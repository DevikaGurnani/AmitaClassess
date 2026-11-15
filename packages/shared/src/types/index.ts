export type UserRole = 'owner' | 'staff' | 'teacher' | 'parent' | 'student';
export type UserStatus = 'active' | 'inactive' | 'pending';
export type StudentStatus = 'active' | 'on_hold' | 'left';
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'leave';
export type FeeStatus = 'paid' | 'partly_paid' | 'due' | 'overdue';
export type PaymentMode = 'cash' | 'upi' | 'bank_transfer' | 'cheque' | 'online';
export type ContactChangeStatus = 'pending' | 'approved' | 'rejected' | 'auto_approved';
export type MaterialType = 'pdf' | 'image' | 'document' | 'presentation' | 'link';

export interface User {
  id: string;
  name: string;
  phone: string;
  email?: string;
  role: UserRole;
  status: UserStatus;
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Student {
  id: string;
  name: string;
  class: string;
  school?: string;
  board?: 'CBSE' | 'State Board' | 'ICSE' | 'Other';
  dateOfBirth: Date;
  admissionDate: Date;
  address?: string;
  status: StudentStatus;
  photoUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Parent {
  id: string;
  userId: string;
  name: string;
  relation: 'father' | 'mother' | 'guardian' | 'other';
  phone: string;
  whatsapp?: string;
  alternatePhone?: string;
  email?: string;
  address?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface StudentParent {
  studentId: string;
  parentId: string;
  relation: string;
  isPrimary: boolean;
}

export interface Batch {
  id: string;
  name: string;
  class: string;
  subjects: string[];
  teacherId: string;
  schedule: BatchSchedule;
  baseFee: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface BatchSchedule {
  days: number[];
  startTime: string;
  endTime: string;
  timezone: string;
}

export interface StudentBatch {
  studentId: string;
  batchId: string;
  startDate: Date;
  endDate?: Date;
  customFee?: number;
}

export interface Attendance {
  id: string;
  studentId: string;
  batchId: string;
  date: Date;
  status: AttendanceStatus;
  markedBy: string;
  markedAt: Date;
  notes?: string;
}

export interface Holiday {
  id: string;
  date: Date;
  reason: string;
  batchId?: string;
  createdAt: Date;
}

export interface FeePlan {
  id: string;
  name: string;
  type: 'monthly' | 'quarterly' | 'one_time';
  amount: number;
  discount?: number;
  siblingDiscount?: number;
  admissionFee?: number;
  applicableTo: 'batch' | 'student';
  batchId?: string;
  studentId?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface FeeDue {
  id: string;
  studentId: string;
  batchId?: string;
  month: string;
  amount: number;
  discount: number;
  dueDate: Date;
  gracePeriodDays: number;
  status: FeeStatus;
  generatedAt: Date;
  paidAmount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Payment {
  id: string;
  dueId: string;
  studentId: string;
  amount: number;
  mode: PaymentMode;
  reference?: string;
  paidOn: Date;
  receivedBy: string;
  receiptNo: string;
  remark?: string;
  isReversal: boolean;
  reversalReason?: string;
  reversalOf?: string;
  createdAt: Date;
}

export interface StudyMaterial {
  id: string;
  batchId: string;
  title: string;
  subject: string;
  topic?: string;
  fileUrl?: string;
  fileType?: MaterialType;
  fileSize?: number;
  linkUrl?: string;
  description?: string;
  uploadedBy: string;
  isHidden: boolean;
  allowDownload: boolean;
  viewCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Notice {
  id: string;
  audience: 'all' | 'class' | 'batch';
  classId?: string;
  batchId?: string;
  title: string;
  body: string;
  createdBy: string;
  createdAt: Date;
  expiresAt?: Date;
}

export interface ContactChangeRequest {
  id: string;
  parentId: string;
  field: 'phone' | 'whatsapp' | 'email' | 'address';
  oldValue: string;
  newValue: string;
  status: ContactChangeStatus;
  otpVerified: boolean;
  requestedAt: Date;
  approvedAt?: Date;
  approvedBy?: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  action: string;
  entity: string;
  entityId: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  timestamp: Date;
}

export interface Notification {
  id: string;
  userId: string;
  channel: 'push' | 'whatsapp' | 'sms' | 'in_app';
  message: string;
  status: 'sent' | 'delivered' | 'failed' | 'pending';
  sentAt?: Date;
  deliveredAt?: Date;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface Test {
  id: string;
  batchId: string;
  title: string;
  subject: string;
  date: Date;
  maxMarks: number;
  questions: TestQuestion[];
  createdBy: string;
  createdAt: Date;
}

export interface TestQuestion {
  id: string;
  question: string;
  marks: number;
  topic: string;
}

export interface TestMarks {
  id: string;
  testId: string;
  studentId: string;
  marks: TestQuestionMark[];
  totalMarks: number;
  remarks?: string;
  enteredBy: string;
  enteredAt: Date;
}

export interface TestQuestionMark {
  questionId: string;
  marksObtained: number;
  topic: string;
}