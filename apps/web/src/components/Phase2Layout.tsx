'use client';
import Link from 'next/link';
import WorkspaceLoading from '@/components/WorkspaceLoading';
import { useAuth } from '@/lib/auth-context';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
export default function Phase2Layout({title,roles=['owner','staff'],children}:{title:string;roles?:string[];children:ReactNode}) {
 const {user,role,isLoading}=useAuth();const router=useRouter();
 useEffect(()=>{if(!isLoading&&!user)router.replace('/auth/login');},[isLoading,user,router]);
 if(isLoading)return <WorkspaceLoading/>;
 if(!user||!role||!roles.includes(role))return <main className="p-8">Access denied.</main>;
 return <main className="min-h-screen bg-tuition-background text-white"><div className="mx-auto max-w-6xl space-y-6">
  <header className="console-page-header"><div><p className="eyebrow">AMITA’S CLASSES / ACADEMY MANAGEMENT</p><h1>{title}</h1><p className="section-description">{title.includes('Test') ? 'Create assessments, enter marks, and help every learner move forward.' : title.includes('Report') ? 'Turn attendance, fees, and results into a clearer view of your academy.' : title.includes('Notic') ? 'Keep students and families connected to the latest academy news.' : title.includes('Notification') ? 'Prepare reminders and follow their delivery status.' : title.includes('payment') ? 'Review outstanding invoices and keep track of confirmed receipts.' : title.includes('library') ? 'Useful resources for curious minds and growing confidence.' : 'Keep your learning community organised and connected.'}</p></div><Link className="secondary-button" href={role === 'teacher' ? '/teacher' : '/owner'}><ArrowLeft size={15} />Overview</Link></header>
  {children}</div></main>;
}
export const inputClass='w-full rounded-md border border-gray-600 bg-tuition-secondary px-3 py-2 text-white';
export const buttonClass='rounded-md bg-tuition-primary px-4 py-2 font-semibold text-white disabled:opacity-50';
export const panelClass='rounded-xl border border-gray-700 bg-tuition-card p-5';
