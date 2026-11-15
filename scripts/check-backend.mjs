import nextEnv from '@next/env';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
nextEnv.loadEnvConfig(fileURLToPath(new URL('../apps/web', import.meta.url)));
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) throw new Error('Supabase URL/anon key missing');
const sb = createClient(url, key, { auth: { persistSession: false }, global: { fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(15000) }) } });
await Promise.all(['users', 'students', 'batches', 'attendance', 'fee_dues', 'tests'].map(async table => {
  const { error, status } = await sb.from(table).select('id').limit(0);
  console.log(`${table}: HTTP ${status} ${error ? `${error.code ?? ''} ${error.message}` : 'reachable (anonymous RLS; this does not verify write access)'}`);
}));
try {
  const response = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key }, signal: AbortSignal.timeout(15000) });
  const settings = await response.json();
  console.log('Auth settings HTTP', response.status);
  if (response.ok) console.log('Auth providers:', JSON.stringify({ email: settings.external?.email, phone: settings.external?.phone, email_autoconfirm: settings.mailer_autoconfirm }));
  console.log('Server account provisioning:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'key configured (not validated)' : 'missing SUPABASE_SERVICE_ROLE_KEY');
} catch { console.log('Auth settings connection failed'); }
