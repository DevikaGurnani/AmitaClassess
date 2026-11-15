// Run locally. Credentials are read from environment, never command-line arguments.
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'node:url';
import { readOwnerPassword } from './owner-password.mjs';
nextEnv.loadEnvConfig(fileURLToPath(new URL('../apps/web', import.meta.url)));
const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key,
  ACADEMY_ACCOUNT_PHONE: suppliedPhone, ACADEMY_ACCOUNT_EMAIL: suppliedEmail,
  ACADEMY_ACCOUNT_NAME: name, ACADEMY_ACCOUNT_ROLE: role = 'owner' } = process.env;
const digits=(suppliedPhone || '').trim().replace(/[\s()-]/g,'');
const phone=/^\d{10}$/.test(digits) ? `+91${digits}` : digits;
const email=(suppliedEmail || '').trim().toLowerCase();
if (!url || !key || !name || !/^\+[1-9]\d{7,14}$/.test(phone ?? '') || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email ?? '') || !['owner','staff','teacher','parent','student'].includes(role)) {
  throw new Error('Set server service-role key and ACADEMY_ACCOUNT_PHONE (with country code), EMAIL, NAME and optional ROLE.');
}
const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const password=role==='owner'?readOwnerPassword():'123456';
const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { must_change_password: true } });
if (error) throw new Error(error.message);
const { error: profileError } = await sb.from('users').insert({ id: data.user.id, phone, email: email.toLowerCase(), name, role, status: 'active' });
if (profileError) {
  const { error: cleanupError } = await sb.auth.admin.deleteUser(data.user.id);
  throw new Error(`Profile creation failed: ${profileError.message}.${cleanupError ? ' Auth cleanup failed; remove the newly created identity in Supabase before retrying.' : ' New auth identity rolled back.'}`);
}
console.log(role==='owner'?'Owner account created using ACADEMY_ACCOUNT_PASSWORD. First-login password change is required.':`Active ${role} account created with temporary password 123456. First-login password change is required.`);
