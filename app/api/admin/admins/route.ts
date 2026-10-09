// =========================================================================
// ADMIN · ADD AN ADMIN (master admins only)
// POST { email, is_master, modules[], note }
//  • Existing Qozob account → promoted with the chosen sections (admin_grant_access).
//  • No account yet → a Supabase invitation is created (service role) and a branded
//    email with a one-time "set your password" link is sent through Resend. If the
//    email can't be sent, the link is returned so the master admin can share it.
// Every permission check runs again inside the database as the signed-in master.
// =========================================================================
import { createClient } from '@/utils/supabase/server';
import { requireMasterAdmin } from '@/lib/server/auth';
import { supabaseAdmin } from '@/lib/server/supabaseAdmin';
import { sendEmail, isValidEmail } from '@/lib/server/mailer';
import { json, errorResponse, readJson } from '@/lib/server/http';
import { SITE } from '@/lib/site';

export const dynamic = 'force-dynamic';

const MODULES = ['claims', 'requests', 'stations', 'prices', 'ads', 'mailing', 'rewards', 'services'] as const;
const MODULE_LABEL: Record<string, string> = {
  claims: 'Station claims', requests: 'Manager requests', stations: 'Stations', prices: 'Price reviews',
  ads: 'Adverts', mailing: 'Mailing', rewards: 'Rewards', services: 'Auto services',
};

export async function POST(req: Request) {
  try {
    const master = await requireMasterAdmin();
    if (!master) return json({ error: 'Only a master admin can add admins.' }, 403);

    const body = await readJson(req);
    const email = String(body.email || '').trim().toLowerCase();
    const isMaster = body.is_master === true;
    const modules = Array.isArray(body.modules)
      ? [...new Set(body.modules.map(String).filter((m): m is (typeof MODULES)[number] => (MODULES as readonly string[]).includes(m)))]
      : [];
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 200) || null : null;

    if (!isValidEmail(email)) return json({ error: 'Enter a valid email address.' }, 400);
    if (!isMaster && modules.length === 0) return json({ error: 'Choose at least one section this admin can use.' }, 400);

    const supabase = await createClient();
    const grant = () => supabase.rpc('admin_grant_access', {
      p_email: email, p_is_master: isMaster, p_modules: isMaster ? [...MODULES] : modules, p_note: note,
    });

    let { data, error } = await grant();
    if (!error) return json({ ok: true, invited: false, result: data });
    if (error.hint !== 'user_not_found') return json({ error: error.message }, error.code === '42501' ? 403 : 400);

    // ---- No account yet: create an invitation ----
    const admin = supabaseAdmin();
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'invite',
      email,
      options: { redirectTo: `${SITE.url}/auth/callback?next=/admin`, data: { invited_as: 'admin' } },
    });
    if (linkErr || !link?.properties?.hashed_token) {
      return json({ error: linkErr?.message || 'Could not create the invitation.' }, 400);
    }
    const inviteUrl = `${SITE.url}/auth/confirm?token_hash=${encodeURIComponent(link.properties.hashed_token)}&type=invite&next=${encodeURIComponent('/admin')}`;

    ({ data, error } = await grant());
    if (error) return json({ error: error.message }, 400);

    const sections = isMaster ? 'every section (master admin)' : modules.map((m) => MODULE_LABEL[m]).join(', ');
    let emailSent = false;
    try {
      await sendEmail({
        to: email,
        tag: 'admin_invite',
        reason: `You're receiving this because a ${SITE.name} master admin invited ${email} to help run ${SITE.name}.`,
        content: {
          subject: `You've been invited to help run ${SITE.name}`,
          preheader: 'Set your password to open the admin panel.',
          body:
            `Hello,\n\nYou have been invited to join the ${SITE.name} admin team with access to: **${sections}**.\n\n` +
            `Tap the button below to set your password. The link works once and expires after about 24 hours.\n\n` +
            `If you weren't expecting this, you can ignore this email or write to ${SITE.contactEmail}.`,
          ctaLabel: 'Set my password',
          ctaUrl: inviteUrl,
        },
      });
      emailSent = true;
    } catch (e) {
      console.error('[admins] invite email failed', e);
    }

    return json({ ok: true, invited: true, emailSent, link: emailSent ? undefined : inviteUrl, result: data });
  } catch (e) {
    return errorResponse(e);
  }
}

