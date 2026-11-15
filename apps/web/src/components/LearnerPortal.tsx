"use client";
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, Award, BookOpen, CalendarDays, FileText, GraduationCap, RefreshCw } from 'lucide-react';
import { EmptyState, money, shortName, StatCard } from '@/components/DashboardParts';
import ConsoleNavigation, { learnerLinks } from '@/components/console/ConsoleNavigation';
import ClassSchedule from '@/components/console/ClassSchedule';
import { AttendanceRecords, ResultsRecords } from '@/components/console/LearningRecords';
import { LearningResources, Announcements } from '@/components/console/LearningResources';
import FamilyFees from '@/components/console/FamilyFees';
import AssignmentsPanel from '@/components/AssignmentsPanel';
import LibraryBrowser from '@/components/LibraryBrowser';
import ParentAssignmentProgress from '@/components/ParentAssignmentProgress';
import TeachingPace from '@/components/TeachingPace';
import TestAnswerSheets from '@/components/TestAnswerSheets';
import WorkspaceLoading from '@/components/WorkspaceLoading';
import BrandedProgress from '@/components/BrandedProgress';
import useLearnerData from '@/components/console/useLearnerData';
import { amountRemaining, attendanceSummary, learnerView, type LearnerRole } from '@/lib/learner-console';

