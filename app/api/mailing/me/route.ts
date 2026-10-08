// GET  /api/mailing/me                 → { status: 'subscribed' | 'pending' | 'unsubscribed' | 'none' | ... }
// POST /api/mailing/me { subscribed }  → turn the signed-in user's email updates on/off
import { currentUser } from '@/lib/server/auth';
import { statusForUser, subscribe, unsubscribeUser } from '@/lib/server/mailingList';
import { json, errorResponse, readJson } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await currentUser();
    if (!user) return json({ error: 'Please sign in.' }, 401);
    return json({ status: await statusForUser(user), email: user.email ?? null });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await currentUser();
    if (!user || !user.email) return json({ error: 'Please sign in.' }, 401);
    const body = await readJson(req);
    if (body.subscribed === true) {
      if (body.consent !== true) return json({ error: 'Please confirm you agree to receive emails.' }, 400);
      const status = await subscribe({ email: user.email, user, source: 'dashboard' });
      return json({ ok: true, status: status === 'subscribed' ? 'subscribed' : 'pending' });
    }
    if (body.subscribed === false) {
      await unsubscribeUser(user);
      return json({ ok: true, status: 'unsubscribed' });
    }
    return json({ error: 'Nothing to change.' }, 400);
  } catch (e) {
    return errorResponse(e);
  }
}

