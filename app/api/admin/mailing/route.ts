// GET  /api/admin/mailing  → is email set up + today's sending quota
// POST /api/admin/mailing  { action: 'queue' | 'next' | 'retry_failed', campaignId? }
import { requireAdmin } from '@/lib/server/auth';
import { createClient } from '@/utils/supabase/server';
import { supabaseAdmin } from '@/lib/server/supabaseAdmin';
import { mailConfig, processQueue, quotaToday } from '@/lib/server/mailer';
import { json, errorResponse, readJson } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return json({ error: 'Admins only.' }, 403);
  const cfg = mailConfig();
  const serviceKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  let quota = { limit: cfg.dailyLimit, used: 0, remaining: cfg.dailyLimit };
  if (serviceKey) {
    try { quota = await quotaToday(); } catch { /* table may not exist yet */ }
  }
  return json({
    ready: cfg.ready && serviceKey,
    missing: [
      !process.env.RESEND_API_KEY && 'RESEND_API_KEY',
      !process.env.MAIL_FROM && 'MAIL_FROM',
      !serviceKey && 'SUPABASE_SERVICE_ROLE_KEY',
    ].filter(Boolean),
    from: cfg.from || null,
    adminEmail: admin.email ?? null,
    quota,
  });
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    if (!admin) return json({ error: 'Admins only.' }, 403);
    const body = await readJson(req);
    const action = body.action;
    const campaignId = typeof body.campaignId === 'string' ? body.campaignId : '';

    if (action === 'queue') {
      if (!campaignId) return json({ error: 'Missing campaign.' }, 400);
      // Runs as the admin (the database re-checks admin rights inside the function).
      const supabase = await createClient();
      const { data, error } = await supabase.rpc('admin_queue_campaign', { p_campaign_id: campaignId });
      if (error) return json({ error: error.message }, 400);
      const result = await processQueue();
      return json({ ok: true, queued: (data as { queued?: number } | null)?.queued ?? 0, ...result });
    }

    if (action === 'retry_failed') {
      if (!campaignId) return json({ error: 'Missing campaign.' }, 400);
      const db = supabaseAdmin();
      await db.from('mail_deliveries').update({ status: 'queued', error: null, claimed_at: null })
        .eq('campaign_id', campaignId).eq('status', 'failed');
      await db.from('mail_campaigns').update({ status: 'sending', completed_at: null }).eq('id', campaignId).in('status', ['sending', 'sent']);
      const result = await processQueue();
      return json({ ok: true, ...result });
    }

    if (action === 'next') {
      const result = await processQueue();
      return json({ ok: true, ...result });
    }

    return json({ error: 'Unknown action.' }, 400);
  } catch (e) {
    return errorResponse(e, 'Sending failed. Please try again.');
  }
}

