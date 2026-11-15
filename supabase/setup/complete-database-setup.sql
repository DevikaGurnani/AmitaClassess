-- TuitionApp complete schema repair, generated from six migrations.
-- Preserves application rows. Replaces policy definitions on these 20 app tables.
-- Run as the database owner, not through the public/service-role REST API.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';
SET LOCAL search_path=public,extensions,pg_catalog;
SELECT pg_advisory_xact_lock(hashtextextended('tuitionapp_schema_upgrade',0));

-- The connected legacy database used notices.class; current queries use class_id.
-- Rename, rather than discard/recreate, so existing notice audiences survive.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='notices' AND column_name='class')
    AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='notices' AND column_name='class_id') THEN
    ALTER TABLE public.notices RENAME COLUMN class TO class_id;
  END IF;
END $$;

-- Record row counts and policy/trigger definitions BEFORE changing metadata.
-- Export catalog preflight separately before applying this script.
CREATE TEMP TABLE tuition_upgrade_counts(table_name text PRIMARY KEY,total bigint) ON COMMIT DROP;
DO $$ DECLARE target text; total bigint; BEGIN
  FOR target IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('users','students','parents','student_parent','batches','student_batch','attendance','holidays','fee_plans','fee_dues','payments','materials','notices','contact_change_requests','audit_log','notifications','tests','test_marks','attendance_sync_keys','payment_orders') LOOP
    EXECUTE format('SELECT count(*) FROM public.%I',target) INTO total;
    INSERT INTO tuition_upgrade_counts VALUES(target,total);
  END LOOP;
END $$;
-- Eliminate old permissive policies as well as duplicate/new restrictive policies.
-- Final policies are restored below before this transaction commits.
DO $$ DECLARE p record; BEGIN
  FOR p IN SELECT tablename,policyname FROM pg_policies WHERE schemaname='public' AND tablename IN ('users','students','parents','student_parent','batches','student_batch','attendance','holidays','fee_plans','fee_dues','payments','materials','notices','contact_change_requests','audit_log','notifications','tests','test_marks','attendance_sync_keys','payment_orders') LOOP
    EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,p.tablename);
  END LOOP;
END $$;

-- SOURCE: 20261031_01_initial_schema.sql
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
DROP POLICY IF EXISTS "Owner full access" ON users;
CREATE POLICY "Owner full access" ON users
  FOR ALL USING (role = 'owner');

DROP POLICY IF EXISTS "Staff access" ON users;
CREATE POLICY "Staff access" ON users
  FOR ALL USING (role = 'staff');

DROP POLICY IF EXISTS "Teacher access" ON users;
CREATE POLICY "Teacher access" ON users
  FOR ALL USING (role = 'teacher');

DROP POLICY IF EXISTS "Parent self access" ON users;
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
DROP POLICY IF EXISTS users_select ON users;
CREATE POLICY users_select ON users FOR SELECT TO authenticated
  USING (id=auth.uid() OR private.is_owner() OR (private.is_admin() AND role IN ('parent','student','teacher')));
DROP POLICY IF EXISTS users_insert ON users;
CREATE POLICY users_insert ON users FOR INSERT TO authenticated
  WITH CHECK (private.is_owner());
DROP POLICY IF EXISTS users_update ON users;
CREATE POLICY users_update ON users FOR UPDATE TO authenticated
  USING (private.is_owner()) WITH CHECK (private.is_owner());
DROP POLICY IF EXISTS users_delete ON users;
CREATE POLICY users_delete ON users FOR DELETE TO authenticated
  USING (private.is_owner());

DROP POLICY IF EXISTS students_read ON students;
CREATE POLICY students_read ON students FOR SELECT TO authenticated
  USING (private.is_admin() OR private.is_parent_of(id) OR private.teaches_student(id));
DROP POLICY IF EXISTS students_add ON students;
CREATE POLICY students_add ON students FOR INSERT TO authenticated WITH CHECK (private.is_admin());
DROP POLICY IF EXISTS students_edit ON students;
CREATE POLICY students_edit ON students FOR UPDATE TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());
-- No DELETE policy: use status=left and preserve history.

DROP POLICY IF EXISTS parents_read ON parents;
CREATE POLICY parents_read ON parents FOR SELECT TO authenticated
  USING (private.is_admin() OR private.owns_parent(id));
DROP POLICY IF EXISTS parents_add ON parents;
CREATE POLICY parents_add ON parents FOR INSERT TO authenticated WITH CHECK (private.is_admin());
DROP POLICY IF EXISTS parents_edit ON parents;
CREATE POLICY parents_edit ON parents FOR UPDATE TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());
DROP POLICY IF EXISTS student_parent_read ON student_parent;
CREATE POLICY student_parent_read ON student_parent FOR SELECT TO authenticated
  USING (private.is_admin() OR private.is_parent_of(student_id) OR private.teaches_student(student_id));
DROP POLICY IF EXISTS student_parent_add ON student_parent;
CREATE POLICY student_parent_add ON student_parent FOR INSERT TO authenticated WITH CHECK (private.is_admin());
DROP POLICY IF EXISTS student_parent_edit ON student_parent;
CREATE POLICY student_parent_edit ON student_parent FOR UPDATE TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());
DROP POLICY IF EXISTS student_parent_delete ON student_parent;
CREATE POLICY student_parent_delete ON student_parent FOR DELETE TO authenticated USING (private.is_admin());

DROP POLICY IF EXISTS batches_read ON batches;
CREATE POLICY batches_read ON batches FOR SELECT TO authenticated
  USING (private.is_admin() OR private.teaches_batch(id) OR private.is_parent_in_batch(id));
DROP POLICY IF EXISTS batches_add ON batches;
CREATE POLICY batches_add ON batches FOR INSERT TO authenticated WITH CHECK (private.is_admin());
DROP POLICY IF EXISTS batches_edit ON batches;
CREATE POLICY batches_edit ON batches FOR UPDATE TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());
-- Batch deletion intentionally blocked: deactivate to preserve attendance history.
DROP POLICY IF EXISTS student_batch_read ON student_batch;
CREATE POLICY student_batch_read ON student_batch FOR SELECT TO authenticated
  USING (private.is_admin() OR private.teaches_batch(batch_id) OR private.is_parent_of(student_id));
DROP POLICY IF EXISTS student_batch_add ON student_batch;
CREATE POLICY student_batch_add ON student_batch FOR INSERT TO authenticated WITH CHECK (private.is_admin());
DROP POLICY IF EXISTS student_batch_edit ON student_batch;
CREATE POLICY student_batch_edit ON student_batch FOR UPDATE TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());
DROP POLICY IF EXISTS student_batch_delete ON student_batch;
CREATE POLICY student_batch_delete ON student_batch FOR DELETE TO authenticated USING (private.is_admin());

