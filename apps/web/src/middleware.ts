import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;
  const sb = createServerClient(url, key, { cookies: {
    getAll: () => request.cookies.getAll(),
    setAll: cookies => {
      cookies.forEach(({ name, value }) => request.cookies.set(name, value));
      response = NextResponse.next({ request });
      cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
    },
  } });
  const { data: { user } } = await sb.auth.getUser();
  if (user?.app_metadata.must_change_password) {
    const blocked = request.nextUrl.pathname.startsWith('/api/');
    const redirect = blocked ? NextResponse.json({ error: 'Change your temporary password before continuing.' }, { status: 403 }) : NextResponse.redirect(new URL('/auth/update-password', request.url));
    response.cookies.getAll().forEach(cookie => redirect.cookies.set(cookie));
    return redirect;
  }
  return response;
}
export const config = { matcher: ['/dashboard', '/owner/:path*', '/parent/:path*', '/student/:path*', '/teacher/:path*', '/api/admin/:path*', '/api/payments/create-order'] };
