// POST /api/admin/mailing/test { subject, preheader?, body, ctaLabel?, ctaUrl? }
// Sends a preview of a campaign to the signed-in admin's own email address.
import { requireAdmin } from '@/lib/server/auth';
import { sendEmail } from '@/lib/server/mailer';
import { ConfigError } from '@/lib/server/supabaseAdmin';
import { json, errorResponse, readJson } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin('mailing');
    if (!admin?.email) return json({ error: 'Admins only.' }, 403);
    const b = await readJson(req);
    const subject = str(b.subject, 150).trim();
    const body = str(b.body, 20000).trim();
    if (!subject || !body) return json({ error: 'Add a subject and a message first.' }, 400);
    const ctaUrl = str(b.ctaUrl, 500).trim();
    if (ctaUrl && !/^https?:\/\/\S+$/i.test(ctaUrl)) return json({ error: 'The button link must start with https://' }, 400);
    await sendEmail({
      to: admin.email,
      tag: 'test',
      reason: 'This is a TEST copy sent only to you from the Qozob admin panel.',
      content: {
        subject: `[TEST] ${subject}`,
        preheader: str(b.preheader, 200) || null,
        body,
        ctaLabel: str(b.ctaLabel, 60) || null,
        ctaUrl: ctaUrl || null,
      },
    });
    return json({ ok: true, to: admin.email });
  } catch (e) {
    if (e instanceof Error && !(e instanceof ConfigError)) {
      // Provider messages (e.g. "domain is not verified") are useful to the admin.
      return json({ error: e.message }, 502);
    }
    return errorResponse(e);
  }
}