DROP POLICY IF EXISTS attendance_read ON attendance;
CREATE POLICY attendance_read ON attendance FOR SELECT TO authenticated
  USING (private.is_admin() OR private.teaches_batch(batch_id) OR private.is_parent_of(student_id));
DROP POLICY IF EXISTS attendance_add ON attendance;
CREATE POLICY attendance_add ON attendance FOR INSERT TO authenticated
  WITH CHECK ((private.is_admin() OR private.teaches_batch(batch_id))
    AND (private.is_admin() OR marked_by=auth.uid())
    AND EXISTS (SELECT 1 FROM public.student_batch sb WHERE sb.student_id=attendance.student_id AND sb.batch_id=attendance.batch_id));
DROP POLICY IF EXISTS attendance_edit ON attendance;
CREATE POLICY attendance_edit ON attendance FOR UPDATE TO authenticated
  USING (private.is_admin() OR (private.teaches_batch(batch_id) AND marked_at >= now()-interval '24 hours'))
  WITH CHECK (private.is_admin() OR (private.teaches_batch(batch_id) AND marked_by=auth.uid()));

DROP POLICY IF EXISTS holidays_read ON holidays;
CREATE POLICY holidays_read ON holidays FOR SELECT TO authenticated
  USING (private.is_admin() OR (batch_id IS NOT NULL AND (private.teaches_batch(batch_id) OR private.is_parent_in_batch(batch_id))));
DROP POLICY IF EXISTS holidays_write ON holidays;
CREATE POLICY holidays_write ON holidays FOR ALL TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());

DROP POLICY IF EXISTS fee_plans_read ON fee_plans;
CREATE POLICY fee_plans_read ON fee_plans FOR SELECT TO authenticated USING (private.is_admin());
DROP POLICY IF EXISTS fee_plans_add ON fee_plans;
CREATE POLICY fee_plans_add ON fee_plans FOR INSERT TO authenticated WITH CHECK (private.is_owner());
DROP POLICY IF EXISTS fee_plans_edit ON fee_plans;
CREATE POLICY fee_plans_edit ON fee_plans FOR UPDATE TO authenticated USING (private.is_owner()) WITH CHECK (private.is_owner());
DROP POLICY IF EXISTS dues_read ON fee_dues;
CREATE POLICY dues_read ON fee_dues FOR SELECT TO authenticated
  USING (private.is_admin() OR private.is_parent_of(student_id));
DROP POLICY IF EXISTS dues_add ON fee_dues;
CREATE POLICY dues_add ON fee_dues FOR INSERT TO authenticated
  WITH CHECK (private.is_admin() AND amount > 0 AND generated_amount > 0);
DROP POLICY IF EXISTS dues_edit ON fee_dues;
CREATE POLICY dues_edit ON fee_dues FOR UPDATE TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());
-- Neither fees nor payments can be deleted via authenticated client.
DROP POLICY IF EXISTS payments_read ON payments;
CREATE POLICY payments_read ON payments FOR SELECT TO authenticated
  USING (private.is_admin() OR private.is_parent_of(student_id));
DROP POLICY IF EXISTS payments_add ON payments;
CREATE POLICY payments_add ON payments FOR INSERT TO authenticated
  WITH CHECK (private.is_admin() AND received_by=auth.uid() AND amount > 0);

DROP POLICY IF EXISTS materials_read ON materials;
CREATE POLICY materials_read ON materials FOR SELECT TO authenticated
  USING (private.is_admin() OR (private.teaches_batch(batch_id)) OR
    (NOT is_hidden AND private.is_parent_in_batch(batch_id)));
DROP POLICY IF EXISTS materials_add ON materials;
CREATE POLICY materials_add ON materials FOR INSERT TO authenticated
  WITH CHECK (private.is_owner() OR (private.teaches_batch(batch_id) AND uploaded_by=auth.uid()));
DROP POLICY IF EXISTS materials_edit ON materials;
CREATE POLICY materials_edit ON materials FOR UPDATE TO authenticated
  USING (private.is_owner() OR private.teaches_batch(batch_id))
  WITH CHECK (private.is_owner() OR private.teaches_batch(batch_id));
DROP POLICY IF EXISTS materials_delete ON materials;
CREATE POLICY materials_delete ON materials FOR DELETE TO authenticated
  USING (private.is_owner() OR private.teaches_batch(batch_id));

DROP POLICY IF EXISTS notices_read ON notices;
CREATE POLICY notices_read ON notices FOR SELECT TO authenticated
  USING (private.is_admin() OR private.current_role()='teacher' OR
    (private.current_role()='parent' AND (
      audience='all' OR
      (audience='batch' AND batch_id IS NOT NULL AND private.is_parent_in_batch(batch_id)) OR
      (audience='class' AND EXISTS (
        SELECT 1 FROM public.students s WHERE s.class=notices.class_id AND private.is_parent_of(s.id)
      ))
    )));
DROP POLICY IF EXISTS notices_write ON notices;
CREATE POLICY notices_write ON notices FOR ALL TO authenticated
  USING (private.is_admin()) WITH CHECK (private.is_admin());

DROP POLICY IF EXISTS contact_read ON contact_change_requests;
CREATE POLICY contact_read ON contact_change_requests FOR SELECT TO authenticated
  USING (private.is_admin() OR private.owns_parent(parent_id));
DROP POLICY IF EXISTS contact_add ON contact_change_requests;
CREATE POLICY contact_add ON contact_change_requests FOR INSERT TO authenticated
  WITH CHECK (private.owns_parent(parent_id) AND status='pending' AND approved_by IS NULL AND NOT otp_verified);
DROP POLICY IF EXISTS contact_edit ON contact_change_requests;
CREATE POLICY contact_edit ON contact_change_requests FOR UPDATE TO authenticated
  USING (private.is_admin()) WITH CHECK (private.is_admin());
DROP POLICY IF EXISTS audit_read ON audit_log;
CREATE POLICY audit_read ON audit_log FOR SELECT TO authenticated USING (private.is_owner());
-- Never allow direct INSERT/UPDATE/DELETE to the audit table by authenticated clients.
DROP POLICY IF EXISTS notifications_read ON notifications;
CREATE POLICY notifications_read ON notifications FOR SELECT TO authenticated
  USING (private.is_admin() OR user_id=auth.uid());
DROP POLICY IF EXISTS notifications_add ON notifications;
CREATE POLICY notifications_add ON notifications FOR INSERT TO authenticated
  WITH CHECK (private.is_admin());

-- Restrict money edits and record every sensitive mutation in the audit log.
CREATE OR REPLACE FUNCTION private.block_payment_changes() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'Payments are immutable: insert a reversal instead';
END $$;
DROP TRIGGER IF EXISTS payments_immutable ON payments;
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
DROP TRIGGER IF EXISTS validate_payment_before_insert ON payments;
CREATE TRIGGER validate_payment_before_insert BEFORE INSERT ON payments
  FOR EACH ROW EXECUTE FUNCTION private.validate_payment();
