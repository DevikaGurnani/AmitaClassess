import type { SupabaseClient } from '@supabase/supabase-js';
import { demoAccounts, getDemoUser } from './demo-auth';

type Row = Record<string, any>;
type Store = Record<string, Row[]>;
const storageKey = 'tuition-demo-data-v1';
export const demoStudentId = '10000000-0000-4000-8000-000000000001';
const batchId = '20000000-0000-4000-8000-000000000001';
const scienceId = '20000000-0000-4000-8000-000000000002';
const guardianId = '30000000-0000-4000-8000-000000000001';

function seed(): Store {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const month = today.slice(0, 7) + '-01';
  const names = ['Aarav Sharma', 'Anika Patel', 'Rohan Mehta', 'Diya Kapoor', 'Ishaan Gupta', 'Sara Khan'];
  const students = names.map((name, index) => ({
    id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, name,
    class: index < 4 ? '10' : '9', school: 'Delhi Public School', board: 'CBSE',
    date_of_birth: '2011-06-15', admission_date: '2026-06-01', status: 'active',
    address: 'Pune, Maharashtra', updated_at: new Date().toISOString(),
  }));
  return {
    students,
    users: Object.entries(demoAccounts).map(([role, account]) => ({ ...account, role, status: 'active', phone: '123456789', student_id: role === 'student' ? demoStudentId : null })),
    parents: [{ id: guardianId, user_id: demoAccounts.parent.id, name: 'Meera Sharma', phone: '+919876543210', relation: 'mother' }],
    student_parent: [{ student_id: demoStudentId, parent_id: guardianId, relation: 'mother', is_primary: true }],
    batches: [
      { id: batchId, name: 'Mathematics · Class 10', class: '10', subjects: ['Mathematics'], base_fee: 1800, is_active: true, teacher_id: null, schedule: { days: ['Monday', 'Wednesday', 'Friday'], startTime: '16:00', endTime: '17:00', timezone: 'IST' } },
      { id: scienceId, name: 'Science · Class 10', class: '10', subjects: ['Physics', 'Chemistry'], base_fee: 1500, is_active: true, teacher_id: null, schedule: { days: ['Tuesday', 'Thursday', 'Saturday'], startTime: '17:00', endTime: '18:00', timezone: 'IST' } },
      { id: '20000000-0000-4000-8000-000000000003', name: 'Foundation · Class 9', class: '9', subjects: ['Mathematics', 'Science'], base_fee: 2200, is_active: true, teacher_id: null, schedule: { days: ['Monday', 'Wednesday'], startTime: '15:00', endTime: '16:00', timezone: 'IST' } },
    ],
    student_batch: students.flatMap(student => [batchId, scienceId].map(id => ({ student_id: student.id, batch_id: id, start_date: '2026-06-01', end_date: null, custom_fee: null }))),
    attendance: students.flatMap((student, index) => Array.from({ length: 20 }, (_, day) => {
      const date = new Date(`${today}T12:00:00Z`); date.setUTCDate(date.getUTCDate() - 19 + day);
      return { id: `attendance-${index}-${day}`, student_id: student.id, batch_id: batchId, date: date.toISOString().slice(0, 10), status: day === 14 && index % 2 === 0 ? 'absent' : 'present', marked_at: new Date().toISOString() };
    })),
    fee_dues: students.map((student, index) => ({ id: `40000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, student_id: student.id, month, amount: 3300, discount: 0, generated_amount: 3300, paid_amount: index < 4 ? 3300 : 1500, due_date: `${today.slice(0, 7)}-10`, grace_period_days: 5, status: index < 4 ? 'paid' : 'partly_paid' })),
    payments: students.map((student, index) => ({ id: `50000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, due_id: `40000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, student_id: student.id, amount: index < 4 ? 3300 : 1500, mode: index % 2 ? 'upi' : 'cash', receipt_no: `TUI-2026-${101 + index}`, paid_at: `${today.slice(0, 7)}-05T10:00:00+05:30`, is_reversal: false, reversal_of: null })),
    tests: [
      { id: 'test-math', batch_id: batchId, title: 'Algebra & quadratic equations', subject: 'Mathematics', max_marks: 50, test_date: today },
      { id: 'test-science', batch_id: scienceId, title: 'Light & reflection', subject: 'Physics', max_marks: 50, test_date: today },
    ],
    test_marks: students.flatMap((student, index) => [{ id: `math-${index}`, test_id: 'test-math', student_id: student.id, marks: 46 - index, remarks: 'Excellent progress. Keep practicing word problems.', updated_at: today }, { id: `science-${index}`, test_id: 'test-science', student_id: student.id, marks: 43 - index, remarks: 'Strong understanding of the fundamentals.', updated_at: today }]),
    notices: [{ id: 'notice-1', title: 'A little practice, a lot of progress', body: 'The November revision worksheets are ready. Complete the first two exercises before your next class.', audience: 'all', created_at: `${today}T09:00:00Z`, expires_at: null }, { id: 'notice-2', title: 'Parent–teacher catch-up', body: 'Join us this Saturday, 10 AM to 12 PM, to talk about your child’s learning journey.', audience: 'all', created_at: `${today}T08:00:00Z`, expires_at: null }],
    materials: [{ id: 'material-1', batch_id: batchId, title: 'Your algebra practice pack', subject: 'Mathematics', topic: 'Quadratic equations', file_type: 'document', file_url: '/demo/algebra-practice.txt', allow_download: true, is_hidden: false, created_at: today }, { id: 'material-2', batch_id: scienceId, title: 'Light & reflection · revision notes', subject: 'Physics', topic: 'Light', file_type: 'document', file_url: '/demo/physics-notes.txt', allow_download: true, is_hidden: false, created_at: today }],
    notifications: [{ id: 'notification-1', user_id: demoAccounts.parent.id, message: 'Aarav scored 46/50 in the mathematics assessment. Well done!', channel: 'in_app', status: 'delivered', created_at: `${today}T09:00:00Z` }],
    holidays: [], fee_plans: [],
  };
}

let memory: Store | null = null;
function read(): Store {
  if (memory) return memory;
  try { const saved = sessionStorage.getItem(storageKey); if (saved) memory = JSON.parse(saved); } catch { /* Start a fresh demo when storage was cleared. */ }
  return memory ??= seed();
}
function persist() { sessionStorage.setItem(storageKey, JSON.stringify(read())); }

function visible(table: string): Row[] {
  const store = read();
  const actor = getDemoUser();
  const role = actor?.user_metadata.demoRole;
  const rows = store[table] ?? [];
  // Upgrade old saved samples once without overriding an intentional unlink.
  const sample = store.users.find(row => row.id === demoAccounts.student.id);
  if (sample && !Object.hasOwn(sample, 'student_id')) sample.student_id = demoStudentId;
  if (role === 'owner') return rows;
  if (!actor) return [];
  const account = store.users.find(row => row.id === actor.id);
  const parentIds = store.parents.filter(row => row.user_id === actor.id).map(row => row.id);
  const studentIds = role === 'student' ? account?.student_id ? [account.student_id] : [] : store.student_parent.filter(row => parentIds.includes(row.parent_id)).map(row => row.student_id);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const batchIds = store.student_batch.filter(row => studentIds.includes(row.student_id) && row.start_date <= today && (!row.end_date || row.end_date >= today)).map(row => row.batch_id);
  if (table === 'students') return rows.filter(row => studentIds.includes(row.id));
  if (['student_batch', 'attendance', 'test_marks'].includes(table)) return rows.filter(row => studentIds.includes(row.student_id));
  if (['fee_dues', 'payments'].includes(table)) return role === 'parent' ? rows.filter(row => studentIds.includes(row.student_id)) : [];
  if (table === 'student_parent') return rows.filter(row => parentIds.includes(row.parent_id));
  if (table === 'parents') return rows.filter(row => parentIds.includes(row.id));
  if (table === 'users') return rows.filter(row => row.id === actor.id);
  if (table === 'batches') return rows.filter(row => batchIds.includes(row.id));
  if (table === 'materials') return rows.filter(row => !row.is_hidden && batchIds.includes(row.batch_id));
  if (table === 'tests') return rows.filter(row => batchIds.includes(row.batch_id) || store.test_marks.some(mark => mark.test_id === row.id && studentIds.includes(mark.student_id)));
  if (table === 'notices') return rows.filter(row => (!row.expires_at || new Date(row.expires_at) > new Date()) && (row.audience === 'all' || row.audience === 'batch' && batchIds.includes(row.batch_id) || row.audience === 'class' && store.students.some(student => studentIds.includes(student.id) && student.class === row.class_id)));
  if (table === 'notifications') return rows.filter(row => row.user_id === actor.id);
  return [];
}

function joined(table: string, row: Row, nested = true): Row {
  const store = read();
  const result = { ...row };
  if (row.student_id) result.students = store.students.find(student => student.id === row.student_id) ?? null;
  if (row.batch_id) result.batches = store.batches.find(batch => batch.id === row.batch_id) ?? null;
  if (row.test_id) result.tests = store.tests.find(test => test.id === row.test_id) ?? null;
  if (table === 'students' && nested) {
    result.student_batch = store.student_batch.filter(link => link.student_id === row.id).map(link => joined('student_batch', link, false));
    result.student_parent = store.student_parent.filter(link => link.student_id === row.id);
  }
  if (table === 'batches') result.student_batch = visible('student_batch').filter(link => link.batch_id === row.id);
  if (table === 'parents') result.student_parent = visible('student_parent').filter(link => link.parent_id === row.id).map(link => joined('student_parent', link, false));
  if (table === 'fee_dues') result.payments = store.payments.filter(payment => payment.due_id === row.id);
  return result;
}

type Result = { data: any; error: { message: string } | null; count?: number };
class DemoQuery implements PromiseLike<Result> {
  private filters: Array<(row: Row) => boolean> = [];
  private sortKey = ''; private ascending = true; private maximum = Infinity;
  private one = false; private maybe = false; private countOnly = false;
  private operation = 'read'; private values: Row[] = []; private conflict = 'id';
  constructor(private table: string) {}
  select(_columns = '*', options?: { head?: boolean; count?: string }) { this.countOnly = options?.head ?? false; return this; }
  eq(key: string, value: unknown) { this.filters.push(row => row[key] === value); return this; }
  in(key: string, values: unknown[]) { this.filters.push(row => values.includes(row[key])); return this; }
  gte(key: string, value: string) { this.filters.push(row => String(this.value(row, key)) >= value); return this; }
  lte(key: string, value: string) { this.filters.push(row => String(this.value(row, key)) <= value); return this; }
  lt(key: string, value: string) { this.filters.push(row => String(this.value(row, key)) < value); return this; }
  is(key: string, value: unknown) { return this.eq(key, value); }
  private value(row: Row, key: string) { return key.split('.').reduce((value, part) => value?.[part], row); }
  or(expression: string) {
    const clauses = expression.split(',').map(clause => {
      const [key, operator, ...parts] = clause.split('.'); const value = parts.join('.');
      return (row: Row) => operator === 'is' ? row[key] == null : operator === 'gte' ? row[key] >= value : String(row[key] ?? '').toLowerCase().includes(value.replaceAll('%', '').toLowerCase());
    });
    this.filters.push(row => clauses.some(clause => clause(row))); return this;
  }
  order(key: string, options?: { ascending?: boolean }) { this.sortKey = key; this.ascending = options?.ascending ?? true; return this; }
  limit(value: number) { this.maximum = value; return this; }
  single() { this.one = true; return this; }
  maybeSingle() { this.one = true; this.maybe = true; return this; }
  insert(values: Row | Row[]) { this.operation = 'insert'; this.values = Array.isArray(values) ? values : [values]; return this; }
  update(values: Row) { this.operation = 'update'; this.values = [values]; return this; }
  upsert(values: Row | Row[], options?: { onConflict?: string }) { this.operation = 'upsert'; this.values = Array.isArray(values) ? values : [values]; this.conflict = options?.onConflict ?? 'id'; return this; }
  delete() { this.operation = 'delete'; return this; }
  private execute(): Result {
    if (this.operation !== 'read' && getDemoUser()?.user_metadata.demoRole !== 'owner') return { data: null, error: { message: 'Use the owner demo to edit institute records.' } };
    const store = read(); store[this.table] ??= [];
    let rows = visible(this.table).filter(row => this.filters.every(filter => filter(joined(this.table, row))));
    if (this.operation === 'update') rows.forEach(row => Object.assign(row, this.values[0], { updated_at: new Date().toISOString() }));
    if (this.operation === 'delete') store[this.table] = store[this.table].filter(row => !rows.includes(row));
    if (this.operation === 'insert' || this.operation === 'upsert') {
      rows = this.values.map(value => {
        const existing = this.operation === 'upsert' ? store[this.table].find(row => this.conflict.split(',').every(key => row[key.trim()] === value[key.trim()])) : null;
        if (existing) { Object.assign(existing, value); return existing; }
        const created = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...value };
        store[this.table].push(created); return created;
      });
    }
    if (this.operation !== 'read') persist();
    let data = rows.map(row => joined(this.table, row));
    if (this.sortKey) data.sort((a, b) => String(a[this.sortKey] ?? '').localeCompare(String(b[this.sortKey] ?? '')) * (this.ascending ? 1 : -1));
    const count = data.length; data = data.slice(0, this.maximum);
    if (this.one && data.length !== 1 && !(this.maybe && data.length === 0)) return { data: null, error: { message: 'Record not found in this demo.' } };
    return { data: this.countOnly ? null : this.one ? data[0] ?? null : data, error: null, count };
  }
  then<TResult1 = Result, TResult2 = never>(onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve().then(() => this.execute()).then(onfulfilled, onrejected);
  }
}

async function rpc(name: string, args: Row): Promise<Result> {
  if (getDemoUser()?.user_metadata.demoRole !== 'owner') return { data: null, error: { message: 'Use the owner demo to edit institute records.' } };
  const store = read();
  if (name === 'save_student_profile' || name === 'save_student_admission') {
    const existing = store.students.find(row => row.id === args.p_id);
    if (existing && args.p_create) return { data: existing.id, error: null };
    if (existing && existing.updated_at !== args.p_expected_updated_at) return { data: null, error: { message: 'Reload this student before saving again.' } };
    const student = { ...args.p_student, id: args.p_id, updated_at: new Date().toISOString() };
    if (existing) Object.assign(existing, student); else store.students.push(student);
    let parentId = args.p_parent_id;
    if (!parentId) { parentId = crypto.randomUUID(); store.parents.push({ ...args.p_guardian, id: parentId }); }
    store.student_parent.filter(row => row.student_id === student.id).forEach(row => { row.is_primary = false; });
    const link = store.student_parent.find(row => row.student_id === student.id && row.parent_id === parentId);
    if (link) Object.assign(link, { is_primary: true, relation: args.p_guardian.relation });
    else store.student_parent.push({ student_id: student.id, parent_id: parentId, relation: args.p_guardian.relation, is_primary: true });
    const today = new Date().toISOString().slice(0, 10);
    for (const enrollment of store.student_batch.filter(row => row.student_id === student.id)) enrollment.end_date = args.p_batch_ids.includes(enrollment.batch_id) ? null : '2000-01-01';
    for (const id of args.p_batch_ids) if (!store.student_batch.some(row => row.student_id === student.id && row.batch_id === id)) store.student_batch.push({ student_id: student.id, batch_id: id, start_date: today, end_date: null, custom_fee: null });
    persist(); return { data: student.id, error: null };
  }
  if (name === 'generate_student_due') {
    let due = store.fee_dues.find(row => row.student_id === args.p_student_id && row.month === args.p_month);
    if (!due) {
      const amount = store.student_batch.filter(row => row.student_id === args.p_student_id && !row.end_date).reduce((sum, row) => sum + Number(row.custom_fee ?? store.batches.find(batch => batch.id === row.batch_id)?.base_fee ?? 0), 0);
      if (amount <= 0) return { data: null, error: { message: 'Enroll the student in a batch with a fee first.' } };
      due = { id: crypto.randomUUID(), student_id: args.p_student_id, month: args.p_month, amount, generated_amount: amount, paid_amount: 0, discount: 0, status: 'due', due_date: args.p_month.slice(0, 7) + '-10', grace_period_days: 5 }; store.fee_dues.push(due);
    }
    persist(); return { data: due.id, error: null };
  }
  if (name === 'record_manual_payment' || name === 'reverse_manual_payment') {
    if (store.payments.some(row => row.id === args.p_id)) return { data: args.p_id, error: null };
    const original = store.payments.find(row => row.id === args.p_payment_id);
    const due = store.fee_dues.find(row => row.id === (original?.due_id ?? args.p_due_id));
    if (!due) return { data: null, error: { message: 'Fee due not found.' } };
    if (original && store.payments.some(row => row.reversal_of === original.id)) return { data: null, error: { message: 'This payment is already reversed.' } };
    const amount = original?.amount ?? args.p_amount;
    if (!(amount > 0) || (!original && amount > due.generated_amount - due.paid_amount)) return { data: null, error: { message: 'Check the payment amount.' } };
    store.payments.push({ id: args.p_id, due_id: due.id, student_id: due.student_id, amount, mode: original?.mode ?? args.p_mode, reference: args.p_reference, receipt_no: 'DEMO-' + args.p_id.slice(0, 8), paid_at: new Date().toISOString(), is_reversal: !!original, reversal_of: original?.id ?? null, reversal_reason: args.p_reason ?? null });
    due.paid_amount += original ? -amount : amount; due.status = due.paid_amount === due.generated_amount ? 'paid' : due.paid_amount > 0 ? 'partly_paid' : 'due';
    persist(); return { data: args.p_id, error: null };
  }
  return { data: null, error: { message: 'This action requires your connected backend.' } };
}

// The demo adapter stays in browser storage and never produces Supabase tokens.
export const demoClient = { from: (table: string) => new DemoQuery(table), rpc } as unknown as SupabaseClient;
