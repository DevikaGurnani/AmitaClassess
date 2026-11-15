"use client";
import { useEffect, useState } from 'react';
import { useAuth, useSupabase } from '@/lib/auth-context';
import {useLiveAttendance,useLiveTable} from '@/lib/use-live-table';
import { indiaDate, noticeForStudent, type LearnerRole, type LearnerStudent, type LearnerBatch, type LearnerAttendance, type LearnerMark, type LearnerMaterial, type LearnerNotice, type LearnerDue } from '@/lib/learner-console';

const emptyDetails = { tests: [] as Array<{id:string;title:string;subject:string;test_date:string;max_marks:number}>, attendance: [] as LearnerAttendance[], marks: [] as LearnerMark[], materials: [] as LearnerMaterial[], notices: [] as LearnerNotice[], dues: [] as LearnerDue[], batches: [] as LearnerBatch[] };
export default function useLearnerData(accountRole: LearnerRole) {
  const auth = useAuth();
  const { supabase: sb } = useSupabase();
  const [students, setStudents] = useState<LearnerStudent[]>([]);
  const [studentId, setStudentId] = useState('');
  const [details, setDetails] = useState(emptyDetails);
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [loadedStudentId, setLoadedStudentId] = useState('');
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const student = students.find(row => row.id === studentId);
  const { user, role } = auth;
  const attendanceFeed=useLiveAttendance(studentId,!!user&&role===accountRole,revision);
  useLiveTable('test_marks',studentId?'student_id=eq.'+studentId:undefined,()=>setRevision(value=>value+1),!!studentId&&!!user);
  useLiveTable('tests',undefined,()=>setRevision(value=>value+1),!!studentId&&!!user);
  useEffect(() => {
    if (!user || role !== accountRole) return;
    let active = true;
    setLoading(true); setError('');
    async function load() {
      let records: LearnerStudent[] = [];
      if (accountRole === 'parent') {
        const result = await sb.from('parents').select('student_parent(students(id,name,class,school))').eq('user_id', user!.id);
        if (result.error) throw result.error;
        records = (result.data ?? []).flatMap((parent: any) => (parent.student_parent ?? []).map((link: any) => link.students).filter(Boolean));
      } else {
        const account = await sb.from('users').select('student_id').eq('id', user!.id).single();
        if (account.error) throw account.error;
        const linkedId = account.data?.student_id;
        if (!linkedId) { if (active) { setStudents([]); setStudentId(''); } return; }
        const result = await sb.from('students').select('id,name,class,school').eq('id', linkedId);
        if (result.error) throw result.error;
        records = result.data ?? [];
      }
      if (!active) return;
      records = [...new Map(records.map(row => [row.id, row])).values()];
      setStudents(records);
      setStudentId(current => records.some(row => row.id === current) ? current : records[0]?.id ?? '');
    }
    void load().catch(cause => { if (active) setError(cause.message || 'Unable to load student profiles.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [sb, user, role, accountRole, revision]);

  useEffect(() => {
    if (!student || !user || role !== accountRole) return;
    let active = true;
    setDetailsLoading(true); setDetails(emptyDetails); setError('');
    async function load() {
      const today = indiaDate();
      const memberships = await sb.from('student_batch').select('batch_id,batches(id,name,subjects,schedule)').eq('student_id', studentId).lte('start_date', today).or(`end_date.is.null,end_date.gte.${today}`);
      if (memberships.error) throw memberships.error;
      const batches = (memberships.data ?? []).map(row => row.batches).filter(Boolean) as unknown as LearnerBatch[];
      const ids = batches.map(batch => batch.id);
      const results = await Promise.all([
        sb.from('attendance').select('date,status,batch_id').eq('student_id', studentId).lte('date', today).order('date', { ascending: false }).limit(500),
        sb.from('test_marks').select('id,marks,remarks,tests!test_marks_test_id_fkey(id,title,subject,max_marks,test_date)').eq('student_id', studentId).order('updated_at', { ascending: false }),
        ids.length ? sb.from('materials').select('id,title,subject,file_url,file_type,allow_download').in('batch_id', ids).eq('is_hidden', false) : Promise.resolve({ data: [], error: null }),
        sb.from('notices').select('id,title,body,created_at,audience,class_id,batch_id,expires_at').order('created_at', { ascending: false }).limit(100),
        accountRole === 'parent' ? sb.from('fee_dues').select('id,month,generated_amount,paid_amount,due_date,payments(id,amount,mode,receipt_no,paid_at,is_reversal)').eq('student_id', studentId).order('month', { ascending: false }) : Promise.resolve({ data: [], error: null }),
        ids.length ? sb.from('tests').select('id,title,subject,test_date,max_marks').in('batch_id',ids).order('test_date',{ascending:false}) : Promise.resolve({data:[],error:null}),
      ]);
      if (!active) return;
      const failures = results.flatMap(result => result.error ? [result.error.message] : []);
      if (failures.length) setError(failures.join(' '));
      setDetails({ tests:results[5].data??[], batches, attendance: results[0].data ?? [], marks: (results[1].data ?? []) as unknown as LearnerMark[], materials: results[2].data ?? [], notices: ((results[3].data ?? []) as LearnerNotice[]).filter(notice => noticeForStudent(notice, student!, ids)), dues: (results[4].data ?? []) as unknown as LearnerDue[] });
      setLoadedStudentId(studentId);
    }
    void load().catch(cause => { if (active) { setError(cause.message || 'Unable to load learning details.'); setLoadedStudentId(studentId); } }).finally(() => { if (active) setDetailsLoading(false); });
    return () => { active = false; };
  }, [sb, studentId, student, user, role, accountRole, revision]);
  return { ...auth, ...details, attendance:attendanceFeed.rows, attendanceLiveStatus:attendanceFeed.status, students, student, studentId, setStudentId, loading, detailsLoading: detailsLoading || (!!student && loadedStudentId !== studentId), error:error||attendanceFeed.error, refresh: () => setRevision(value => value + 1) };
}
