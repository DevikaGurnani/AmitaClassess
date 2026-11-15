'use client';
import type { ReactNode } from 'react';
import { TrendingUp } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export function StatCard({ label, value, detail, icon, tone = 'green' }: { label: string; value: string | number; detail: string; icon: ReactNode; tone?: string }) {
  return <article className={`stat-card stat-${tone}`}><div className="stat-top"><span>{label}</span><span className="stat-icon">{icon}</span></div><strong>{value}</strong><p><span className="stat-detail-dot" />{detail}</p></article>;
}

export function AttendanceChart({ data }: { data: Array<{ label: string; value: number }> }) {
  return <div className="attendance-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{ top: 18, right: 10, left: -20, bottom: 0 }}><defs><linearGradient id="attendanceFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#76a58c" stopOpacity={0.3} /><stop offset="100%" stopColor="#76a58c" stopOpacity={0.01} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#e9eee7" strokeDasharray="4 5" /><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#8a958d', fontSize: 11 }} dy={12} /><YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} axisLine={false} tickLine={false} tick={{ fill: '#8a958d', fontSize: 11 }} tickFormatter={value => `${value}%`} /><Tooltip contentStyle={{ border: '1px solid #dfe7dd', borderRadius: 12, fontSize: 12 }} formatter={(value: number) => [`${value}%`, 'Attendance']} /><Area type="monotone" dataKey="value" stroke="#42745a" strokeWidth={3} fill="url(#attendanceFill)" activeDot={{ r: 5, fill: '#d78c66', stroke: '#fff', strokeWidth: 3 }} /></AreaChart></ResponsiveContainer></div>;
}

export function ProgressRing({ value, label,empty=false }: { value: number; label: string;empty?:boolean }) {
  return <div className="progress-ring" style={{ background: `conic-gradient(#4e7a5c ${Math.min(100, Math.max(0, value)) * 3.6}deg, #edf1e8 0deg)` }}><div><strong>{empty?'—':`${value}%`}</strong><span>{label}</span></div></div>;
}

export function SectionHeading({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="section-heading"><h2>{title}</h2>{children}</div>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="designed-empty"><TrendingUp size={26} /><p>{children}</p></div>;
}

export const money = (value: number) => `₹${value.toLocaleString('en-IN')}`;
export const shortName = (name: string) => name.split(' ').map(part => part[0]).slice(0, 2).join('');
