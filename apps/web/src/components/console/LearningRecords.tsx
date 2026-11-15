"use client";
import { useState } from 'react';
import { Download, Sparkles } from 'lucide-react';
import { EmptyState, ProgressRing, SectionHeading } from '@/components/DashboardParts';
import { exportPdf } from '@/lib/phase2/export';
import { attendanceSummary, displayDate, type LearnerAttendance, type LearnerBatch, type LearnerMark } from '@/lib/learner-console';

export function AttendanceRecords({ records, batches, compact = false, liveStatus }: { records: LearnerAttendance[]; batches: LearnerBatch[]; compact?: boolean; liveStatus?: string }) {
  const [month, setMonth] = useState('all');
  const [status, setStatus] = useState('all');
  const summary = attendanceSummary(records);
  const months = [...new Set(records.map(row => row.date.slice(0, 7)))].sort().reverse();
  const visible = records.filter(row => (month === 'all' || row.date.startsWith(month)) && (status === 'all' || row.status === status));
  return <section className={`dashboard-panel ${compact ? '' : 'console-wide'}`}><SectionHeading title="Attendance & consistency"><span className="subtle-pill">Latest {records.length} records</span></SectionHeading>
    {liveStatus && <span className={`live-status ${liveStatus === 'Live' ? 'is-live' : ''}`}>{liveStatus}</span>}
    <div className="attendance-summary"><strong>{summary.rate}<span>%</span></strong><p>{summary.present} present | {summary.late} late | {summary.absent} absent<br />Leave does not count as absence.</p></div>
    {compact ? <div className="attendance-dots">{records.slice(0, 28).reverse().map((record, index) => <span key={`${record.date}-${record.batch_id}-${index}`} className={record.status === 'absent' ? 'absent' : record.status === 'leave' ? 'excused' : 'present'} title={`${displayDate(record.date)} | ${record.status}`}>{record.status === 'present' ? 'P' : record.status === 'late' ? 'L' : record.status === 'leave' ? 'E' : 'A'}</span>)}</div> : <><div className="console-filters"><label>Month<select value={month} onChange={event => setMonth(event.target.value)}><option value="all">All recorded months</option>{months.map(value => <option key={value}>{value}</option>)}</select></label><label>Status<select value={status} onChange={event => setStatus(event.target.value)}><option value="all">All statuses</option>{['present', 'late', 'absent', 'leave'].map(value => <option key={value}>{value}</option>)}</select></label></div><div className="console-table-wrap"><table><caption className="sr-only">Attendance records</caption><thead><tr><th>Date</th><th>Class</th><th>Status</th></tr></thead><tbody>{visible.map((row, index) => <tr key={`${row.date}-${row.batch_id}-${index}`}><td>{displayDate(row.date)}</td><td>{batches.find(batch => batch.id === row.batch_id)?.name ?? 'Previous class'}</td><td><span className={`record-status record-${row.status}`}>{row.status}</span></td></tr>)}</tbody></table></div></>}
    {!(compact ? records : visible).length && <EmptyState>{records.length ? 'No attendance matches these filters.' : 'Your attendance will appear after your first recorded class.'}</EmptyState>}
  </section>;
}

export function ResultsRecords({ marks, studentName, compact = false, subjects=[],tests=[] }: { marks: LearnerMark[]; studentName: string; compact?: boolean;subjects?:string[];tests?:Array<{id:string;title:string;subject:string;test_date:string;max_marks:number}> }) {
  const [subject, setSubject] = useState('all');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const valid = marks.filter(mark => mark.tests && mark.tests.max_marks > 0);
  const average = valid.length ? Math.round(valid.reduce((sum, mark) => sum + mark.marks / mark.tests!.max_marks * 100, 0) / valid.length) : 0;
  const visible = valid.filter(mark => subject === 'all' || mark.tests!.subject === subject);
  const pending=tests.filter(test=>!valid.some(mark=>mark.tests?.id===test.id)&&(subject==='all'||test.subject===subject));
  async function download() {
    setBusy(true); setMessage('');
    try { await exportPdf(`Learning report - ${studentName}`, ['Assessment', 'Subject', 'Date', 'Marks', 'Maximum', 'Teacher feedback'], visible.map(mark => [mark.tests!.title, mark.tests!.subject, displayDate(mark.tests!.test_date), mark.marks, mark.tests!.max_marks, mark.remarks])); }
    catch { setMessage('Unable to download the report. Please try again.'); }
    finally { setBusy(false); }
  }
  return <section className={`dashboard-panel ${compact ? '' : 'console-wide'}`}><SectionHeading title="Progress & results">{!compact && <button className="text-button" onClick={() => void download()} disabled={busy || !visible.length}><Download size={15} />{busy ? 'Preparing...' : 'Download report'}</button>}</SectionHeading><p className="section-description">Every assessment is another step forward.</p>
    <div className="learner-progress-layout"><ProgressRing empty={!valid.length} value={average} label={valid.length?"average score":"No published results"} /><div className="subject-results">{valid.slice(0, compact ? 2 : 3).map((mark, index) => <div className={`subject-result subject-${index % 2}`} key={mark.id}><div><strong>{mark.tests!.subject}</strong><span>{mark.marks}<small> / {mark.tests!.max_marks}</small></span></div><div className="subject-progress"><span style={{ width: `${Math.min(100, mark.marks / mark.tests!.max_marks * 100)}%` }} /></div><p>{mark.tests!.title}</p></div>)}</div></div>
    {!compact && <><div className="console-filters"><label>Subject<select value={subject} onChange={event => setSubject(event.target.value)}><option value="all">All subjects</option>{[...new Set([...subjects,...tests.map(test=>test.subject),...valid.map(mark => mark.tests!.subject)])].sort().map(value => <option key={value}>{value}</option>)}</select></label></div><div className="assessment-list">{visible.map(mark => <article key={mark.id}><div><span className="subject-label">{mark.tests!.subject} | {displayDate(mark.tests!.test_date)}</span><h3>{mark.tests!.title}</h3>{mark.remarks && <p>{mark.remarks}</p>}</div><strong>{mark.marks}<small> / {mark.tests!.max_marks}</small></strong></article>)}{pending.map(test=><article key={test.id}><div><span className="subject-label">{test.subject} | {displayDate(test.test_date)}</span><h3>{test.title}</h3><p>Your teaching team has not published marks yet.</p></div><span className="subtle-pill">Awaiting result</span></article>)}</div></>}
    {compact && valid[0]?.remarks && <div className="teacher-note"><Sparkles size={18} /><p><strong>A note from your teacher</strong>{valid[0].remarks}</p></div>}
    {!(compact ? valid : visible).length && (compact||!pending.length) && <EmptyState>{valid.length ? 'No results for this subject yet.' : 'Results will appear when your teacher publishes them.'}</EmptyState>}
    {message && <p role="alert" className="form-error">{message}</p>}
  </section>;
}

