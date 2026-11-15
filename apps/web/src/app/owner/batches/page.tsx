"use client";

import { Plus, Edit, Search, Eye,PauseCircle,PlayCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useEffect, useState, useCallback } from 'react';
import { useAuth, useSupabase } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { hasPermission } from '@/lib/permissions';
import { supabase } from '@/lib/supabase/client';

interface BatchFormValues {
  name: string;
  class: string;
  subjects: string[];
  teacherId: string | null;
  schedule: {
    days: string[];
    startTime: string;
    endTime: string;
    timezone: string;
  };
  baseFee: number;
}

const emptyBatchForm: BatchFormValues = {
  name: '', class: '', subjects: [], teacherId: null,
  schedule: { days: [], startTime: '08:00', endTime: '14:00', timezone: 'IST' }, baseFee: 0,
};

function OwnerBatchesContent() {
  const { user, role, isLoading, signOut } = useAuth();
  const router = useRouter();
  const { supabase: sb } = useSupabase();

  useEffect(() => {
    if (!user && !isLoading) {
      router.replace('/auth/login');
    }
  }, [user, isLoading, router]);

  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModal, setCreateModal] = useState(false);
  const [editModal, setEditModal] = useState<{ id: string | null; show: boolean } | null>(null);
  const [error, setError] = useState('');
  const [formValues, setFormValues] = useState<BatchFormValues>(emptyBatchForm);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active'>('all');

  // Load batches
  const loadBatches = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      let query = sb.from('batches').select(`
        *,
        users!batches_teacher_id_fkey (name),
        student_batch(student_id,start_date,end_date)
      `);

      if (filterStatus === 'active') {
        query = query.eq('is_active', true);
      }

      if (search) {
        query = query.or(`name.ilike.%${search}%,class.ilike.%${search}%`);
      }

      const { data, error } = await query.order('name', { ascending: true });
      if (error) throw error;
      setBatches(data || []);
    } catch (err: any) {
      console.error('Error loading batches:', err);
      setError(err?.message || 'Unable to load batches');
    } finally {
      setLoading(false);
    }
  }, [sb, search, filterStatus]);

  // Load teachers for selector
  const [teachers, setTeachers] = useState<any[]>([]);
  useEffect(() => {
    Promise.resolve(sb.from('users').select('id, name, role').eq('role', 'teacher').order('name', { ascending: true })).then(r => setTeachers(r.data || [])).catch(() => setTeachers([]));
  }, []);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  // Create/Update batch
  const handleSave = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (!formValues.name.trim() || !formValues.class.trim()) throw new Error('Batch name and class are required');
      if (!formValues.schedule.days.length) throw new Error('Choose at least one scheduled day');
      if (formValues.schedule.startTime >= formValues.schedule.endTime) throw new Error('End time must be after start time');
      const { error } = editModal?.id
        ? await sb.from('batches').update({
        name: formValues.name,
        class: formValues.class,
        subjects: formValues.subjects,
        teacher_id: formValues.teacherId,
        schedule: formValues.schedule,
        base_fee: formValues.baseFee,
        is_active: batches.find(batch => batch.id === editModal.id)?.is_active ?? true
      }).eq('id',editModal.id)
        : await sb.from('batches').insert({
          name: formValues.name, class: formValues.class, subjects: formValues.subjects,
          teacher_id: formValues.teacherId, schedule: formValues.schedule, base_fee: formValues.baseFee, is_active: true
        });

      if (error) throw error;
      setCreateModal(false);
      setEditModal(null);
      setFormValues(emptyBatchForm);
      loadBatches();
    } catch (err: any) {
      console.error('Error saving batch:', err);
      setError(err?.message || 'Unable to save batch');
    } finally {
      setLoading(false);
    }
  }, [sb, batches, formValues, editModal, loadBatches]);

  const openCreate = () => {
    setEditModal(null);
    setFormValues(emptyBatchForm);
    setCreateModal(true);
  };

  const changeBatchStatus = useCallback(async (id: string, isActive: boolean) => {
    setError('');
    try {
      const { error } = await sb.from('batches').update({ is_active: isActive }).eq('id', id);
      if (error) throw error;
      await loadBatches();
    } catch (err: any) {
      setError(err?.message || 'Unable to deactivate batch');
    }
  }, [sb, loadBatches]);

  const exportToExcel = useCallback(async () => {
    const batchesData = batches.map(b => ({
      'Batch Name': b.name,
      'Class': b.class,
      'Subjects': b.subjects.join(', '),
      'Teacher': b.users?.name || 'Unassigned',
      'Base Fee': b.base_fee,
      'Is Active': b.is_active ? 'Yes' : 'No',
      'Schedule': JSON.stringify(b.schedule)
    }));

    const ws = XLSX.utils.json_to_sheet(batchesData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Batches');
    XLSX.writeFile(wb, 'batches_export.xlsx');
  }, [batches]);

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
            className="p-2 rounded-lg hover:bg-tuition-secondary transition-colors"
            aria-label="Sign out"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m-7-10v6m7 4v-6m-7-4v-6m7 10h-5.293A2 2 0 0112 16v-1m0-4v-1a2 2 0 012-2h1m2.707 5.293A2 2 0 0115.707 6l-2.707 2.707z"/></svg>
          </button>
        </div>
      </nav>

      <main className="p-6 pt-0">
        <div className="flex items-center justify-between py-5"><h1 className="text-2xl font-bold">Batches</h1><button className="px-4 py-2 rounded-lg bg-tuition-primary text-white" onClick={openCreate}>Create batch</button></div>
        {error && <p role="alert" className="text-red-300 mb-4">{error}</p>}
        <div className="bg-tuition-card border border-border rounded-lg p-4 mb-6">
          <div className="flex items-center gap-3">
            <Plus className="w-5 h-5 text-tuition-accent" />
            <div>
              <h3 className="font-medium text-lg">Create New Batch</h3>
              <p className="text-muted-500 text-sm">Add a new batch/timetable</p>
            </div>
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
              <option value="all">All Batches</option>
              <option value="active">Active</option>
            </select>
          </div>
          <div>
            <label className="text-sm text-muted-500 mb-1">Search</label>
            <input
              type="text"
              placeholder="Search batches..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-tuition-primary"
            />
          </div>
        </div>

        {/* Batches table */}
        <div className="bg-tuition-card border border-border rounded-lg overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="p-3 text-left text-muted-500">Batch Name</th>
                <th className="p-3 text-left text-muted-500">Class</th>
                <th className="p-3 text-left text-muted-500">Subjects</th>
                <th className="p-3 text-left text-muted-500">Teacher</th>
                <th className="p-3 text-left text-muted-500">Base Fee</th>
                <th className="p-3 text-left text-muted-500">Students</th>
                <th className="p-3 text-left text-muted-500 batch-actions-column">Actions</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch: any) => (
                <tr key={batch.id} className="border-b border-border/50 hover:bg-tuition-secondary/50">
                  <td className="p-3 font-medium">{batch.name}</td>
                  <td className="p-3">{batch.class || 'N/A'}</td>
                  <td className="p-3">{batch.subjects?.length ? batch.subjects.join(', ') : 'None'}</td>
                  <td className="p-3">{batch.users?.name || 'Unassigned'}</td>
                  <td className="p-3">{batch.base_fee}</td>
                  <td className="p-3">
                    {(batch.student_batch || []).filter((row: any) => row.start_date <= new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) && (!row.end_date || row.end_date >= new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }))).length} students
                  </td>
                  <td className="p-3">
                    <div className="batch-row-actions">
                      <button
                        onClick={() => router.push(`/owner/batches/${batch.id}/profile`)}
                        className="batch-action-button view"
                        title="View Details"
                      >
                        <Eye size={16}/><span>View details</span>
                      </button>
                      <button
                        onClick={() => {setFormValues({ name:batch.name, class:batch.class, subjects:batch.subjects || [], teacherId:batch.teacher_id, schedule:batch.schedule, baseFee:batch.base_fee });setEditModal({id:batch.id,show:true});setCreateModal(true);}}
                        className="batch-action-button edit"
                        title="Edit"
                      >
                        <Edit size={16}/><span>Edit batch</span>
                      </button>
                      <button
                        onClick={() => void changeBatchStatus(batch.id, !batch.is_active)}
                        className={`batch-action-button ${batch.is_active?'deactivate':'activate'}`}
                        title={batch.is_active ? 'Deactivate batch' : 'Activate batch'}
                        aria-label={`${batch.is_active ? 'Deactivate' : 'Activate'} ${batch.name}`}
                      >
                        {batch.is_active?<PauseCircle size={16}/>:<PlayCircle size={16}/>}<span>{batch.is_active?'Deactivate':'Activate'}</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Empty state */}
        {batches.length === 0 && !loading && (
          <div className="p-8 text-center">
            <svg className="w-12 h-12 mx-auto mb-4 text-muted-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zM9 9v6a2 2 0 002 2h2a2 2 0 002-2v-6a2 2 0 00-2-2H5a2 2 0 00-2 2z"/></svg>
            <h3 className="text-lg font-medium mb-2">No batches found</h3>
            <p className="text-muted-500">Create your first batch to get started</p>
            <button
              onClick={openCreate}
              className="mt-4 inline-block px-4 py-2 rounded-lg bg-tuition-primary text-white text-sm font-medium transition-colors"
            >
              Create First Batch
            </button>
          </div>
        )}

        {/* Export button */}
        {batches.length > 0 && (
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
            <h2 className="text-2xl font-bold mb-6">{editModal?.id ? 'Edit Batch' : 'Create New Batch'}</h2>

            <form className="space-y-4" onSubmit={e=>{e.preventDefault();void handleSave();}}>
              {error && <p role="alert" className="text-red-300">{error}</p>}
              <div>
                <label className="text-sm text-muted-500 mb-1">Batch Name</label>
                <input
                  type="text"
                  value={formValues.name}
                  onChange={(e) => setFormValues({ ...formValues, name: e.target.value })}
                  placeholder="e.g., Class 9 Science"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-tuition-primary"
                  required
                />
              </div>

              <div>
                <label className="text-sm text-muted-500 mb-1">Class/Standard</label>
                <input
                  type="text"
                  value={formValues.class}
                  onChange={(e) => setFormValues({ ...formValues, class: e.target.value })}
                  placeholder="e.g., 9"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-tuition-primary"
                  required
                />
              </div>

              <div>
                <label className="text-sm text-muted-500 mb-1">Subjects</label>
                <input
                  type="text"
                  value={formValues.subjects.join(', ')}
                  onChange={(e) => setFormValues({ ...formValues, subjects: e.target.value.split(',').map(s => s.trim()).filter(s => s.length > 0) })}
                  placeholder="e.g., Math, Science, English"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-tuition-primary"
                  required
                />
                <p className="text-xs text-muted-400 mt-1">Comma-separated list</p>
              </div>

              <div>
                <label className="text-sm text-muted-500 mb-1">Teacher</label>
                <select
                  value={formValues.teacherId || ''}
                  onChange={(e) => setFormValues({ ...formValues, teacherId: e.target.value || null })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-tuition-primary"
                >
                  <option value="">Unassigned</option>
                  {teachers.map((teacher: any) => (
                    <option key={teacher.id} value={teacher.id}>{teacher.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm text-muted-500 mb-1">Schedule</label>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-muted-500">Days</label>
                    <select
                      multiple
                      value={formValues.schedule.days}
                      onChange={(e) => {
                          const days = Array.from(e.target.selectedOptions, option => option.value);
                          setFormValues({ ...formValues, schedule: { ...formValues.schedule, days } });
                        }}
                      className="w-full px-2 py-1 rounded-lg border border-border bg-transparent text-xs focus:outline-none focus:ring-2 focus:ring-tuition-primary"
                    >
                      <option value="Monday">Monday</option>
                      <option value="Tuesday">Tuesday</option>
                      <option value="Wednesday">Wednesday</option>
                      <option value="Thursday">Thursday</option>
                      <option value="Friday">Friday</option>
                      <option value="Saturday">Saturday</option>
                      <option value="Sunday">Sunday</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-500">Start</label>
                    <input
                      type="time"
                      value={formValues.schedule.startTime}
                      onChange={(e) => setFormValues({ ...formValues, schedule: { ...formValues.schedule, startTime: e.target.value } })}
                      className="w-full px-2 py-1 rounded-lg border border-border bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-tuition-primary"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-500">End</label>
                    <input
                      type="time"
                      value={formValues.schedule.endTime}
                      onChange={(e) => setFormValues({ ...formValues, schedule: { ...formValues.schedule, endTime: e.target.value } })}
                      className="w-full px-2 py-1 rounded-lg border border-border bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-tuition-primary"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-500 mt-2">Timezone: IST (India Standard Time)</p>
              </div>

              <div>
                <label className="text-sm text-muted-500 mb-1">Base Monthly Fee</label>
                <input
                  type="number"
                  value={formValues.baseFee}
                  onChange={(e) => setFormValues({ ...formValues, baseFee: parseInt(e.target.value) || 0 })}
                  placeholder="0"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-tuition-primary"
                  min="0"
                />
                <p className="text-xs text-muted-400">Monthly fee in currency units</p>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {setCreateModal(false);setEditModal(null);}}
                  className="flex-1 px-4 py-2 rounded-lg bg-tuition-secondary text-sm text-muted-600 transition-colors hover:bg-tuition-tertiary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 rounded-lg bg-tuition-primary text-white text-sm font-medium transition-colors hover:bg-tuition-primary/90"
                >
                  {editModal?.id ? 'Update Batch' : 'Create Batch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
export default function OwnerBatches() {
  const { user, role, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-screen grid place-items-center">Loading...</div>;
  if (!user) return <div className="min-h-screen grid place-items-center"><a href="/auth/login">Sign in</a></div>;
  if (!role || !['owner', 'staff'].includes(role)) return <div className="min-h-screen grid place-items-center">Access denied</div>;
  return <OwnerBatchesContent />;
}
