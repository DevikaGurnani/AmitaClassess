import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
// Token-hash recovery works when the email is opened on another device/browser.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token_hash = url.searchParams.get('token_hash');
  if (token_hash && url.searchParams.get('type') === 'recovery') {
    const { error } = await createServerSupabaseClient().auth.verifyOtp({ token_hash, type: 'recovery' });
    if (!error) return NextResponse.redirect(new URL('/auth/update-password', url.origin));
  }
  return NextResponse.redirect(new URL('/auth/update-password?error=expired', url.origin));
}
