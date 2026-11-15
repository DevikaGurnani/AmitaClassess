// Explicit live acceptance check: temporary Auth/profile records are removed.
// Financial/admission scenarios run in a transaction that is always rolled back.
import nextEnv from '@next/env';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { root } from './database-upgrade.mjs';
nextEnv.loadEnvConfig(path.join(root,'apps/web'));
const endpoint=process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
const connection=new URL(process.env.SUPABASE_DB_URL || process.env.DATABASE_URL);
const ref=new URL(endpoint).hostname.split('.')[0];
if (connection.hostname!==`db.${ref}.supabase.co` && !(connection.hostname.endsWith('.pooler.supabase.com') && decodeURIComponent(connection.username)===`postgres.${ref}`)) throw new Error('Database project mismatch');
for(const name of ['sslmode','sslrootcert','sslcert','sslkey'])connection.searchParams.delete(name);
const db=new pg.Client({connectionString:connection.toString(),connectionTimeoutMillis:15000,ssl:{ca:readFileSync(process.env.SUPABASE_DB_CA_PATH || path.join(root,'.runtime/supabase-ca.crt'),'utf8'),rejectUnauthorized:true,servername:connection.hostname}});
const admin=createClient(endpoint,secret,{auth:{persistSession:false,autoRefreshToken:false}});
const ids=[];
const studentId=randomUUID();
const stamp=randomUUID();
const ownerEmail=`tuition-owner-${stamp}@example.com`;
const studentEmail=`tuition-student-${stamp}@example.com`;
const ownerPhone='+12025550101';
const studentPhone='+12025550102';
let transaction=false;
let connected=false;
const origin=process.env.APP_TEST_ORIGIN || 'http://localhost:3000';
const cookieStore=new Map();
const client=createServerClient(endpoint,publicKey,{cookies:{
  getAll:()=>[...cookieStore].map(([name,value])=>({name,value})),
  setAll:items=>items.forEach(({name,value})=>value ? cookieStore.set(name,value) : cookieStore.delete(name)),
}});
const fail=(error,label)=>{if(error)throw new Error(`${label}: ${error.code || error.name || 'failed'} ${error.message || ''}`);};
try {
  await db.connect();connected=true;
  const {data:created,error:createError}=await admin.auth.admin.createUser({email:ownerEmail,password:'123456',email_confirm:true,app_metadata:{must_change_password:true}});
  fail(createError,'Temporary owner creation');
  ids.push(created.user.id);
  await db.query("INSERT INTO public.users(id,name,email,phone,role,status) VALUES($1,'Temporary setup verifier',$2,$3,'owner','active')",[created.user.id,ownerEmail,ownerPhone]);
  const {data:signed,error:signError}=await client.auth.signInWithPassword({email:ownerEmail,password:'123456'});
  fail(signError,'Email/password login');assert.equal(signed.user.app_metadata.must_change_password,true);
  const blocked=await client.from('students').select('id').limit(1);fail(blocked.error,'Temporary-password RLS check');assert.equal(blocked.data.length,0);
  console.log('PASS: email/password login and first-login data restriction');
  const changed=await client.auth.updateUser({password:`Private-${randomUUID()}!`});fail(changed.error,'First password update');
  const refreshed=await client.auth.refreshSession();fail(refreshed.error,'Session refresh');assert.equal(refreshed.data.user.app_metadata.must_change_password,false);
  console.log('PASS: actual password change clears the server-owned first-login flag');

  await db.query('BEGIN');transaction=true;
  await db.query('SET LOCAL ROLE authenticated');
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[created.user.id]);
  const batch=randomUUID(),learner=randomUUID(),payment=randomUUID();
  await db.query("INSERT INTO batches(id,name,class,base_fee) VALUES($1,'Temporary acceptance batch','10',1000)",[batch]);
  const student={name:'Temporary admission verifier',class:'10',date_of_birth:'2010-01-01',admission_date:new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'}),status:'active',email:`admission-${stamp}@example.com`,phone:'+12025550103'};
  const guardian={name:'Temporary guardian',phone:'+12025550104',relation:'guardian'};
  for(let attempt=0;attempt<2;attempt++)await db.query('SELECT save_student_admission($1,true,$2::jsonb,NULL,$3::jsonb,$4::uuid[],NULL)',[learner,JSON.stringify(student),JSON.stringify(guardian),[batch]]);
  const saved=(await db.query('SELECT email,phone FROM students WHERE id=$1',[learner])).rows[0];assert.equal(saved.email,student.email);
  const month=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'}).slice(0,7)+'-01';
  const due=(await db.query('SELECT generate_student_due($1,$2) AS id',[learner,month])).rows[0].id;
  await db.query("SELECT record_manual_payment($1,$2,400,'cash',NULL)",[payment,due]);
  assert.equal((await db.query('SELECT paid_amount FROM fee_dues WHERE id=$1',[due])).rows[0].paid_amount,400);
  await db.query('SELECT reverse_manual_payment($1,$2,$3)',[randomUUID(),payment,'Temporary acceptance test']);
  assert.equal((await db.query('SELECT paid_amount FROM fee_dues WHERE id=$1',[due])).rows[0].paid_amount,0);
  await db.query('ROLLBACK');transaction=false;
  console.log('PASS: live admission/contact retry, fee generation, partial payment and owner reversal (all rolled back)');

  await db.query("INSERT INTO students(id,name,class,date_of_birth,admission_date,email,phone) VALUES($1,'Temporary student verifier','10','2010-01-01',current_date,$2,$3)",[studentId,studentEmail,studentPhone]);
  const response=await fetch(`${origin}/api/admin/users`,{method:'POST',headers:{origin,'Content-Type':'application/json',cookie:[...cookieStore].map(([name,value])=>`${name}=${value}`).join('; ')},body:JSON.stringify({name:'Temporary student verifier',email:studentEmail,phone:studentPhone,role:'student',student_id:studentId}),signal:AbortSignal.timeout(30000)});
  const body=await response.json();
  if(!response.ok)throw new Error(`Student account endpoint HTTP ${response.status}: ${body.error || 'failed'}`);
  ids.push(body.account.id);assert.equal(body.account.student_id,studentId);
  console.log('PASS: running application creates and links a real student account');
  const studentClient=createClient(endpoint,publicKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const studentSigned=await studentClient.auth.signInWithPassword({email:studentEmail,password:'123456'});fail(studentSigned.error,'Student email/password login');
  assert.equal(studentSigned.data.user.app_metadata.must_change_password,true);
  const personalPassword=`Private-${randomUUID()}!`;
  fail((await studentClient.auth.updateUser({password:personalPassword})).error,'Student first password update');
  fail((await studentClient.auth.refreshSession()).error,'Student token refresh');
  const own=await studentClient.from('students').select('id');fail(own.error,'Student isolation');assert.deepEqual(own.data.map(row=>row.id),[studentId]);
  console.log('PASS: real student login, first password change and own-profile isolation');
  for (const identifier of [studentEmail,studentPhone]) {
    const login=await fetch(`${origin}/api/auth/password`,{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({identifier,password:personalPassword}),signal:AbortSignal.timeout(30000)});
    const result=await login.json();
    if(!login.ok)throw new Error(`Unified password login failed (HTTP ${login.status}): ${result.error || 'failed'}`);
    assert.equal(result.redirect,'/dashboard');
    assert.ok(login.headers.get('set-cookie'));
  }
  console.log('PASS: application email/mobile password login with session cookies (no SMS needed)');
  await studentClient.auth.signOut();await client.auth.signOut();
} finally {
  if(connected && transaction)await db.query('ROLLBACK');
  if(connected){
    const leftovers=await db.query('SELECT id FROM auth.users WHERE email=ANY($1::text[])',[[ownerEmail,studentEmail]]);
    for(const row of leftovers.rows)if(!ids.includes(row.id))ids.push(row.id);
  }
  let cleanupError=false;
  for(const id of ids.reverse()){
    const {error}=await admin.auth.admin.deleteUser(id);
    if(error){cleanupError=true;console.error('Temporary Auth cleanup failed; inspect setup verifier accounts before retrying.');}
  }
  if(connected){
    await db.query('DELETE FROM students WHERE id=$1',[studentId]);
    await db.query('DELETE FROM audit_log WHERE entity_id=ANY($1::uuid[])',[[studentId,...ids]]);
    const ownerCount=await db.query("SELECT count(*)::int total FROM public.users u JOIN auth.users a ON a.id=u.id WHERE u.role='owner' AND u.status='active'");
    console.log('Permanent active owner accounts remaining:',ownerCount.rows[0].total);
    await db.end();
  }
  if(cleanupError)process.exitCode=1;
  else console.log('Temporary acceptance identities/records cleaned up.');
}