CREATE UNIQUE INDEX IF NOT EXISTS one_reversal_per_payment ON payments(reversal_of) WHERE reversal_of IS NOT NULL;
ALTER TABLE payments DROP CONSTRAINT IF EXISTS reversal_integrity;
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
DROP TRIGGER IF EXISTS audit_attendance ON attendance;
CREATE TRIGGER audit_attendance AFTER INSERT OR UPDATE OR DELETE ON attendance
  FOR EACH ROW EXECUTE FUNCTION private.audit_sensitive_changes();
DROP TRIGGER IF EXISTS audit_fee_dues ON fee_dues;
CREATE TRIGGER audit_fee_dues AFTER INSERT OR UPDATE OR DELETE ON fee_dues
  FOR EACH ROW EXECUTE FUNCTION private.audit_sensitive_changes();
DROP TRIGGER IF EXISTS audit_payments ON payments;
CREATE TRIGGER audit_payments AFTER INSERT ON payments
  FOR EACH ROW EXECUTE FUNCTION private.audit_sensitive_changes();
DROP TRIGGER IF EXISTS audit_users ON users;
CREATE TRIGGER audit_users AFTER INSERT OR UPDATE OR DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION private.audit_sensitive_changes();

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trigger_users_updated_at ON users;
CREATE TRIGGER trigger_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trigger_students_updated_at ON students;
CREATE TRIGGER trigger_students_updated_at BEFORE UPDATE ON students
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trigger_parents_updated_at ON parents;
CREATE TRIGGER trigger_parents_updated_at BEFORE UPDATE ON parents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trigger_batches_updated_at ON batches;
CREATE TRIGGER trigger_batches_updated_at BEFORE UPDATE ON batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trigger_fee_plans_updated_at ON fee_plans;
CREATE TRIGGER trigger_fee_plans_updated_at BEFORE UPDATE ON fee_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trigger_fee_dues_updated_at ON fee_dues;
CREATE TRIGGER trigger_fee_dues_updated_at BEFORE UPDATE ON fee_dues
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trigger_materials_updated_at ON materials;
CREATE TRIGGER trigger_materials_updated_at BEFORE UPDATE ON materials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
-- Never include private as an exposed PostgREST schema.


-- SOURCE: 20261110_02_phase2.sql
-- Phase 2: Apply after the repaired baseline migration. Amounts are whole INR.
-- Never use this migration as a replacement for the baseline or on unreviewed production data.

CREATE TABLE IF NOT EXISTS tests (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), batch_id uuid NOT NULL REFERENCES batches(id),
 title text NOT NULL CHECK (length(trim(title))>0), subject text NOT NULL,
 test_date date NOT NULL, max_marks numeric(8,2) NOT NULL CHECK(max_marks>0),
 created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS test_marks (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), test_id uuid NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
 student_id uuid NOT NULL REFERENCES students(id), marks numeric(8,2) NOT NULL CHECK(marks>=0),
 remarks text, entered_by uuid NOT NULL REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(test_id,student_id)
);
CREATE INDEX IF NOT EXISTS idx_tests_batch_date ON tests(batch_id,test_date DESC);
CREATE INDEX IF NOT EXISTS idx_test_marks_student ON test_marks(student_id);
ALTER TABLE tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_marks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tests_read ON tests;
CREATE POLICY tests_read ON tests FOR SELECT TO authenticated USING (
 private.is_admin() OR private.teaches_batch(batch_id) OR private.is_parent_in_batch(batch_id));
DROP POLICY IF EXISTS tests_add ON tests;
CREATE POLICY tests_add ON tests FOR INSERT TO authenticated WITH CHECK (
 (private.is_admin() OR private.teaches_batch(batch_id)) AND created_by=auth.uid());
DROP POLICY IF EXISTS tests_change ON tests;
CREATE POLICY tests_change ON tests FOR UPDATE TO authenticated USING (
 private.is_admin() OR private.teaches_batch(batch_id)) WITH CHECK(private.is_admin() OR private.teaches_batch(batch_id));
DROP POLICY IF EXISTS marks_read ON test_marks;
CREATE POLICY marks_read ON test_marks FOR SELECT TO authenticated USING (
 private.is_admin() OR private.is_parent_of(student_id) OR EXISTS (
  SELECT 1 FROM tests t WHERE t.id=test_marks.test_id AND private.teaches_batch(t.batch_id)));
DROP POLICY IF EXISTS marks_add ON test_marks;
CREATE POLICY marks_add ON test_marks FOR INSERT TO authenticated WITH CHECK (
 entered_by=auth.uid() AND EXISTS (SELECT 1 FROM tests t JOIN student_batch sb ON sb.batch_id=t.batch_id
 WHERE t.id=test_id AND sb.student_id=test_marks.student_id AND (private.is_admin() OR private.teaches_batch(t.batch_id)))
 AND marks <= (SELECT t.max_marks FROM tests t WHERE t.id=test_id));
DROP POLICY IF EXISTS marks_update ON test_marks;
CREATE POLICY marks_update ON test_marks FOR UPDATE TO authenticated USING (
 private.is_admin() OR EXISTS (SELECT 1 FROM tests t WHERE t.id=test_id AND private.teaches_batch(t.batch_id)))
 WITH CHECK (entered_by=auth.uid() AND marks <= (SELECT t.max_marks FROM tests t WHERE t.id=test_id)
 AND EXISTS (SELECT 1 FROM tests t JOIN student_batch sb ON sb.batch_id=t.batch_id
 WHERE t.id=test_id AND sb.student_id=test_marks.student_id
 AND (private.is_admin() OR private.teaches_batch(t.batch_id))));

