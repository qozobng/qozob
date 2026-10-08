// POST /api/mailing/subscribe  { email, consent: true, source?, fullName?, state?, lga? }
import { currentUser } from '@/lib/server/auth';
import { isValidEmail } from '@/lib/server/mailer';
import { subscribe, cleanSource } from '@/lib/server/mailingList';
import { json, errorResponse, readJson } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!isValidEmail(email)) return json({ error: 'Please enter a valid email address.' }, 400);
    if (body.consent !== true) return json({ error: 'Please tick the box to agree to receive emails.' }, 400);
    // Honeypot: real people never fill the hidden "website" field.
    if (typeof body.website === 'string' && body.website.trim()) return json({ ok: true, status: 'check_email' });

    const user = await currentUser();
    const status = await subscribe({
      email, user, source: cleanSource(body.source),
      fullName: body.fullName, state: body.state, lga: body.lga,
    });
    return json({ ok: true, status });
  } catch (e) {
    return errorResponse(e);
  }
}

