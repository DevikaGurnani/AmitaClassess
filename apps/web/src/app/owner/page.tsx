'use client';
import Link from 'next/link';
import WorkspaceLoading from '@/components/WorkspaceLoading';
import { useSearchParams } from 'next/navigation';
import { OwnerManagement, OwnerFinancePanel } from '@/components/console/OwnerConsoleModules';
import WorkspaceQuickActions from '@/components/WorkspaceQuickActions';
import { useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowRight, ArrowUpRight, BookOpen, CalendarDays, ChevronRight, CreditCard, Plus, Users } from 'lucide-react';
import { useAuth, useSupabase } from '@/lib/auth-context';
import { AttendanceChart, EmptyState, money, SectionHeading, shortName, StatCard } from '@/components/DashboardParts';

type Student = { id: string; name: string; class: string; status: string; admission_date: string };
type Batch = { id: string; name: string; subjects: string[]; base_fee: number; schedule: { days?: string[]; startTime?: string; endTime?: string }; is_active: boolean };
type Attendance = { date: string; status: string };
type Due = { id: string; generated_amount: number; paid_amount: number; due_date: string; students: { name: string } | null };
type Payment = { id: string; amount: number; is_reversal: boolean; mode: string; receipt_no: string; paid_at: string; students: { name: string } | null };
type Notice = { id: string; title: string; body: string; created_at: string };

