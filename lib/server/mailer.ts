// =========================================================================
// SERVER-ONLY email sending through Resend (https://resend.com).
// • sendEmail(): one message (confirmation emails, admin test sends).
// • processQueue(): sends queued bulk-campaign emails in batches of up to 100,
//   never going over the daily limit (Resend free plan = 100 emails/day), so a
//   large campaign simply continues the next day (Vercel cron) or when an admin
//   clicks "Send next batch".
// Needs env vars: RESEND_API_KEY, MAIL_FROM (e.g. "Qozob <hello@qozob.com>"),
// SUPABASE_SERVICE_ROLE_KEY. Optional: MAILING_DAILY_LIMIT (default 90).
// =========================================================================
import { supabaseAdmin, ConfigError } from '@/lib/server/supabaseAdmin';
import { renderEmail, bodyToText, type EmailContent } from '@/lib/emailTemplate';
import { SITE } from '@/lib/site';

const RESEND_URL = 'https://api.resend.com';

export function mailConfig() {
  const apiKey = process.env.RESEND_API_KEY || '';
  const from = process.env.MAIL_FROM || '';
  const dailyLimit = Math.max(1, parseInt(process.env.MAILING_DAILY_LIMIT || '90', 10) || 90);
  return { apiKey, from, dailyLimit, ready: Boolean(apiKey && from) };
}

function requireMailConfig() {
  const cfg = mailConfig();
  if (!cfg.ready) {
    throw new ConfigError('Email is not set up yet. Add RESEND_API_KEY and MAIL_FROM in Vercel → Project → Settings → Environment Variables, then redeploy.');
  }
  return cfg;
}

export function unsubscribeUrl(token: string) {
  return `${SITE.url}/mailing?unsubscribe=${encodeURIComponent(token)}`;
}

/** One-click unsubscribe headers (RFC 8058) — Gmail/Yahoo show an "Unsubscribe" button. */
function listHeaders(token: string): Record<string, string> {
  return {
    'List-Unsubscribe': `<${SITE.url}/api/mailing/unsubscribe?token=${encodeURIComponent(token)}>, <mailto:${SITE.contactEmail}?subject=unsubscribe>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

interface OutgoingEmail {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  tags?: { name: string; value: string }[];
}

async function resendFetch(path: string, payload: unknown, idempotencyKey?: string) {
  const { apiKey } = requireMailConfig();
  const res = await fetch(`${RESEND_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey.slice(0, 256) } : {}),
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
  let json: unknown = null;
  try { json = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const msg = (json as { message?: string } | null)?.message || `Email provider error (HTTP ${res.status})`;
    throw new Error(msg);
  }
  return json;
}

/** Send a single email. `unsubscribeToken` adds the unsubscribe link + headers (omit for transactional mail). */
export async function sendEmail(opts: {
  to: string;
  content: EmailContent;
  unsubscribeToken?: string;
  reason?: string;
  tag?: string;
}) {
  const { from } = requireMailConfig();
  const unsub = opts.unsubscribeToken ? unsubscribeUrl(opts.unsubscribeToken) : `${SITE.url}/mailing`;
  const email: OutgoingEmail = {
    from,
    to: [opts.to],
    subject: opts.content.subject,
    html: renderEmail(opts.content, unsub, opts.reason),
    text: bodyToText(opts.content, unsub),
    headers: opts.unsubscribeToken ? listHeaders(opts.unsubscribeToken) : undefined,
    tags: opts.tag ? [{ name: 'category', value: opts.tag }] : undefined,
  };
  const json = (await resendFetch('/emails', email)) as { id?: string } | null;
  return { id: json?.id ?? null };
}

// ---------------------------------------------------------------------------
// Daily quota (counted in Nigerian time, WAT = UTC+1, no daylight saving)
// ---------------------------------------------------------------------------
export function startOfLagosDayUtc(now = new Date()): Date {
  const lagos = new Date(now.getTime() + 60 * 60 * 1000);
  lagos.setUTCHours(0, 0, 0, 0);
  return new Date(lagos.getTime() - 60 * 60 * 1000);
}

export async function quotaToday() {
  const db = supabaseAdmin();
  const { dailyLimit } = mailConfig();
  const since = startOfLagosDayUtc().toISOString();
  const [{ count: sent }, { count: inFlight }] = await Promise.all([
    db.from('mail_deliveries').select('id', { count: 'exact', head: true }).gte('sent_at', since),
    db.from('mail_deliveries').select('id', { count: 'exact', head: true }).eq('status', 'sending'),
  ]);
  const used = (sent ?? 0) + (inFlight ?? 0);
  return { limit: dailyLimit, used, remaining: Math.max(0, dailyLimit - used) };
}

interface DeliveryRow { id: number; campaign_id: string; subscriber_id: string | null; email: string }
interface CampaignRow {
  id: string; subject: string; preheader: string | null; body: string;
  cta_label: string | null; cta_url: string | null;
}

