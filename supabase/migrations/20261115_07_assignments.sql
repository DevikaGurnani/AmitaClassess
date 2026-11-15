BEGIN;
CREATE TABLE IF NOT EXISTS public.assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.batches(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 160),
  question_text text NOT NULL DEFAULT '' CHECK(length(question_text)<=30000),
  due_at timestamptz NOT NULL,
  max_marks numeric(8,2) NOT NULL CHECK(max_marks>0 AND max_marks<=100000),
  question_path text UNIQUE, question_name text, question_mime text, question_size integer,
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(length(trim(question_text))>0 OR question_path IS NOT NULL),
  CHECK(question_path IS NULL OR (question_name IS NOT NULL AND question_mime IN ('application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document') AND question_size BETWEEN 1 AND 10485760))
);
CREATE TABLE IF NOT EXISTS public.assignment_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
  file_path text NOT NULL UNIQUE, file_name text NOT NULL, file_mime text NOT NULL CHECK(file_mime IN ('application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  file_size integer NOT NULL CHECK(file_size BETWEEN 1 AND 10485760),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  marks_awarded numeric(8,2) CHECK(marks_awarded>=0), feedback text NOT NULL DEFAULT '',
  graded_by uuid REFERENCES public.users(id), graded_at timestamptz,
  UNIQUE(assignment_id,student_id)
);
CREATE INDEX IF NOT EXISTS assignments_batch_deadline ON public.assignments(batch_id,due_at);
CREATE INDEX IF NOT EXISTS assignment_submissions_student ON public.assignment_submissions(student_id);
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_submissions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.can_view_assignment(aid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT private.is_owner() OR (private.current_role()='student' AND EXISTS (
   SELECT 1 FROM users u JOIN assignments a ON a.id=aid WHERE u.id=auth.uid() AND u.status='active' AND u.role='student'
   AND (EXISTS(SELECT 1 FROM student_batch sb WHERE sb.student_id=u.student_id AND sb.batch_id=a.batch_id
     AND sb.start_date<=(now() AT TIME ZONE 'Asia/Kolkata')::date AND (sb.end_date IS NULL OR sb.end_date>=(now() AT TIME ZONE 'Asia/Kolkata')::date))
     OR EXISTS(SELECT 1 FROM assignment_submissions s WHERE s.assignment_id=aid AND s.student_id=u.student_id))
 ))
$$;
REVOKE ALL ON FUNCTION private.can_view_assignment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_view_assignment(uuid) TO authenticated;
CREATE POLICY assignments_read ON public.assignments FOR SELECT TO authenticated USING(private.can_view_assignment(id));
CREATE POLICY assignments_create ON public.assignments FOR INSERT TO authenticated WITH CHECK(private.is_owner() AND created_by=auth.uid());
CREATE POLICY submissions_read ON public.assignment_submissions FOR SELECT TO authenticated USING(private.is_owner() OR (private.current_role()='student' AND private.is_student_of(student_id)));
REVOKE ALL ON public.assignments,public.assignment_submissions FROM anon;
GRANT SELECT,INSERT ON public.assignments TO authenticated;
GRANT SELECT ON public.assignment_submissions TO authenticated;
GRANT ALL ON public.assignments,public.assignment_submissions TO service_role;

CREATE OR REPLACE FUNCTION public.submit_assignment(p_assignment_id uuid,p_path text,p_filename text,p_mime text,p_size integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE sid uuid; target assignments%ROWTYPE; existing assignment_submissions%ROWTYPE; result_id uuid;
BEGIN
  IF private.current_role()<>'student' OR NOT private.password_ready() THEN RAISE EXCEPTION 'Student access required'; END IF;
  SELECT student_id INTO sid FROM users WHERE id=auth.uid() AND role='student' AND status='active';
  IF sid IS NULL THEN RAISE EXCEPTION 'Student profile is not linked'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_assignment_id::text||sid::text,0));
  SELECT * INTO target FROM assignments WHERE id=p_assignment_id FOR SHARE;
  IF target.id IS NULL THEN RAISE EXCEPTION 'Assignment not found'; END IF;
  IF target.due_at<clock_timestamp() THEN RAISE EXCEPTION 'The submission deadline has passed'; END IF;
  IF NOT EXISTS(SELECT 1 FROM student_batch sb JOIN students s ON s.id=sb.student_id WHERE sb.student_id=sid AND s.status='active' AND sb.batch_id=target.batch_id
    AND sb.start_date<=(now() AT TIME ZONE 'Asia/Kolkata')::date AND (sb.end_date IS NULL OR sb.end_date>=(now() AT TIME ZONE 'Asia/Kolkata')::date)) THEN RAISE EXCEPTION 'Not enrolled in this assignment batch'; END IF;
  IF p_path NOT LIKE 'submissions/'||p_assignment_id::text||'/'||sid::text||'/%' OR p_path LIKE '%..%' OR length(trim(p_filename)) NOT BETWEEN 1 AND 200
    OR p_mime NOT IN ('application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document') OR p_size NOT BETWEEN 1 AND 10485760 THEN RAISE EXCEPTION 'Invalid submission file'; END IF;
  IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='assignment-files' AND name=p_path) THEN RAISE EXCEPTION 'Upload the file before submitting'; END IF;
  SELECT * INTO existing FROM assignment_submissions WHERE assignment_id=p_assignment_id AND student_id=sid FOR UPDATE;
  IF existing.marks_awarded IS NOT NULL THEN RAISE EXCEPTION 'A graded submission cannot be replaced'; END IF;
  INSERT INTO assignment_submissions(assignment_id,student_id,file_path,file_name,file_mime,file_size)
    VALUES(p_assignment_id,sid,p_path,p_filename,p_mime,p_size)
    ON CONFLICT(assignment_id,student_id) DO UPDATE SET file_path=excluded.file_path,file_name=excluded.file_name,file_mime=excluded.file_mime,file_size=excluded.file_size,submitted_at=clock_timestamp(),updated_at=clock_timestamp()
    RETURNING id INTO result_id;
  RETURN jsonb_build_object('id',result_id,'old_path',existing.file_path,'file_path',p_path);
