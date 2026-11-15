'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { useAuth, useSupabase } from '@/lib/auth-context';
import Phase2Layout, { buttonClass, inputClass, panelClass } from '@/components/Phase2Layout';
import {mobileDisplay} from '@/lib/phone';
import {loginIdentity} from '@/lib/account-validation';
import { validateAccount } from '@/lib/account-validation';

type Student = {
  name: string; class: string; school: string; board: string;
  date_of_birth: string; admission_date: string; address: string; status: string; email: string; phone: string;
};
type Parent = { id: string; name: string; phone: string; relation: string; user_id: string | null };
type Batch = { id: string; name: string; class: string; base_fee: number; is_active: boolean };
type ParentAccount = { id: string; name: string; phone: string };
type Guardian = { name: string; phone: string; relation: string; email: string; whatsapp: string; address: string; user_id: string };
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

export default function StudentEditor({ studentId }: { studentId?: string }) {
  const { user, role } = useAuth();
  const { supabase: sb } = useSupabase();
  const [recordId, setRecordId] = useState(studentId ?? '');
  const [student, setStudent] = useState<Student>({ name: '', class: '', school: '', board: '', date_of_birth: '', admission_date: today(), address: '', status: 'active', email: '', phone: '' });
  const [guardian, setGuardian] = useState<Guardian>({ name: '', phone: '', relation: 'guardian', email: '', whatsapp: '', address: '', user_id: '' });
  const [parentId, setParentId] = useState('');
  const [parents, setParents] = useState<Parent[]>([]);
  const [accounts, setAccounts] = useState<ParentAccount[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchIds, setBatchIds] = useState<string[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [createLogin, setCreateLogin] = useState(true);
  const [savedAdmission, setSavedAdmission] = useState('');
  const [linkedLogin, setLinkedLogin] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!user || !role || !['owner', 'staff'].includes(role)) return;
    let active = true;
    async function load() {
      try {
        const [parentResult, batchResult, accountResult] = await Promise.all([
          sb.from('parents').select('id,name,phone,relation,user_id').order('name'),
          sb.from('batches').select('id,name,class,base_fee,is_active').order('name'),
          sb.from('users').select('id,name,phone').eq('role', 'parent').eq('status', 'active').order('name'),
        ]);
        if (parentResult.error || batchResult.error || accountResult.error) throw parentResult.error || batchResult.error || accountResult.error;
        if (!active) return;
        setParents(parentResult.data ?? []); setBatches(batchResult.data ?? []); setAccounts(accountResult.data ?? []);
        if (!studentId) { setRecordId(crypto.randomUUID()); return; }
        const [studentResult, links, enrollments, logins] = await Promise.all([
          sb.from('students').select('*').eq('id', studentId).single(),
          sb.from('student_parent').select('parent_id,relation,is_primary').eq('student_id', studentId),
          sb.from('student_batch').select('batch_id,start_date,end_date').eq('student_id', studentId),
          sb.from('users').select('id,email,phone').eq('role', 'student').eq('student_id', studentId),
        ]);
        if (studentResult.error || links.error || enrollments.error || logins.error) throw studentResult.error || links.error || enrollments.error || logins.error;
        if (!active) return;
        const record = studentResult.data;
        const login = logins.data?.[0];
        setLinkedLogin(!!login);
        setStudent({ name: record.name, class: record.class, school: record.school ?? '', board: record.board ?? '', date_of_birth: record.date_of_birth, admission_date: record.admission_date, address: record.address ?? '', status: record.status, email: record.email ?? login?.email ?? '', phone: record.phone ?? login?.phone ?? '' });
        setUpdatedAt(record.updated_at);
        const primary = links.data?.find(link => link.is_primary) ?? links.data?.[0];
        setParentId(primary?.parent_id ?? '');
        setGuardian(value => ({ ...value, relation: primary?.relation ?? 'guardian' }));
        setBatchIds((enrollments.data ?? []).filter(row => !row.end_date || row.end_date >= today()).map(row => row.batch_id));
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : (cause as { message?: string })?.message ?? 'Unable to load student data');
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [sb, user, role, studentId]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setMessage(''); setBusy(true);
    try {
      if (!recordId) throw new Error('Reload the page before saving');
      const contact = validateAccount({ name: student.name, email: student.email, phone: student.phone, role: 'student' });
      let id = savedAdmission;
      if (!id) {
      const { data, error: saveError } = await sb.rpc('save_student_admission', {
        p_id: recordId, p_create: !studentId, p_student: { ...student, email: contact.email, phone: contact.phone },
        p_parent_id: parentId || null, p_guardian: {...guardian,phone:guardian.phone?((loginIdentity(guardian.phone) as {phone:string}).phone):guardian.phone},
        p_batch_ids: batchIds, p_expected_updated_at: updatedAt,
      });
      if (saveError) throw saveError;
      id = data;
      setSavedAdmission(id);
      }
      if (role === 'owner' && createLogin && !linkedLogin) {
        setMessage('Admission saved. Creating the linked student login…');
        const response = await fetch('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...contact, student_id: id }) });
        const result = await response.json();
        if (!response.ok) throw new Error(`Admission saved, but login was not created: ${result.error || 'Please retry.'}`);
      }
      window.location.assign(`/owner/students/${id}/profile?saved=1`);
    } catch (cause) { setError((cause as { message?: string })?.message ?? 'Unable to save student'); }
    finally { setBusy(false); }
  }

  return <Phase2Layout title={studentId ? 'Student profile' : 'New admission'}>
    <Link className="text-tuition-accent underline" href="/owner/students">Students</Link>
    {error && <p role="alert" className="text-red-300">{error}</p>}
    {message && <p role="status" className="console-info">{message}</p>}
    {loading ? <p>Loading student records…</p> : <form onSubmit={event => void save(event)} className="student-editor">
      <fieldset disabled={busy || !!savedAdmission || (!!studentId && !updatedAt)} className={`${panelClass} admission-fields`}>
        <legend className="text-xl">Student details</legend>
        <label>Name<input required maxLength={150} className={inputClass} value={student.name} onChange={event => setStudent({ ...student, name: event.target.value })} /></label>
        <label>Class<input required maxLength={40} className={inputClass} value={student.class} onChange={event => setStudent({ ...student, class: event.target.value })} /></label>
        <label>Student email<input type="email" required disabled={linkedLogin} autoComplete="email" className={inputClass} value={student.email} onChange={event => setStudent({ ...student, email: event.target.value })} /></label>
        <label>Student mobile number<input type="tel" required disabled={linkedLogin} autoComplete="tel" placeholder="9876543210" className={inputClass} value={mobileDisplay(student.phone)} onChange={event => setStudent({ ...student, phone: event.target.value })} /></label>
        <label>Date of birth<input required type="date" max={student.admission_date} className={inputClass} value={student.date_of_birth} onChange={event => setStudent({ ...student, date_of_birth: event.target.value })} /></label>
        <label>Admission date<input required type="date" max={today()} min={student.date_of_birth} className={inputClass} value={student.admission_date} onChange={event => setStudent({ ...student, admission_date: event.target.value })} /></label>
        <label>School<input className={inputClass} value={student.school} onChange={event => setStudent({ ...student, school: event.target.value })} /></label>
        <label>Board<select className={inputClass} value={student.board} onChange={event => setStudent({ ...student, board: event.target.value })}><option value="">Select board</option>{['CBSE', 'State Board', 'ICSE', 'Other'].map(board => <option key={board}>{board}</option>)}</select></label>
        <label>Status<select className={inputClass} value={student.status} onChange={event => setStudent({ ...student, status: event.target.value })}><option value="active">Active</option><option value="on_hold">On hold</option><option value="left">Left</option></select></label>
        <label>Address<textarea className={inputClass} value={student.address} onChange={event => setStudent({ ...student, address: event.target.value })} /></label>
      </fieldset>
      <fieldset disabled={busy || !!savedAdmission} className={`${panelClass} admission-fields`}>
        <legend className="text-xl">Primary guardian</legend>
        <label>Guardian<select className={inputClass} value={parentId} onChange={event => { setParentId(event.target.value); setGuardian({ ...guardian, user_id: '' }); }}><option value="">Create guardian</option>{parents.map(parent => <option key={parent.id} value={parent.id}>{parent.name} · {mobileDisplay(parent.phone)}</option>)}</select></label>
        <label>Relationship<select className={inputClass} value={guardian.relation} onChange={event => setGuardian({ ...guardian, relation: event.target.value })}>{['father', 'mother', 'guardian', 'other'].map(relation => <option key={relation}>{relation}</option>)}</select></label>
        {!parentId && <>
          <label>Guardian name<input required className={inputClass} value={guardian.name} onChange={event => setGuardian({ ...guardian, name: event.target.value })} /></label>
          <label>Mobile number<input required type="tel" pattern="[0-9]{10}" placeholder="9876543210" className={inputClass} value={mobileDisplay(guardian.phone)} onChange={event => setGuardian({ ...guardian, phone: event.target.value })} /></label>
          <label>Email<input type="email" className={inputClass} value={guardian.email} onChange={event => setGuardian({ ...guardian, email: event.target.value })} /></label>
          <label>WhatsApp<input type="tel" className={inputClass} value={mobileDisplay(guardian.whatsapp)} onChange={event => setGuardian({ ...guardian, whatsapp: event.target.value })} /></label>
          <label>Guardian address<textarea className={inputClass} value={guardian.address} onChange={event => setGuardian({ ...guardian, address: event.target.value })} /></label>
        </>}
        {!parents.find(parent => parent.id === parentId)?.user_id && <label>Existing parent login<select className={inputClass} value={guardian.user_id} onChange={event => setGuardian({ ...guardian, user_id: event.target.value })}><option value="">Link later</option>{accounts.filter(account => !parents.some(parent => parent.user_id === account.id)).map(account => <option key={account.id} value={account.id}>{account.name} · {mobileDisplay(account.phone)}</option>)}</select></label>}
      </fieldset>
      <fieldset disabled={busy || !!savedAdmission} className={`${panelClass} admission-enrollments`}>
        <legend className="text-xl">Batch enrollment</legend>
        {batches.filter(batch => batch.is_active || batchIds.includes(batch.id)).map(batch => <label className="flex items-center gap-3" key={batch.id}><input type="checkbox" checked={batchIds.includes(batch.id)} onChange={event => setBatchIds(event.target.checked ? [...batchIds, batch.id] : batchIds.filter(id => id !== batch.id))} /><span>{batch.name} · Class {batch.class} · ₹{batch.base_fee}/month{!batch.is_active ? ' · Inactive' : ''}</span></label>)}
        {!batches.length && <p>Create an active batch to enroll this student.</p>}
      </fieldset>
      <section className="dashboard-panel admission-login"><h2>Student login</h2>{linkedLogin ? <p>This student already has a linked login. Use the registered email or mobile number and password.</p> : role === 'owner' ? <><label className="admission-checkbox"><input type="checkbox" checked={createLogin} disabled={busy} onChange={event => setCreateLogin(event.target.checked)} />Create a login using this student’s email and mobile</label><p>Temporary password: <strong>123456</strong>. The student must choose a new password on first login. No SMS OTP is needed for password login.</p></> : <p>Contacts will be saved. Ask the owner to create and link the student account.</p>}</section>
      {savedAdmission && <p className="console-info">Admission is saved. Retry login creation below, or uncheck it and open the profile.</p>}
      <button disabled={busy || !recordId || (!!studentId && !updatedAt)} className={buttonClass}>{busy ? 'Saving…' : savedAdmission ? 'Retry / finish admission' : 'Save student'}</button>
    </form>}
  </Phase2Layout>;
}
