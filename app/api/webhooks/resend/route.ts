// POST /api/webhooks/resend — Resend tells us when an email bounced or was marked as spam,
// so we stop emailing that address (protects deliverability and respects the person).
// Set RESEND_WEBHOOK_SECRET (starts with "whsec_") from Resend → Webhooks.
// Signatures follow the Svix scheme: HMAC-SHA256 of "id.timestamp.body".
import crypto from 'node:crypto';
import { supabaseAdmin } from '@/lib/server/supabaseAdmin';
import { json } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

function verify(secret: string, id: string, ts: string, sigHeader: string, body: string) {
  const age = Math.abs(Date.now() / 1000 - Number(ts));
  if (!Number.isFinite(age) || age > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto.createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest();
  return sigHeader.split(' ').some(part => {
    const [version, sig] = part.split(',');
    if (version !== 'v1' || !sig) return false;
    const given = Buffer.from(sig, 'base64');
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
}

export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return json({ error: 'Webhook not configured' }, 503);
  const body = await req.text();
  const ok = verify(
    secret,
    req.headers.get('svix-id') || '',
    req.headers.get('svix-timestamp') || '',
    req.headers.get('svix-signature') || '',
    body,
  );
  if (!ok) return json({ error: 'Invalid signature' }, 401);

  let event: { type?: string; data?: { to?: string[] | string } } = {};
  try { event = JSON.parse(body); } catch { return json({ error: 'Bad JSON' }, 400); }

  const status = event.type === 'email.bounced' ? 'bounced' : event.type === 'email.complained' ? 'complained' : null;
  if (status) {
    const to = Array.isArray(event.data?.to) ? event.data?.to : event.data?.to ? [event.data.to] : [];
    const emails = (to ?? []).map(e => String(e).toLowerCase().trim()).filter(Boolean);
    if (emails.length) {
      await supabaseAdmin().from('mailing_subscribers')
        .update({ status, unsubscribed_at: new Date().toISOString() })
        .in('email', emails)
        .neq('status', 'unsubscribed');
    }
  }
  return json({ ok: true });
}

