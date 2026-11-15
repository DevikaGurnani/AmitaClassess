import Link from 'next/link';
import { BookOpen, CalendarDays, CreditCard, GraduationCap, Home, Megaphone, PieChart,ClipboardList } from 'lucide-react';
import type { LearnerRole } from '@/lib/learner-console';

export function learnerLinks(role: LearnerRole) {
  const home = `/${role}`;
  return [
    { href: home, label: 'Overview', view: 'overview', icon: Home },
    { href: `${home}?view=schedule`, label: 'Class schedule', view: 'schedule', icon: CalendarDays },
    { href: `${home}?view=attendance`, label: 'Attendance', view: 'attendance', icon: PieChart },
    { href: `${home}?view=results`, label: 'Results', view: 'results', icon: GraduationCap },
    {href:`${home}?view=answer-sheets`,label:'Test answer sheets',view:'answer-sheets',icon:ClipboardList},
    { href: `${home}?view=materials`, label: 'Learning library', view: 'materials', icon: BookOpen },
    ...(['student','parent'].includes(role)?[{href:`${home}?view=assignments`,label:'Assignments',view:'assignments',icon:ClipboardList}]:[]),
    ...(role === 'parent' ? [{ href: `${home}?view=fees`, label: 'Fees & receipts', view: 'fees', icon: CreditCard }] : []),
    { href: `${home}?view=notices`, label: 'Announcements', view: 'notices', icon: Megaphone },
  ];
}

export default function ConsoleNavigation({ role, view }: { role: LearnerRole; view: string }) {
  return <nav className="console-tabs" aria-label={`${role} console sections`}>{learnerLinks(role).map(({ href, label, view: key, icon: Icon }) => <Link href={href} key={key} aria-current={view === key ? 'page' : undefined} className={view === key ? 'selected' : ''}><Icon size={16} />{label}</Link>)}</nav>;
}
