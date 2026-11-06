// POST /api/garage/send-reminder — Sends an immediate vehicle paper expiry digest email
// to the signed-in user for all vehicles in their My Garage.
import { createClient } from '@/utils/supabase/server';
import { mailConfig, sendEmail } from '@/lib/server/mailer';
import { json, errorResponse } from '@/lib/server/http';
import { SITE } from '@/lib/site';

export const dynamic = 'force-dynamic';

function statusText(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Not set';
  const t = new Date(dateStr).getTime();
  if (isNaN(t)) return 'Not set';
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  const days = Math.ceil((t - now.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 0) return `EXPIRED (${Math.abs(days)}d ago · ${dateStr})`;
  if (days <= 30) return `Expiring in ${days}d (${dateStr})`;
  return `Valid (${days}d left · ${dateStr})`;
}

export async function POST() {
  try {
    if (!mailConfig().ready) {
      return json({ error: 'Email service (RESEND_API_KEY / MAIL_FROM) is not configured yet.' }, 503);
    }
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user || !user.email) {
      return json({ error: 'Please sign in first.' }, 401);
    }

    const { data: vehicles, error } = await supabase
      .from('user_vehicles')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) return json({ error: error.message }, 500);
    if (!vehicles || vehicles.length === 0) {
      return json({ error: 'Add a vehicle to My Garage first.' }, 400);
    }

    const blocks = vehicles.map((v: Record<string, unknown>) => {
      const title = [v.vehicle_make, v.vehicle_model, v.vehicle_year ? `(${v.vehicle_year})` : null]
        .filter(Boolean)
        .join(' ');
      const lines = [
        `**${v.plate_number}** ${title ? `— ${title}` : ''}`,
        `• Insurance: ${statusText(v.insurance_expiry as string | null)}`,
        `• Vehicle License: ${statusText(v.license_expiry as string | null)}`,
        `• Roadworthiness: ${statusText(v.roadworthiness_expiry as string | null)}`,
        `• Proof of Ownership (POC): ${statusText(v.poc_expiry as string | null)}`,
      ];
      if (v.vehicle_usage === 'commercial' || v.hackney_expiry) {
        lines.push(`• Hackney / Haulage Permit: ${statusText(v.hackney_expiry as string | null)}`);
      }
      return lines.join('\n');
    });

    const firstId = String(vehicles[0].id);
    await sendEmail({
      to: user.email,
      tag: 'garage-digest',
      reason: 'You requested an immediate My Garage expiry summary on Qozob.',
      content: {
        subject: `Your Qozob My Garage Paper Expiry Summary (${vehicles.length} vehicle${vehicles.length === 1 ? '' : 's'})`,
        preheader: `Current insurance, vehicle license, roadworthiness, and POC status for your garage.`,
        body: [
          `Here is the current paper expiry status for the vehicle(s) in your Qozob My Garage:`,
          blocks.join('\n\n'),
          `Need to renew any expiring papers? Click below for 1-click renewal with doorstep delivery and Digital Document Vault backup.`,
        ].join('\n\n'),
        ctaLabel: 'Open 1-Click Paper Renewal',
        ctaUrl: `${SITE.url}/services?vehicle=${encodeURIComponent(firstId)}`,
      },
    });

    return json({ ok: true, message: `Expiry summary emailed to ${user.email}.` });
  } catch (e) {
    return errorResponse(e);
  }
}

