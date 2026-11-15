// Read-only verification. Never print keys, identities or database records.
import nextEnv from '@next/env';
import { fileURLToPath } from 'node:url';
nextEnv.loadEnvConfig(fileURLToPath(new URL('../apps/web', import.meta.url)));
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Supabase URL or server key missing');
const headers = { apikey: key, Authorization: `Bearer ${key}` };
const checks = [
  ['Auth admin access', '/auth/v1/admin/users?page=1&per_page=1'],
  ['Student contact columns', '/rest/v1/students?select=id,email,phone&limit=0'],
  ['Student login link column', '/rest/v1/users?select=id,student_id&limit=0'],
  ['Assessments table', '/rest/v1/tests?select=id&limit=0'],
];
await Promise.all(checks.map(async ([label, path]) => {
  try {
    const response = await fetch(url.replace(/\/$/, '') + path, { headers, signal: AbortSignal.timeout(15000) });
    console.log(`${label}: HTTP ${response.status} ${response.ok ? 'OK' : 'NOT READY'}`);
  } catch { console.log(`${label}: CONNECTION FAILED`); process.exitCode = 1; }
}));
