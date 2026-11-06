// GET /api/cron/vehicle-reminders — Daily Vercel Cron job that emails 30 / 14 / 7 / 0-day
// vehicle paper expiry reminders to Qozob My Garage users via Resend.
import { mailConfig, sendEmail } from '@/lib/server/mailer';
import { supabaseAdmin } from '@/lib/server/supabaseAdmin';
import { json, errorResponse } from '@/lib/server/http';
import { SITE } from '@/lib/site';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface VehicleRow {
  id: string;
  user_id: string;
  plate_number: string;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_year: string | null;
  insurance_expiry: string | null;
  license_expiry: string | null;
  roadworthiness_expiry: string | null;
  poc_expiry: string | null;
  hackney_expiry: string | null;
  reminder_enabled: boolean | null;
  last_reminder_milestone: string | null;
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const t = new Date(dateStr).getTime();
  if (isNaN(t)) return null;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return Math.ceil((t - today.getTime()) / (1000 * 60 * 60 * 24));
}

function milestoneForDays(minDays: number): 'expired' | '7d' | '14d' | '30d' | null {
  if (minDays <= 0) return 'expired';
  if (minDays <= 7) return '7d';
  if (minDays <= 14) return '14d';
  if (minDays <= 30) return '30d';
  return null;
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return json({ error: 'Unauthorised' }, 401);
  }
  if (!mailConfig().ready || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ ok: true, skipped: 'email not configured' });
  }

  try {
    const db = supabaseAdmin();
    const { data: rows, error } = await db
      .from('user_vehicles')
      .select('id, user_id, plate_number, vehicle_make, vehicle_model, vehicle_year, insurance_expiry, license_expiry, roadworthiness_expiry, poc_expiry, hackney_expiry, reminder_enabled, last_reminder_milestone')
      .eq('reminder_enabled', true);

    if (error) return json({ ok: false, error: error.message }, 500);

    let sent = 0;
    let skipped = 0;

    for (const v of (rows || []) as VehicleRow[]) {
      const checks: [string, string | null][] = [
        ['Auto Insurance', v.insurance_expiry],
        ['Vehicle License', v.license_expiry],
        ['Roadworthiness Certificate', v.roadworthiness_expiry],
        ['Proof of Ownership (POC)', v.poc_expiry],
        ['Hackney / Haulage Permit', v.hackney_expiry],
      ];

      const expiring: { label: string; date: string; days: number }[] = [];
      for (const [label, dt] of checks) {
        const d = daysUntil(dt);
        if (d !== null && d <= 30 && dt) {
          expiring.push({ label, date: dt, days: d });
        }
      }

      if (expiring.length === 0) {
        skipped++;
        continue;
      }

      const minDays = Math.min(...expiring.map(e => e.days));
      const milestone = milestoneForDays(minDays);
      if (!milestone || v.last_reminder_milestone === milestone) {
        skipped++;
        continue;
      }

      const { data: uData } = await db.auth.admin.getUserById(v.user_id);
      const email = uData?.user?.email;
      if (!email) {
        skipped++;
        continue;
      }

      const carName = [v.vehicle_make, v.vehicle_model, v.vehicle_year ? `(${v.vehicle_year})` : null]
        .filter(Boolean)
        .join(' ') || 'your vehicle';
      const lines = expiring.map(e =>
        e.days < 0
          ? `• ${e.label}: EXPIRED ${Math.abs(e.days)} day(s) ago (${e.date})`
          : e.days === 0
            ? `• ${e.label}: EXPIRES TODAY (${e.date})`
            : `• ${e.label}: expires in ${e.days} day(s) (${e.date})`
      );

      const renewUrl = `${SITE.url}/services?vehicle=${encodeURIComponent(v.id)}`;
      const subject = minDays <= 0
        ? `Urgent: Vehicle papers expired for ${v.plate_number}`
        : `Reminder: ${v.plate_number} vehicle papers expire in ${minDays} day${minDays === 1 ? '' : 's'}`;

      const res = await sendEmail({
        to: email,
        tag: 'vehicle-reminder',
        reason: 'You enabled vehicle paper expiry alerts in Qozob My Garage.',
        content: {
          subject,
          preheader: `${expiring.length} document(s) for ${v.plate_number} (${carName}) need renewal.`,
          body: [
            `Hello,`,
            `This is an automated reminder from Qozob My Garage for **${v.plate_number}** (${carName}):`,
            lines.join('\n'),
            `Renew online in 2 minutes with 1-click prefill — we process genuine NIID insurance, vehicle license, roadworthiness, and Proof of Ownership (POC) with doorstep delivery and digital vault copies.`,
          ].join('\n\n'),
          ctaLabel: `Renew ${v.plate_number} Papers Now`,
          ctaUrl: renewUrl,
        },
      });

      const now = new Date().toISOString();
      await db
        .from('user_vehicles')
        .update({ last_reminder_sent_at: now, last_reminder_milestone: milestone })
        .eq('id', v.id);

      await db.from('vehicle_reminder_logs').insert({
        vehicle_id: v.id,
        user_id: v.user_id,
        email,
        plate_number: v.plate_number,
        milestone,
        expiring_items: expiring,
        provider_id: res.id,
      });

      sent++;
    }

    return json({ ok: true, sent, skipped });
  } catch (e) {
    return errorResponse(e);
  }
}

