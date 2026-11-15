import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { loginIdentity } from '@/lib/account-validation';

// Email recovery codes only; never SMS or public account creation.
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  try {
    const body = await request.json();
    const identity = loginIdentity(typeof body.email === 'string' ? body.email : '');
    const otp = typeof body.otp === 'string' ? body.otp.trim() : '';
    if (!('email' in identity) || !/^\d{6,10}$/.test(otp)) {
      return NextResponse.json({ error: 'Registered email and a valid email recovery code are required.' }, { status: 400 });
    }
    const client = createServerSupabaseClient();
    const { data, error } = await client.auth.verifyOtp({ email: identity.email, token: otp, type: 'recovery' });
    if (error || !data.user) return NextResponse.json({ error: 'Invalid or expired email code. Request a new reset email.' }, { status: 401 });
    const { data: profile, error: profileError } = await client.from('users')
      .select('id,status').eq('id', data.user.id).maybeSingle();
    if (profileError || !profile || profile.status !== 'active') {
      await client.auth.signOut();
      return NextResponse.json({ error: 'Account not active' }, { status: 403 });
    }
    return NextResponse.json({ redirect: '/auth/update-password' });
  } catch {
    return NextResponse.json({ error: 'Enter your registered email and recovery code.' }, { status: 400 });
  }
}
