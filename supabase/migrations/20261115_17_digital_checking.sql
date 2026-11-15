BEGIN;
ALTER TABLE assignments ADD COLUMN answer_upload_mode text NOT NULL DEFAULT 'document' CHECK(answer_upload_mode IN ('document','scanned_pdf'));
ALTER TABLE tests ADD COLUMN accept_answer_uploads boolean NOT NULL DEFAULT false,ADD COLUMN answer_upload_mode text NOT NULL DEFAULT 'document' CHECK(answer_upload_mode IN ('document','scanned_pdf')),ADD COLUMN answer_due_at timestamptz;
CREATE TABLE test_answer_sheets(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),test_id uuid NOT NULL REFERENCES tests(id) ON DELETE RESTRICT,student_id uuid NOT NULL REFERENCES students(id) ON DELETE RESTRICT,file_path text NOT NULL UNIQUE,file_name text NOT NULL,file_mime text NOT NULL CHECK(file_mime IN ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document')),file_size integer NOT NULL CHECK(file_size BETWEEN 1 AND 10485760),submitted_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(test_id,student_id));
CREATE TABLE submission_reviews(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),assignment_submission_id uuid REFERENCES assignment_submissions(id) ON DELETE CASCADE UNIQUE,test_submission_id uuid REFERENCES test_answer_sheets(id) ON DELETE CASCADE UNIQUE,source_path text NOT NULL,annotations jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(annotations)='array' AND jsonb_array_length(annotations)<=1500),marks numeric(8,2),feedback text NOT NULL DEFAULT '' CHECK(length(feedback)<=5000),status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),reviewed_path text UNIQUE,reviewer_id uuid NOT NULL REFERENCES users(id),updated_at timestamptz NOT NULL DEFAULT now(),CHECK(num_nonnulls(assignment_submission_id,test_submission_id)=1),CHECK(status<>'published' OR (reviewed_path IS NOT NULL AND marks IS NOT NULL)));
CREATE FUNCTION private.can_manage_test(tid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT private.is_owner() OR EXISTS(SELECT 1 FROM tests t WHERE t.id=tid AND private.teaches_subject(t.batch_id,t.subject)) $$;
CREATE FUNCTION private.answer_student(k text,sid uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT student_id FROM assignment_submissions WHERE k='assignment' AND id=sid UNION ALL SELECT student_id FROM test_answer_sheets WHERE k='test' AND id=sid $$;
CREATE FUNCTION private.can_manage_answer(k text,sid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT CASE WHEN k='assignment' THEN EXISTS(SELECT 1 FROM assignment_submissions s WHERE s.id=sid AND private.can_manage_assignment(s.assignment_id)) WHEN k='test' THEN EXISTS(SELECT 1 FROM test_answer_sheets s WHERE s.id=sid AND private.can_manage_test(s.test_id)) ELSE false END $$;
CREATE FUNCTION private.can_read_answer(k text,sid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT private.can_manage_answer(k,sid) OR private.is_student_of(private.answer_student(k,sid)) OR private.is_parent_of(private.answer_student(k,sid)) $$;
ALTER TABLE test_answer_sheets ENABLE ROW LEVEL SECURITY;ALTER TABLE submission_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY test_sheets_read ON test_answer_sheets FOR SELECT TO authenticated USING(private.can_read_answer('test',id));
CREATE POLICY review_read ON submission_reviews FOR SELECT TO authenticated USING(private.can_manage_answer(CASE WHEN assignment_submission_id IS NOT NULL THEN 'assignment' ELSE 'test' END,coalesce(assignment_submission_id,test_submission_id)) OR (status='published' AND private.can_read_answer(CASE WHEN assignment_submission_id IS NOT NULL THEN 'assignment' ELSE 'test' END,coalesce(assignment_submission_id,test_submission_id))));
GRANT SELECT ON test_answer_sheets,submission_reviews TO authenticated;GRANT ALL ON test_answer_sheets,submission_reviews TO service_role;
REVOKE ALL ON FUNCTION private.can_manage_test(uuid),private.answer_student(text,uuid),private.can_manage_answer(text,uuid),private.can_read_answer(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_manage_test(uuid),private.can_manage_answer(text,uuid),private.can_read_answer(text,uuid) TO authenticated;
CREATE FUNCTION public.submit_test_answer(p_test uuid,p_path text,p_name text,p_mime text,p_size integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE sid uuid;target tests%ROWTYPE;old test_answer_sheets%ROWTYPE;result uuid;BEGIN
 IF private.current_role()<>'student' THEN RAISE EXCEPTION 'Student access required'; END IF;
 SELECT student_id INTO sid FROM users WHERE id=auth.uid();SELECT * INTO target FROM tests WHERE id=p_test FOR SHARE;
 IF sid IS NULL OR target.id IS NULL OR NOT target.accept_answer_uploads OR (target.answer_due_at IS NOT NULL AND target.answer_due_at<now()) OR NOT private.student_in_batch(target.batch_id) THEN RAISE EXCEPTION 'Answer upload is not available'; END IF;
 IF p_path NOT LIKE 'tests/'||p_test::text||'/'||sid::text||'/%' OR p_path LIKE '%..%' OR p_size NOT BETWEEN 1 AND 10485760 OR p_mime NOT IN ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document') OR (target.answer_upload_mode='scanned_pdf' AND p_mime<>'application/pdf') OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='answer-sheets' AND name=p_path) THEN RAISE EXCEPTION 'Invalid answer sheet upload'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_test::text||sid::text,0));SELECT * INTO old FROM test_answer_sheets WHERE test_id=p_test AND student_id=sid FOR UPDATE;
 IF EXISTS(SELECT 1 FROM submission_reviews WHERE test_submission_id=old.id AND status='published') THEN RAISE EXCEPTION 'A checked answer sheet cannot be replaced'; END IF;
 INSERT INTO test_answer_sheets(test_id,student_id,file_path,file_name,file_mime,file_size) VALUES(p_test,sid,p_path,left(p_name,200),p_mime,p_size) ON CONFLICT(test_id,student_id) DO UPDATE SET file_path=excluded.file_path,file_name=excluded.file_name,file_mime=excluded.file_mime,file_size=excluded.file_size,submitted_at=clock_timestamp(),updated_at=clock_timestamp() RETURNING id INTO result;
 RETURN jsonb_build_object('id',result,'old_path',old.file_path);
END $$;
CREATE FUNCTION public.save_submission_review(p_kind text,p_submission uuid,p_source text,p_annotations jsonb,p_marks numeric,p_feedback text,p_publish boolean,p_path text,p_expected timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE aid uuid;tid uuid;sid uuid;actual_path text;maximum numeric;existing submission_reviews%ROWTYPE;result submission_reviews%ROWTYPE;BEGIN
 IF NOT private.can_manage_answer(p_kind,p_submission) THEN RAISE EXCEPTION 'Teaching access required'; END IF;
 IF p_kind='assignment' THEN SELECT assignment_id,student_id,file_path INTO aid,sid,actual_path FROM assignment_submissions WHERE id=p_submission FOR UPDATE;SELECT max_marks INTO maximum FROM assignments WHERE id=aid;
 ELSE SELECT test_id,student_id,file_path INTO tid,sid,actual_path FROM test_answer_sheets WHERE id=p_submission FOR UPDATE;SELECT max_marks INTO maximum FROM tests WHERE id=tid;END IF;
 IF actual_path IS DISTINCT FROM p_source THEN RAISE EXCEPTION 'Student replaced this answer sheet. Reload before checking'; END IF;
 SELECT * INTO existing FROM submission_reviews WHERE assignment_submission_id=CASE WHEN p_kind='assignment' THEN p_submission ELSE NULL END OR test_submission_id=CASE WHEN p_kind='test' THEN p_submission ELSE NULL END FOR UPDATE;
 IF (existing.id IS NOT NULL AND existing.updated_at IS DISTINCT FROM p_expected) OR (existing.id IS NULL AND p_expected IS NOT NULL) THEN RAISE EXCEPTION 'Review changed. Reload before saving'; END IF;
 IF existing.status='published' AND NOT p_publish THEN RAISE EXCEPTION 'Publish an updated checked copy instead of overwriting a published review with a draft'; END IF;
 IF p_annotations IS NULL OR jsonb_typeof(p_annotations)<>'array' OR jsonb_array_length(p_annotations)>1500 OR length(coalesce(p_feedback,''))>5000 OR (p_marks IS NOT NULL AND (p_marks<0 OR p_marks>maximum)) OR (p_publish AND p_marks IS NULL) THEN RAISE EXCEPTION 'Check annotations, total marks and feedback'; END IF;
 IF p_publish AND (p_path NOT LIKE 'checked/'||p_kind||'/'||p_submission::text||'/%' OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='answer-sheets' AND name=p_path)) THEN RAISE EXCEPTION 'Generate the checked PDF before publishing'; END IF;
 IF existing.id IS NULL THEN INSERT INTO submission_reviews(assignment_submission_id,test_submission_id,source_path,annotations,marks,feedback,status,reviewed_path,reviewer_id) VALUES(CASE WHEN p_kind='assignment' THEN p_submission END,CASE WHEN p_kind='test' THEN p_submission END,p_source,p_annotations,p_marks,coalesce(p_feedback,''),CASE WHEN p_publish THEN 'published' ELSE 'draft' END,p_path,auth.uid()) RETURNING * INTO result;
 ELSE UPDATE submission_reviews SET source_path=p_source,annotations=p_annotations,marks=p_marks,feedback=coalesce(p_feedback,''),status=CASE WHEN p_publish THEN 'published' ELSE 'draft' END,reviewed_path=p_path,reviewer_id=auth.uid(),updated_at=clock_timestamp() WHERE id=existing.id RETURNING * INTO result;END IF;
 IF p_publish THEN IF p_kind='assignment' THEN UPDATE assignment_submissions SET marks_awarded=p_marks,feedback=coalesce(p_feedback,''),graded_by=auth.uid(),graded_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=p_submission;
 ELSE INSERT INTO test_marks(test_id,student_id,marks,remarks,entered_by) VALUES(tid,sid,p_marks,p_feedback,auth.uid()) ON CONFLICT(test_id,student_id) DO UPDATE SET marks=excluded.marks,remarks=excluded.remarks,entered_by=auth.uid(),updated_at=clock_timestamp();END IF;END IF;
 RETURN jsonb_build_object('review',to_jsonb(result),'old_path',existing.reviewed_path);
END $$;
REVOKE ALL ON FUNCTION public.submit_test_answer(uuid,text,text,text,integer),public.save_submission_review(text,uuid,text,jsonb,numeric,text,boolean,text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_test_answer(uuid,text,text,text,integer),public.save_submission_review(text,uuid,text,jsonb,numeric,text,boolean,text,timestamptz) TO authenticated;
CREATE FUNCTION private.can_read_answer_object(object_path text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT EXISTS(SELECT 1 FROM test_answer_sheets s WHERE s.file_path=object_path AND private.can_read_answer('test',s.id)) OR EXISTS(SELECT 1 FROM submission_reviews r WHERE r.reviewed_path=object_path AND (r.status='published') AND private.can_read_answer(CASE WHEN r.assignment_submission_id IS NOT NULL THEN 'assignment' ELSE 'test' END,coalesce(r.assignment_submission_id,r.test_submission_id))) $$;
REVOKE ALL ON FUNCTION private.can_read_answer_object(text) FROM PUBLIC;GRANT EXECUTE ON FUNCTION private.can_read_answer_object(text) TO authenticated;
CREATE POLICY answer_storage_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='answer-sheets' AND private.can_read_answer_object(name));
CREATE POLICY answer_storage_read_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated USING(bucket_id<>'answer-sheets' OR private.can_read_answer_object(name));
CREATE POLICY answer_storage_anon_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO anon USING(bucket_id<>'answer-sheets');
CREATE POLICY answer_storage_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(bucket_id<>'answer-sheets');
CREATE POLICY answer_storage_update_guard ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING(bucket_id<>'answer-sheets') WITH CHECK(bucket_id<>'answer-sheets');
CREATE POLICY answer_storage_delete_guard ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING(bucket_id<>'answer-sheets');
CREATE TRIGGER audit_test_sheets AFTER INSERT OR UPDATE OR DELETE ON test_answer_sheets FOR EACH ROW EXECUTE FUNCTION private.audit_sensitive_changes();
CREATE TRIGGER audit_submission_reviews AFTER INSERT OR UPDATE OR DELETE ON submission_reviews FOR EACH ROW EXECUTE FUNCTION private.audit_sensitive_changes();
CREATE OR REPLACE FUNCTION public.submit_assignment(p_assignment_id uuid,p_path text,p_filename text,p_mime text,p_size integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE sid uuid; target assignments%ROWTYPE; existing assignment_submissions%ROWTYPE; result_id uuid;
BEGIN
  IF private.current_role()<>'student' OR NOT private.password_ready() THEN RAISE EXCEPTION 'Student access required'; END IF;
  SELECT student_id INTO sid FROM users WHERE id=auth.uid() AND role='student' AND status='active';
  IF sid IS NULL THEN RAISE EXCEPTION 'Student profile is not linked'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_assignment_id::text||sid::text,0));
  SELECT * INTO target FROM assignments WHERE id=p_assignment_id FOR SHARE;
  IF target.id IS NULL THEN RAISE EXCEPTION 'Assignment not found'; END IF; IF target.student_ids IS NOT NULL AND NOT(sid=ANY(target.student_ids)) THEN RAISE EXCEPTION 'This assignment is not allocated to you'; END IF;
  IF target.due_at<clock_timestamp() THEN RAISE EXCEPTION 'The submission deadline has passed'; END IF;
  IF NOT EXISTS(SELECT 1 FROM student_batch sb JOIN students s ON s.id=sb.student_id WHERE sb.student_id=sid AND s.status='active' AND sb.batch_id=target.batch_id
    AND sb.start_date<=(now() AT TIME ZONE 'Asia/Kolkata')::date AND (sb.end_date IS NULL OR sb.end_date>=(now() AT TIME ZONE 'Asia/Kolkata')::date)) THEN RAISE EXCEPTION 'Not enrolled in this assignment batch'; END IF;
  IF p_path NOT LIKE 'submissions/'||p_assignment_id::text||'/'||sid::text||'/%' OR p_path LIKE '%..%' OR length(trim(p_filename)) NOT BETWEEN 1 AND 200
    OR p_mime NOT IN ('application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document') OR p_size NOT BETWEEN 1 AND 10485760 THEN RAISE EXCEPTION 'Invalid submission file'; END IF;
  IF target.answer_upload_mode='scanned_pdf' AND p_mime<>'application/pdf' THEN RAISE EXCEPTION 'Upload a scanned PDF answer sheet'; END IF;
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



NOTIFY pgrst,'reload schema';
COMMIT;
