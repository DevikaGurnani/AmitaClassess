BEGIN;
-- A student account is linked by an owner, never by editable auth metadata.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS student_id uuid REFERENCES public.students(id) ON DELETE SET NULL;
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

CREATE POLICY student_own_profile ON public.students FOR SELECT TO authenticated USING (private.is_student_of(id));
CREATE POLICY student_own_enrollments ON public.student_batch FOR SELECT TO authenticated USING (private.is_student_of(student_id));
CREATE POLICY student_class_schedule ON public.batches FOR SELECT TO authenticated USING (private.student_in_batch(id));
CREATE POLICY student_own_attendance ON public.attendance FOR SELECT TO authenticated USING (private.is_student_of(student_id));
CREATE POLICY student_own_marks ON public.test_marks FOR SELECT TO authenticated USING (private.is_student_of(student_id));
CREATE POLICY student_assessments ON public.tests FOR SELECT TO authenticated USING (
  private.student_in_batch(batch_id) OR private.student_has_result(id));
CREATE POLICY student_learning_materials ON public.materials FOR SELECT TO authenticated USING (NOT is_hidden AND private.student_in_batch(batch_id));
CREATE POLICY student_announcements ON public.notices FOR SELECT TO authenticated USING (
  private.current_role()='student' AND (expires_at IS NULL OR expires_at > now()) AND (
    audience='all' OR (audience='batch' AND private.student_in_batch(batch_id)) OR (audience='class' AND private.student_in_class(class_id))));
-- Existing users_update policy limits account links to owners. No student write policy is added.
COMMIT;
