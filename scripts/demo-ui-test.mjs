import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
const require = createRequire(import.meta.url);
const ts = require('typescript');

function loadDemo(mode = 'development') {
  const items = new Map();
  const sessionStorage = { getItem: key => items.get(key) ?? null, setItem: (key, value) => items.set(key, value), removeItem: key => items.delete(key) };
  const modules = {};
  function load(name) {
    const source = readFileSync(new URL(`../apps/web/src/lib/${name}.ts`, import.meta.url), 'utf8');
    const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
    const module = { exports: {} };
    new Function('require', 'module', 'exports', 'process', 'sessionStorage', 'window', 'crypto', output)(
      dependency => modules[dependency.replace('./', '')] ?? require(dependency), module, module.exports,
      { env: { NODE_ENV: mode } }, sessionStorage, {}, { randomUUID },
    );
    modules[name] = module.exports;
    return module.exports;
  }
  return { auth: load('demo-auth'), data: load('demo-data'), sessionStorage };
}

test('demo owner, parent, and student use the same phone and OTP with separate roles', () => {
  const { auth } = loadDemo();
  for (const role of ['owner', 'parent', 'student']) {
    auth.startDemoSession('123456789', '1234', role);
    assert.equal(auth.getDemoUser().user_metadata.demoRole, role);
    assert.equal(auth.getDemoUser().id, auth.demoAccounts[role].id);
    auth.clearDemoSession(); assert.equal(auth.getDemoUser(), null);
  }
  assert.throws(() => auth.startDemoSession('123456789', '4321', 'parent'));
  assert.throws(() => auth.startDemoSession('123456789', '1234', 'invalid'));
});
test('previous owner demo sessions remain usable and production rejects all demo roles', () => {
  const legacy = loadDemo(); legacy.sessionStorage.setItem('tuition-demo-session', 'active');
  assert.equal(legacy.auth.getDemoUser().user_metadata.demoRole, 'owner');
  const production = loadDemo('production');
  for (const role of ['owner', 'parent', 'student']) assert.throws(() => production.auth.startDemoSession('123456789', '1234', role));
});
test('owner sees sample records and new admissions persist in the browser demo', async () => {
  const { auth, data } = loadDemo(); auth.startDemoSession('123456789', '1234');
  const sb = data.demoClient;
  const before = await sb.from('students').select('*'); assert.equal(before.data.length, 6);
  const batch = (await sb.from('batches').select('*')).data[0];
  const id = randomUUID();
  const saved = await sb.rpc('save_student_profile', { p_id: id, p_create: true, p_student: { name: 'New Demo Student', class: '10' }, p_guardian: { name: 'New Demo Parent', relation: 'father' }, p_batch_ids: [batch.id] });
  assert.equal(saved.data, id);
  const record = await sb.from('students').select('*').eq('id', id).single();
  assert.equal(record.data.name, 'New Demo Student'); assert.equal(record.data.student_batch[0].batches.id, batch.id);
  assert.equal((await sb.from('students').select('*')).data.length, 7);
});
test('parent sees a linked child, marks, downloadable resources, and receipts', async () => {
  const { auth, data } = loadDemo(); auth.startDemoSession('123456789', '1234', 'parent');
  const sb = data.demoClient;
  const parent = await sb.from('parents').select('student_parent(students(*))').eq('user_id', auth.getDemoUser().id);
  assert.equal(parent.data[0].student_parent[0].students.name, 'Aarav Sharma');
  assert.equal((await sb.from('students').select('*')).data.length, 1);
  const marks = await sb.from('test_marks').select('*').eq('student_id', data.demoStudentId);
  assert.equal(marks.data.length, 2); assert.equal(marks.data[0].tests.max_marks, 50);
  assert.equal((await sb.from('materials').select('*')).data.length, 2);
  const dues = await sb.from('fee_dues').select('payments(*)');
  assert.equal(dues.data[0].payments.length, 1);
  assert.ok(dues.data[0].payments[0].receipt_no);
});
test('student gets an individual portal profile and cannot edit academy records', async () => {
  const { auth, data } = loadDemo(); auth.startDemoSession('123456789', '1234', 'student');
  assert.equal(auth.getDemoUser().user_metadata.student_id, data.demoStudentId);
  assert.equal((await data.demoClient.from('users').select('student_id').eq('id', auth.getDemoUser().id).single()).data.student_id, data.demoStudentId);
  assert.equal((await data.demoClient.from('students').select('*')).data.length, 1);
  const result = await data.demoClient.from('students').update({ name: 'Changed' }).eq('id', data.demoStudentId);
  assert.ok(result.error);
  assert.equal((await data.demoClient.from('students').select('*').single()).data.name, 'Aarav Sharma');
});
test('demo partial payments update balances and reversal amounts remain signed', async () => {
  const { auth, data } = loadDemo(); auth.startDemoSession('123456789', '1234');
  const sb = data.demoClient;
  const due = (await sb.from('fee_dues').select('*').eq('status', 'partly_paid')).data[0];
  const id = randomUUID();
  await sb.rpc('record_manual_payment', { p_id: id, p_due_id: due.id, p_amount: 1000, p_mode: 'cash' });
  await sb.rpc('record_manual_payment', { p_id: id, p_due_id: due.id, p_amount: 1000, p_mode: 'cash' });
  assert.equal((await sb.from('fee_dues').select('*').eq('id', due.id).single()).data.paid_amount, 2500);
  await sb.rpc('reverse_manual_payment', { p_id: randomUUID(), p_payment_id: id, p_reason: 'Test reversal' });
  assert.equal((await sb.from('fee_dues').select('*').eq('id', due.id).single()).data.paid_amount, 1500);
});


