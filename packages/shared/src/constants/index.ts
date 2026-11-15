export const ROLES = {
  OWNER: 'owner' as const,
  STAFF: 'staff' as const,
  TEACHER: 'teacher' as const,
  PARENT: 'parent' as const,
  STUDENT: 'student' as const,
} as const;

export const USER_STATUS = {
  ACTIVE: 'active' as const,
  INACTIVE: 'inactive' as const,
  PENDING: 'pending' as const,
} as const;

export const STUDENT_STATUS = {
  ACTIVE: 'active' as const,
  ON_HOLD: 'on_hold' as const,
  LEFT: 'left' as const,
} as const;

export const ATTENDANCE_STATUS = {
  PRESENT: 'present' as const,
  ABSENT: 'absent' as const,
  LATE: 'late' as const,
  LEAVE: 'leave' as const,
} as const;

export const FEE_STATUS = {
  PAID: 'paid' as const,
  PARTLY_PAID: 'partly_paid' as const,
  DUE: 'due' as const,
  OVERDUE: 'overdue' as const,
} as const;

export const PAYMENT_MODE = {
  CASH: 'cash' as const,
  UPI: 'upi' as const,
  BANK_TRANSFER: 'bank_transfer' as const,
  CHEQUE: 'cheque' as const,
  ONLINE: 'online' as const,
} as const;

export const CONTACT_CHANGE_STATUS = {
  PENDING: 'pending' as const,
  APPROVED: 'approved' as const,
  REJECTED: 'rejected' as const,
  AUTO_APPROVED: 'auto_approved' as const,
} as const;

export const MATERIAL_TYPE = {
  PDF: 'pdf' as const,
  IMAGE: 'image' as const,
  DOCUMENT: 'document' as const,
  PRESENTATION: 'presentation' as const,
  LINK: 'link' as const,
} as const;

export const NOTIFICATION_CHANNEL = {
  PUSH: 'push' as const,
  WHATSAPP: 'whatsapp' as const,
  SMS: 'sms' as const,
  IN_APP: 'in_app' as const,
} as const;

export const DEFAULT_GRACE_PERIOD_DAYS = 5;
export const DEFAULT_LOW_ATTENDANCE_THRESHOLD = 75;
export const DEFAULT_SESSION_DAYS_WEB = 8 / 24;
export const DEFAULT_SESSION_DAYS_MOBILE = 30;
export const MAX_FILE_SIZE_MB = 25;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export const BOARD_OPTIONS = [
  'CBSE',
  'State Board',
  'ICSE',
  'Other',
] as const;

export const RELATION_OPTIONS = [
  'father',
  'mother',
  'guardian',
  'other',
] as const;

export const FEE_PLAN_TYPES = [
  'monthly',
  'quarterly',
  'one_time',
] as const;

export const DAYS_OF_WEEK = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export const PERMISSION_MATRIX = {
  ADD_EDIT_STUDENTS_BATCHES: ['owner', 'staff'],
  MARK_ATTENDANCE: ['owner', 'staff', 'teacher'],
  EDIT_PAST_ATTENDANCE: { owner: true, staff: false, teacher: 'within_24_hours' },
  VIEW_ATTENDANCE: ['owner', 'staff', 'teacher', 'parent', 'student'],
  SET_FEE_PLANS: ['owner'],
  RECORD_PAYMENTS: ['owner', 'staff'],
  VIEW_FEES: ['owner', 'staff', 'parent'],
  UPLOAD_STUDY_MATERIAL: ['owner'],
  VIEW_STUDY_MATERIAL: ['owner', 'staff', 'teacher', 'parent', 'student'],
  UPDATE_PARENT_CONTACT: ['owner', 'staff'],
  REQUEST_CONTACT_CHANGE: ['parent'],
  APPROVE_CONTACT_CHANGE: ['owner', 'staff'],
  MANAGE_USERS_ROLES: ['owner'],
  MANAGE_TEACHING_ACCESS: ['owner'],
  MANAGE_QUESTION_BANK: ['owner', 'teacher'],
  GENERATE_QUESTION_PAPERS: ['owner', 'teacher'],
  PUBLISH_ASSIGNMENTS: ['owner', 'teacher'],
  GRADE_ASSIGNMENTS: ['owner', 'teacher'],
  VIEW_CHILD_PROGRESS: ['parent'],
  VIEW_REPORTS_EXPORT: ['owner', 'staff', 'teacher'],
} as const;

export function hasPermission(role: string, action: keyof typeof PERMISSION_MATRIX): boolean {
  const permissions = PERMISSION_MATRIX[action];
  if (Array.isArray(permissions)) {
    return (permissions as readonly string[]).includes(role);
  }
  if (typeof permissions === 'object') {
    const rolePerm = permissions[role as keyof typeof permissions];
    return rolePerm === true || rolePerm === 'within_24_hours';
  }
  return false;
}

export function canEditPastAttendance(role: string): 'yes' | 'no' | 'within_24_hours' {
  const perm = PERMISSION_MATRIX.EDIT_PAST_ATTENDANCE;
  if (typeof perm === 'object') {
    return (perm[role as keyof typeof perm] as 'yes' | 'no' | 'within_24_hours') || 'no';
  }
  return 'no';
}
