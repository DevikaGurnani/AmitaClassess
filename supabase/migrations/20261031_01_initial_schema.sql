-- Initial database schema for Tuition App
-- Run: supabase db push or supabase migration up

-- Enable pgvector for potential AI use
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- pgvector is optional for future AI features; do not require it for MVP.

-- Users table (extends Supabase auth.users with role/status)
CREATE TABLE IF NOT EXISTS users (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE,
  role TEXT NOT NULL DEFAULT 'parent' CHECK (role IN ('owner', 'staff', 'teacher', 'parent', 'student')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending')),
  last_login TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Enable RLS on users
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Create role-based policies for users table
CREATE POLICY "Owner full access" ON users
  FOR ALL USING (role = 'owner');

CREATE POLICY "Staff access" ON users
  FOR ALL USING (role = 'staff');

CREATE POLICY "Teacher access" ON users
  FOR ALL USING (role = 'teacher');

CREATE POLICY "Parent self access" ON users
  FOR ALL USING (role = 'parent');

-- Student table
CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  class TEXT NOT NULL,
  school TEXT,
  board TEXT CHECK (board IN ('CBSE', 'State Board', 'ICSE', 'Other')),
  date_of_birth DATE NOT NULL,
  admission_date DATE NOT NULL,
  address TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'on_hold', 'left')),
  photo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE students ENABLE ROW LEVEL SECURITY;

-- Parent table
CREATE TABLE IF NOT EXISTS parents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  name TEXT NOT NULL,
  relation TEXT NOT NULL CHECK (relation IN ('father', 'mother', 'guardian', 'other')),
  phone TEXT NOT NULL,
  whatsapp TEXT,
  alternate_phone TEXT,
  email TEXT,
  address TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE parents ENABLE ROW LEVEL SECURITY;

-- Student-Parent relationship table
CREATE TABLE IF NOT EXISTS student_parent (
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES parents(id) ON DELETE CASCADE,
  relation TEXT NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  PRIMARY KEY (student_id, parent_id)
);

ALTER TABLE student_parent ENABLE ROW LEVEL SECURITY;

-- Batches table
CREATE TABLE IF NOT EXISTS batches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  class TEXT NOT NULL,
  subjects TEXT[] NOT NULL DEFAULT '{}',
  teacher_id UUID REFERENCES users(id) ON DELETE SET NULL,
  schedule JSONB NOT NULL DEFAULT '{"days": [], "startTime": "00:00", "endTime": "00:00", "timezone": "IST"}',
  base_fee INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE batches ENABLE ROW LEVEL SECURITY;

-- Student-Batch relationships
CREATE TABLE IF NOT EXISTS student_batch (
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES batches(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE,
  custom_fee INTEGER,
  PRIMARY KEY (student_id, batch_id)
);

ALTER TABLE student_batch ENABLE ROW LEVEL SECURITY;

-- Attendance table
CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES batches(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'absent', 'late', 'leave')),
  marked_by UUID REFERENCES users(id),
  marked_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  notes TEXT,
  UNIQUE(student_id, batch_id, date)
);

ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

