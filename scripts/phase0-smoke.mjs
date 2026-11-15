import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = p => readFileSync(join(root,p),'utf8');
const checks = [
  ['root package JSON', () => JSON.parse(read('package.json'))],
  ['web package JSON', () => JSON.parse(read('apps/web/package.json'))],
  ['no committed secret files', () => {assert(!existsSync(join(root,'.env.local')));assert(!existsSync(join(root,'apps/web/.env.local')));}],
  ['no demo bypass', () => assert(!read('apps/web/src/lib/auth-context.ts').includes('1234567890'))],
  ['OTP verification API', () => assert(read('apps/web/src/app/api/auth/signin/route.ts').includes('verifyOtp'))],
  ['single SSR client library', () => assert(read('apps/web/src/lib/supabase/client.ts').includes("from '@supabase/ssr'"))],
  ['private storage', () => assert.equal(JSON.parse(read('supabase/storage/config.json')).public,false)],
  ['RLS policies use authenticated actor', () => {const sql=read('supabase/migrations/20261031_01_initial_schema.sql'); assert(sql.includes('private.current_role()')); assert(!sql.includes("FOR ALL USING (role IN"));}],
  ['immutable payments', () => assert(read('supabase/migrations/20261031_01_initial_schema.sql').includes('CREATE TRIGGER payments_immutable'))],
  ['audit trail trigger', () => assert(read('supabase/migrations/20261031_01_initial_schema.sql').includes('CREATE TRIGGER audit_attendance'))],
];
for (const [label,fn] of checks) {fn();console.log('PASS',label);}
console.log(`${checks.length} static smoke checks passed`);
