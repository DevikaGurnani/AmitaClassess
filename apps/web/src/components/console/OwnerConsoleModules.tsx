import Link from 'next/link';
import { ArrowUpRight, BarChart3, Bell, BookOpen, CalendarCheck, CreditCard, FileText, GraduationCap, Layers, Megaphone, Settings2, UserPlus, Users, WifiOff } from 'lucide-react';
import { EmptyState, money, SectionHeading, shortName } from '@/components/DashboardParts';
import { amountRemaining, displayDate, indiaDate } from '@/lib/learner-console';

const groups = [
  { title: 'People & admissions', description: 'A thoughtful start for every learner.', tools: [
    { href: '/owner/students/add', label: 'New admission', detail: 'Add a student and link their family', icon: UserPlus },
    { href: '/owner/students', label: 'Student directory', detail: 'Search, update, and manage student profiles', icon: Users },
    { href: '/owner/users', label: 'People & permissions', detail: 'Review connected academy accounts', icon: Settings2 },
  ] },
  { title: 'Teaching & learning', description: 'Keep great learning moving.', tools: [
    { href: '/owner/batches', label: 'Classes & batches', detail: 'Manage schedules, subjects, and enrolments', icon: Layers },
    { href: '/owner/attendance', label: 'Class attendance', detail: 'Mark and review attendance', icon: CalendarCheck },
    { href: '/owner/tests', label: 'Tests & results', detail: 'Create assessments and enter marks', icon: GraduationCap },
    { href: '/owner/question-papers', label: 'Question paper studio', detail: 'Import question banks and generate class papers', icon: FileText },
    { href: '/owner/materials', label: 'Learning library', detail: 'Share notes, practice packs, and links', icon: BookOpen },
    { href: '/owner/assignments', label: 'Assignments', detail: 'Set deadlines, review uploads, and award marks', icon: FileText },
  ] },
  { title: 'Finance & operations', description: 'Less admin. More room to grow.', tools: [
    { href: '/owner/fees', label: 'Fees & collections', detail: 'Generate dues and record payments', icon: CreditCard },
    { href: '/owner/payments', label: 'Online payments', detail: 'Start checkout and download receipts', icon: FileText },
    { href: '/owner/reports', label: 'Reports & exports', detail: 'Attendance, collection, and result reports', icon: BarChart3 },
    { href: '/owner/notices', label: 'Announcements', detail: 'Publish academy and class updates', icon: Megaphone },
    { href: '/owner/notifications', label: 'Notification queue', detail: 'Review and prepare reminders', icon: Bell },
    { href: '/owner/offline-attendance', label: 'Offline attendance', detail: 'Record attendance without a connection', icon: WifiOff },
  ] },
];
export function OwnerManagement({ role }: { role: string | null }) {
  return <div className="management-groups">{groups.map((group, index) => <section className="management-group" key={group.title}><div className="management-group-heading"><span>0{index + 1}</span><div><h2>{group.title}</h2><p>{group.description}</p></div></div><div className="management-tool-grid">{group.tools.filter(tool => !['/owner/users', '/owner/assignments','/owner/question-papers'].includes(tool.href) || role === 'owner').map(({ href, label, detail, icon: Icon }) => <Link href={href} className="management-tool" key={href}><span className={`management-tool-icon tool-tone-${index}`}><Icon size={23} /></span><div><h3>{label}</h3><p>{detail}</p></div><ArrowUpRight size={18} /></Link>)}</div></section>)}</div>;
}

type FinanceDue = { id: string; generated_amount: number; paid_amount: number; due_date: string; students: { name: string } | null };
type FinancePayment = { id: string; amount: number; is_reversal: boolean; mode: string; receipt_no: string; paid_at: string; students: { name: string } | null };
export function OwnerFinancePanel({ dues, payments, loading, failed = false }: { dues: FinanceDue[]; payments: FinancePayment[]; loading: boolean; failed?: boolean }) {
  const unpaid = dues.filter(due => amountRemaining(due) > 0).sort((a, b) => a.due_date.localeCompare(b.due_date));
  return <div className="owner-finance-grid"><section className="dashboard-panel"><SectionHeading title="Needs a little attention"><Link href="/owner/fees">Manage dues <ArrowUpRight size={15} /></Link></SectionHeading><p className="section-description">Outstanding invoices for this billing month.</p><div className="owner-followups">{unpaid.slice(0, 4).map(due => <Link href={`/owner/fees/${due.id}/details`} key={due.id}><span className="avatar avatar-peach">{shortName(due.students?.name ?? 'Student')}</span><div><strong>{due.students?.name ?? 'Student invoice'}</strong><small>{due.due_date < indiaDate() ? 'Overdue' : 'Due'} | {displayDate(due.due_date)}</small></div><strong>{money(amountRemaining(due))}</strong><ArrowUpRight size={15} /></Link>)}</div>{!unpaid.length && <EmptyState>{loading ? 'Loading invoices...' : failed ? 'Invoice details are unavailable. Try refreshing the console.' : 'No outstanding invoices in this billing month.'}</EmptyState>}</section>
    <section className="dashboard-panel"><SectionHeading title="Recent collections"><Link href="/owner/payments">All receipts <ArrowUpRight size={15} /></Link></SectionHeading><p className="section-description">The latest recorded payments across your academy.</p><div className="owner-followups">{payments.map(payment => <article key={payment.id}><span className="payment-entry-icon"><CreditCard size={18} /></span><div><strong>{payment.students?.name ?? payment.receipt_no}</strong><small>{payment.receipt_no} | {payment.mode}{payment.is_reversal ? ' | Reversal' : ''}</small></div><strong>{money(payment.is_reversal ? -payment.amount : payment.amount)}</strong></article>)}</div>{!payments.length && <EmptyState>{loading ? 'Loading collections...' : failed ? 'Payment details are unavailable. Try refreshing the console.' : 'Recorded payments will appear here.'}</EmptyState>}</section></div>;
}