-- Holiday calendar
CREATE TABLE IF NOT EXISTS holidays (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL,
  reason TEXT NOT NULL,
  batch_id UUID REFERENCES batches(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;

-- Fee plans
CREATE TABLE IF NOT EXISTS fee_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('monthly', 'quarterly', 'one_time')),
  amount INTEGER NOT NULL,
  discount INTEGER DEFAULT 0,
  sibling_discount INTEGER DEFAULT 0,
  admission_fee INTEGER DEFAULT 0,
  applicable_to TEXT NOT NULL CHECK (applicable_to IN ('batch', 'student')),
  batch_id UUID REFERENCES batches(id) ON DELETE SET NULL,
  student_id UUID REFERENCES students(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE fee_plans ENABLE ROW LEVEL SECURITY;

-- Fee dues (generated monthly)
CREATE TABLE IF NOT EXISTS fee_dues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  amount INTEGER NOT NULL,
  discount INTEGER DEFAULT 0,
  due_date DATE NOT NULL,
  grace_period_days INTEGER DEFAULT 5,
  status TEXT NOT NULL DEFAULT 'due' CHECK (status IN ('paid', 'partly_paid', 'due', 'overdue')),
  generated_amount INTEGER NOT NULL DEFAULT 0,
  paid_amount INTEGER DEFAULT 0,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  UNIQUE(student_id, month)
);

ALTER TABLE fee_dues ENABLE ROW LEVEL SECURITY;

-- Payments
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  due_id UUID REFERENCES fee_dues(id) ON DELETE RESTRICT,
  student_id UUID REFERENCES students(id) ON DELETE RESTRICT,
  amount INTEGER NOT NULL,
  mode TEXT NOT NULL DEFAULT 'cash' CHECK (mode IN ('cash', 'upi', 'bank_transfer', 'cheque', 'online')),
  reference TEXT,
  paid_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  received_by UUID REFERENCES users(id),
  receipt_no TEXT UNIQUE NOT NULL,
  is_reversal BOOLEAN DEFAULT false,
  reversal_reason TEXT,
  reversal_of UUID REFERENCES payments(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Study materials
CREATE TABLE IF NOT EXISTS materials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id UUID REFERENCES batches(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  subject TEXT NOT NULL,
  topic TEXT,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT 'pdf' CHECK (file_type IN ('pdf', 'image', 'document', 'presentation', 'link')),
  file_size INTEGER,
  description TEXT,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  is_hidden BOOLEAN DEFAULT false,
  allow_download BOOLEAN DEFAULT true,
  view_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE materials ENABLE ROW LEVEL SECURITY;

-- Notices/Announcements
CREATE TABLE IF NOT EXISTS notices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  audience TEXT NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'class', 'batch')),
  class_id TEXT,
  batch_id UUID REFERENCES batches(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  expires_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE notices ENABLE ROW LEVEL SECURITY;

-- Contact change requests
CREATE TABLE IF NOT EXISTS contact_change_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parent_id UUID REFERENCES parents(id) ON DELETE CASCADE,
  field TEXT NOT NULL CHECK (field IN ('phone', 'whatsapp', 'email', 'address')),
  old_value TEXT NOT NULL,
  new_value TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'auto_approved')),
  otp_verified BOOLEAN DEFAULT false,
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE contact_change_requests ENABLE ROW LEVEL SECURITY;

-- Audit log
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id UUID NOT NULL,
  old_value JSONB,
  new_value JSONB,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'push' CHECK (channel IN ('push', 'whatsapp', 'sms', 'in_app')),
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'failed', 'pending')),
  sent_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_students_class ON students(class);
