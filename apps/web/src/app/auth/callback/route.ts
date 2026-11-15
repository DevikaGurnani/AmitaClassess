import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  if (code) {
    const { error } = await createServerSupabaseClient().auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL('/auth/update-password', url.origin));
  }
  return NextResponse.redirect(new URL('/auth/update-password?error=expired', url.origin));
}
