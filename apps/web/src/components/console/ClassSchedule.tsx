'use client';
import { useState } from 'react';
import { Clock, BookOpen } from 'lucide-react';
import { EmptyState, SectionHeading } from '@/components/DashboardParts';
import { weekDays, type LearnerBatch } from '@/lib/learner-console';

export default function ClassSchedule({ batches, compact = false }: { batches: LearnerBatch[]; compact?: boolean }) {
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', timeZone: 'Asia/Kolkata' });
  const [day, setDay] = useState(today);
  const sessions = batches.filter(batch => batch.schedule?.days?.includes(day)).sort((a, b) => (a.schedule?.startTime ?? '').localeCompare(b.schedule?.startTime ?? ''));
  return <section className={`dashboard-panel class-schedule ${compact ? '' : 'console-wide'}`}>
    <SectionHeading title={compact ? "Your week, at a glance" : 'Class schedule'}><span className="subtle-pill">All times IST</span></SectionHeading>
    <p className="section-description">A little preparation makes room for a great class.</p>
    <div className="weekday-picker" role="group" aria-label="Choose a weekday">{weekDays.map(value => <button key={value} type="button" aria-pressed={day === value} className={day === value ? 'selected' : ''} onClick={() => setDay(value)}><span>{value.slice(0, 3)}</span>{value === today && <i aria-label="Today" />}</button>)}</div>
    <div className="console-session-list">{sessions.map((batch, index) => <article key={batch.id} className={`console-session session-tone-${index % 3}`}><span className="console-session-icon"><BookOpen size={21} /></span><div><h3>{batch.name}</h3><p>{batch.subjects?.join(' · ') || 'Learning session'}</p></div><span className="session-time"><Clock size={14} />{batch.schedule?.startTime || 'To be confirmed'}{batch.schedule?.endTime ? ` – ${batch.schedule.endTime}` : ''}</span></article>)}</div>
    {!sessions.length && <EmptyState>No classes scheduled for {day}. Choose another day to see your timetable.</EmptyState>}
    {!compact && <div className="enrolled-batches"><h3>Enrolled classes <span>{batches.length}</span></h3>{batches.map(batch => <article key={batch.id}><strong>{batch.name}</strong><p>{batch.schedule?.days?.join(', ') || 'Schedule to be announced'}</p></article>)}</div>}
  </section>;
}
