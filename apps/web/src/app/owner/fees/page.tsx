"use client";

import { Edit, Search } from 'lucide-react';
import { useEffect, useState, useCallback } from 'react';
import { useAuth, useSupabase } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { hasPermission } from '@/lib/permissions';
import { supabase } from '@/lib/supabase/client';
import * as XLSX from 'xlsx';

interface FeeDueForm {
  studentId: string;
  month: string;
  amount: number;
  discount: number;
  dueDate: Date;
}

function OwnerFeesContent() {
  const { user, role, isLoading, signOut } = useAuth();
  const router = useRouter();
  const { supabase: sb } = useSupabase();

  useEffect(() => {
    if (!user && !isLoading) {
      router.replace('/auth/login');
    }
  }, [user, isLoading, router]);

  const [feeDues, setFeeDues] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModal, setCreateModal] = useState(false);
  const [error, setError] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'paid' | 'partly_paid' | 'due' | 'overdue'>('all');
  const [search, setSearch] = useState<string>('');
  const [currentMonth, setCurrentMonth] = useState<string>(new Date().toISOString().split('T')[0].split('-').slice(0, 2).join('-') + '-01');
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);

  // Load fee dues
  const loadFeeDues = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      let query = sb.from('fee_dues')
        .select(`
          *,
          students (name, class),
          payments (
            amount,
            mode,
            paid_at
          )
        `);

      // Filter by status
      if (filterStatus !== 'all') {
        query = query.eq('status', filterStatus);
      }

      // Filter by current month
      if (currentMonth) {
        query = query.in('month', [currentMonth, currentMonth.slice(0, 7)]);
      }

      // Search
      // Text search across joined students is applied client-side after fetch.

      const { data, error } = await query.order('month', { ascending: false });

      if (error) throw error;
      setFeeDues(data || []);
    } catch (err: any) {
      console.error('Error loading fee dues:', err);
      setError(err?.message || 'Unable to load fee dues');
    } finally {
      setLoading(false);
    }
  }, [sb, filterStatus, currentMonth]);

  // Load students
  const [students, setStudents] = useState<any[]>([]);
  useEffect(() => {
    Promise.resolve(sb.from('students').select('id, name, class').eq('status', 'active').order('name', { ascending: true })).then(r => setStudents(r.data || [])).catch(() => setStudents([]));
  }, []);

  useEffect(() => {
    loadFeeDues();
  }, [loadFeeDues]);

  // Create/Update fee due
  const handleSave = useCallback(async () => {
    setLoading(true);
    try {
      if (!selectedStudent) throw new Error('Select a student');
      const { error } = await sb.rpc('generate_student_due', {
        p_student_id: selectedStudent,
        p_month: currentMonth,
      });

      if (error) throw error;
      setCreateModal(false);
      setSelectedStudent(null);
      setCurrentMonth(new Date().toISOString().split('T')[0].split('-').slice(0, 2).join('-') + '-01');
      loadFeeDues();
    } catch (err: any) {
      console.error('Error creating fee due:', err);
      alert(err?.message || 'Unable to save fee due');
    } finally {
      setLoading(false);
    }
  }, [selectedStudent, currentMonth, loadFeeDues]);

  // Export to Excel
  const exportToExcel = useCallback(async () => {
    const duesData = feeDues.map(f => ({
      'Student Name': f.students?.name || 'Unknown',
      'Class': f.students?.class || 'N/A',
      'Month': f.month,
      'Amount': f.amount,
      'Discount': f.discount,
      'Due Date': f.due_date,
      'Status': f.status,
      'Paid Amount': f.paid_amount,
      'Pending': f.generated_amount - f.paid_amount,
    }));

    const ws = XLSX.utils.json_to_sheet(duesData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Fee Dues');
    XLSX.writeFile(wb, 'fee_dues_export.xlsx');
  }, [feeDues]);

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
          <span className="text-sm text-muted-400">{user?.user_metadata?.name || 'User'}</span>
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
        <div className="flex items-center justify-between py-5"><h1 className="text-2xl font-bold">Fee dues</h1><button className="px-4 py-2 rounded-lg bg-tuition-primary text-white" onClick={() => setCreateModal(true)}>Generate due</button></div>
        {error && <p role="alert" className="text-red-300 mb-4">{error}</p>}
        {loading && <p role="status">Loading dues…</p>}
        {/* Filters */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-sm text-muted-500 mb-1">Filter by Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-tuition-primary"
            >
              <option value="all">All Dues</option>
              <option value="paid">Paid</option>
              <option value="partly_paid">Partly Paid</option>
              <option value="due">Due</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>
          <div>
            <label className="text-sm text-muted-500 mb-1">Month</label>
            <input type="month" value={currentMonth.slice(0,7)} onChange={e => setCurrentMonth(`${e.target.value}-01`)} className="w-full px-3 py-2 rounded-lg border border-border bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-tuition-primary" />
          </div>
          <div>
            <label className="text-sm text-muted-500 mb-1">Search</label>
            <input
              type="text"
              placeholder="Search students..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-tuition-primary"
            />
          </div>
        </div>

        {/* Fee dues table */}
        <div className="bg-tuition-card border border-border rounded-lg overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="p-3 text-left text-muted-500">Student</th>
                <th className="p-3 text-left text-muted-500">Class</th>
                <th className="p-3 text-left text-muted-500">Month</th>
                <th className="p-3 text-left text-muted-500">Amount</th>
                <th className="p-3 text-left text-muted-500">Discount</th>
                <th className="p-3 text-left text-muted-500">Due Date</th>
                <th className="p-3 text-left text-muted-500">Status</th>
                <th className="p-3 text-left text-muted-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {feeDues.filter(due => `${due.students?.name ?? ''} ${due.students?.class ?? ''}`.toLowerCase().includes(search.toLowerCase())).map((due: any) => {
                const isOverdue =
                  due.status === 'overdue' ||
                  (due.status === 'due' && new Date() > new Date(due.due_date));

                return (
                  <tr key={due.id} className="border-b border-border/50 hover:bg-tuition-secondary/50">
                    <td className="p-3 font-medium">{due.students?.name || 'Unknown'}</td>
                    <td className="p-3">{due.students?.class || 'N/A'}</td>
                    <td className="p-3">{due.month}</td>
                    <td className="p-3">{due.amount}</td>
                    <td className="p-3">{due.discount}</td>
                    <td className="p-3">{due.due_date}</td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${isOverdue ? 'bg-tuition-error/20 text-tuition-error' : 'bg-tuition-warning/20 text-tuition-warning'}`}>
                        {due.status}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => router.push(`/owner/fees/${due.id}/details`)}
                          className="secondary-button"
                          title="View Details"
                        >
                          View due & payments
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Empty state */}
        {feeDues.length === 0 && !loading && (
          <div className="p-8 text-center">
            <svg className="w-12 h-12 mx-auto mb-4 text-muted-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zM9 9v6a2 2 0 002 2h2a2 2 0 002-2v-6a2 2 0 00-2-2H5a2 2 0 00-2 2z"/></svg>
            <h3 className="text-lg font-medium mb-2">No fee dues found</h3>
            <p className="text-muted-500">Generate fee dues for the current month</p>
            <button
              onClick={() => setCreateModal(true)}
              className="mt-4 inline-block px-4 py-2 rounded-lg bg-tuition-primary text-white text-sm font-medium transition-colors"
            >
              Generate Dues
            </button>
          </div>
        )}

        {/* Export button */}
        {feeDues.length > 0 && (
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

      {/* Create/Edit Modal */}
      {createModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-tuition-card border border-border rounded-xl p-6 max-w-md w-full animate-scale">
            <h2 className="text-2xl font-bold mb-6">Generate Fee Due</h2>

            <form className="space-y-4" onSubmit={event => { event.preventDefault(); void handleSave(); }}>
              <div>
                <label className="text-sm text-muted-500 mb-1">Student</label>
                <select
                  value={selectedStudent || ''}
                  onChange={(e) => setSelectedStudent(e.target.value || null)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-tuition-primary"
                  disabled={loading}
                >
                  <option value="">Select Student</option>
                  {students.map((student: any) => (
                    <option key={student.id} value={student.id}>
                      {student.name} (Class {student.class})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm text-muted-500 mb-1">Month</label>
                <input type="month" value={currentMonth.slice(0,7)} onChange={e => setCurrentMonth(`${e.target.value}-01`)} className="w-full px-3 py-2 rounded-lg border border-border bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-tuition-primary" />
              </div>

              <p className="text-sm text-muted-400">Monthly billing uses enrolled batch fees and custom enrollment fees. Payment is due on the 10th with five grace days. Existing dues retain their amounts and payments.</p>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setCreateModal(false)}
                  className="flex-1 px-4 py-2 rounded-lg bg-tuition-secondary text-sm text-muted-600 transition-colors hover:bg-tuition-tertiary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !selectedStudent || currentMonth.length !== 10}
                  className="flex-1 px-4 py-2 rounded-lg bg-tuition-primary text-white text-sm font-medium transition-colors hover:bg-tuition-primary/90"
                >
                  Generate Due
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
export default function OwnerFees() {
  const { user, role, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-screen grid place-items-center">Loading...</div>;
  if (!user) return <div className="min-h-screen grid place-items-center"><a href="/auth/login">Sign in</a></div>;
  if (!role || !['owner', 'staff'].includes(role)) return <div className="min-h-screen grid place-items-center">Access denied</div>;
  return <OwnerFeesContent />;
}