CREATE INDEX IF NOT EXISTS idx_students_status ON students(status);
CREATE INDEX IF NOT EXISTS idx_parents_phone ON parents(phone);
CREATE INDEX IF NOT EXISTS idx_batches_teacher ON batches(teacher_id);
CREATE INDEX IF NOT EXISTS idx_batches_class ON batches(class);
CREATE INDEX IF NOT EXISTS idx_student_parent_parent ON student_parent(parent_id);
CREATE INDEX IF NOT EXISTS idx_student_parent_student ON student_parent(student_id);
CREATE INDEX IF NOT EXISTS idx_student_batch_student ON student_batch(student_id);
CREATE INDEX IF NOT EXISTS idx_student_batch_batch ON student_batch(batch_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
CREATE INDEX IF NOT EXISTS idx_fee_dues_student ON fee_dues(student_id);
CREATE INDEX IF NOT EXISTS idx_fee_dues_status ON fee_dues(status);
CREATE INDEX IF NOT EXISTS idx_payments_due ON payments(due_id);
CREATE INDEX IF NOT EXISTS idx_payments_student ON payments(student_id);
CREATE INDEX IF NOT EXISTS idx_materials_batch ON materials(batch_id);
CREATE INDEX IF NOT EXISTS idx_notices_batch ON notices(batch_id);
CREATE INDEX IF NOT EXISTS idx_notices_audience ON notices(audience);
CREATE INDEX IF NOT EXISTS idx_contact_requests_parent ON contact_change_requests(parent_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);

-- RLS: all permissions refer to the authenticated actor, NEVER the target row role.
-- SECURITY DEFINER helpers avoid recursive RLS checks across relationship tables.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.current_role() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT role FROM public.users WHERE id = (SELECT auth.uid()) AND status = 'active' LIMIT 1
$$;
CREATE OR REPLACE FUNCTION private.is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(private.current_role() IN ('owner','staff'), false)
$$;
CREATE OR REPLACE FUNCTION private.is_owner() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(private.current_role() = 'owner', false)
$$;
CREATE OR REPLACE FUNCTION private.is_parent_of(sid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(private.current_role() = 'parent' AND EXISTS (
    SELECT 1 FROM public.student_parent sp JOIN public.parents p ON p.id=sp.parent_id
    WHERE sp.student_id=sid AND p.user_id=(SELECT auth.uid())
  ), false)
$$;
CREATE OR REPLACE FUNCTION private.teaches_batch(bid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(private.current_role() = 'teacher' AND EXISTS (
    SELECT 1 FROM public.batches b WHERE b.id=bid AND b.teacher_id=(SELECT auth.uid())
  ), false)
$$;
CREATE OR REPLACE FUNCTION private.teaches_student(sid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(private.current_role() = 'teacher' AND EXISTS (
    SELECT 1 FROM public.student_batch sb JOIN public.batches b ON b.id=sb.batch_id
    WHERE sb.student_id=sid AND b.teacher_id=(SELECT auth.uid())
  ), false)
$$;
CREATE OR REPLACE FUNCTION private.is_parent_in_batch(bid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(private.current_role() = 'parent' AND EXISTS (
    SELECT 1 FROM public.student_batch sb JOIN public.student_parent sp ON sp.student_id=sb.student_id
    JOIN public.parents p ON p.id=sp.parent_id
    WHERE sb.batch_id=bid AND p.user_id=(SELECT auth.uid())
  ), false)
$$;
CREATE OR REPLACE FUNCTION private.owns_parent(pid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(private.current_role() = 'parent' AND EXISTS (
    SELECT 1 FROM public.parents p WHERE p.id=pid AND p.user_id=(SELECT auth.uid())
  ),false)
$$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO authenticated;

-- users: self can read, only owner can manage; self cannot escalate role.
CREATE POLICY users_select ON users FOR SELECT TO authenticated
  USING (id=auth.uid() OR private.is_owner() OR (private.is_admin() AND role IN ('parent','student','teacher')));
CREATE POLICY users_insert ON users FOR INSERT TO authenticated
  WITH CHECK (private.is_owner());
CREATE POLICY users_update ON users FOR UPDATE TO authenticated
  USING (private.is_owner()) WITH CHECK (private.is_owner());
CREATE POLICY users_delete ON users FOR DELETE TO authenticated
  USING (private.is_owner());

CREATE POLICY students_read ON students FOR SELECT TO authenticated
  USING (private.is_admin() OR private.is_parent_of(id) OR private.teaches_student(id));
CREATE POLICY students_add ON students FOR INSERT TO authenticated WITH CHECK (private.is_admin());
CREATE POLICY students_edit ON students FOR UPDATE TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());
-- No DELETE policy: use status=left and preserve history.

CREATE POLICY parents_read ON parents FOR SELECT TO authenticated
  USING (private.is_admin() OR private.owns_parent(id));
CREATE POLICY parents_add ON parents FOR INSERT TO authenticated WITH CHECK (private.is_admin());
CREATE POLICY parents_edit ON parents FOR UPDATE TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());
CREATE POLICY student_parent_read ON student_parent FOR SELECT TO authenticated
  USING (private.is_admin() OR private.is_parent_of(student_id) OR private.teaches_student(student_id));
CREATE POLICY student_parent_add ON student_parent FOR INSERT TO authenticated WITH CHECK (private.is_admin());
CREATE POLICY student_parent_edit ON student_parent FOR UPDATE TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());
CREATE POLICY student_parent_delete ON student_parent FOR DELETE TO authenticated USING (private.is_admin());

CREATE POLICY batches_read ON batches FOR SELECT TO authenticated
  USING (private.is_admin() OR private.teaches_batch(id) OR private.is_parent_in_batch(id));
CREATE POLICY batches_add ON batches FOR INSERT TO authenticated WITH CHECK (private.is_admin());
CREATE POLICY batches_edit ON batches FOR UPDATE TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());
-- Batch deletion intentionally blocked: deactivate to preserve attendance history.
CREATE POLICY student_batch_read ON student_batch FOR SELECT TO authenticated
  USING (private.is_admin() OR private.teaches_batch(batch_id) OR private.is_parent_of(student_id));
CREATE POLICY student_batch_add ON student_batch FOR INSERT TO authenticated WITH CHECK (private.is_admin());
CREATE POLICY student_batch_edit ON student_batch FOR UPDATE TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());
CREATE POLICY student_batch_delete ON student_batch FOR DELETE TO authenticated USING (private.is_admin());

CREATE POLICY attendance_read ON attendance FOR SELECT TO authenticated
  USING (private.is_admin() OR private.teaches_batch(batch_id) OR private.is_parent_of(student_id));
CREATE POLICY attendance_add ON attendance FOR INSERT TO authenticated
  WITH CHECK ((private.is_admin() OR private.teaches_batch(batch_id))
    AND (private.is_admin() OR marked_by=auth.uid())
    AND EXISTS (SELECT 1 FROM public.student_batch sb WHERE sb.student_id=attendance.student_id AND sb.batch_id=attendance.batch_id));
CREATE POLICY attendance_edit ON attendance FOR UPDATE TO authenticated
  USING (private.is_admin() OR (private.teaches_batch(batch_id) AND marked_at >= now()-interval '24 hours'))
  WITH CHECK (private.is_admin() OR (private.teaches_batch(batch_id) AND marked_by=auth.uid()));

CREATE POLICY holidays_read ON holidays FOR SELECT TO authenticated
  USING (private.is_admin() OR (batch_id IS NOT NULL AND (private.teaches_batch(batch_id) OR private.is_parent_in_batch(batch_id))));
CREATE POLICY holidays_write ON holidays FOR ALL TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());

