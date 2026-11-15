import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('Phase 3 database workflows and role isolation', async context => {
  const db = new PGlite();
  try {
    // Supabase supplies these roles and auth objects. The local harness emulates
    // auth.uid() and UUID generation while running the actual table/RLS/RPC SQL.
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY, encrypted_password text, raw_app_meta_data jsonb DEFAULT '{}'::jsonb);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE FUNCTION public.uuid_generate_v4() RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;
      GRANT USAGE ON SCHEMA auth TO authenticated;
      GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
    `);
    for (const file of ['20261031_01_initial_schema.sql', '20261110_02_phase2.sql', '20261111_03_core_workflows.sql', '20261113_04_student_console.sql', '20261113_05_account_passwords.sql', '20261115_06_student_contacts.sql']) {
      const sql = readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8')
        .replace('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";', '');
      await db.exec(sql);
    }
    await db.exec('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;');
    const owner = randomUUID(), staff = randomUUID(), parent = randomUUID(), otherParent = randomUUID();
    const batch = randomUUID(), secondBatch = randomUUID(), inactiveBatch = randomUUID();
    for (const [id, role, phone] of [[owner, 'owner', '+919000000001'], [staff, 'staff', '+919000000002'], [parent, 'parent', '+919000000003'], [otherParent, 'parent', '+919000000004']]) {
      await db.query('INSERT INTO auth.users(id) VALUES($1)', [id]);
      await db.query("INSERT INTO users(id,name,phone,role,email) VALUES($1::uuid,$2,$3,$2,$1::uuid::text || '@example.test')", [id, role, phone]);
    }
    await db.query(`INSERT INTO batches(id,name,class,base_fee,is_active) VALUES
      ($1,'Math','9',1500,true),($2,'Science','9',500,true),($3,'Ended','9',100,false)`, [batch, secondBatch, inactiveBatch]);
    const [{ today, billing_month: month }] = (await db.query(`SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date::text AS today,
      date_trunc('month',now() AT TIME ZONE 'Asia/Kolkata')::date::text AS billing_month`)).rows;
    const studentId = randomUUID();
    const student = { name: 'Test Student', class: '9', date_of_birth: '2014-01-01', admission_date: today, school: 'Test School', board: 'CBSE', status: 'active' };
    const guardian = { name: 'Test Guardian', phone: '+919000000003', relation: 'mother', user_id: parent };
    async function actor(id) {
      await db.exec('SET ROLE authenticated');
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]);
    }
    async function save(id, create, values = student, parentId = null, guardianValues = guardian, batches = [batch, secondBatch], version = null) {
      return db.query('SELECT save_student_profile($1,$2,$3::jsonb,$4,$5::jsonb,$6::uuid[],$7) id',
        [id, create, JSON.stringify(values), parentId, JSON.stringify(guardianValues), batches, version]);
    }
    await actor(owner);
    let guardianId, dueId, paymentId;

    await context.test('admission links a guardian account and multiple batches atomically', async () => {
      await save(studentId, true);
      assert.equal((await db.query('SELECT count(*)::int total FROM student_batch WHERE student_id=$1', [studentId])).rows[0].total, 2);
      guardianId = (await db.query('SELECT parent_id FROM student_parent WHERE student_id=$1 AND is_primary', [studentId])).rows[0].parent_id;
      assert.equal((await db.query('SELECT user_id FROM parents WHERE id=$1', [guardianId])).rows[0].user_id, parent);
    });
    await context.test('retrying admission does not duplicate guardians or enrollments', async () => {
      await save(studentId, true);
      assert.equal((await db.query('SELECT count(*)::int total FROM parents')).rows[0].total, 1);
      assert.equal((await db.query('SELECT count(*)::int total FROM student_batch')).rows[0].total, 2);
    });
    await context.test('late validation errors roll back new guardian and student records', async () => {
      const badId = randomUUID();
      await assert.rejects(save(badId, true, { ...student, board: 'Invalid' }, null, { ...guardian, user_id: '' }));
      assert.equal((await db.query('SELECT count(*)::int total FROM students WHERE id=$1', [badId])).rows[0].total, 0);
      assert.equal((await db.query('SELECT count(*)::int total FROM parents')).rows[0].total, 1);
      await assert.rejects(save(randomUUID(), true, student, guardianId, guardian, [inactiveBatch]), /active batches/);
    });
    await context.test('siblings reuse the same guardian record', async () => {
      await save(randomUUID(), true, { ...student, name: 'Sibling' }, guardianId);
      assert.equal((await db.query('SELECT count(*)::int total FROM parents')).rows[0].total, 1);
      assert.equal((await db.query('SELECT count(*)::int total FROM student_parent WHERE parent_id=$1', [guardianId])).rows[0].total, 2);
    });
    await context.test('billing totals custom fees and preserves an existing due on retry', async () => {
      await db.query('UPDATE student_batch SET custom_fee=1200 WHERE student_id=$1 AND batch_id=$2', [studentId, batch]);
      dueId = (await db.query('SELECT generate_student_due($1,$2) id', [studentId, month])).rows[0].id;
      assert.equal((await db.query('SELECT generated_amount FROM fee_dues WHERE id=$1', [dueId])).rows[0].generated_amount, 1700);
      assert.equal((await db.query('SELECT generate_student_due($1,$2) id', [studentId, month])).rows[0].id, dueId);
    });
    await context.test('partial payment retries are idempotent and regeneration retains balances', async () => {
      paymentId = randomUUID();
      for (let attempt = 0; attempt < 2; attempt++) {
        await db.query("SELECT record_manual_payment($1,$2,500,'cash',NULL)", [paymentId, dueId]);
      }
      await db.query('SELECT generate_student_due($1,$2)', [studentId, month]);
      const due = (await db.query('SELECT paid_amount,generated_amount FROM fee_dues WHERE id=$1', [dueId])).rows[0];
      assert.deepEqual(due, { paid_amount: 500, generated_amount: 1700 });
      assert.equal((await db.query('SELECT count(*)::int total FROM payments WHERE due_id=$1', [dueId])).rows[0].total, 1);
      await assert.rejects(db.query("SELECT record_manual_payment($1,$2,600,'cash',NULL)", [paymentId, dueId]), /retry details changed/);
      await assert.rejects(db.query("SELECT record_manual_payment($1,$2,1201,'cash',NULL)", [randomUUID(), dueId]), /exceeds outstanding/);
    });
    await context.test('reversals preserve original payments and cannot double-reverse', async () => {
      await db.query('SELECT reverse_manual_payment($1,$2,$3)', [randomUUID(), paymentId, 'Entered against wrong receipt']);
      await db.query('SELECT reverse_manual_payment($1,$2,$3)', [randomUUID(), paymentId, 'Retry']);
      assert.equal((await db.query('SELECT paid_amount FROM fee_dues WHERE id=$1', [dueId])).rows[0].paid_amount, 0);
      assert.equal((await db.query('SELECT count(*)::int total FROM payments WHERE due_id=$1', [dueId])).rows[0].total, 2);
      assert.equal((await db.query('UPDATE payments SET amount=1 WHERE id=$1 RETURNING id', [paymentId])).rows.length, 0);
      assert.equal((await db.query('DELETE FROM payments WHERE id=$1 RETURNING id', [paymentId])).rows.length, 0);
      await db.exec('RESET ROLE');
      await assert.rejects(db.query('UPDATE payments SET amount=1 WHERE id=$1', [paymentId]), /immutable/);
      await actor(owner);
    });
    await context.test('stale profile edits fail and ended enrollment rows remain in history', async () => {
      const version = (await db.query('SELECT updated_at::text version FROM students WHERE id=$1', [studentId])).rows[0].version;
      await save(studentId, false, { ...student, school: 'Updated School' }, guardianId, guardian, [batch], version);
      await assert.rejects(save(studentId, false, student, guardianId, guardian, [batch], version), /updated by someone else/);
      const ended = (await db.query('SELECT end_date::text FROM student_batch WHERE student_id=$1 AND batch_id=$2', [studentId, secondBatch])).rows[0];
      assert.ok(ended.end_date);
    });
    await context.test('parent sees linked children and cannot escalate roles or write core records', async () => {
      await actor(parent);
      assert.equal((await db.query('SELECT count(*)::int total FROM students')).rows[0].total, 2);
      assert.equal((await db.query('SELECT count(*)::int total FROM users')).rows[0].total, 1);
      assert.equal((await db.query("UPDATE users SET role='owner' WHERE id=$1 RETURNING id", [parent])).rows.length, 0);
      await assert.rejects(save(randomUUID(), true), /Owner or staff/);
      await assert.rejects(db.query('SELECT generate_student_due($1,$2)', [studentId, month]), /Owner or staff/);
      await assert.rejects(db.query("SELECT record_manual_payment($1,$2,10,'cash',NULL)", [randomUUID(), dueId]), /Owner or staff/);
      await actor(otherParent);
      assert.equal((await db.query('SELECT count(*)::int total FROM students')).rows[0].total, 0);
      assert.equal((await db.query('SELECT count(*)::int total FROM fee_dues')).rows[0].total, 0);
    });
    await context.test('staff can record payments while reversals require the owner', async () => {
      await actor(staff);
      await db.query("SELECT record_manual_payment($1,$2,100,'upi','TEST-REFERENCE')", [randomUUID(), dueId]);
      await assert.rejects(db.query('SELECT reverse_manual_payment($1,$2,$3)', [randomUUID(), paymentId, 'Staff attempt']), /Owner access/);
      await actor(owner);
      assert.ok((await db.query("SELECT count(*)::int total FROM audit_log WHERE entity IN ('students','parents','payments')")).rows[0].total > 0);
    });
    await context.test('existing inactive-batch enrollment does not block profile editing', async () => {
      await db.query('UPDATE batches SET is_active=false WHERE id=$1', [batch]);
      const version = (await db.query('SELECT updated_at::text version FROM students WHERE id=$1', [studentId])).rows[0].version;
      await save(studentId, false, student, guardianId, guardian, [batch], version);
      await db.query('UPDATE batches SET is_active=true WHERE id=$1', [batch]);
    });
    await context.test('legacy billing months are reused without creating duplicate dues', async () => {
      await db.query('UPDATE fee_dues SET month=$1 WHERE id=$2', [month.slice(0, 7), dueId]);
      assert.equal((await db.query('SELECT generate_student_due($1,$2) id', [studentId, month])).rows[0].id, dueId);
      assert.equal((await db.query('SELECT count(*)::int total FROM fee_dues WHERE student_id=$1', [studentId])).rows[0].total, 1);
    });
    await context.test('an existing guardian can be linked to a parent login later', async () => {
      const additionalId = randomUUID();
      await save(additionalId, true, student, null, { ...guardian, user_id: '' });
      const guardianRow = (await db.query('SELECT parent_id FROM student_parent WHERE student_id=$1', [additionalId])).rows[0];
      const version = (await db.query('SELECT updated_at::text version FROM students WHERE id=$1', [additionalId])).rows[0].version;
      await save(additionalId, false, student, guardianRow.parent_id, { ...guardian, user_id: otherParent }, [batch], version);
      await actor(otherParent);
      assert.equal((await db.query('SELECT count(*)::int total FROM students')).rows[0].total, 1);
    });
    await context.test('canceling a same-day enrollment excludes it from new billing', async () => {
      await actor(owner);
      const canceledId = randomUUID();
      await save(canceledId, true, student, guardianId, guardian, [batch]);
      const version = (await db.query('SELECT updated_at::text version FROM students WHERE id=$1', [canceledId])).rows[0].version;
      await save(canceledId, false, student, guardianId, guardian, [], version);
      await assert.rejects(db.query('SELECT generate_student_due($1,$2)', [canceledId, month]), /No positive enrolled batch fee/);
    });
    await context.test('student contacts are required, normalized and saved with admission atomically', async () => {
      await actor(owner);
      const id = randomUUID();
      const values = { ...student, email: ' Learner@Example.test ', phone: '+919123456789' };
      const submit = (details, create = true, version = null) => db.query('SELECT save_student_admission($1,$2,$3::jsonb,$4,$5::jsonb,$6::uuid[],$7) id', [id,create,JSON.stringify(details),guardianId,JSON.stringify(guardian),[batch],version]);
      await assert.rejects(submit({ ...values, email: '' }), /email/);
      await assert.rejects(submit({ ...values, phone: '123' }), /mobile/);
      await assert.rejects(submit({ ...values, board: 'Invalid' }));
      assert.equal((await db.query('SELECT id FROM students WHERE id=$1',[id])).rows.length,0);
      await submit(values); await submit(values);
      const record = (await db.query('SELECT email,phone,updated_at::text version FROM students WHERE id=$1',[id])).rows[0];
      assert.equal(record.email,'learner@example.test'); assert.equal(record.phone,values.phone);
      await assert.rejects(submit({ ...values, email: 'other@example.test' }), /already saved/);
      await assert.rejects(submit({ ...values, name: 'Stale' },false,'2000-01-01'), /updated by someone else/);
      await submit({ ...values, name: 'Edited' },false,record.version);
      const loginId = randomUUID();
      await db.exec('RESET ROLE');
      await db.query('INSERT INTO auth.users(id) VALUES($1)',[loginId]);
      await db.query("INSERT INTO users(id,name,phone,email,role,student_id) VALUES($1,'Student login',$2,$3,'student',$4)",[loginId,values.phone,'learner@example.test',id]);
      await actor(owner);
      const version = (await db.query('SELECT updated_at::text version FROM students WHERE id=$1',[id])).rows[0].version;
      await assert.rejects(submit({ ...values, email: 'changed@example.test' },false,version), /login/);
      await actor(otherParent);
      await assert.rejects(submit(values), /Owner or staff/);
    });
  } finally {
    await db.close();
  }
});
