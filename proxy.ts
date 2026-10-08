import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export default async function proxy(request: NextRequest) {
  // Supabase falls back to the bare Site URL (https://www.qozob.com/?code=...) when a redirect URL
  // isn't allow-listed. Hand those links to the auth routes so the person is signed in and welcomed.
  const { pathname, searchParams } = request.nextUrl
  if (pathname === '/' && (searchParams.has('code') || searchParams.has('token_hash'))) {
    const url = request.nextUrl.clone()
    if (searchParams.has('token_hash')) {
      url.pathname = '/auth/confirm'
    } else {
      url.pathname = '/auth/callback'
      if (!url.searchParams.has('flow')) url.searchParams.set('flow', 'root')
    }
    return NextResponse.redirect(url)
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  await supabase.auth.getUser()
  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}