export default function OwnerDashboard() {
  const { user, profile, role, isLoading } = useAuth();
  const management = useSearchParams().get('view') === 'management';
  const [revision, setRevision] = useState(0);
  const { supabase: sb } = useSupabase();
  const [students, setStudents] = useState<Student[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [dues, setDues] = useState<Due[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  useEffect(() => {
    if (!user || !['owner', 'staff'].includes(role ?? '')) return;
    let active = true;
    setLoading(true); setError('');
    async function load() {
      const results = await Promise.all([
        sb.from('students').select('id,name,class,status,admission_date').order('admission_date', { ascending: false }),
        sb.from('batches').select('id,name,subjects,base_fee,schedule,is_active').eq('is_active', true),
        sb.from('attendance').select('date,status').lte('date', today).order('date', { ascending: false }).limit(500),
        sb.from('fee_dues').select('id,generated_amount,paid_amount,due_date,students(name)').in('month', [today.slice(0, 7), today.slice(0, 7) + '-01']),
        sb.from('payments').select('id,amount,is_reversal,mode,receipt_no,paid_at,students(name)').order('paid_at', { ascending: false }).limit(5),
        sb.from('notices').select('id,title,body,created_at').order('created_at', { ascending: false }).limit(2),
      ]);
      if (!active) return;
      const failed = results.find(result => result.error);
      if (failed?.error) setError(failed.error.message);
      setStudents(results[0].data ?? []); setBatches(results[1].data ?? []); setAttendance(results[2].data ?? []); setDues((results[3].data ?? []) as unknown as Due[]);
      setPayments((results[4].data ?? []) as unknown as Payment[]); setNotices(results[5].data ?? []); setLoading(false);
    }
    void load().catch(cause => { if (active) { setError(cause.message); setLoading(false); } });
    return () => { active = false; };
  }, [sb, user, role, today, revision]);
  if (isLoading) return <WorkspaceLoading/>;
  if (!user) return <div className="page-loading"><Link href="/auth/login">Sign in to your workspace →</Link></div>;
  if (!['owner', 'staff'].includes(role ?? '')) return <div className="page-loading">This workspace is for owners and staff.</div>;
  const collected = dues.reduce((sum, row) => sum + row.paid_amount, 0);
  const billed = dues.reduce((sum, row) => sum + row.generated_amount, 0);
  const present = attendance.filter(row => ['present', 'late'].includes(row.status)).length;
  const attendanceRate = attendance.length ? Math.round(present / attendance.length * 100) : 0;
  const chartDates = [...new Set(attendance.map(row => row.date))].sort().slice(-7);
  const chart = chartDates.map(date => { const records = attendance.filter(row => row.date === date); return { label: new Date(`${date}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'short' }), value: Math.round(records.filter(row => ['present', 'late'].includes(row.status)).length / records.length * 100) }; });
  const weekday = new Date().toLocaleDateString('en-US', { weekday: 'long', timeZone: 'Asia/Kolkata' });
  const sessions = batches.filter(batch => batch.schedule?.days?.includes(weekday)).sort((a, b) => (a.schedule.startTime ?? '').localeCompare(b.schedule.startTime ?? ''));

  return <main className="dashboard-page owner-console">
    <div className="console-role-label">OWNER CONSOLE <span>Amita’s Classes</span></div>
    <div className="dashboard-heading"><div><p className="eyebrow">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })}</p><h1>Hello, {profile?.name.split(' ')[0]}<span className="greeting-sun">✳</span></h1><p>Here’s what’s happening in your learning community.</p></div><Link className="primary-button" aria-label="New admission" href="/owner/students/add"><Plus size={17} />New admission</Link></div>
    <nav className="console-tabs" aria-label="Owner console sections"><Link href="/owner" className={!management ? 'selected' : ''} aria-current={!management ? 'page' : undefined}>Academy overview</Link><Link href="/owner?view=management" className={management ? 'selected' : ''} aria-current={management ? 'page' : undefined}>Management tools</Link><button className="console-refresh text-button" disabled={loading} onClick={() => setRevision(value => value + 1)}>{loading ? 'Refreshing...' : 'Refresh data'}</button></nav>
    {error && <p role="alert" className="form-error">{error}</p>}
    {management ? <OwnerManagement role={role} /> : <>
    <div className="overview-top-grid">
      <section className="welcome-banner"><div><span className="eyebrow">EVERY STUDENT. EVERY POSSIBILITY.</span><h2>A little progress.<br /><em>A brighter future.</em></h2><p>{sessions.length ? `${sessions.length} classes on the timetable today. Let’s make them count.` : 'A clear view of your classes, your people, and their progress.'}</p><Link href="/owner/attendance">Let’s take attendance <ArrowRight size={16} /></Link></div><img src="/images/learning-still-life.png" alt="An open notebook and sculptural learning essentials" /></section>
      <section className="collection-card"><div className="section-heading"><span className="eyebrow">THIS MONTH’S COLLECTION</span><span className="small-icon"><ArrowDownLeft size={18} /></span></div><strong>{money(collected)}</strong><p>of {money(billed)} billed</p><div className="collection-progress"><span style={{ width: `${billed ? collected / billed * 100 : 0}%` }} /></div><div className="collection-footer"><span>{billed ? Math.round(collected / billed * 100) : 0}% collected</span><Link href="/owner/fees">View fees <ArrowUpRight size={14} /></Link></div></section>
    </div>
    <WorkspaceQuickActions />
    <section className="stats-grid"><StatCard label="Active students" value={students.filter(row => row.status === 'active').length} detail="Growing minds, one community" icon={<Users size={19} />} /><StatCard label="Active batches" value={batches.length} detail={`${sessions.length} classes scheduled today`} tone="peach" icon={<BookOpen size={19} />} /><StatCard label="Attendance" value={`${attendanceRate}%`} detail="Across recent recorded classes" tone="lavender" icon={<CalendarDays size={19} />} /><StatCard label="Pending fees" value={money(billed - collected)} detail="Outstanding this billing month" tone="sand" icon={<CreditCard size={19} />} /></section>
    <div className="dashboard-main-grid"><section className="dashboard-panel"><SectionHeading title="Showing up. Moving forward."><span className="subtle-pill">Last 7 class days</span></SectionHeading><p className="section-description">Your community’s attendance at a glance.</p>{chart.length ? <AttendanceChart data={chart} /> : <EmptyState>{loading ? 'Loading attendance…' : 'Mark attendance to see your first trend.'}</EmptyState>}<div className="chart-legend"><span /><span>Class attendance</span><strong>{attendanceRate}% overall</strong></div></section>
      <section className="dashboard-panel timetable-panel"><SectionHeading title="Today’s classes"><span className="subtle-pill">{sessions.length} sessions</span></SectionHeading><div className="schedule-list">{sessions.map((batch, index) => <Link href={`/owner/batches/${batch.id}/profile`} className={`schedule-item schedule-${index % 3}`} key={batch.id}><span className="schedule-time">{batch.schedule.startTime}<small>{batch.schedule.endTime}</small></span><span className="schedule-line" /><span className="schedule-info"><strong>{batch.name}</strong><small>{batch.subjects.join(' & ')}</small></span><ChevronRight size={15} /></Link>)}{!sessions.length && <EmptyState>A little breathing room. No classes scheduled today.</EmptyState>}</div><Link href="/owner/batches" className="panel-bottom-link">View all batches <ArrowRight size={15} /></Link></section>
    </div>
    <OwnerFinancePanel dues={dues} payments={payments} loading={loading} failed={!!error} />
    <div className="dashboard-lower-grid"><section className="dashboard-panel students-panel"><SectionHeading title="Meet your growing community"><Link href="/owner/students">All students <ArrowUpRight size={15} /></Link></SectionHeading><div className="student-preview-table"><div className="student-preview-header"><span>STUDENT</span><span>CLASS</span><span>STATUS</span><span /></div>{students.slice(0, 4).map((student, index) => <Link href={`/owner/students/${student.id}/profile`} className="student-preview-row" key={student.id}><span className="student-person"><span className={`avatar avatar-color-${index % 4}`}>{shortName(student.name)}</span><span><strong>{student.name}</strong><small>Amita’s Classes student</small></span></span><span>Class {student.class}</span><span className="status-tag"><i />{student.status}</span><ArrowUpRight size={16} /></Link>)}</div>{!students.length && <EmptyState>Your first student’s next chapter starts here.</EmptyState>}</section>
      <section className="dashboard-panel notice-preview"><SectionHeading title="On the notice board"><Link href="/owner/notices" aria-label="View all notices"><ArrowUpRight size={18} /></Link></SectionHeading>{notices.map((notice, index) => <article key={notice.id}><span className={`notice-icon notice-${index}`}><BookOpen size={17} /></span><div><h3>{notice.title}</h3><p>{notice.body}</p></div></article>)}{!notices.length && <EmptyState>Share an update with your community.</EmptyState>}</section></div>
    </>}
  </main>;
}