END $$;
REVOKE ALL ON FUNCTION public.submit_assignment(uuid,text,text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_assignment(uuid,text,text,text,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.grade_assignment_submission(p_id uuid,p_marks numeric,p_feedback text,p_expected_updated_at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE item assignment_submissions%ROWTYPE; maximum numeric;
BEGIN
  IF NOT private.is_owner() THEN RAISE EXCEPTION 'Owner access required'; END IF;
  SELECT * INTO item FROM assignment_submissions WHERE id=p_id FOR UPDATE;
  IF item.id IS NULL THEN RAISE EXCEPTION 'Submission not found'; END IF;
  IF item.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'Submission changed. Refresh before grading'; END IF;
  SELECT max_marks INTO maximum FROM assignments WHERE id=item.assignment_id;
  IF p_marks IS NULL OR p_marks<0 OR p_marks>maximum OR length(coalesce(p_feedback,''))>5000 THEN RAISE EXCEPTION 'Check marks and feedback'; END IF;
  UPDATE assignment_submissions SET marks_awarded=p_marks,feedback=coalesce(p_feedback,''),graded_by=auth.uid(),graded_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=p_id;
END $$;
REVOKE ALL ON FUNCTION public.grade_assignment_submission(uuid,numeric,text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.grade_assignment_submission(uuid,numeric,text,timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION private.can_read_assignment_file(object_path text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT private.is_owner() OR EXISTS(SELECT 1 FROM assignments a WHERE a.question_path=object_path AND private.can_view_assignment(a.id))
 OR EXISTS(SELECT 1 FROM assignment_submissions s WHERE s.file_path=object_path AND private.current_role()='student' AND private.is_student_of(s.student_id))
$$;
REVOKE ALL ON FUNCTION private.can_read_assignment_file(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_read_assignment_file(text) TO authenticated;
CREATE POLICY assignment_file_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='assignment-files' AND private.can_read_assignment_file(name));
CREATE POLICY assignment_file_read_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated USING(bucket_id<>'assignment-files' OR private.can_read_assignment_file(name));
CREATE POLICY assignment_file_anon_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO anon USING(bucket_id<>'assignment-files');
-- Server uploads are validated and authorized first. Broad pre-existing storage
-- policies must not let clients upload/overwrite/delete these private documents.
CREATE POLICY assignment_file_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(bucket_id<>'assignment-files');
CREATE POLICY assignment_file_update_guard ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING(bucket_id<>'assignment-files') WITH CHECK(bucket_id<>'assignment-files');
CREATE POLICY assignment_file_delete_guard ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING(bucket_id<>'assignment-files');
CREATE TRIGGER audit_assignments AFTER INSERT OR UPDATE OR DELETE ON public.assignments FOR EACH ROW EXECUTE FUNCTION private.audit_sensitive_changes();
CREATE TRIGGER audit_assignment_submissions AFTER INSERT OR UPDATE OR DELETE ON public.assignment_submissions FOR EACH ROW EXECUTE FUNCTION private.audit_sensitive_changes();
NOTIFY pgrst,'reload schema';
COMMIT;