export default function LearnerPortal({ accountRole }: { accountRole: LearnerRole }) {
  const data = useLearnerData(accountRole);
  const { user, role, profile, isLoading, student, studentId, students, setStudentId, attendance, marks, materials, notices, dues, batches, loading, detailsLoading, error, refresh } = data;
  const view = learnerView(useSearchParams().get('view'), accountRole);
  const home = `/${accountRole}`;
  const isParent = accountRole === 'parent';
  const validMarks = marks.filter(mark => mark.tests && mark.tests.max_marks > 0);
  const average = validMarks.length ? Math.round(validMarks.reduce((sum, mark) => sum + mark.marks / mark.tests!.max_marks * 100, 0) / validMarks.length) : 0;
  const balance = dues.reduce((sum, due) => sum + amountRemaining(due), 0);
  const summary = attendanceSummary(attendance);
  const show = (section: string) => view === 'overview' || view === section;
  if (isLoading) return <WorkspaceLoading/>;
  if (!user) return <div className="page-loading"><Link href="/auth/login">Sign in to your workspace</Link></div>;
  if (role !== accountRole) return <div className="page-loading">Sign in with your {accountRole} account to open this space.</div>;

  return <main className={`dashboard-page learner-page ${isParent ? 'parent-console' : 'student-console'}`}>
    <div className="dashboard-heading"><div><p className="eyebrow">AMITA’S CLASSES / {isParent ? 'PARENT CONSOLE' : 'STUDENT CONSOLE'}</p><h1>{view === 'overview' ? `Welcome back, ${profile?.name.split(' ')[0] ?? 'there'}` : learnerLinks(accountRole).find(link => link.view === view)?.label}</h1><p>{isParent ? 'A closer connection to every step of their learning.' : 'Your classes, your progress, your next big idea.'}</p></div><button className="secondary-button console-refresh" onClick={refresh} disabled={loading || detailsLoading}><RefreshCw size={16} />Refresh</button></div>
    <ConsoleNavigation role={accountRole} view={view} />
    {error && <div className="form-error" role="alert">{error} <button className="text-button" onClick={refresh}>Try again</button></div>}
    {student && <section className="learner-profile-strip"><span className="avatar avatar-peach">{shortName(student.name)}</span><div className="learner-profile-name"><span className="eyebrow">{isParent ? 'FOLLOWING THEIR JOURNEY' : 'YOUR LEARNING PROFILE'}</span>{isParent ? <label className="sr-only" htmlFor="console-child">Choose your child</label> : null}{isParent ? <select id="console-child" aria-label="Select student" value={studentId} onChange={event => setStudentId(event.target.value)}>{students.map(child => <option key={child.id} value={child.id}>{child.name} - Class {child.class}</option>)}</select> : <h2>{student.name}</h2>}<p>Class {student.class} | {student.school || 'Amita’s Classes'}</p></div><span className="profile-tag"><GraduationCap size={17} />{detailsLoading ? 'Loading classes...' : `${batches.length} learning classes`}</span></section>}
    {!student ? <EmptyState>{loading ? 'Finding your linked student profile...' : error ? 'Unable to open your student profile. Please retry.' : 'Your student profile is awaiting an account link from the academy.'}</EmptyState> : detailsLoading ? <BrandedProgress label="Loading your learning details…"/> : <>
      {view === 'overview' && <>
        <section className="welcome-banner learner-welcome"><div><span className="eyebrow">{isParent ? 'TOGETHER, EVERY STEP OF THE WAY' : 'A LITTLE CURIOSITY. A LOT OF POSSIBILITY.'}</span><h2>{isParent ? <>Their next chapter.<br /><em>With you beside them.</em></> : <>Make today<br /><em>a learning day.</em></>}</h2><p>{isParent ? `Stay close to ${student.name.split(' ')[0]}'s classes, achievements, and everyday progress.` : 'Find your next class, revisit a tricky topic, and see how far you have come.'}</p><Link href={`${home}?view=${isParent ? 'results' : 'schedule'}`}>{isParent ? 'Explore their progress' : 'See your class schedule'}<ArrowRight size={16} /></Link></div><img src="/images/learning-still-life.png" alt="Study books and a notebook" /></section>
        <section className="stats-grid"><Link href={`${home}?view=attendance`}><StatCard label="Attendance" value={summary.counted ? `${summary.rate}%` : '--'} detail={`${summary.present + summary.late} classes attended`} icon={<CalendarDays size={19} />} /></Link><Link href={`${home}?view=results`}><StatCard label="Average score" value={validMarks.length ? `${average}%` : '--'} detail={`Across ${validMarks.length} assessments`} tone="peach" icon={<Award size={19} />} /></Link><Link href={`${home}?view=materials`}><StatCard label="Learning resources" value={materials.length} detail="Notes and practice, ready to explore" tone="lavender" icon={<BookOpen size={19} />} /></Link><Link href={`${home}?view=${isParent ? 'fees' : 'schedule'}`}><StatCard label={isParent ? 'Outstanding fees' : 'Learning classes'} value={isParent ? money(balance) : batches.length} detail={isParent ? 'Invoices and receipts in one place' : 'View your weekly timetable'} tone="sand" icon={isParent ? <FileText size={19} /> : <GraduationCap size={19} />} /></Link></section>
      </>}
      <div className={`learner-grid console-panels ${view !== 'overview' ? 'console-detail' : ''}`}>
        {view==='answer-sheets'&&<TestAnswerSheets key={studentId} studentId={studentId} readOnly={isParent}/>} {!isParent&&view==='assignments'&&<AssignmentsPanel/>}{isParent&&view==='assignments'&&<ParentAssignmentProgress studentId={studentId} batches={batches.map(row=>row.id)}/>}
        {!isParent&&(view==='overview'||view==='schedule')&&<TeachingPace/>}
        {show('schedule') && <ClassSchedule batches={batches} compact={view === 'overview'} />}
        {show('results') && <ResultsRecords key={studentId} subjects={batches.flatMap(batch=>batch.subjects||[])} tests={data.tests} marks={marks} studentName={student.name} compact={view === 'overview'} />}
        {show('attendance') && <AttendanceRecords records={attendance} batches={batches} compact={view === 'overview'} liveStatus={data.attendanceLiveStatus} />}
        {view==='materials'&&<LibraryBrowser key={studentId} studentId={studentId}/>}
        {show('materials') && (view === 'overview' || materials.length>0) && <LearningResources materials={materials} compact={view === 'overview'} />}
        {show('notices') && <Announcements notices={notices} home={home} compact={view === 'overview'} />}
        {isParent && show('fees') && <FamilyFees dues={dues} studentName={student.name} isDemo={false} refresh={refresh} compact={view === 'overview'} />}
      </div>
    </>}
  </main>;
}
