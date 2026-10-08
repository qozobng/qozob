// Small helpers for API route responses.
import { NextResponse } from 'next/server';
import { ConfigError } from '@/lib/server/supabaseAdmin';

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** Turns thrown errors into friendly JSON. Setup problems (missing keys) are shown as-is to help the admin. */
export function errorResponse(e: unknown, fallback = 'Something went wrong. Please try again.') {
  if (e instanceof ConfigError) return json({ error: e.message, setup: true }, 503);
  if (e instanceof Error && e.message === 'MAIL_NOT_READY') {
    return json({ error: 'Email sign-up is not switched on yet. Please try again later.', setup: true }, 503);
  }
  console.error('[api]', e);
  return json({ error: fallback }, 500);
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