CREATE POLICY fee_plans_read ON fee_plans FOR SELECT TO authenticated USING (private.is_admin());
CREATE POLICY fee_plans_add ON fee_plans FOR INSERT TO authenticated WITH CHECK (private.is_owner());
CREATE POLICY fee_plans_edit ON fee_plans FOR UPDATE TO authenticated USING (private.is_owner()) WITH CHECK (private.is_owner());
CREATE POLICY dues_read ON fee_dues FOR SELECT TO authenticated
  USING (private.is_admin() OR private.is_parent_of(student_id));
CREATE POLICY dues_add ON fee_dues FOR INSERT TO authenticated
  WITH CHECK (private.is_admin() AND amount > 0 AND generated_amount > 0);
CREATE POLICY dues_edit ON fee_dues FOR UPDATE TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());
-- Neither fees nor payments can be deleted via authenticated client.
CREATE POLICY payments_read ON payments FOR SELECT TO authenticated
  USING (private.is_admin() OR private.is_parent_of(student_id));
CREATE POLICY payments_add ON payments FOR INSERT TO authenticated
  WITH CHECK (private.is_admin() AND received_by=auth.uid() AND amount > 0);

CREATE POLICY materials_read ON materials FOR SELECT TO authenticated
  USING (private.is_admin() OR (private.teaches_batch(batch_id)) OR
    (NOT is_hidden AND private.is_parent_in_batch(batch_id)));
CREATE POLICY materials_add ON materials FOR INSERT TO authenticated
  WITH CHECK (private.is_owner() OR (private.teaches_batch(batch_id) AND uploaded_by=auth.uid()));
CREATE POLICY materials_edit ON materials FOR UPDATE TO authenticated
  USING (private.is_owner() OR private.teaches_batch(batch_id))
  WITH CHECK (private.is_owner() OR private.teaches_batch(batch_id));
CREATE POLICY materials_delete ON materials FOR DELETE TO authenticated
  USING (private.is_owner() OR private.teaches_batch(batch_id));

CREATE POLICY notices_read ON notices FOR SELECT TO authenticated
  USING (private.is_admin() OR private.current_role()='teacher' OR
    (private.current_role()='parent' AND (
      audience='all' OR
      (audience='batch' AND batch_id IS NOT NULL AND private.is_parent_in_batch(batch_id)) OR
      (audience='class' AND EXISTS (
        SELECT 1 FROM public.students s WHERE s.class=notices.class_id AND private.is_parent_of(s.id)
      ))
    )));
CREATE POLICY notices_write ON notices FOR ALL TO authenticated
  USING (private.is_admin()) WITH CHECK (private.is_admin());

CREATE POLICY contact_read ON contact_change_requests FOR SELECT TO authenticated
  USING (private.is_admin() OR private.owns_parent(parent_id));
