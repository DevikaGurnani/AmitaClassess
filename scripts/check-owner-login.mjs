// Verify the configured owner's real login without changing their password.
// Recovery code is generated/consumed for testing, never printed or emailed.
import nextEnv from '@next/env';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { root } from './database-upgrade.mjs';
import { readOwnerPassword } from './owner-password.mjs';
nextEnv.loadEnvConfig(path.join(root,'apps/web'));
const origin=process.env.APP_TEST_ORIGIN || 'http://localhost:3000';
const email=process.env.ACADEMY_ACCOUNT_EMAIL.trim().toLowerCase();
const phone=process.env.ACADEMY_ACCOUNT_PHONE.trim();
const password=readOwnerPassword();
for(const identifier of [email,phone]){
  const response=await fetch(`${origin}/api/auth/password`,{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({identifier,password}),signal:AbortSignal.timeout(30000)});
  const result=await response.json();
  if(!response.ok)throw new Error(`Owner login failed: HTTP ${response.status} ${result.error || ''}`);
  assert.equal(result.redirect,'/auth/update-password');
}
console.log('PASS: configured owner email/mobile login; first-password-change redirect required');
const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const {data,error}=await admin.auth.admin.generateLink({type:'recovery',email});
if(error)throw new Error(`Recovery token generation failed: ${error.code || error.name}`);
const response=await fetch(`${origin}/api/auth/signin`,{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({email,otp:data.properties.email_otp}),signal:AbortSignal.timeout(30000)});
assert.equal(response.status,200);assert.equal((await response.json()).redirect,'/auth/update-password');
const cookieHeader=response.headers.get('set-cookie') || '';
// Sign out the temporary recovery session using the cookies returned by the route.
const cookieStore=new Map();
for(const match of cookieHeader.matchAll(/(?:^|,\s*)(sb-[^=;\s]+)=([^;]*)/g))cookieStore.set(match[1],match[2]);
const recovery=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...cookieStore].map(([name,value])=>({name,value})),setAll:items=>items.forEach(({name,value})=>cookieStore.set(name,value))}});
await recovery.auth.signOut({scope:'local'});
console.log('PASS: real email recovery-code verification and reset-page session (no email sent; password unchanged)');
