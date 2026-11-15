import { hasPermission as sharedHasPermission, canEditPastAttendance as sharedEdit, PERMISSION_MATRIX } from '@tuition/shared/constants';
export type Action = keyof typeof PERMISSION_MATRIX;
export function hasPermission(role: string | null, action: Action): boolean {
  return !!role && sharedHasPermission(role, action);
}
export function canEditPastAttendance(role: string | null): 'yes' | 'no' | 'within_24_hours' {
  if (!role) return 'no';
  const result = sharedEdit(role);
  return result === 'within_24_hours' ? result : result === 'yes' ? 'yes' : 'no';
}
export function getAvailableActions(role: string | null): Action[] {
  return (Object.keys(PERMISSION_MATRIX) as Action[]).filter(action => hasPermission(role, action));
}
export function canAccessArea(role: string | null, area: 'students'|'batches'|'attendance'|'fees'|'materials'|'notices'|'reports'|'users'): boolean {
  if (!role) return false;
  const areas: Record<typeof area, Action[]> = {
    students: ['ADD_EDIT_STUDENTS_BATCHES'], batches: ['ADD_EDIT_STUDENTS_BATCHES'],
    attendance: ['MARK_ATTENDANCE','VIEW_ATTENDANCE'],
    fees: ['SET_FEE_PLANS','RECORD_PAYMENTS','VIEW_FEES'],
    materials: ['UPLOAD_STUDY_MATERIAL','VIEW_STUDY_MATERIAL'],
    notices: ['VIEW_STUDY_MATERIAL'], reports: ['VIEW_REPORTS_EXPORT'],
    users: ['MANAGE_USERS_ROLES']
  };
  return areas[area].some(a => hasPermission(role, a));
}