-- Offline attendance uses a per-device idempotency key and an RPC that rechecks batch permissions.
CREATE TABLE IF NOT EXISTS attendance_sync_keys (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), client_key uuid NOT NULL,
 user_id uuid NOT NULL REFERENCES users(id), attendance_id uuid NOT NULL REFERENCES attendance(id),
 synced_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,client_key)
);
ALTER TABLE attendance_sync_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sync_keys_read ON attendance_sync_keys;
CREATE POLICY sync_keys_read ON attendance_sync_keys FOR SELECT TO authenticated USING (user_id=auth.uid() OR private.is_admin());
CREATE OR REPLACE FUNCTION public.sync_attendance(
 p_client_key uuid, p_student_id uuid, p_batch_id uuid, p_date date, p_status text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private,pg_temp AS $$
DECLARE v_id uuid; v_existing uuid; v_date_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
 IF auth.uid() IS NULL OR private.current_role() IS NULL THEN RAISE EXCEPTION 'Unauthenticated'; END IF;
 SELECT attendance_id INTO v_existing FROM attendance_sync_keys WHERE client_key=p_client_key AND user_id=auth.uid();
 IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
 IF p_status NOT IN ('present','absent','late','leave') THEN RAISE EXCEPTION 'Invalid status'; END IF;
 IF p_date > v_date_today THEN RAISE EXCEPTION 'Future attendance not permitted'; END IF;
 IF NOT (private.is_admin() OR private.teaches_batch(p_batch_id)) THEN RAISE EXCEPTION 'Batch access denied'; END IF;
 IF NOT EXISTS(SELECT 1 FROM student_batch sb JOIN students s ON s.id=sb.student_id
 WHERE sb.student_id=p_student_id AND sb.batch_id=p_batch_id AND s.status='active'
 AND sb.start_date<=p_date AND (sb.end_date IS NULL OR sb.end_date>=p_date)) THEN
 RAISE EXCEPTION 'Student is not enrolled on date'; END IF;
 IF NOT private.is_admin() THEN
  IF p_date<>v_date_today THEN RAISE EXCEPTION 'Teacher may only sync today''s attendance'; END IF;
  IF EXISTS(SELECT 1 FROM attendance WHERE student_id=p_student_id AND batch_id=p_batch_id AND date=p_date
     AND marked_at<now()-interval '24 hours') THEN RAISE EXCEPTION 'Edit window expired'; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM holidays WHERE date=p_date AND (batch_id IS NULL OR batch_id=p_batch_id))
 AND NOT private.is_admin() THEN RAISE EXCEPTION 'Holiday'; END IF;
 INSERT INTO attendance(student_id,batch_id,date,status,marked_by,marked_at)
 VALUES(p_student_id,p_batch_id,p_date,p_status,auth.uid(),now())
 ON CONFLICT(student_id,batch_id,date) DO UPDATE SET status=excluded.status,marked_by=auth.uid(),marked_at=now()
 RETURNING id INTO v_id;
 INSERT INTO attendance_sync_keys(client_key,user_id,attendance_id) VALUES(p_client_key,auth.uid(),v_id);
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.sync_attendance(uuid,uuid,uuid,date,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_attendance(uuid,uuid,uuid,date,text) TO authenticated;

-- Payment settlement must be webhook-verified, never claimed by browser UI.
CREATE TABLE IF NOT EXISTS payment_orders (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), due_id uuid NOT NULL REFERENCES fee_dues(id) ON DELETE RESTRICT,
 student_id uuid NOT NULL REFERENCES students(id), requested_by uuid NOT NULL REFERENCES users(id),
 amount_inr integer NOT NULL CHECK(amount_inr>0), gateway text NOT NULL DEFAULT 'razorpay' CHECK(gateway='razorpay'),
 gateway_order_id text UNIQUE NOT NULL, gateway_payment_id text UNIQUE,
 status text NOT NULL DEFAULT 'created' CHECK(status IN('created','captured','failed')),
 created_at timestamptz NOT NULL DEFAULT now(), captured_at timestamptz,
 UNIQUE(id,due_id)
);
ALTER TABLE payment_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS orders_read ON payment_orders;
CREATE POLICY orders_read ON payment_orders FOR SELECT TO authenticated USING(
 private.is_admin() OR (requested_by=auth.uid() AND private.is_parent_of(student_id)));
DROP POLICY IF EXISTS orders_insert ON payment_orders;
CREATE POLICY orders_insert ON payment_orders FOR INSERT TO authenticated WITH CHECK (
 requested_by=auth.uid() AND (private.is_admin() OR private.is_parent_of(student_id))
 AND status='created' AND EXISTS (SELECT 1 FROM fee_dues d WHERE d.id=due_id AND d.student_id=payment_orders.student_id
 AND amount_inr<=greatest(0,d.generated_amount-d.paid_amount)));
-- No authenticated UPDATE or DELETE policy on gateway orders.

CREATE OR REPLACE FUNCTION private.recalculate_due_payment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_paid integer; v_total integer; v_date date; v_grace integer;
BEGIN
 -- Serialize all inserts for one due *before* summing to prevent concurrent overpayment.
 SELECT generated_amount,due_date,grace_period_days INTO v_total,v_date,v_grace FROM fee_dues WHERE id=NEW.due_id FOR UPDATE;
 SELECT COALESCE(SUM(CASE WHEN is_reversal THEN -amount ELSE amount END),0) INTO v_paid
 FROM payments WHERE due_id=NEW.due_id;
 IF v_paid<0 OR v_paid>v_total THEN RAISE EXCEPTION 'Payment total outside fee due'; END IF;
 UPDATE fee_dues SET paid_amount=v_paid, status=CASE
  WHEN v_paid=v_total THEN 'paid'
  WHEN current_date>v_date+v_grace THEN 'overdue'
  WHEN v_paid>0 THEN 'partly_paid' ELSE 'due' END,
  updated_at=now() WHERE id=NEW.due_id;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS recalculate_due_after_payment ON payments;
CREATE TRIGGER recalculate_due_after_payment AFTER INSERT ON payments
 FOR EACH ROW EXECUTE FUNCTION private.recalculate_due_payment();

