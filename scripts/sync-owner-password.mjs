import nextEnv from '@next/env';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { readOwnerPassword,synchronizeOwnerPassword } from './owner-password.mjs';
nextEnv.loadEnvConfig(fileURLToPath(new URL('../apps/web',import.meta.url)));
const env=process.env;
const digits=(env.ACADEMY_ACCOUNT_PHONE || '').trim().replace(/[\s()-]/g,'');
const phone=/^\d{10}$/.test(digits)?`+91${digits}`:digits;
const email=(env.ACADEMY_ACCOUNT_EMAIL || '').trim().toLowerCase();
const password=readOwnerPassword();
if(!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !email || !phone)throw new Error('Owner contacts and Supabase configuration are required.');
const options={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,options);
const verifier=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,options);
if(process.argv.includes('--inspect')){
  const {data,error}=await admin.from('users').select('role,status,phone').eq('email',email);
  if(error)throw new Error(`Owner lookup failed (${error.code || 'connection error'}).`);
  console.log('Configured email profile count:',data.length);
  console.log('Profile matches:',JSON.stringify(data.map(row=>({owner:row.role==='owner',active:row.status==='active',phoneMatches:row.phone===phone}))));
  const byPhone=await admin.from('users').select('role,status').eq('phone',phone);
  const owners=await admin.from('users').select('id',{count:'exact',head:true}).eq('role','owner').eq('status','active');
  if(byPhone.error || owners.error)throw new Error('Additional owner lookup failed.');
  console.log('Configured phone profile count:',byPhone.data.length);
  console.log('Permanent active owner count:',owners.count);
  process.exit(0);
}
const result=await synchronizeOwnerPassword({admin,verifier,email,phone,password});
console.log(result==='already-matches'?'Owner Auth password already matches ACADEMY_ACCOUNT_PASSWORD. No password reset performed.':'Owner Auth password synchronized from ACADEMY_ACCOUNT_PASSWORD. First-login password change required.');
