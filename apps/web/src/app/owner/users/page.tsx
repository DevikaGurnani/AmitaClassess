"use client";
import { useEffect, useState, type FormEvent } from 'react';
import { Link2, ShieldCheck, Users,Edit,X } from 'lucide-react';
import DeleteAccountDialog from '@/components/DeleteAccountDialog';
import Phase2Layout from '@/components/Phase2Layout';
import { useAuth, useSupabase } from '@/lib/auth-context';
import { EmptyState, shortName } from '@/components/DashboardParts';
import RoleAccessManager from '@/components/RoleAccessManager';
import TeacherScopePicker,{type TeachingChoice} from '@/components/TeacherScopePicker';
import {mobileDisplay} from '@/lib/phone';

type Person = { id: string; name: string; email?: string; role: string; phone: string; status: string; student_id: string | null };
export default function UsersPage() {
  const { user, role } = useAuth(); const { supabase: sb } = useSupabase();
  const [deleting,setDeleting]=useState<Person|null>(null);
  const [people, setPeople] = useState<Person[]>([]); const [newRole,setNewRole]=useState('parent'),[choices,setChoices]=useState<TeachingChoice[]>([]),[accessData,setAccessData]=useState<any>(null),[accessRevision,setAccessRevision]=useState(0),[editing,setEditing]=useState<Person|null>(null);
 useEffect(()=>{if(user&&role==='owner')void fetch('/api/admin/access',{cache:'no-store'}).then(async response=>{const result=await response.json();if(!response.ok)throw new Error(result.error||'Unable to load teaching assignments.');return result;}).then(setAccessData).catch(cause=>setError(cause.message));},[user,role,accessRevision]);
 async function editAccount(event:FormEvent<HTMLFormElement>){event.preventDefault();if(!editing)return;setBusy('edit');setError('');try{const values=Object.fromEntries(new FormData(event.currentTarget));const response=await fetch('/api/admin/users',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({...values,id:editing.id})}),result=await response.json();if(!response.ok)throw new Error(result.error);setPeople(rows=>rows.map(row=>row.id===editing.id?result.account:row));setEditing(null);setAccessRevision(value=>value+1);setMessage('Account updated. Login email/mobile details are synchronized.');}catch(cause){setError((cause as Error).message);}finally{setBusy('');}} 
  const [students, setStudents] = useState<Array<{id: string; name: string; class: string}>>([]);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState('');
  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    setBusy('create'); setError(''); setMessage('');
    try {
      const response = await fetch('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({...values,teaching_scopes:choices}) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to create user.');
      setPeople(current => [...current, result.account].sort((a, b) => a.name.localeCompare(b.name)));
      setLinks(current => ({ ...current, [result.account.id]: '' }));
      form.reset();setNewRole('parent');setChoices([]);setAccessRevision(value=>value+1);
      setMessage('Account created. Temporary password: 123456. The user must change it on first login.');
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(''); }
  }
  useEffect(() => {
    if (!user || role !== 'owner') return;
    let active = true;
    async function load() {
      const [accounts, learners] = await Promise.all([sb.from('users').select('id,name,email,phone,role,status,student_id').order('name'), sb.from('students').select('id,name,class').order('name')]);
      if (!active) return;
      if (accounts.error || learners.error) { setError(accounts.error?.message || learners.error?.message || 'Unable to load accounts.'); return; }
      setPeople(accounts.data ?? []); setStudents(learners.data ?? []);
      setLinks(Object.fromEntries((accounts.data ?? []).map(person => [person.id, person.student_id ?? ''])));
    }
    void load().catch(cause => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [sb, user, role]);
  async function save(person: Person) {
    setBusy(person.id); setError(''); setMessage('');
    try {
      const { data, error } = await sb.from('users').update({ student_id: links[person.id] || null }).eq('id', person.id).eq('role', 'student').select('id,student_id').single();
      if (error) throw error;
      setPeople(current => current.map(row => row.id === person.id ? { ...row, student_id: data.student_id } : row));
      setMessage(`Learning profile ${data.student_id ? 'linked' : 'unlinked'} for ${person.name}.`);
    } catch (cause) { setError((cause as {message: string}).message || 'Unable to save this account link.'); }
    finally { setBusy(''); }
  }
  return <Phase2Layout title="People & permissions" roles={['owner']}>
    <section className="library-intro"><span className="resource-icon"><Users size={23} /></span><div><h2>A community that grows together.</h2><p>Review academy accounts and connect students to their own learning profiles.</p></div></section>
    {error && <p role="alert" className="form-error">{error}</p>}{message && <p role="status" className="console-info">{message}</p>}
    <form className="dashboard-panel material-share-form" onSubmit={event => void createAccount(event)}><h2>Create academy account</h2><p>All fields are required. Temporary password: <strong>123456</strong>. The user sets their own password on first login.</p><div className="material-form-grid"><label>Name<input name="name" required maxLength={150} autoComplete="name" /></label><label>Email<input name="email" type="email" required autoComplete="email" /></label><label>Mobile number<input name="phone" type="tel" required autoComplete="tel" placeholder="9876543210" pattern="[0-9]{10}" /></label><label>Role<select name="role" required value={newRole} onChange={event=>setNewRole(event.target.value)}><option value="parent">Parent</option><option value="student">Student</option><option value="teacher">Teacher</option><option value="staff">Staff</option><option value="owner">Owner</option></select></label></div>{newRole==='teacher'&&<TeacherScopePicker data={accessData} value={choices} onChange={setChoices}/>}<button className="primary-button" disabled={!!busy||(newRole==='teacher'&&!choices.length)}>{busy === 'create' ? 'Creating…' : 'Create account'}</button></form>
    <section className="dashboard-panel"><div className="section-heading"><h2>Academy accounts</h2><span className="subtle-pill">{people.length} people</span></div><div className="people-list">{people.map((person, index) => <article key={person.id} className="account-directory-row"><div className="account-person"><span className={`avatar avatar-color-${index % 4}`}>{shortName(person.name)}</span><div><strong>{person.name}</strong><p>{mobileDisplay(person.phone)}</p></div></div><span className="role-tag"><ShieldCheck size={13} />{person.role}</span><span className="status-tag">{person.status}</span><button className="secondary-button" onClick={()=>{setError('');setEditing(person);}}><Edit size={15}/>Edit account</button>{person.role === 'student' && <div className="student-account-link"><label htmlFor={`link-${person.id}`}>Learning profile<select id={`link-${person.id}`} value={links[person.id] ?? ''} onChange={event => setLinks(current => ({ ...current, [person.id]: event.target.value }))}><option value="">Not linked</option>{students.map(student => <option key={student.id} value={student.id}>{student.name} - Class {student.class}</option>)}</select></label><button className="secondary-button" onClick={() => void save(person)} disabled={!!busy || (links[person.id] || null) === person.student_id}><Link2 size={15} />{busy === person.id ? 'Saving...' : 'Save link'}</button></div>}</article>)}</div>{!people.length && !error && <EmptyState>Academy accounts will appear here.</EmptyState>}</section>
    <div id="role-access-settings"><RoleAccessManager key={accessRevision}/></div>
    {editing&&!deleting&&<div className="assignment-viewer-backdrop"><section className="account-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="account-edit-title"><header><h2 id="account-edit-title">Edit {editing.name}</h2><button className="icon-button labelled-action-button" aria-label="Close account editor" onClick={()=>setEditing(null)}><X size={18}/><span className="action-button-label">Close account editor</span></button></header><p>Role: {editing.role}. Password remains unchanged.</p><form onSubmit={event=>void editAccount(event)}><label>Name<input name="name" required maxLength={150} defaultValue={editing.name}/></label><label>Email<input name="email" type="email" required defaultValue={editing.email}/></label><label>Mobile number<input name="phone" type="tel" pattern="[0-9]{10}" required defaultValue={mobileDisplay(editing.phone)}/></label><label>Status<select name="status" defaultValue={editing.status} disabled={editing.id===user?.id}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>{error&&<p className="form-error" role="alert">{error}</p>}<button className="primary-button" disabled={!!busy}>{busy==='edit'?'Saving…':'Save account'}</button></form>{editing.id!==user?.id&&editing.role!=='owner'&&<button type="button" className="secondary-button delete-account-button" disabled={!!busy} onClick={()=>setDeleting(editing)}>Delete user permanently</button>}{['teacher','parent'].includes(editing.role)&&<a className="text-button" href="#role-access-settings" onClick={()=>setEditing(null)}>Manage {editing.role==='teacher'?'batch/subject access':'child links'}</a>}</section></div>}
    {deleting&&<DeleteAccountDialog person={deleting} onCancel={()=>setDeleting(null)} onDeleted={()=>{const id=deleting.id;setPeople(rows=>rows.filter(row=>row.id!==id));setDeleting(null);setEditing(null);setAccessRevision(value=>value+1);setMessage('User login permanently deleted. Separate student academic and fee records are preserved.');}}/>}
  </Phase2Layout>;
}
