"use client";
import Link from 'next/link';
import { useState } from 'react';
import { ArrowUpRight, BookOpen, Download, FileText, Search } from 'lucide-react';
import { EmptyState, SectionHeading } from '@/components/DashboardParts';
import { displayDate, safeResourceUrl, type LearnerMaterial, type LearnerNotice } from '@/lib/learner-console';

export function LearningResources({ materials, compact = false }: { materials: LearnerMaterial[]; compact?: boolean }) {
  const [search, setSearch] = useState('');
  const [subject, setSubject] = useState('all');
  const visible = materials.filter(material => `${material.title} ${material.subject}`.toLowerCase().includes(search.toLowerCase()) && (subject === 'all' || material.subject === subject));
  return <section className={`dashboard-panel ${compact ? '' : 'console-wide'}`}><SectionHeading title="Your learning library"><span className="subtle-pill">{materials.length} resources</span></SectionHeading><p className="section-description">Notes, revision packs, and a little inspiration.</p>
    {!compact && <div className="console-filters"><label className="console-search-label">Find a resource<span className="console-search"><Search size={16} /><input type="search" placeholder="Search by title or subject" value={search} onChange={event => setSearch(event.target.value)} /></span></label><label>Subject<select value={subject} onChange={event => setSubject(event.target.value)}><option value="all">All subjects</option>{[...new Set(materials.map(row => row.subject))].map(value => <option key={value}>{value}</option>)}</select></label></div>}
    <div className="resource-list">{visible.slice(0, compact ? 3 : undefined).map((material, index) => { const url = safeResourceUrl(material.file_url); return <article key={material.id}><span className={`resource-icon resource-${index % 2}`}><FileText size={22} /></span><div><strong>{material.title}</strong><p>{material.subject} | {material.file_type}</p></div>{url ? <div className="resource-actions"><a href={url} target="_blank" rel="noopener noreferrer" className="text-button" aria-label={`Open ${material.title}`}><ArrowUpRight size={16} />Open</a>{material.allow_download && <a href={url} download className="icon-button labelled-action-button" aria-label={`Download ${material.title}`}><Download size={17} /><span className="action-button-label">Download</span></a>}</div> : <span className="section-description">Link unavailable</span>}</article>; })}</div>
    {!visible.length && <EmptyState>{materials.length ? 'No resources match your search. Try another title or subject.' : 'Your teachers will share resources here.'}</EmptyState>}
  </section>;
}

export function Announcements({ notices, home, compact = false }: { notices: LearnerNotice[]; home: string; compact?: boolean }) {
  return <section className={`dashboard-panel notice-preview ${compact ? '' : 'console-wide'}`}><SectionHeading title="From your academy">{compact && <Link href={`${home}?view=notices`}>All updates <ArrowUpRight size={15} /></Link>}</SectionHeading>{notices.slice(0, compact ? 2 : undefined).map((notice, index) => <article key={notice.id}><span className={`notice-icon notice-${index % 2}`}><BookOpen size={18} /></span><div><span className="subject-label">{displayDate(notice.created_at)}</span><h3>{notice.title}</h3><p className="notice-body">{notice.body}</p></div></article>)}{!notices.length && <EmptyState>You are up to date. New announcements will appear here.</EmptyState>}</section>;
}
