'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth, useSupabase } from '@/lib/auth-context';
import Phase2Layout, { panelClass } from '@/components/Phase2Layout';

type Batch = { name: string; class: string; subjects: string[]; base_fee: number; is_active: boolean; schedule: { days?: string[]; startTime?: string; endTime?: string } | null };
type Enrollment = { student_id: string; start_date: string; end_date: string | null; custom_fee: number | null; students: { name: string; status: string } | null };

export default function BatchProfile({ params }: { params: { id: string } }) {
  const { user, role } = useAuth();
  const { supabase: sb } = useSupabase();
  const [batch, setBatch] = useState<Batch | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!user || !role || !['owner', 'staff'].includes(role)) return;
    let active = true;
    async function load() {
      try {
        const [result, members] = await Promise.all([
          sb.from('batches').select('name,class,subjects,base_fee,is_active,schedule').eq('id', params.id).single(),
          sb.from('student_batch').select('student_id,start_date,end_date,custom_fee,students(name,status)').eq('batch_id', params.id).order('start_date'),
        ]);
        if (result.error || members.error) throw result.error || members.error;
        if (active) { setBatch(result.data); setEnrollments((members.data ?? []) as unknown as Enrollment[]); }
      } catch (cause) { if (active) setError((cause as { message?: string })?.message ?? 'Unable to load batch'); }
      finally { if (active) setLoading(false); }
    }
    void load(); return () => { active = false; };
  }, [sb, user, role, params.id]);
  return <Phase2Layout title={batch?.name ?? 'Batch profile'}>
    <Link className="text-tuition-accent underline" href="/owner/batches">Batches</Link>
    {error && <p role="alert" className="text-red-300">{error}</p>}
    {loading && <p>Loading batch…</p>}
    {batch && <><section className={`${panelClass} space-y-2`}><p>Class {batch.class} · {batch.is_active ? 'Active' : 'Inactive'}</p><p>{batch.subjects.join(', ')}</p><p>Base monthly fee ₹{batch.base_fee}</p><p>{batch.schedule?.days?.join(', ')} · {batch.schedule?.startTime}–{batch.schedule?.endTime} IST</p></section>
      <section className={`${panelClass} space-y-3`}><h2 className="text-xl">Enrollment history</h2>
        {!enrollments.length && <p>No students enrolled. Assign batches from a student profile.</p>}
        {enrollments.map(row => <div key={row.student_id} className="border-t border-gray-700 pt-3"><Link className="text-tuition-accent underline" href={`/owner/students/${row.student_id}/profile`}>{row.students?.name ?? row.student_id}</Link><p>{row.start_date} to {row.end_date ?? 'ongoing'} · {row.students?.status} · ₹{row.custom_fee ?? batch.base_fee}/month</p></div>)}
      </section></>}
  </Phase2Layout>;
}
