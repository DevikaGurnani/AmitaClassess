import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { buildUpgrade, applicationTables } from './database-upgrade.mjs';
test('complete setup is repeatable and preserves existing identities, students and policies',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE SCHEMA extensions;
      CREATE TABLE auth.users(id uuid PRIMARY KEY,encrypted_password text,raw_app_meta_data jsonb DEFAULT '{}');
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE FUNCTION public.uuid_generate_v4() RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;
      GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;`);
    const sql=buildUpgrade().replace('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";','');
    async function apply() {
      try { await db.exec(sql); }
      catch (error) {
        console.error('SQL error context:',JSON.stringify({position:error.position,internalPosition:error.internalPosition,internalQuery:error.internalQuery,where:error.where}));
        const position=Number(error.position ?? 0);
        if (position) console.error('Generated SQL near failure:',sql.slice(Math.max(0,position-120),position+120));
        throw error;
      }
    }
    await apply();
    const owner=randomUUID(),student=randomUUID();
    await db.query('INSERT INTO auth.users(id) VALUES($1)',[owner]);
    await db.query("INSERT INTO users(id,name,email,phone,role) VALUES($1,'Owner','owner@example.test','+919000000001','owner')",[owner]);
    await db.query("INSERT INTO students(id,name,class,date_of_birth,admission_date) VALUES($1,'Preserved','10','2010-01-01',current_date)",[student]);
    // A permissive policy from an older/manual setup must not survive repair.
    await db.exec('CREATE POLICY unsafe_legacy_read ON students FOR SELECT TO authenticated USING(true)');
    await db.exec('ALTER TABLE notices RENAME COLUMN class_id TO class');
    await db.exec("INSERT INTO notices(audience,class,title,body) VALUES('class','10','Legacy audience','Preserve this notice')");
    const before=(await db.query('SELECT id,name FROM students')).rows;
    await apply();
    assert.deepEqual((await db.query('SELECT id,name FROM students')).rows,before);
    assert.equal((await db.query('SELECT count(*)::int total FROM auth.users')).rows[0].total,1);
    assert.equal((await db.query("SELECT class_id FROM notices WHERE title='Legacy audience'")).rows[0].class_id,'10');
    assert.equal((await db.query("SELECT count(*)::int total FROM pg_tables WHERE schemaname='public' AND tablename=ANY($1::text[])",[applicationTables])).rows[0].total,20);
    assert.equal((await db.query("SELECT count(*)::int total FROM pg_policies WHERE policyname='unsafe_legacy_read'")).rows[0].total,0);
    assert.equal((await db.query("SELECT count(*)::int total FROM pg_policies WHERE policyname='require_password_change'")).rows[0].total,19);
    assert.equal((await db.query("SELECT count(*)::int total FROM pg_policies WHERE policyname IN ('Owner full access','Staff access','Teacher access','Parent self access')")).rows[0].total,0);
    assert.equal((await db.query("SELECT count(*)::int total FROM pg_constraint WHERE conname IN ('payments_due_id_fkey','payments_student_id_fkey') AND confdeltype='r'")).rows[0].total,2);
  } finally {await db.close();}
});
