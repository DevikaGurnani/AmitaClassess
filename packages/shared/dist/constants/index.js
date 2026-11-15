export const ROLES = {
    OWNER: 'owner',
    STAFF: 'staff',
    TEACHER: 'teacher',
    PARENT: 'parent',
    STUDENT: 'student',
};
export const USER_STATUS = {
    ACTIVE: 'active',
    INACTIVE: 'inactive',
    PENDING: 'pending',
};
export const STUDENT_STATUS = {
    ACTIVE: 'active',
    ON_HOLD: 'on_hold',
    LEFT: 'left',
};
export const ATTENDANCE_STATUS = {
    PRESENT: 'present',
    ABSENT: 'absent',
    LATE: 'late',
    LEAVE: 'leave',
};
export const FEE_STATUS = {
    PAID: 'paid',
    PARTLY_PAID: 'partly_paid',
    DUE: 'due',
    OVERDUE: 'overdue',
};
export const PAYMENT_MODE = {
    CASH: 'cash',
    UPI: 'upi',
    BANK_TRANSFER: 'bank_transfer',
    CHEQUE: 'cheque',
    ONLINE: 'online',
};
export const CONTACT_CHANGE_STATUS = {
    PENDING: 'pending',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    AUTO_APPROVED: 'auto_approved',
};
export const MATERIAL_TYPE = {
    PDF: 'pdf',
    IMAGE: 'image',
    DOCUMENT: 'document',
    PRESENTATION: 'presentation',
    LINK: 'link',
};
export const NOTIFICATION_CHANNEL = {
    PUSH: 'push',
    WHATSAPP: 'whatsapp',
    SMS: 'sms',
    IN_APP: 'in_app',
};
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
];
export const RELATION_OPTIONS = [
    'father',
    'mother',
    'guardian',
    'other',
];
export const FEE_PLAN_TYPES = [
    'monthly',
    'quarterly',
    'one_time',
];
export const DAYS_OF_WEEK = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
];
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
};
export function hasPermission(role, action) {
    const permissions = PERMISSION_MATRIX[action];
    if (Array.isArray(permissions)) {
        return permissions.includes(role);
    }
    if (typeof permissions === 'object') {
        const rolePerm = permissions[role];
        return rolePerm === true || rolePerm === 'within_24_hours';
    }
    return false;
}
export function canEditPastAttendance(role) {
    const perm = PERMISSION_MATRIX.EDIT_PAST_ATTENDANCE;
    if (typeof perm === 'object') {
        return perm[role] || 'no';
    }
    return 'no';
}
