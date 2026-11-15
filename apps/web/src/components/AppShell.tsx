'use client';
import AcademyBrand from '@/components/AcademyBrand';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { ArrowUpRight, Bell, BookOpen, CalendarDays, BarChart3, ChevronDown, CreditCard, GraduationCap, Home, LayoutGrid, LogOut, Menu, MessageSquare, Search, Settings2, Users } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { learnerLinks } from '@/components/console/ConsoleNavigation';
import { learnerView } from '@/lib/learner-console';
import NotificationCenter from '@/components/NotificationCenter';
import WorkspaceLoading from '@/components/WorkspaceLoading';

const ownerLinks = [
  { href: '/owner', label: 'Overview', icon: Home },
  { href: '/owner/students', label: 'Students', icon: Users },
  { href: '/owner/batches', label: 'Batches', icon: LayoutGrid },
  { href: '/owner/attendance', label: 'Attendance', icon: CalendarDays },
  { href: '/owner/fees', label: 'Fees & payments', icon: CreditCard },
  { href: '/owner/materials', label: 'Learning library', icon: BookOpen },
  { href: '/owner/assignments', label: 'Assignments', icon: BookOpen },
  { href: '/owner/tests', label: 'Tests & results', icon: GraduationCap },
  { href: '/owner/question-papers', label: 'Question papers', icon: BookOpen },
  { href: '/owner/reports', label: 'Reports', icon: BarChart3 },
  { href: '/owner/notices', label: 'Announcements', icon: MessageSquare },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  if (!['/owner', '/parent', '/student', '/teacher'].some(prefix => path.startsWith(prefix))) return children;
  return <WorkspaceShell>{children}</WorkspaceShell>;
}

function WorkspaceShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, profile, role, signOut, isLoading } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [search, setSearch] = useState('');
  const isAdmin = role === 'owner' || role === 'staff';
  const home = role === 'parent' ? '/parent' : role === 'student' ? '/student' : role === 'teacher' ? '/teacher' : '/owner';
  const links = isAdmin ? [{ href: '/owner?view=management', label: 'Management tools', icon: LayoutGrid }, ...ownerLinks.filter(link=>role==='owner'||!['/owner/assignments','/owner/question-papers'].includes(link.href))] : role === 'parent' || role === 'student' ? learnerLinks(role) : [
    { href: home, label: 'Overview', icon: Home },
    { href: '/teacher?view=assignments', label: 'Assignments & review', icon: BookOpen },
    { href: '/teacher?view=papers', label: 'Question papers', icon: GraduationCap },
    { href: '/owner/tests', label: 'Tests & results', icon: GraduationCap },
    { href: '/owner/materials', label: 'Learning library', icon: BookOpen },
  ];
  const currentView = role === 'parent' || role === 'student' ? learnerView(searchParams.get('view'), role) : searchParams.get('view');
  function isActive(href: string) {
    if (href.includes('?')) return path === href.split('?')[0] && currentView === href.split('view=')[1];
    return href === home ? path === home && (!currentView || currentView === 'overview') : path.startsWith(href);
  }
  const name = profile?.name ?? 'Your workspace';
  if(isLoading)return <WorkspaceLoading/>;
  return <div className="workspace">
    {menuOpen && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
    <aside className={`workspace-sidebar ${menuOpen ? 'is-open' : ''}`}>
      <Link href={home} className="brand" onClick={() => setMenuOpen(false)}><AcademyBrand /></Link>
      <div className="institute-switch"><span className="institute-avatar">A</span><span>Amita’s Classes<small>{isAdmin ? 'Owner workspace' : role === 'parent' ? 'Parent workspace' : 'Learning workspace'}</small></span></div>
      <p className="nav-section-label">WORKSPACE</p>
      <nav className="workspace-nav" aria-label="Main navigation">{links.map(item => {
        const active = isActive(item.href);
        return <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined} className={active ? 'active' : ''} onClick={() => setMenuOpen(false)}><item.icon size={19} /><span>{item.label}</span>{active && <span className="nav-active-dot" />}</Link>;
      })}</nav>
      {isAdmin && <><p className="nav-section-label">OPERATIONS</p><nav className="workspace-nav" aria-label="Academy operations">{[{ href: '/owner/payments', label: 'Online payments', icon: CreditCard }, { href: '/owner/notifications', label: 'Notifications', icon: Bell }, ...(role === 'owner' ? [{ href: '/owner/users', label: 'People & permissions', icon: Settings2 }] : [])].map(item => <Link key={item.href} href={item.href} className={isActive(item.href) ? 'active' : ''} aria-current={isActive(item.href) ? 'page' : undefined} onClick={() => setMenuOpen(false)}><item.icon size={19} />{item.label}</Link>)}</nav></>}
      <div className="sidebar-bottom">
        <button className="sidebar-account" onClick={() => void signOut()}><span className="avatar avatar-green">{name.split(' ').map(part => part[0]).slice(0, 2).join('')}</span><span>{name}<small>{role ? `${role[0].toUpperCase()}${role.slice(1)} account` : 'Loading account'}</small></span><LogOut size={17} /></button>
      </div>
    </aside>
    <div className="workspace-body">
      <header className="workspace-topbar">
        <div className="topbar-location"><button className="icon-button mobile-menu" aria-label="Open navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><Menu size={22} /></button><span>Workspace</span><span className="breadcrumb-divider">/</span><strong>{links.find(item => isActive(item.href))?.label ?? 'Your learning space'}</strong></div>
        <div className="topbar-actions">
          {isAdmin && <form className="global-search" onSubmit={event => { event.preventDefault(); router.push(`/owner/students?search=${encodeURIComponent(search)}`); }}><Search size={16} /><input aria-label="Search students" placeholder="Find a student…" value={search} onChange={event => setSearch(event.target.value)} /><kbd>↵</kbd></form>}
          <NotificationCenter />
          <div className="topbar-divider" />
          <div className="popover-anchor"><button className="account-toggle" aria-label="Account menu" aria-expanded={accountOpen} onClick={() => setAccountOpen(!accountOpen)}><span className="avatar avatar-peach">{name.split(' ').map(part => part[0]).slice(0, 2).join('')}</span><ChevronDown size={14} /></button>{accountOpen && <div className="header-popover account-popover"><strong>{name}</strong><p>{role} account</p><button onClick={() => void signOut()}><LogOut size={16} /> Sign out</button></div>}</div>
        </div>
      </header>
      <div className="workspace-content">{children}</div>
      <footer className="workspace-footer"><span>Made for brighter futures.</span><span>Learning portal · Amita’s Classes</span></footer>
    </div>
  </div>;
}
