// POST /api/mailing/unsubscribe?token=…   (Gmail/Yahoo one-click, RFC 8058)
// POST /api/mailing/unsubscribe  { token }  (the button on /mailing)
// Always answers "ok" so the endpoint can't be used to test which addresses are on the list.
import { unsubscribeToken } from '@/lib/server/mailingList';
import { json } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let token = new URL(req.url).searchParams.get('token') || '';
  if (!token && (req.headers.get('content-type') || '').includes('application/json')) {
    try {
      const body = (await req.json()) as { token?: unknown };
      if (typeof body.token === 'string') token = body.token;
    } catch { /* ignore */ }
  }
  try {
    if (token) await unsubscribeToken(token);
  } catch (e) {
    console.error('[mailing/unsubscribe]', e);
    return json({ error: 'We could not process that right now. Please try again or email us.' }, 500);
  }
  return json({ ok: true });
}