CREATE POLICY contact_add ON contact_change_requests FOR INSERT TO authenticated
  WITH CHECK (private.owns_parent(parent_id) AND status='pending' AND approved_by IS NULL AND NOT otp_verified);
CREATE POLICY contact_edit ON contact_change_requests FOR UPDATE TO authenticated
  USING (private.is_admin()) WITH CHECK (private.is_admin());
CREATE POLICY audit_read ON audit_log FOR SELECT TO authenticated USING (private.is_owner());
-- Never allow direct INSERT/UPDATE/DELETE to the audit table by authenticated clients.
CREATE POLICY notifications_read ON notifications FOR SELECT TO authenticated
  USING (private.is_admin() OR user_id=auth.uid());
CREATE POLICY notifications_add ON notifications FOR INSERT TO authenticated
  WITH CHECK (private.is_admin());

-- Restrict money edits and record every sensitive mutation in the audit log.
CREATE OR REPLACE FUNCTION private.block_payment_changes() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'Payments are immutable: insert a reversal instead';
END $$;
CREATE TRIGGER payments_immutable BEFORE UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION private.block_payment_changes();
CREATE OR REPLACE FUNCTION private.validate_payment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE original public.payments%ROWTYPE;
original_student uuid;
BEGIN
  IF NEW.amount <= 0 THEN RAISE EXCEPTION 'Payment amount must be positive'; END IF;
  SELECT d.student_id INTO original_student FROM public.fee_dues d WHERE d.id=NEW.due_id;
  IF original_student IS NULL OR original_student IS DISTINCT FROM NEW.student_id THEN
    RAISE EXCEPTION 'Payment must reference a due for the same student';
  END IF;
  IF NEW.is_reversal THEN
    SELECT * INTO original FROM public.payments WHERE id=NEW.reversal_of;
    IF NOT FOUND OR original.is_reversal OR original.student_id IS DISTINCT FROM NEW.student_id
       OR original.due_id IS DISTINCT FROM NEW.due_id OR original.amount <> NEW.amount THEN
      RAISE EXCEPTION 'A reversal must exactly match an original payment';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_payment_before_insert BEFORE INSERT ON payments
  FOR EACH ROW EXECUTE FUNCTION private.validate_payment();
CREATE UNIQUE INDEX IF NOT EXISTS one_reversal_per_payment ON payments(reversal_of) WHERE reversal_of IS NOT NULL;
ALTER TABLE payments ADD CONSTRAINT reversal_integrity CHECK (
  (is_reversal = false AND reversal_of IS NULL AND reversal_reason IS NULL) OR
  (is_reversal = true AND reversal_of IS NOT NULL AND NULLIF(trim(reversal_reason),'') IS NOT NULL)
);

CREATE OR REPLACE FUNCTION private.audit_sensitive_changes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE entity_id uuid;
BEGIN
  entity_id := CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
  INSERT INTO public.audit_log(user_id, action, entity, entity_id, old_value, new_value)
  VALUES (auth.uid(), TG_OP, TG_TABLE_NAME, entity_id,
    CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END);
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER audit_attendance AFTER INSERT OR UPDATE OR DELETE ON attendance
  FOR EACH ROW EXECUTE FUNCTION private.audit_sensitive_changes();
CREATE TRIGGER audit_fee_dues AFTER INSERT OR UPDATE OR DELETE ON fee_dues
  FOR EACH ROW EXECUTE FUNCTION private.audit_sensitive_changes();
CREATE TRIGGER audit_payments AFTER INSERT ON payments
  FOR EACH ROW EXECUTE FUNCTION private.audit_sensitive_changes();
CREATE TRIGGER audit_users AFTER INSERT OR UPDATE OR DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION private.audit_sensitive_changes();

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER trigger_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trigger_students_updated_at BEFORE UPDATE ON students
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trigger_parents_updated_at BEFORE UPDATE ON parents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trigger_batches_updated_at BEFORE UPDATE ON batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trigger_fee_plans_updated_at BEFORE UPDATE ON fee_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trigger_fee_dues_updated_at BEFORE UPDATE ON fee_dues
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trigger_materials_updated_at BEFORE UPDATE ON materials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
-- Never include private as an exposed PostgREST schema.
