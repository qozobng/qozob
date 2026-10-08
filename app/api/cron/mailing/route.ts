// GET /api/cron/mailing — called once a day by Vercel Cron (see vercel.json) to keep
// sending large campaigns within the daily email limit. Vercel sends
// "Authorization: Bearer <CRON_SECRET>" automatically when CRON_SECRET is set.
import { mailConfig, processQueue } from '@/lib/server/mailer';
import { json, errorResponse } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return json({ error: 'Unauthorised' }, 401);
  }
  if (!mailConfig().ready || !process.env.SUPABASE_SERVICE_ROLE_KEY) return json({ ok: true, skipped: 'email not configured' });
  try {
    return json({ ok: true, ...(await processQueue()) });
  } catch (e) {
    return errorResponse(e);
  }
}

