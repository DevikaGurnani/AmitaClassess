"use client";

import { Edit, Search } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useEffect, useState, useCallback } from 'react';
import { useAuth, useSupabase } from '@/lib/auth-context';
import { useRouter, useSearchParams } from 'next/navigation';
import { hasPermission } from '@/lib/permissions';
import { supabase } from '@/lib/supabase/client';

function OwnerStudentsContent() {
  const { user, role, isLoading, signOut } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { supabase: sb } = useSupabase();

  useEffect(() => {
    if (!user && !isLoading) {
      router.replace('/auth/login');
    }
  }, [user, isLoading, router]);

  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  useEffect(() => { setSearch(searchParams.get('search') ?? ''); }, [searchParams]);
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'on_hold' | 'left'>('all');
  const [filterBatch, setFilterBatch] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Fetch students
  const loadStudents = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      let query = sb.from('students').select(`
        *,
        student_parent (
          parent_id,
          relation,
          is_primary
        ),
        student_batch (batch_id, start_date, end_date, batches(name))
      `);

      // Filter by status
      if (filterStatus !== 'all') {
        query = query.eq('status', filterStatus);
      }

      // Filter by batch
      if (filterBatch) {
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
        const memberships = await sb.from('student_batch').select('student_id').eq('batch_id', filterBatch)
          .lte('start_date', today).or(`end_date.is.null,end_date.gte.${today}`);
        if (memberships.error) throw memberships.error;
        query = query.in('id', memberships.data?.map(row => row.student_id) ?? []);
      }

      // Search
      if (search) {
        const term = search.replace(/[(),.%]/g, ' ').trim();
        if (term) query = query.or(`name.ilike.%${term}%,class.ilike.%${term}%`);
      }

      const { data, error } = await query.order('name', { ascending: true });

      if (error) throw error;
      setStudents(data || []);
    } catch (err: any) {
      console.error('Error loading students:', err);
      setError(err?.message || 'Unable to load students');
    } finally {
      setLoading(false);
    }
  }, [sb, search, filterStatus, filterBatch]);

  // Load batches for filter
  const [batches, setBatches] = useState<any[]>([]);
  useEffect(() => {
    Promise.resolve(sb.from('batches').select('id, name, class').eq('is_active', true).order('name', { ascending: true })).then(r => setBatches(r.data || [])).catch(() => setBatches([]));
  }, []);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  const handleDelete = useCallback(async (id: string) => {
    setError('');
    try {
      const { error } = await sb.from('students').update({ status: 'left' }).eq('id', id);
      if (error) throw error;
      await loadStudents();
    } catch (err: any) {
      setError(err?.message || 'Unable to change student status');
    }
  }, [sb, loadStudents]);

  const studentBatches = (student: any) => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    return (student.student_batch || []).filter((row: any) => row.start_date <= today && (!row.end_date || row.end_date >= today))
      .map((row: any) => row.batches?.name || row.batch_id).join(', ') || 'Unassigned';
  };

  const exportToExcel = useCallback(async () => {
    // Export students data to Excel
    const studentsData = students.map(s => ({
      'Name': s.name,
      'Class': s.class,
      'Batch': studentBatches(s),
      'Status': s.status,
      'School': s.school,
      'Board': s.board,
      'Admission Date': s.admission_date,
      'Date of Birth': s.date_of_birth,
    }));

    // Use table export logic
    const ws = XLSX.utils.json_to_sheet(studentsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Students');
    XLSX.writeFile(wb, 'students_export.xlsx');
  }, [students]);

  return (
    <div className="min-h-screen bg-tuition-background">
      <nav className="bg-tuition-secondary border-b border-border flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-tuition-primary flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 9v2m4 4v2m7-7h-2m0 0h-2m2 2v2m4-4v2m7-7H9m11 0H5a2 2 0 01-2-2V5a2 2 0 012-2h6a2 2 0 012 2v14a2 2 0 01-2 2h-6a2 2 0 01-2-2V5a2 2 0 012-2h6z"/></svg>
          </div>
          <span className="text-lg font-bold">Amita’s Classes</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-400">{role}</span>
          <button
            onClick={() => void signOut()}
            className="secondary-button"
            aria-label="Sign out"
          >
            Sign out
          </button>
        </div>
      </nav>

      <main className="p-6 pt-0">
        <div className="flex items-center justify-between py-5">
          <h1 className="text-2xl font-bold">Students</h1>
          <button className="primary-button" onClick={() => router.push('/owner/students/add')}>Add student</button>
        </div>
        {error && <p role="alert" className="text-red-300 mb-4">{error}</p>}
        {loading && <p role="status">Loading students…</p>}
        <div className="bg-tuition-card border border-border rounded-lg p-4 mb-6">
          <div className="flex items-center gap-3">
            <Search className="w-5 h-5 text-muted-400" />
            <input
              type="text"
              placeholder="Search students... by name or class"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg border border-border bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-tuition-primary"
            />
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-sm text-muted-500 mb-1">Filter by Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-tuition-primary"
            >
              <option value="all">All Students</option>
              <option value="active">Active</option>
              <option value="on_hold">On Hold</option>
              <option value="left">Left</option>
            </select>
          </div>
          <div>
            <label className="text-sm text-muted-500 mb-1">Filter by Batch</label>
            <select
              value={filterBatch || 'all'}
              onChange={(e) => setFilterBatch(e.target.value === 'all' ? null : e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-tuition-primary"
            >
              <option value="all">All Batches</option>
              {batches.map((batch: any) => (
                <option key={batch.id} value={batch.id}>{batch.name} (Class {batch.class})</option>
              ))}
            </select>
          </div>
        </div>

        {/* Students table */}
        <div className="bg-tuition-card border border-border rounded-lg overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="p-3 text-left text-muted-500">Name</th>
                <th className="p-3 text-left text-muted-500">Class</th>
                <th className="p-3 text-left text-muted-500">Batch</th>
                <th className="p-3 text-left text-muted-500">Status</th>
                <th className="p-3 text-left text-muted-500">School</th>
                <th className="p-3 text-left text-muted-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student: any) => (
                <tr key={student.id} className="border-b border-border/50 hover:bg-tuition-secondary/50">
                  <td className="p-3">
                    <span className="font-medium">{student.name}</span>
                    {student.grade && <span className="text-xs text-muted-400 ml-1">Grade {student.grade}</span>}
                  </td>
                  <td className="p-3">{student.class || 'N/A'}</td>
                  <td className="p-3">
                    {studentBatches(student)}
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${student.status === 'active' ? 'bg-tuition-primary/20 text-tuition-primary' : student.status === 'on_hold' ? 'bg-tuition-warning/20 text-tuition-warning' : 'bg-tuition-secondary/20 text-tuition-muted'}`}>
                      {student.status}
                    </span>
                  </td>
                  <td className="p-3">{student.school || '-'}</td>
                  <td className="p-3">
                    <div className="student-directory-actions">
                      <button
                        onClick={() => router.push(`/owner/students/${student.id}/profile`)}
                        className="secondary-button"
                        title="View Profile"
                      >
                        View profile
                      </button>
                      <button
                        onClick={() => handleDelete(student.id)}
                        className="secondary-button student-left-button"
                        title="Mark as left"
                        aria-label={`Mark ${student.name} as left`}
                      >
                        Mark as left
                      </button>
                      <button
                        onClick={() => router.push(`/owner/students/${student.id}/profile`)}
                        className="secondary-button"
                        title="Edit"
                      >
                        Edit student
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Empty state */}
        {students.length === 0 && !loading && (
          <div className="p-8 text-center">
            <svg className="w-12 h-12 mx-auto mb-4 text-muted-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zM9 9v6a2 2 0 002 2h2a2 2 0 002-2v-6a2 2 0 00-2-2H5a2 2 0 00-2 2z"/></svg>
            <h3 className="text-lg font-medium mb-2">No students found</h3>
            <p className="text-muted-500">Add students to get started</p>
            <button
              onClick={() => router.push('/owner/students/add')}
              className="mt-4 inline-block px-4 py-2 rounded-lg bg-tuition-primary text-white text-sm font-medium transition-colors"
            >
              Add First Student
            </button>
          </div>
        )}

        {/* Export button */}
        {students.length > 0 && (
          <div className="mt-6">
            <button
              onClick={exportToExcel}
              className="inline-block px-4 py-2 rounded-lg bg-tuition-primary text-white text-sm font-medium transition-colors hover:bg-tuition-primary/90"
            >
              Export to Excel
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
export default function OwnerStudents() {
  const { user, role, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-screen grid place-items-center">Loading...</div>;
  if (!user) return <div className="min-h-screen grid place-items-center"><a href="/auth/login">Sign in</a></div>;
  if (!role || !['owner', 'staff'].includes(role)) return <div className="min-h-screen grid place-items-center">Access denied</div>;
  return <OwnerStudentsContent />;
}
