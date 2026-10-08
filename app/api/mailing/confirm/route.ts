// GET /api/mailing/confirm?token=…  (link inside the confirmation email)
import { NextResponse } from 'next/server';
import { confirmToken } from '@/lib/server/mailingList';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token') || '';
  let status: string;
  try {
    status = await confirmToken(token);
  } catch (e) {
    console.error('[mailing/confirm]', e);
    status = 'error';
  }
  return NextResponse.redirect(new URL(`/mailing?status=${status}`, req.url), 303);
}
