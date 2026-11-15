import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('student console database permissions and owner account linking', async context => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY, encrypted_password text, raw_app_meta_data jsonb DEFAULT '{}'::jsonb);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE FUNCTION public.uuid_generate_v4() RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;
      GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;`);
    for (const file of ['20261031_01_initial_schema.sql', '20261110_02_phase2.sql', '20261111_03_core_workflows.sql', '20261113_04_student_console.sql', '20261113_05_account_passwords.sql', '20261115_06_student_contacts.sql']) {
      await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8').replace('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";', ''));
    }
    await db.exec('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;');
    const owner = randomUUID(), login = randomUUID(), otherLogin = randomUUID(), parent = randomUUID();
    const student = randomUUID(), other = randomUUID(), batch = randomUUID(), otherBatch = randomUUID(), testId = randomUUID();
    for (const [id, role, phone] of [[owner,'owner','+919000000001'],[login,'student','+919000000002'],[otherLogin,'student','+919000000003'],[parent,'parent','+919000000004']]) {
      await db.query('INSERT INTO auth.users(id) VALUES($1)', [id]);
      await db.query("INSERT INTO users(id,name,role,phone,email) VALUES($1::uuid,$2,$2,$3,$1::uuid::text || '@example.test')", [id,role,phone]);
    }
    await db.query("INSERT INTO students(id,name,class,board,date_of_birth,admission_date) VALUES($1,'Aarav','10','CBSE','2011-01-01',current_date-20),($2,'Other learner','9','CBSE','2012-01-01',current_date-20)", [student,other]);
    await db.query("INSERT INTO batches(id,name,class,base_fee) VALUES($1,'Math','10',1000),($2,'Science','9',1000)", [batch,otherBatch]);
    await db.query("INSERT INTO student_batch(student_id,batch_id,start_date) VALUES($1,$2,current_date-10),($3,$4,current_date-10)", [student,batch,other,otherBatch]);
    await db.query("INSERT INTO attendance(student_id,batch_id,date,status,marked_by) VALUES($1,$2,current_date,'present',$5),($3,$4,current_date,'absent',$5)", [student,batch,other,otherBatch,owner]);
    await db.query("INSERT INTO tests(id,batch_id,title,subject,test_date,max_marks,created_by) VALUES($1,$2,'Algebra','Math',current_date,50,$3)", [testId,batch,owner]);
    await db.query("INSERT INTO test_marks(test_id,student_id,marks,entered_by) VALUES($1,$2,45,$4),($1,$3,35,$4)", [testId,student,other,owner]);
    await db.query("INSERT INTO materials(batch_id,title,subject,file_url,is_hidden) VALUES($1,'Visible notes','Math','https://example.org/notes',false),($1,'Hidden notes','Math','https://example.org/hidden',true),($2,'Other notes','Science','https://example.org/other',false)", [batch,otherBatch]);
    await db.query("INSERT INTO notices(title,body,audience,batch_id,class_id,expires_at) VALUES('All','Update','all',null,null,null),('My batch','Update','batch',$1,null,null),('Other batch','Update','batch',$2,null,null),('My class','Update','class',null,'10',null),('Other class','Update','class',null,'9',null),('Expired','Update','all',null,null,now()-interval '1 day')", [batch,otherBatch]);
    const guardian = randomUUID();
    await db.query("INSERT INTO parents(id,user_id,name,phone,relation) VALUES($1,$2,'Parent','+919000000004','mother')", [guardian,parent]);
    await db.query("INSERT INTO student_parent(student_id,parent_id,is_primary,relation) VALUES($1,$2,true,'mother')",[student,guardian]);
    async function actor(id) { await db.exec('SET ROLE authenticated'); await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[id]); }
    async function count(table) { return (await db.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n; }
    await context.test('only owner links a login to the authoritative student profile', async () => {
      await actor(owner);
      await db.query('UPDATE users SET student_id=$1 WHERE id=$2',[student,login]);
      assert.equal((await db.query('SELECT student_id FROM users WHERE id=$1',[login])).rows[0].student_id,student);
      const due = (await db.query("SELECT generate_student_due($1,date_trunc('month',current_date)::date) id",[student])).rows[0].id;
      await db.query("SELECT record_manual_payment($1,$2,100,'cash',NULL)",[randomUUID(),due]);
      await actor(login);
      const attempted = await db.query('UPDATE users SET student_id=$1 WHERE id=$2 RETURNING id',[other,login]);
      assert.equal(attempted.rows.length,0);
      assert.equal((await db.query('SELECT student_id FROM users WHERE id=$1',[login])).rows[0].student_id,student);
    });
    await context.test('student sees only own learning records and assigned visible resources', async () => {
      await actor(login);
      assert.equal(await count('students'),1); assert.equal(await count('student_batch'),1); assert.equal(await count('batches'),1);
      assert.equal(await count('attendance'),1); assert.equal(await count('test_marks'),1); assert.equal(await count('materials'),1);
      assert.equal(Number((await db.query('SELECT marks,title FROM test_marks JOIN tests ON tests.id=test_marks.test_id')).rows[0].marks),45);
      assert.deepEqual((await db.query('SELECT title FROM notices ORDER BY title')).rows.map(row=>row.title),['All','My batch','My class']);
      assert.equal(await count('fee_dues'),0); assert.equal(await count('payments'),0);
    });
    await context.test('student cannot edit attendance, profiles, or learning resources', async () => {
      await actor(login);
      assert.equal((await db.query("UPDATE students SET name='Changed' WHERE id=$1 RETURNING id",[student])).rows.length,0);
      await assert.rejects(db.query("INSERT INTO attendance(student_id,batch_id,date,status,marked_by) VALUES($1,$2,current_date-1,'present',$3)",[student,batch,login]),/row-level security/);
      await assert.rejects(db.query("INSERT INTO materials(batch_id,title,subject,file_url,uploaded_by) VALUES($1,'Wrong','Math','https://example.org',$2)",[batch,login]),/row-level security/);
    });
    await context.test('unlinked student cannot read another learner by supplying an ID', async () => {
      await actor(otherLogin);
      assert.equal(await count('students'),0); assert.equal(await count('attendance'),0); assert.equal(await count('test_marks'),0); assert.equal(await count('materials'),0);
      assert.equal((await db.query('SELECT id FROM students WHERE id=$1',[student])).rows.length,0);
    });
    await context.test('parent reads linked child and student account linking stays owner-only', async () => {
      await actor(parent);
      assert.equal(await count('students'),1); assert.equal(await count('test_marks'),1); assert.equal(await count('fee_dues'),1); assert.equal(await count('payments'),1);
      assert.equal((await db.query('UPDATE users SET student_id=$1 WHERE id=$2 RETURNING id',[other,login])).rows.length,0);
    });
    await context.test('ending enrolment removes resources while preserving past personal results', async () => {
      await actor(owner);
      await db.query('UPDATE student_batch SET end_date=current_date-1 WHERE student_id=$1',[student]);
      await actor(login);
      assert.equal(await count('batches'),0); assert.equal(await count('materials'),0);
      assert.equal((await db.query('SELECT marks,title FROM test_marks JOIN tests ON tests.id=test_marks.test_id')).rows.length,1);
    });
    await context.test('inactive student login loses all learning access', async () => {
      await actor(owner); await db.query("UPDATE users SET status='inactive' WHERE id=$1",[login]);
      await actor(login); assert.equal(await count('students'),0); assert.equal(await count('attendance'),0); assert.equal(await count('test_marks'),0); assert.equal(await count('notices'),0);
    });
  } finally { await db.close(); }
});
