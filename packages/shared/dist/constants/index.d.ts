export declare const ROLES: {
    readonly OWNER: "owner";
    readonly STAFF: "staff";
    readonly TEACHER: "teacher";
    readonly PARENT: "parent";
    readonly STUDENT: "student";
};
export declare const USER_STATUS: {
    readonly ACTIVE: "active";
    readonly INACTIVE: "inactive";
    readonly PENDING: "pending";
};
export declare const STUDENT_STATUS: {
    readonly ACTIVE: "active";
    readonly ON_HOLD: "on_hold";
    readonly LEFT: "left";
};
export declare const ATTENDANCE_STATUS: {
    readonly PRESENT: "present";
    readonly ABSENT: "absent";
    readonly LATE: "late";
    readonly LEAVE: "leave";
};
export declare const FEE_STATUS: {
    readonly PAID: "paid";
    readonly PARTLY_PAID: "partly_paid";
    readonly DUE: "due";
    readonly OVERDUE: "overdue";
};
export declare const PAYMENT_MODE: {
    readonly CASH: "cash";
    readonly UPI: "upi";
    readonly BANK_TRANSFER: "bank_transfer";
    readonly CHEQUE: "cheque";
    readonly ONLINE: "online";
};
export declare const CONTACT_CHANGE_STATUS: {
    readonly PENDING: "pending";
    readonly APPROVED: "approved";
    readonly REJECTED: "rejected";
    readonly AUTO_APPROVED: "auto_approved";
};
export declare const MATERIAL_TYPE: {
    readonly PDF: "pdf";
    readonly IMAGE: "image";
    readonly DOCUMENT: "document";
    readonly PRESENTATION: "presentation";
    readonly LINK: "link";
};
export declare const NOTIFICATION_CHANNEL: {
    readonly PUSH: "push";
    readonly WHATSAPP: "whatsapp";
    readonly SMS: "sms";
    readonly IN_APP: "in_app";
};
export declare const DEFAULT_GRACE_PERIOD_DAYS = 5;
export declare const DEFAULT_LOW_ATTENDANCE_THRESHOLD = 75;
export declare const DEFAULT_SESSION_DAYS_WEB: number;
export declare const DEFAULT_SESSION_DAYS_MOBILE = 30;
export declare const MAX_FILE_SIZE_MB = 25;
export declare const MAX_FILE_SIZE_BYTES: number;
export declare const BOARD_OPTIONS: readonly ["CBSE", "State Board", "ICSE", "Other"];
export declare const RELATION_OPTIONS: readonly ["father", "mother", "guardian", "other"];
export declare const FEE_PLAN_TYPES: readonly ["monthly", "quarterly", "one_time"];
export declare const DAYS_OF_WEEK: readonly ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export declare const PERMISSION_MATRIX: {
    readonly ADD_EDIT_STUDENTS_BATCHES: readonly ["owner", "staff"];
    readonly MARK_ATTENDANCE: readonly ["owner", "staff", "teacher"];
    readonly EDIT_PAST_ATTENDANCE: {
        readonly owner: true;
        readonly staff: false;
        readonly teacher: "within_24_hours";
    };
    readonly VIEW_ATTENDANCE: readonly ["owner", "staff", "teacher", "parent", "student"];
    readonly SET_FEE_PLANS: readonly ["owner"];
    readonly RECORD_PAYMENTS: readonly ["owner", "staff"];
    readonly VIEW_FEES: readonly ["owner", "staff", "parent"];
    readonly UPLOAD_STUDY_MATERIAL: readonly ["owner", "teacher"];
    readonly VIEW_STUDY_MATERIAL: readonly ["owner", "staff", "teacher", "parent", "student"];
    readonly UPDATE_PARENT_CONTACT: readonly ["owner", "staff"];
    readonly REQUEST_CONTACT_CHANGE: readonly ["parent"];
    readonly APPROVE_CONTACT_CHANGE: readonly ["owner", "staff"];
    readonly MANAGE_USERS_ROLES: readonly ["owner"];
    readonly VIEW_REPORTS_EXPORT: readonly ["owner", "staff", "teacher"];
};
export declare function hasPermission(role: string, action: keyof typeof PERMISSION_MATRIX): boolean;
export declare function canEditPastAttendance(role: string): 'yes' | 'no' | 'within_24_hours';
//# sourceMappingURL=index.d.ts.map