CREATE OR REPLACE FUNCTION public.settle_gateway_payment(p_order text,p_payment text,p_amount_paise bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private,pg_temp AS $$
DECLARE v_order payment_orders%ROWTYPE; v_remaining integer;
BEGIN
 -- Service role only; caller MUST have verified Razorpay webhook signature and captured event.
 SELECT * INTO v_order FROM payment_orders WHERE gateway_order_id=p_order FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown gateway order'; END IF;
 IF v_order.status='captured' THEN
  IF v_order.gateway_payment_id=p_payment THEN RETURN false; END IF;
  RAISE EXCEPTION 'Order already settled by another payment';
 END IF;
 IF p_amount_paise <> v_order.amount_inr::bigint*100 THEN RAISE EXCEPTION 'Amount mismatch'; END IF;
 SELECT generated_amount-paid_amount INTO v_remaining FROM fee_dues WHERE id=v_order.due_id FOR UPDATE;
 IF v_remaining<v_order.amount_inr THEN RAISE EXCEPTION 'Due has already been paid'; END IF;
 INSERT INTO payments(due_id,student_id,amount,mode,reference,received_by,receipt_no)
 VALUES(v_order.due_id,v_order.student_id,v_order.amount_inr,'online',p_payment,v_order.requested_by,
 'RZP-'||substr(v_order.id::text,1,8)||'-'||substr(p_payment,1,14));
 UPDATE payment_orders SET status='captured',gateway_payment_id=p_payment,captured_at=now() WHERE id=v_order.id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.settle_gateway_payment(text,text,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.settle_gateway_payment(text,text,bigint) TO service_role;

-- Notifications are queue records, not an assertion that SMS/WhatsApp was delivered.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS template_key text;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS scheduled_for timestamptz NOT NULL DEFAULT now();
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS provider_message_id text;
CREATE INDEX IF NOT EXISTS idx_notifications_queue ON notifications(status,scheduled_for) WHERE status='pending';
-- Teacher notices may be sent only to their own batch, or admin to any audience.
DROP POLICY IF EXISTS notices_write ON notices;
DROP POLICY IF EXISTS notices_add ON notices;
CREATE POLICY notices_add ON notices FOR INSERT TO authenticated WITH CHECK(
 created_by=auth.uid() AND (private.is_admin() OR (audience='batch' AND private.teaches_batch(batch_id))));
DROP POLICY IF EXISTS notices_update ON notices;
CREATE POLICY notices_update ON notices FOR UPDATE TO authenticated USING(private.is_admin() OR (created_by=auth.uid() AND private.teaches_batch(batch_id)))
 WITH CHECK(private.is_admin() OR (created_by=auth.uid() AND audience='batch' AND private.teaches_batch(batch_id)));
DROP POLICY IF EXISTS notices_delete ON notices;
CREATE POLICY notices_delete ON notices FOR DELETE TO authenticated USING(private.is_admin());
DROP POLICY IF EXISTS teacher_notification_read ON notifications;
CREATE POLICY teacher_notification_read ON notifications FOR SELECT TO authenticated USING(
 private.current_role()='teacher' AND user_id=auth.uid());

DROP TRIGGER IF EXISTS audit_tests ON tests;
CREATE TRIGGER audit_tests AFTER INSERT OR UPDATE OR DELETE ON tests FOR EACH ROW EXECUTE FUNCTION private.audit_sensitive_changes();
DROP TRIGGER IF EXISTS audit_marks ON test_marks;
CREATE TRIGGER audit_marks AFTER INSERT OR UPDATE OR DELETE ON test_marks FOR EACH ROW EXECUTE FUNCTION private.audit_sensitive_changes();
DROP TRIGGER IF EXISTS audit_orders ON payment_orders;
CREATE TRIGGER audit_orders AFTER INSERT OR UPDATE ON payment_orders FOR EACH ROW EXECUTE FUNCTION private.audit_sensitive_changes();

-- Follow-up migration section: idempotent reminder enqueue and safe worker claims.

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_status_check;
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_status_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_status_check CHECK(status IN ('pending','processing','sent','delivered','failed'));
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS dedupe_key text;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_dedupe_key ON notifications(dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE OR REPLACE FUNCTION public.generate_reminder_notifications()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private,pg_temp AS $$
DECLARE v_total integer:=0; v_count integer; v_today date:=(now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
 -- Never grant this RPC to an authenticated user; server scheduler invokes with service_role.
 INSERT INTO notifications(user_id,channel,message,status,template_key,dedupe_key)
 SELECT DISTINCT p.user_id,'in_app',
  CASE WHEN d.due_date<v_today THEN 'Overdue tuition fee: INR '||(d.generated_amount-d.paid_amount)||' for '||s.name
    WHEN d.due_date=v_today THEN 'Tuition fee due today: INR '||(d.generated_amount-d.paid_amount)||' for '||s.name
    ELSE 'Tuition fee due soon: INR '||(d.generated_amount-d.paid_amount)||' for '||s.name END,
  'pending','fee_reminder','fee:'||d.id||':'||CASE WHEN d.due_date<v_today THEN 'overdue' WHEN d.due_date=v_today THEN 'due' ELSE 'before' END||':'||p.user_id
 FROM fee_dues d JOIN students s ON s.id=d.student_id
 JOIN student_parent sp ON sp.student_id=d.student_id JOIN parents p ON p.id=sp.parent_id
 JOIN users u ON u.id=p.user_id AND u.status='active'
 WHERE d.generated_amount>d.paid_amount AND
 (d.due_date=v_today OR d.due_date=v_today+interval '3 days' OR d.due_date+ d.grace_period_days+1=v_today)
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS v_count=ROW_COUNT;v_total:=v_total+v_count;
 INSERT INTO notifications(user_id,channel,message,status,template_key,dedupe_key)
 SELECT DISTINCT p.user_id,'in_app','Attendance alert: '||s.name||' was marked absent on '||a.date||'.',
  'pending','absence','absence:'||a.id||':'||p.user_id
 FROM attendance a JOIN students s ON s.id=a.student_id
 JOIN student_parent sp ON sp.student_id=a.student_id JOIN parents p ON p.id=sp.parent_id
 JOIN users u ON u.id=p.user_id AND u.status='active'
 WHERE a.date=v_today AND a.status='absent'
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS v_count=ROW_COUNT;RETURN v_total+v_count;
END $$;
REVOKE ALL ON FUNCTION public.generate_reminder_notifications() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.generate_reminder_notifications() TO service_role;

CREATE OR REPLACE FUNCTION public.claim_notification_jobs(p_limit integer DEFAULT 20)
RETURNS SETOF notifications LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 RETURN QUERY WITH candidates AS (
  SELECT id FROM notifications WHERE ((status='pending' AND scheduled_for<=now()) OR (status='processing' AND claimed_at<now()-interval '10 minutes')) AND attempts<3
  ORDER BY scheduled_for,id FOR UPDATE SKIP LOCKED LIMIT LEAST(GREATEST(p_limit,1),100)
 ) UPDATE notifications n SET status='processing',claimed_at=now(),attempts=attempts+1
 FROM candidates WHERE n.id=candidates.id RETURNING n.*;
END $$;
REVOKE ALL ON FUNCTION public.claim_notification_jobs(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_jobs(integer) TO service_role;


-- SOURCE: 20261111_03_core_workflows.sql
-- Phase 3 core workflows. Apply after the Phase 0 and Phase 2 migrations.

-- Remove permissive policies left by the original foundation migration.
DROP POLICY IF EXISTS "Owner full access" ON public.users;
DROP POLICY IF EXISTS "Staff access" ON public.users;
DROP POLICY IF EXISTS "Teacher access" ON public.users;
DROP POLICY IF EXISTS "Parent self access" ON public.users;

CREATE OR REPLACE FUNCTION public.save_student_profile(
  p_id uuid, p_create boolean, p_student jsonb, p_parent_id uuid,
  p_guardian jsonb, p_batch_ids uuid[], p_expected_updated_at timestamptz DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE
  v_student students%ROWTYPE;
  v_parent_id uuid := p_parent_id;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_admission date := (p_student->>'admission_date')::date;
  v_dob date := (p_student->>'date_of_birth')::date;
  v_relation text := p_guardian->>'relation';
BEGIN
  IF NOT private.is_admin() THEN RAISE EXCEPTION 'Owner or staff access required'; END IF;
  -- One student lock serializes enrollment and profile changes, including retries.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text, 0));
  SELECT * INTO v_student FROM students WHERE id=p_id FOR UPDATE;
  IF p_create AND FOUND THEN RETURN p_id; END IF;
  IF NOT p_create THEN
    IF v_student.id IS NULL THEN RAISE EXCEPTION 'Student not found'; END IF;
    IF p_expected_updated_at IS DISTINCT FROM v_student.updated_at THEN
      RAISE EXCEPTION 'This student was updated by someone else. Reload the profile before saving';
    END IF;
  END IF;
  IF nullif(trim(p_student->>'name'),'') IS NULL OR nullif(trim(p_student->>'class'),'') IS NULL THEN
    RAISE EXCEPTION 'Student name and class are required';
  END IF;
  IF v_dob IS NULL OR v_admission IS NULL OR v_dob>v_admission OR v_admission>v_today THEN
    RAISE EXCEPTION 'Check the birth and admission dates';
  END IF;
  IF v_relation IS NULL OR v_relation NOT IN ('father','mother','guardian','other') THEN
    RAISE EXCEPTION 'Choose a guardian relationship';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_batch_ids) bid WHERE NOT EXISTS (
    SELECT 1 FROM batches b WHERE b.id=bid AND (b.is_active OR EXISTS (
      SELECT 1 FROM student_batch sb WHERE sb.student_id=p_id AND sb.batch_id=b.id
        AND (sb.end_date IS NULL OR sb.end_date>=v_today)
    ))
  )) THEN RAISE EXCEPTION 'Choose active batches'; END IF;

  IF v_parent_id IS NULL THEN
    IF nullif(trim(p_guardian->>'name'),'') IS NULL OR
       COALESCE(p_guardian->>'phone','') !~ '^\+[1-9][0-9]{7,14}$' THEN
      RAISE EXCEPTION 'Guardian name and a phone number with country code are required';
    END IF;
    IF nullif(p_guardian->>'user_id','') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM users WHERE id=(p_guardian->>'user_id')::uuid AND role='parent' AND status='active'
    ) THEN RAISE EXCEPTION 'Choose an active parent account'; END IF;
    INSERT INTO parents(name,phone,relation,email,whatsapp,address,user_id)
    VALUES(trim(p_guardian->>'name'),p_guardian->>'phone',v_relation,
      nullif(trim(p_guardian->>'email'),''),nullif(trim(p_guardian->>'whatsapp'),''),
      nullif(trim(p_guardian->>'address'),''),nullif(p_guardian->>'user_id','')::uuid)
    RETURNING id INTO v_parent_id;
  ELSIF NOT EXISTS (SELECT 1 FROM parents WHERE id=v_parent_id) THEN
    RAISE EXCEPTION 'Guardian not found';
  ELSIF nullif(p_guardian->>'user_id','') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM users WHERE id=(p_guardian->>'user_id')::uuid AND role='parent' AND status='active') THEN
      RAISE EXCEPTION 'Choose an active parent account';
    END IF;
    UPDATE parents SET user_id=(p_guardian->>'user_id')::uuid WHERE id=v_parent_id AND user_id IS NULL;
  END IF;

  INSERT INTO students(id,name,class,school,board,date_of_birth,admission_date,address,status)
  VALUES(p_id,trim(p_student->>'name'),trim(p_student->>'class'),nullif(trim(p_student->>'school'),''),
    nullif(p_student->>'board',''),v_dob,v_admission,nullif(trim(p_student->>'address'),''),p_student->>'status')
  ON CONFLICT(id) DO UPDATE SET name=excluded.name,class=excluded.class,school=excluded.school,
    board=excluded.board,date_of_birth=excluded.date_of_birth,admission_date=excluded.admission_date,
    address=excluded.address,status=excluded.status;
  UPDATE student_parent SET is_primary=false WHERE student_id=p_id AND is_primary;
  INSERT INTO student_parent(student_id,parent_id,relation,is_primary)
  VALUES(p_id,v_parent_id,v_relation,true)
  ON CONFLICT(student_id,parent_id) DO UPDATE SET relation=excluded.relation,is_primary=true;

  -- Keep ended enrollment rows and their custom fees for historical records.
  UPDATE student_batch SET end_date=v_today-1
  WHERE student_id=p_id AND (end_date IS NULL OR end_date>=v_today)
    AND NOT (batch_id=ANY(COALESCE(p_batch_ids,'{}'::uuid[])));
  INSERT INTO student_batch(student_id,batch_id,start_date)
  SELECT p_id,bid,greatest(v_admission,v_today) FROM (SELECT DISTINCT unnest(p_batch_ids) bid) selected
  ON CONFLICT(student_id,batch_id) DO UPDATE SET end_date=NULL;
  RETURN p_id;
