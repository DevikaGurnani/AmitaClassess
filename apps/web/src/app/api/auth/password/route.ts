import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { loginIdentity } from '@/lib/account-validation';

// Mobile is an academy login identifier. Passwords are always verified by Auth,
// never compared against application tables or the temporary-password constant.
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  try {
    const body = await request.json();
    if (typeof body.identifier !== 'string' || typeof body.password !== 'string' || body.identifier.length > 254 || !body.password || body.password.length > 1024) return NextResponse.json({ error: 'Enter your email/mobile and password.' }, { status: 400 });
    let identity;
    try { identity = loginIdentity(body.identifier); }
    catch { return NextResponse.json({ error: 'Enter a valid email or mobile number.' }, { status: 400 }); }
    const client = createServerSupabaseClient();
    let email: string;
    let mappedId: string | undefined;
    if ('email' in identity) email = identity.email;
    else {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) return NextResponse.json({ error: 'Mobile login is not configured. Use your email or contact the administrator.' }, { status: 503 });
      const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data: account, error } = await admin.from('users').select('id,email,status').eq('phone', identity.phone).maybeSingle();
      if (error) return NextResponse.json({ error: 'Unable to verify your account right now. Please retry.' }, { status: 503 });
      if (!account?.email || account.status !== 'active') return NextResponse.json({ error: 'Email/mobile or password is incorrect.' }, { status: 401 });
      email = account.email;
      mappedId = account.id;
    }
    const { data, error } = await client.auth.signInWithPassword({ email, password: body.password });
    if (error || !data.user) return NextResponse.json({ error: 'Email/mobile or password is incorrect.' }, { status: error?.name === 'AuthRetryableFetchError' ? 503 : 401 });
    if (mappedId && data.user.id !== mappedId) {
      await client.auth.signOut();
      return NextResponse.json({ error: 'Email/mobile or password is incorrect.' }, { status: 401 });
    }
    const { data: profile, error: profileError } = await client.from('users').select('id,status').eq('id', data.user.id).maybeSingle();
    if (profileError || profile?.status !== 'active') {
      await client.auth.signOut();
      return NextResponse.json({ error: 'An active academy account is required. Contact your administrator.' }, { status: 403 });
    }
    return NextResponse.json({ redirect: data.user.app_metadata.must_change_password ? '/auth/update-password' : '/dashboard' });
  } catch { return NextResponse.json({ error: 'Unable to sign in. Please retry.' }, { status: 400 }); }
}