test('owner can share a class resource and link a student login without exposing other profiles', async () => {
  const { auth, data } = loadDemo(); auth.startDemoSession('123456789', '1234');
  const sb = data.demoClient;
  const batch = (await sb.from('batches').select('*')).data[0];
  const shared = await sb.from('materials').insert({ title: 'Extra practice', subject: 'Math', batch_id: batch.id, file_url: 'https://example.org/practice', file_type: 'link', allow_download: false, is_hidden: false }).select('*').single();
  assert.equal(shared.error, null);
  const account = auth.demoAccounts.student.id;
  await sb.from('users').update({ student_id: data.demoStudentId }).eq('id', account);
  auth.clearDemoSession(); auth.startDemoSession('123456789', '1234', 'student');
  assert.equal((await sb.from('users').select('student_id').single()).data.student_id, data.demoStudentId);
  assert.equal((await sb.from('students').select('*')).data.length, 1);
  assert.ok((await sb.from('materials').select('*').in('batch_id', [batch.id]).eq('is_hidden', false)).data.some(row => row.id === shared.data.id));
  assert.ok((await sb.from('users').update({ student_id: 'other' }).eq('id', account)).error);
});


test('owner account relinking changes the student demo profile and unlinking removes access', async () => {
  const { auth, data } = loadDemo(); auth.startDemoSession('123456789', '1234');
  const sb = data.demoClient;
  const other = (await sb.from('students').select('*')).data[1];
  await sb.from('users').update({ student_id: other.id }).eq('id', auth.demoAccounts.student.id);
  auth.clearDemoSession(); auth.startDemoSession('123456789', '1234', 'student');
  assert.equal((await sb.from('students').select('*').single()).data.id, other.id);
  assert.equal((await sb.from('students').select('*').eq('id', data.demoStudentId)).data.length, 0);
  assert.equal((await sb.from('fee_dues').select('*')).data.length, 0);
  auth.clearDemoSession(); auth.startDemoSession('123456789', '1234');
  await sb.from('users').update({ student_id: null }).eq('id', auth.demoAccounts.student.id);
  auth.clearDemoSession(); auth.startDemoSession('123456789', '1234', 'student');
  assert.equal((await sb.from('students').select('*')).data.length, 0);
});
test('parent demo discovers siblings through their guardian relationship', async () => {
  const { auth, data } = loadDemo(); auth.startDemoSession('123456789', '1234');
  const sb = data.demoClient;
  const guardian = (await sb.from('parents').select('*')).data[0];
  const batch = (await sb.from('batches').select('*')).data[0];
  const id = randomUUID();
  await sb.rpc('save_student_profile', { p_id: id, p_create: true, p_parent_id: guardian.id, p_student: { name: 'Sibling', class: '9' }, p_guardian: { name: guardian.name, relation: 'mother' }, p_batch_ids: [batch.id] });
  auth.clearDemoSession(); auth.startDemoSession('123456789', '1234', 'parent');
  const parent = (await sb.from('parents').select('student_parent(students(*))')).data[0];
  assert.equal(parent.student_parent.length, 2);
  assert.deepEqual((await sb.from('students').select('*')).data.map(row => row.id).sort(), [data.demoStudentId, id].sort());
});
