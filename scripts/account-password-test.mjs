import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const module = { exports: {} };
new Function('module', 'exports', ts.transpileModule(readFileSync(new URL('../apps/web/src/lib/account-validation.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(module, module.exports);
const { loginIdentity, validateAccount, validateNewPassword } = module.exports;
test('admin creation rejects unauthorized requests and rolls back profile failures', async t => {
  const actorId = randomUUID();
  let state;
  const client = {
    auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
    from: table => ({ select: () => ({ eq: () => ({
      single: async () => ({ data: table === 'students' ? state.student : state.actor }),
      maybeSingle: async () => ({ data: state.existing ?? null, error: null }),
    }) }) }),
  };
  const admin = {
    auth: { admin: {
      createUser: async attributes => { state.created.push(attributes); return { data: { user: { id: actorId } }, error: null }; },
      deleteUser: async id => { state.deleted.push(id); return { error: null }; },
    } },
    from: () => ({ insert: attributes => {
      state.profile = attributes;
      return { select: () => ({ single: async () => ({ data: attributes, error: state.profileError }) }) };
    } }),
  };
  const route = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL('../apps/web/src/app/api/admin/users/route.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  new Function('module','exports','require',code)(route,route.exports,name => {
    if (name === 'next/server') return { NextResponse: { json: (body, options) => Response.json(body, options) } };
    if (name === '@supabase/supabase-js') return { createClient: () => admin };
    if (name === '@/lib/supabase/server') return { createServerSupabaseClient: () => client };
    if (name === '@/lib/account-validation') return module.exports;
    throw new Error(`Unexpected import ${name}`);
  });
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL, oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-key';
  const reset = () => { state = { user: { id: actorId, app_metadata: {} }, actor: { role: 'owner', status: 'active' }, created: [], deleted: [] }; };
  const input = { name: 'Teacher', email: 'teacher@example.com', phone: '9876543210', role: 'teacher' };
  const send = (body=input,origin='http://localhost:3000') => route.exports.POST(new Request('http://localhost:3000/api/admin/users', { method: 'POST', headers: { origin, 'content-type':'application/json' }, body: JSON.stringify(body) }));
  try {
    await t.test('cross-origin and signed-out callers cannot provision users',async()=>{
      reset(); assert.equal((await send(input,'https://other.test')).status,403);
      state.user=null; assert.equal((await send()).status,401); assert.equal(state.created.length,0);
    });
    await t.test('staff, inactive owners and temporary-password owners are denied',async()=>{
      reset(); state.actor.role='staff'; assert.equal((await send()).status,403);
      reset(); state.actor.status='inactive'; assert.equal((await send()).status,403);
      reset(); state.user.app_metadata.must_change_password=true; assert.equal((await send()).status,403);
      assert.equal(state.created.length,0);
    });
    await t.test('missing email is rejected before Auth writes',async()=>{
      reset(); assert.equal((await send({ ...input,email:'' })).status,400); assert.equal(state.created.length,0);
    });
    await t.test('client cannot override temporary password or server flag',async()=>{
      reset(); assert.equal((await send({ ...input,password:'override',must_change_password:false })).status,201);
      assert.equal(state.created[0].password,'123456');
      assert.equal(state.created[0].app_metadata.must_change_password,true);
      assert.equal(state.profile.email,'teacher@example.com');
    });
    await t.test('profile failure rolls back only the newly created Auth identity',async()=>{
      reset(); state.profileError={ message:'failed' };
      assert.equal((await send()).status,500); assert.deepEqual(state.deleted,[actorId]);
    });
    await t.test('student login must match saved admission and is linked immediately',async()=>{
      reset(); const studentId = randomUUID();
      const body = { ...input, role:'student', student_id:studentId };
      assert.equal((await send(body)).status,400);
      state.student={ id:studentId, name:input.name,email:'other@example.com',phone:input.phone };
      assert.equal((await send(body)).status,409); assert.equal(state.created.length,0);
      state.student={ id:studentId, name:input.name,email:input.email,phone:'+919876543210' };
      assert.equal((await send(body)).status,201); assert.equal(state.profile.student_id,studentId);
    });
    await t.test('retry returns matching linked login without resetting its password',async()=>{
      reset(); const studentId = randomUUID();
      state.student={ id:studentId,name:input.name,email:input.email,phone:'+919876543210' };
      state.existing={ ...state.student, id:actorId,student_id:studentId,role:'student',status:'active' };
      assert.equal((await send({ ...input,role:'student',student_id:studentId })).status,200);
      assert.equal(state.created.length,0);
      state.existing.status='inactive';
      assert.equal((await send({ ...input,role:'student',student_id:studentId })).status,409);
    });
  } finally {
    if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL=oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY=oldKey;
  }
});
test('one identifier accepts email or mobile; creation requires both contacts', () => {
  assert.deepEqual(loginIdentity(' User@Example.com '), { email: 'user@example.com' });
  assert.deepEqual(loginIdentity('98765 43210'), { phone: '+919876543210' });
  assert.deepEqual(loginIdentity('+44 7911 123456'), { phone: '+447911123456' });
  assert.throws(() => loginIdentity('wrong@'));
  assert.throws(() => validateAccount({ name: 'Test', phone: '9876543210', role: 'teacher' }));
  assert.throws(() => validateAccount({ name: 'Test', email: 'test@example.com', phone: '9876543210', role: 'superuser' }));
  assert.equal(validateAccount({ name: 'Test', email: 'test@example.com', phone: '9876543210', role: 'parent' }).email, 'test@example.com');
  assert.throws(() => validateNewPassword('123456', '123456'));
  assert.throws(() => validateNewPassword('new-password', 'different-password'));
  assert.doesNotThrow(() => validateNewPassword('my-new-password', 'my-new-password'));
});
test('first-password requirement is enforced in SQL and clears only on hash change', async t => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY, encrypted_password text, raw_app_meta_data jsonb DEFAULT '{}'::jsonb, raw_user_meta_data jsonb DEFAULT '{}'::jsonb);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE FUNCTION public.uuid_generate_v4() RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;
      GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;`);
    for (const file of ['20261031_01_initial_schema.sql','20261110_02_phase2.sql','20261111_03_core_workflows.sql','20261113_04_student_console.sql']) {
      await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url),'utf8').replace('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',''));
    }
    const owner = randomUUID(), learner = randomUUID(), student = randomUUID();
    await db.query("INSERT INTO auth.users(id,encrypted_password,raw_app_meta_data) VALUES($1,'oldhash','{\"must_change_password\":true}'),($2,'hash','{}')",[owner,learner]);
    await db.query("INSERT INTO users(id,name,phone,role) VALUES($1,'Legacy owner','+919000000001','owner'),($2,'Legacy student','+919000000002','student')",[owner,learner]);
    await db.query("INSERT INTO students(id,name,class,date_of_birth,admission_date) VALUES($1,'Learner','10','2011-01-01',current_date)",[student]);
    await db.query('UPDATE users SET student_id=$1 WHERE id=$2',[student,learner]);
    await db.exec(readFileSync(new URL('../supabase/migrations/20261113_05_account_passwords.sql',import.meta.url),'utf8'));
    await db.exec('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated;');
    async function asUser(id, sql) {
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[id]);
      await db.exec('SET ROLE authenticated');
      try { return await db.query(sql); } finally { await db.exec('RESET ROLE'); }
    }
    await t.test('temporary owner can read own profile but no academy data or RPC writes',async()=>{
      assert.equal((await asUser(owner,'SELECT * FROM users')).rows.length,1);
      assert.equal((await asUser(owner,'SELECT * FROM students')).rows.length,0);
      await assert.rejects(asUser(owner,"INSERT INTO batches(name,class) VALUES('Blocked','10')"));
      assert.equal((await asUser(owner,'SELECT private.current_role() AS role')).rows[0].role,null);
    });
    await t.test('user metadata cannot bypass the requirement',async()=>{
      await db.query("UPDATE auth.users SET raw_user_meta_data='{\"must_change_password\":false}' WHERE id=$1",[owner]);
      assert.equal((await asUser(owner,'SELECT private.password_ready() AS ready')).rows[0].ready,false);
      await db.query('UPDATE auth.users SET encrypted_password=encrypted_password WHERE id=$1',[owner]);
      assert.equal((await asUser(owner,'SELECT private.password_ready() AS ready')).rows[0].ready,false);
    });
    await t.test('actual hash update unlocks owner without erasing other metadata',async()=>{
      await db.query("UPDATE auth.users SET raw_app_meta_data=raw_app_meta_data || '{\"provider\":\"email\"}'::jsonb WHERE id=$1",[owner]);
      await db.query("UPDATE auth.users SET encrypted_password='newhash' WHERE id=$1",[owner]);
      assert.equal((await asUser(owner,'SELECT private.current_role() AS role')).rows[0].role,'owner');
      assert.equal((await asUser(owner,'SELECT * FROM students')).rows.length,1);
      assert.equal((await db.query('SELECT raw_app_meta_data FROM auth.users WHERE id=$1',[owner])).rows[0].raw_app_meta_data.provider,'email');
    });
    await t.test('student policies cannot bypass first-login restriction',async()=>{
      assert.equal((await asUser(learner,'SELECT * FROM students')).rows.length,1);
      await db.query("UPDATE auth.users SET raw_app_meta_data='{\"must_change_password\":true}' WHERE id=$1",[learner]);
      assert.equal((await asUser(learner,'SELECT * FROM students')).rows.length,0);
    });
    await t.test('new accounts require email; legacy profile updates still work',async()=>{
      const id=randomUUID();
      await db.query('INSERT INTO auth.users(id) VALUES($1)',[id]);
      await assert.rejects(db.query("INSERT INTO users(id,name,phone,role) VALUES($1,'Missing email','+919000000003','parent')",[id]),/email/);
      await db.query("INSERT INTO users(id,name,phone,email,role) VALUES($1,'Valid','+919000000003','NEW@Example.com','parent')",[id]);
      assert.equal((await db.query('SELECT email FROM users WHERE id=$1',[id])).rows[0].email,'new@example.com');
      await db.query("UPDATE users SET name='Updated' WHERE id=$1",[owner]);
    });
  } finally { await db.close(); }
});
