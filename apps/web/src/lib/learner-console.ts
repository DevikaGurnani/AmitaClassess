export type LearnerRole = 'parent' | 'student';
export type LearnerStudent = { id: string; name: string; class: string; school: string };
export type LearnerBatch = { id: string; name: string; subjects: string[]; schedule: { days?: string[]; startTime?: string; endTime?: string } | null };
export type LearnerAttendance = { date: string; status: string; batch_id: string };
export type LearnerMark = { id: string; marks: number; remarks: string; tests: { id?:string; title: string; subject: string; max_marks: number; test_date: string } | null };
export type LearnerMaterial = { id: string; title: string; subject: string; file_url: string; file_type: string; allow_download: boolean };
export type LearnerNotice = { id: string; title: string; body: string; created_at: string; audience?: string; class_id?: string | null; batch_id?: string | null; expires_at?: string | null };
export type LearnerPayment = { id: string; amount: number; mode: string; receipt_no: string; paid_at: string; is_reversal: boolean };
export type LearnerDue = { id: string; month: string; generated_amount: number; paid_amount: number; due_date: string; payments: LearnerPayment[] };

export const weekDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const learnerViews = ['overview', 'schedule', 'attendance', 'results', 'materials', 'notices', 'fees', 'assignments', 'answer-sheets'] as const;
export function learnerView(value: string | null, role: LearnerRole) {
  return learnerViews.find(view => view === value && (view !== 'fees' || role === 'parent') && (view !== 'assignments' || ['student','parent'].includes(role))) ?? 'overview';
}
export function indiaDate(now = new Date()) {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}
export function displayDate(date: string) {
  const parsed = new Date(date.length === 10 ? `${date}T12:00:00+05:30` : date);
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}
export function amountRemaining(due: Pick<LearnerDue, 'generated_amount' | 'paid_amount'>) {
  return Math.max(0, Number(due.generated_amount) - Number(due.paid_amount));
}
export function attendanceSummary(records: LearnerAttendance[]) {
  const present = records.filter(row => row.status === 'present').length;
  const late = records.filter(row => row.status === 'late').length;
  const absent = records.filter(row => row.status === 'absent').length;
  // Excused classes are not counted as absences.
  const counted = present + late + absent;
  return { present, late, absent, counted, rate: counted ? Math.round((present + late) / counted * 100) : 0 };
}
export function noticeForStudent(notice: LearnerNotice, student: LearnerStudent, batchIds: string[], now = new Date()) {
  if (notice.expires_at && new Date(notice.expires_at).getTime() <= now.getTime()) return false;
  if (notice.audience === 'class') return notice.class_id === student.class;
  if (notice.audience === 'batch') return !!notice.batch_id && batchIds.includes(notice.batch_id);
  return !notice.audience || notice.audience === 'all';
}
export function safeResourceUrl(value: string) {
  if (value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')) return value;
  try { const url = new URL(value); return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null; }
  catch { return null; }
}