END $$;
REVOKE ALL ON FUNCTION public.save_student_profile(uuid,boolean,jsonb,uuid,jsonb,uuid[],timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_student_profile(uuid,boolean,jsonb,uuid,jsonb,uuid[],timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_student_due(p_student_id uuid,p_month date)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid; v_amount integer; v_month date := date_trunc('month',p_month)::date;
BEGIN
  IF NOT private.is_admin() THEN RAISE EXCEPTION 'Owner or staff access required'; END IF;
  IF p_month IS NULL THEN RAISE EXCEPTION 'Choose a billing month'; END IF;
  PERFORM 1 FROM students WHERE id=p_student_id AND status='active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active student not found'; END IF;
  SELECT id INTO v_id FROM fee_dues WHERE student_id=p_student_id AND month IN (v_month::text,to_char(v_month,'YYYY-MM'))
    ORDER BY month DESC LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  SELECT sum(COALESCE(sb.custom_fee,b.base_fee)) INTO v_amount
  FROM student_batch sb JOIN batches b ON b.id=sb.batch_id
  WHERE sb.student_id=p_student_id AND b.is_active
    AND sb.start_date<(v_month+interval '1 month')::date
    AND (sb.end_date IS NULL OR (sb.end_date>=v_month AND sb.end_date>=sb.start_date));
  IF COALESCE(v_amount,0)<=0 THEN RAISE EXCEPTION 'No positive enrolled batch fee for this month'; END IF;
  INSERT INTO fee_dues(student_id,month,amount,discount,generated_amount,paid_amount,due_date,grace_period_days,status)
  VALUES(p_student_id,v_month::text,v_amount,0,v_amount,0,v_month+9,5,
    CASE WHEN (now() AT TIME ZONE 'Asia/Kolkata')::date>v_month+14 THEN 'overdue' ELSE 'due' END)
  ON CONFLICT(student_id,month) DO NOTHING RETURNING id INTO v_id;
  IF v_id IS NULL THEN SELECT id INTO v_id FROM fee_dues WHERE student_id=p_student_id AND month=v_month::text; END IF;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.generate_student_due(uuid,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.generate_student_due(uuid,date) TO authenticated;

DROP TRIGGER IF EXISTS audit_students ON students;
CREATE TRIGGER audit_students AFTER INSERT OR UPDATE ON students
  FOR EACH ROW EXECUTE FUNCTION private.audit_sensitive_changes();
DROP TRIGGER IF EXISTS audit_parents ON parents;
CREATE TRIGGER audit_parents AFTER INSERT OR UPDATE ON parents
  FOR EACH ROW EXECUTE FUNCTION private.audit_sensitive_changes();

CREATE OR REPLACE FUNCTION public.record_manual_payment(
  p_id uuid,p_due_id uuid,p_amount integer,p_mode text,p_reference text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v_due fee_dues%ROWTYPE; v_payment payments%ROWTYPE;
BEGIN
  IF NOT private.is_admin() THEN RAISE EXCEPTION 'Owner or staff access required'; END IF;
  IF p_id IS NULL OR p_amount IS NULL OR p_amount<=0 OR p_mode IS NULL OR
    p_mode NOT IN ('cash','upi','bank_transfer','cheque') THEN RAISE EXCEPTION 'Invalid payment'; END IF;
  SELECT * INTO v_due FROM fee_dues WHERE id=p_due_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fee due not found'; END IF;
  SELECT * INTO v_payment FROM payments WHERE id=p_id;
  IF FOUND THEN
    IF v_payment.due_id IS DISTINCT FROM p_due_id OR v_payment.amount<>p_amount OR
      v_payment.mode<>p_mode OR v_payment.is_reversal OR
      v_payment.reference IS DISTINCT FROM nullif(trim(p_reference),'') THEN
      RAISE EXCEPTION 'Payment retry details changed. Reload the payment history';
    END IF;
    RETURN p_id;
  END IF;
  IF p_amount>v_due.generated_amount-v_due.paid_amount THEN RAISE EXCEPTION 'Payment exceeds outstanding balance'; END IF;
  INSERT INTO payments(id,due_id,student_id,amount,mode,reference,received_by,receipt_no)
  VALUES(p_id,p_due_id,v_due.student_id,p_amount,p_mode,nullif(trim(p_reference),''),auth.uid(),
    'PAY-'||replace(p_id::text,'-',''));
  RETURN p_id;
END $$;
REVOKE ALL ON FUNCTION public.record_manual_payment(uuid,uuid,integer,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_manual_payment(uuid,uuid,integer,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.reverse_manual_payment(p_id uuid,p_payment_id uuid,p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v_payment payments%ROWTYPE; v_existing uuid;
BEGIN
  IF NOT private.is_owner() THEN RAISE EXCEPTION 'Owner access required'; END IF;
  IF p_id IS NULL OR nullif(trim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Reversal reason is required'; END IF;
  SELECT * INTO v_payment FROM payments WHERE id=p_payment_id;
  IF NOT FOUND OR v_payment.is_reversal OR v_payment.mode='online' THEN
    RAISE EXCEPTION 'Choose an original manual payment';
  END IF;
  PERFORM 1 FROM fee_dues WHERE id=v_payment.due_id FOR UPDATE;
  SELECT id INTO v_existing FROM payments WHERE reversal_of=p_payment_id;
  IF FOUND THEN RETURN v_existing; END IF;
  INSERT INTO payments(id,due_id,student_id,amount,mode,reference,received_by,receipt_no,is_reversal,reversal_of,reversal_reason)
  VALUES(p_id,v_payment.due_id,v_payment.student_id,v_payment.amount,v_payment.mode,v_payment.reference,
    auth.uid(),'REV-'||replace(p_id::text,'-',''),true,p_payment_id,trim(p_reason));
  RETURN p_id;
END $$;
REVOKE ALL ON FUNCTION public.reverse_manual_payment(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reverse_manual_payment(uuid,uuid,text) TO authenticated;


-- SOURCE: 20261113_04_student_console.sql

-- A student account is linked by an owner, never by editable auth metadata.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS student_id uuid REFERENCES public.students(id) ON DELETE SET NULL;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_student_link_role;
ALTER TABLE public.users ADD CONSTRAINT users_student_link_role CHECK (student_id IS NULL OR role = 'student');
CREATE INDEX IF NOT EXISTS users_student_link ON public.users(student_id) WHERE student_id IS NOT NULL;

CREATE OR REPLACE FUNCTION private.is_student_of(sid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.users u WHERE u.id=(SELECT auth.uid()) AND u.role='student' AND u.status='active' AND u.student_id=sid)
$$;
CREATE OR REPLACE FUNCTION private.student_in_batch(bid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.users u JOIN public.student_batch sb ON sb.student_id=u.student_id
    WHERE u.id=(SELECT auth.uid()) AND u.role='student' AND u.status='active' AND sb.batch_id=bid
    AND sb.start_date <= (now() AT TIME ZONE 'Asia/Kolkata')::date
    AND (sb.end_date IS NULL OR sb.end_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date))
$$;
CREATE OR REPLACE FUNCTION private.student_in_class(class_name text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.users u JOIN public.students s ON s.id=u.student_id
    WHERE u.id=(SELECT auth.uid()) AND u.role='student' AND u.status='active' AND s.class=class_name)
$$;
CREATE OR REPLACE FUNCTION private.student_has_result(tid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.users u JOIN public.test_marks m ON m.student_id=u.student_id
    WHERE u.id=(SELECT auth.uid()) AND u.role='student' AND u.status='active' AND m.test_id=tid)
$$;
REVOKE ALL ON FUNCTION private.is_student_of(uuid), private.student_in_batch(uuid), private.student_in_class(text), private.student_has_result(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_student_of(uuid), private.student_in_batch(uuid), private.student_in_class(text), private.student_has_result(uuid) TO authenticated;

DROP POLICY IF EXISTS student_own_profile ON public.students;
CREATE POLICY student_own_profile ON public.students FOR SELECT TO authenticated USING (private.is_student_of(id));
DROP POLICY IF EXISTS student_own_enrollments ON public.student_batch;
CREATE POLICY student_own_enrollments ON public.student_batch FOR SELECT TO authenticated USING (private.is_student_of(student_id));
DROP POLICY IF EXISTS student_class_schedule ON public.batches;
CREATE POLICY student_class_schedule ON public.batches FOR SELECT TO authenticated USING (private.student_in_batch(id));
DROP POLICY IF EXISTS student_own_attendance ON public.attendance;
CREATE POLICY student_own_attendance ON public.attendance FOR SELECT TO authenticated USING (private.is_student_of(student_id));
DROP POLICY IF EXISTS student_own_marks ON public.test_marks;
CREATE POLICY student_own_marks ON public.test_marks FOR SELECT TO authenticated USING (private.is_student_of(student_id));
DROP POLICY IF EXISTS student_assessments ON public.tests;
CREATE POLICY student_assessments ON public.tests FOR SELECT TO authenticated USING (
  private.student_in_batch(batch_id) OR private.student_has_result(id));
DROP POLICY IF EXISTS student_learning_materials ON public.materials;
CREATE POLICY student_learning_materials ON public.materials FOR SELECT TO authenticated USING (NOT is_hidden AND private.student_in_batch(batch_id));
DROP POLICY IF EXISTS student_announcements ON public.notices;
CREATE POLICY student_announcements ON public.notices FOR SELECT TO authenticated USING (
  private.current_role()='student' AND (expires_at IS NULL OR expires_at > now()) AND (
    audience='all' OR (audience='batch' AND private.student_in_batch(batch_id)) OR (audience='class' AND private.student_in_class(class_id))));
-- Existing users_update policy limits account links to owners. No student write policy is added.

-- SOURCE: 20261113_05_account_passwords.sql

-- App metadata is server-owned. Users cannot remove the first-login requirement
-- by editing their own user_metadata or by navigating straight to a portal.
CREATE OR REPLACE FUNCTION private.password_ready() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM auth.users WHERE id=(SELECT auth.uid())
    AND COALESCE(raw_app_meta_data->>'must_change_password','false') <> 'true')
$$;
REVOKE ALL ON FUNCTION private.password_ready() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.password_ready() TO authenticated;

CREATE OR REPLACE FUNCTION private.current_role() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT role FROM public.users WHERE id=(SELECT auth.uid()) AND status='active'
    AND private.password_ready() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION private.complete_first_password_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password
    AND COALESCE(NEW.encrypted_password,'') <> '' THEN
    NEW.raw_app_meta_data := COALESCE(NEW.raw_app_meta_data,'{}'::jsonb)
      || '{"must_change_password":false}'::jsonb;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.complete_first_password_change() FROM PUBLIC;
DROP TRIGGER IF EXISTS complete_first_password_change ON auth.users;
CREATE TRIGGER complete_first_password_change BEFORE UPDATE OF encrypted_password ON auth.users
FOR EACH ROW EXECUTE FUNCTION private.complete_first_password_change();

-- Restrictive policies intersect all existing permissive policies, including
-- student read policies. The user's own profile remains readable for login.
DO $$ DECLARE target text; BEGIN
  FOR target IN SELECT tablename FROM pg_tables WHERE schemaname='public'
    AND tablename IN ('students','parents','student_parent','batches','student_batch','attendance',
    'holidays','fee_plans','fee_dues','payments','materials','notices','contact_change_requests',
    'audit_log','notifications','tests','test_marks','attendance_sync_keys','payment_orders')
  LOOP
    EXECUTE format('CREATE POLICY require_password_change ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (private.password_ready()) WITH CHECK (private.password_ready())',target);
  END LOOP;
END $$;
-- Require email on new profiles without blocking updates to legacy profiles.
CREATE OR REPLACE FUNCTION private.require_account_email() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.email IS NULL OR NEW.email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'A valid email address is required for new accounts';
  END IF;
  NEW.email := lower(trim(NEW.email));
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.require_account_email() FROM PUBLIC;
DROP TRIGGER IF EXISTS require_account_email ON public.users;
CREATE TRIGGER require_account_email BEFORE INSERT ON public.users
FOR EACH ROW EXECUTE FUNCTION private.require_account_email();


-- SOURCE: 20261115_06_student_contacts.sql

ALTER TABLE public.students ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS phone text;

-- Keep contacts and admission/guardian/enrolment writes in a single transaction.
-- The original RPC remains compatible with existing callers and records.
CREATE OR REPLACE FUNCTION public.save_student_admission(
  p_id uuid, p_create boolean, p_student jsonb, p_parent_id uuid,
  p_guardian jsonb, p_batch_ids uuid[], p_expected_updated_at timestamptz DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE
  v_id uuid;
  v_email text := lower(trim(p_student->>'email'));
  v_phone text := p_student->>'phone';
  v_existing students%ROWTYPE;
BEGIN
  IF NOT private.is_admin() THEN RAISE EXCEPTION 'Owner or staff access required'; END IF;
  IF v_email IS NULL OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Student email is required';
  END IF;
  IF v_phone IS NULL OR v_phone !~ '^\+[1-9][0-9]{7,14}$' THEN
    RAISE EXCEPTION 'Student mobile number with country code is required';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  SELECT * INTO v_existing FROM students WHERE id=p_id FOR UPDATE;
  IF p_create AND FOUND THEN
    IF v_existing.email IS DISTINCT FROM v_email OR v_existing.phone IS DISTINCT FROM v_phone THEN
      RAISE EXCEPTION 'Admission already saved. Open its profile to edit contacts';
    END IF;
    RETURN p_id;
  END IF;
  -- Login contacts must be changed in Auth as well; do not silently desynchronize.
  IF EXISTS (SELECT 1 FROM users u WHERE u.role='student' AND u.student_id=p_id
    AND (lower(u.email) IS DISTINCT FROM v_email OR u.phone IS DISTINCT FROM v_phone)) THEN
    RAISE EXCEPTION 'This student has a login. Login contact changes require an administrator account update';
  END IF;
  v_id := public.save_student_profile(p_id,p_create,p_student,p_parent_id,p_guardian,p_batch_ids,p_expected_updated_at);
  UPDATE students SET email=v_email, phone=v_phone WHERE id=v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.save_student_admission(uuid,boolean,jsonb,uuid,jsonb,uuid[],timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_student_admission(uuid,boolean,jsonb,uuid,jsonb,uuid[],timestamptz) TO authenticated;


-- Existing legacy tables may still have destructive payment FK delete actions.
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_due_id_fkey;
ALTER TABLE public.payments ADD CONSTRAINT payments_due_id_fkey FOREIGN KEY(due_id) REFERENCES public.fee_dues(id) ON DELETE RESTRICT;
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_student_id_fkey;
ALTER TABLE public.payments ADD CONSTRAINT payments_student_id_fkey FOREIGN KEY(student_id) REFERENCES public.students(id) ON DELETE RESTRICT;
DO $$ DECLARE target text; BEGIN
  FOREACH target IN ARRAY ARRAY['users','students','parents','student_parent','batches','student_batch','attendance','holidays','fee_plans','fee_dues','payments','materials','notices','contact_change_requests','audit_log','notifications','tests','test_marks','attendance_sync_keys','payment_orders'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',target);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon',target);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.%I TO authenticated',target);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role',target);
  END LOOP;
END $$;
-- Abort rather than commit any change that unexpectedly removed existing rows.
DO $$ DECLARE item record; total bigint; BEGIN
  FOR item IN SELECT * FROM tuition_upgrade_counts LOOP
    EXECUTE format('SELECT count(*) FROM public.%I',item.table_name) INTO total;
    IF total <> item.total THEN RAISE EXCEPTION 'Row count changed for %',item.table_name; END IF;
  END LOOP;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