async function refreshCampaign(campaignId: string) {
  const db = supabaseAdmin();
  const count = async (status: string) =>
    (await db.from('mail_deliveries').select('id', { count: 'exact', head: true }).eq('campaign_id', campaignId).eq('status', status)).count ?? 0;
  const [sent, failed, queued, sending] = await Promise.all([count('sent'), count('failed'), count('queued'), count('sending')]);
  const done = queued + sending === 0;
  await db.from('mail_campaigns').update({
    sent_count: sent,
    failed_count: failed,
    ...(done ? { status: 'sent', completed_at: new Date().toISOString() } : {}),
  }).eq('id', campaignId).eq('status', 'sending');
  return { sent, failed, left: queued + sending, done };
}

/**
 * Sends as many queued campaign emails as today's quota allows (optionally capped by `max`).
 * Safe to call from several places at once: rows are claimed with SKIP LOCKED.
 */
export async function processQueue(max?: number) {
  requireMailConfig();
  const db = supabaseAdmin();
  let { remaining } = await quotaToday();
  if (typeof max === 'number') remaining = Math.min(remaining, Math.max(0, max));
  let sentTotal = 0;
  let failedTotal = 0;
  let skippedTotal = 0;

  const { data: campaigns, error: cErr } = await db
    .from('mail_campaigns')
    .select('id, subject, preheader, body, cta_label, cta_url')
    .eq('status', 'sending')
    .order('queued_at', { ascending: true });
  if (cErr) throw new Error(cErr.message);

  for (const c of (campaigns ?? []) as CampaignRow[]) {
    while (remaining > 0) {
      const { data: claimed, error: claimErr } = await db.rpc('claim_mail_deliveries', { p_campaign_id: c.id, p_limit: Math.min(100, remaining) });
      if (claimErr) throw new Error(claimErr.message);
      const rows = (claimed ?? []) as DeliveryRow[];
      if (rows.length === 0) break;

      // Re-check each person is still subscribed right now (they may have unsubscribed since queueing).
      const subIds = rows.map(r => r.subscriber_id).filter((x): x is string => Boolean(x));
      const { data: subs } = subIds.length
        ? await db.from('mailing_subscribers').select('id, status, unsubscribe_token').in('id', subIds)
        : { data: [] as { id: string; status: string; unsubscribe_token: string }[] };
      const subMap = new Map((subs ?? []).map(s => [s.id as string, s as { id: string; status: string; unsubscribe_token: string }]));

      const sendable: { row: DeliveryRow; token: string }[] = [];
      const skipIds: number[] = [];
      for (const r of rows) {
        const s = r.subscriber_id ? subMap.get(r.subscriber_id) : undefined;
        if (s && s.status === 'subscribed') sendable.push({ row: r, token: s.unsubscribe_token });
        else skipIds.push(r.id);
      }
      if (skipIds.length) {
        await db.from('mail_deliveries').update({ status: 'skipped', error: 'No longer subscribed' }).in('id', skipIds);
        skippedTotal += skipIds.length;
      }
      if (sendable.length === 0) continue;

      const content: EmailContent = { subject: c.subject, preheader: c.preheader, body: c.body, ctaLabel: c.cta_label, ctaUrl: c.cta_url };
      const { from } = mailConfig();
      const payload: OutgoingEmail[] = sendable.map(({ row, token }) => ({
        from,
        to: [row.email],
        subject: c.subject,
        html: renderEmail(content, unsubscribeUrl(token)),
        text: bodyToText(content, unsubscribeUrl(token)),
        headers: listHeaders(token),
        tags: [{ name: 'campaign', value: c.id.replace(/[^a-zA-Z0-9_-]/g, '') }],
      }));

      const now = new Date().toISOString();
      try {
        const key = `qozob-${c.id}-${sendable[0].row.id}-${sendable[sendable.length - 1].row.id}-${sendable.length}`;
        const json = (await resendFetch('/emails/batch', payload, key)) as { data?: { id: string }[] } | null;
        const ids = json?.data ?? [];
        // Resend returns the ids in the same order as we sent them.
        await Promise.all(sendable.map(({ row }, i) =>
          db.from('mail_deliveries').update({ status: 'sent', sent_at: now, provider_id: ids[i]?.id ?? null, error: null }).eq('id', row.id)));
        const sentSubIds = sendable.map(s => s.row.subscriber_id).filter((x): x is string => Boolean(x));
        if (sentSubIds.length) await db.from('mailing_subscribers').update({ last_emailed_at: now }).in('id', sentSubIds);
        sentTotal += sendable.length;
        remaining -= sendable.length;
      } catch (e) {
        const msg = (e instanceof Error ? e.message : String(e)).slice(0, 500);
        await db.from('mail_deliveries').update({ status: 'failed', error: msg }).in('id', sendable.map(s => s.row.id));
        failedTotal += sendable.length;
        await refreshCampaign(c.id);
        // Stop this run: a provider error (bad key, unverified domain, quota) would repeat for every batch.
        return { sent: sentTotal, failed: failedTotal, skipped: skippedTotal, error: msg, quota: await quotaToday() };
      }
    }
    await refreshCampaign(c.id);
    if (remaining <= 0) break;
  }

  return { sent: sentTotal, failed: failedTotal, skipped: skippedTotal, error: null as string | null, quota: await quotaToday() };
}

/** Simple email format check (the database has the same rule). */
export function isValidEmail(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
}

