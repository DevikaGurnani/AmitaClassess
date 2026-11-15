import Link from 'next/link';
import { ArrowUpRight, BookOpen, CalendarCheck, GraduationCap, Users } from 'lucide-react';

const actions = [
  { href: '/owner/attendance', title: 'Take attendance', description: 'Every learner counts', icon: CalendarCheck, tone: 'green' },
  { href: '/owner/batches', title: 'Explore classes', description: 'Make space for discovery', icon: Users, tone: 'peach' },
  { href: '/owner/materials', title: 'Learning library', description: 'Ideas worth sharing', icon: BookOpen, tone: 'lavender' },
  { href: '/owner/tests', title: 'Track progress', description: 'Celebrate the next step', icon: GraduationCap, tone: 'sand' },
];

export default function WorkspaceQuickActions() {
  return <section className="quick-actions" aria-labelledby="quick-actions-title"><div className="quick-actions-heading"><h2 id="quick-actions-title">A good place to start</h2><span>Your everyday essentials</span></div><div className="quick-actions-grid">{actions.map(({ href, title, description, icon: Icon, tone }) => <Link href={href} className={`quick-action quick-action-${tone}`} key={href}><span className="quick-action-icon"><Icon size={22} /></span><span><strong>{title}</strong><small>{description}</small></span><ArrowUpRight size={17} aria-hidden="true" /></Link>)}</div></section>;
}
