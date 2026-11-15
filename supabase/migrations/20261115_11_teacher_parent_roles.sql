BEGIN;
CREATE TABLE public.subjects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL UNIQUE CHECK(length(trim(name)) BETWEEN 1 AND 100),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.batch_subjects(batch_id uuid REFERENCES batches(id) ON DELETE CASCADE,subject_id uuid REFERENCES subjects(id) ON DELETE RESTRICT,PRIMARY KEY(batch_id,subject_id));
CREATE TABLE public.teacher_batch_subjects(teacher_id uuid REFERENCES users(id) ON DELETE CASCADE,batch_id uuid,subject_id uuid,id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,PRIMARY KEY(teacher_id,batch_id,subject_id),FOREIGN KEY(batch_id,subject_id) REFERENCES batch_subjects(batch_id,subject_id) ON DELETE CASCADE);
INSERT INTO subjects(name) SELECT DISTINCT trim(value) FROM batches CROSS JOIN LATERAL unnest(subjects) value WHERE length(trim(value)) BETWEEN 1 AND 100 ON CONFLICT DO NOTHING;
INSERT INTO batch_subjects SELECT DISTINCT b.id,s.id FROM batches b CROSS JOIN LATERAL unnest(b.subjects) value JOIN subjects s ON s.name=trim(value) ON CONFLICT DO NOTHING;
INSERT INTO teacher_batch_subjects SELECT b.teacher_id,bs.batch_id,bs.subject_id FROM batches b JOIN batch_subjects bs ON bs.batch_id=b.id JOIN users u ON u.id=b.teacher_id AND u.role='teacher' AND u.status='active' ON CONFLICT DO NOTHING;
CREATE FUNCTION private.sync_batch_subject_catalog() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 INSERT INTO subjects(name) SELECT DISTINCT trim(value) FROM unnest(NEW.subjects) value WHERE length(trim(value)) BETWEEN 1 AND 100 ON CONFLICT DO NOTHING;
 DELETE FROM batch_subjects bs WHERE bs.batch_id=NEW.id AND NOT EXISTS(SELECT 1 FROM subjects s WHERE s.id=bs.subject_id AND s.name=ANY(SELECT trim(value) FROM unnest(NEW.subjects) value));
 INSERT INTO batch_subjects SELECT NEW.id,s.id FROM subjects s WHERE s.name=ANY(SELECT trim(value) FROM unnest(NEW.subjects) value) ON CONFLICT DO NOTHING;
 IF TG_OP='INSERT' OR NEW.teacher_id IS DISTINCT FROM OLD.teacher_id THEN
  IF TG_OP='UPDATE' THEN DELETE FROM teacher_batch_subjects WHERE batch_id=NEW.id AND teacher_id=OLD.teacher_id; END IF;
  IF EXISTS(SELECT 1 FROM users WHERE id=NEW.teacher_id AND role='teacher' AND status='active') THEN INSERT INTO teacher_batch_subjects SELECT NEW.teacher_id,bs.batch_id,bs.subject_id FROM batch_subjects bs WHERE bs.batch_id=NEW.id ON CONFLICT DO NOTHING; END IF;
 END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.sync_batch_subject_catalog() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER sync_batch_subject_catalog AFTER INSERT OR UPDATE OF subjects,teacher_id ON batches FOR EACH ROW EXECUTE FUNCTION private.sync_batch_subject_catalog();
CREATE OR REPLACE FUNCTION private.teaches_batch(bid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT private.current_role()='teacher' AND EXISTS(SELECT 1 FROM teacher_batch_subjects t JOIN batches b ON b.id=t.batch_id WHERE t.teacher_id=auth.uid() AND t.batch_id=bid AND b.is_active) $$;
CREATE OR REPLACE FUNCTION private.teaches_student(sid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT private.current_role()='teacher' AND EXISTS(SELECT 1 FROM student_batch sb WHERE sb.student_id=sid AND private.teaches_batch(sb.batch_id) AND sb.start_date<=(now() AT TIME ZONE 'Asia/Kolkata')::date AND (sb.end_date IS NULL OR sb.end_date>=(now() AT TIME ZONE 'Asia/Kolkata')::date)) $$;
CREATE FUNCTION private.teaches_subject(bid uuid,subject_name text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT private.current_role()='teacher' AND EXISTS(SELECT 1 FROM teacher_batch_subjects t JOIN subjects s ON s.id=t.subject_id JOIN batches b ON b.id=t.batch_id WHERE t.teacher_id=auth.uid() AND t.batch_id=bid AND s.name=subject_name AND b.is_active) $$;
CREATE FUNCTION private.teaches_class_subject(cname text,sname text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT EXISTS(SELECT 1 FROM batches b WHERE b.class=cname AND b.is_active AND private.teaches_subject(b.id,sname)) $$;
REVOKE ALL ON FUNCTION private.teaches_subject(uuid,text),private.teaches_class_subject(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.teaches_subject(uuid,text),private.teaches_class_subject(text,text) TO authenticated;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;ALTER TABLE batch_subjects ENABLE ROW LEVEL SECURITY;ALTER TABLE teacher_batch_subjects ENABLE ROW LEVEL SECURITY;
CREATE POLICY subjects_read ON subjects FOR SELECT TO authenticated USING(private.is_admin() OR EXISTS(SELECT 1 FROM batch_subjects bs WHERE bs.subject_id=subjects.id));
CREATE POLICY subjects_owner_write ON subjects FOR ALL TO authenticated USING(private.is_owner()) WITH CHECK(private.is_owner());
CREATE POLICY batch_subjects_read ON batch_subjects FOR SELECT TO authenticated USING(private.is_admin() OR private.teaches_batch(batch_id) OR private.student_in_batch(batch_id) OR private.is_parent_in_batch(batch_id));
CREATE POLICY teacher_scopes_read ON teacher_batch_subjects FOR SELECT TO authenticated USING(private.is_owner() OR (private.current_role()='teacher' AND teacher_id=auth.uid()));
GRANT SELECT ON subjects,batch_subjects,teacher_batch_subjects TO authenticated;GRANT INSERT,UPDATE ON subjects TO authenticated;GRANT ALL ON subjects,batch_subjects,teacher_batch_subjects TO service_role;
CREATE FUNCTION public.set_teacher_batch_subjects(p_teacher uuid,p_batch uuid,p_subjects uuid[]) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF NOT private.is_owner() THEN RAISE EXCEPTION 'Owner access required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM users WHERE id=p_teacher AND role='teacher' AND status='active') OR NOT EXISTS(SELECT 1 FROM batches WHERE id=p_batch) THEN RAISE EXCEPTION 'Choose a teacher and batch'; END IF;
 IF p_subjects IS NULL OR cardinality(p_subjects)>100 OR EXISTS(SELECT 1 FROM unnest(p_subjects) value WHERE NOT EXISTS(SELECT 1 FROM batch_subjects bs WHERE bs.batch_id=p_batch AND bs.subject_id=value)) THEN RAISE EXCEPTION 'Choose subjects belonging to this batch'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_teacher::text||p_batch::text,0));
 DELETE FROM teacher_batch_subjects WHERE teacher_id=p_teacher AND batch_id=p_batch;
 INSERT INTO teacher_batch_subjects SELECT DISTINCT p_teacher,p_batch,value FROM unnest(p_subjects) value;
END $$;
CREATE FUNCTION public.set_parent_children(p_parent_user uuid,p_students uuid[]) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE person users%ROWTYPE;pid uuid;BEGIN
 IF NOT private.is_owner() THEN RAISE EXCEPTION 'Owner access required'; END IF;
 SELECT * INTO person FROM users WHERE id=p_parent_user AND role='parent' AND status='active';IF person.id IS NULL OR p_students IS NULL OR cardinality(p_students)>100 THEN RAISE EXCEPTION 'Choose an active parent and children'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(p_students) value WHERE NOT EXISTS(SELECT 1 FROM students WHERE id=value)) THEN RAISE EXCEPTION 'Unknown student'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_parent_user::text,0));
 SELECT id INTO pid FROM parents WHERE user_id=p_parent_user FOR UPDATE;
 IF pid IS NULL THEN INSERT INTO parents(user_id,name,relation,phone,email) VALUES(person.id,person.name,'guardian',person.phone,person.email) RETURNING id INTO pid; END IF;
 DELETE FROM student_parent WHERE parent_id=pid AND NOT(student_id=ANY(p_students));
 INSERT INTO student_parent(student_id,parent_id,relation,is_primary) SELECT DISTINCT value,pid,'guardian',false FROM unnest(p_students) value ON CONFLICT DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.set_teacher_batch_subjects(uuid,uuid,uuid[]),public.set_parent_children(uuid,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_teacher_batch_subjects(uuid,uuid,uuid[]),public.set_parent_children(uuid,uuid[]) TO authenticated;
ALTER TABLE assignments ADD COLUMN subject_id uuid REFERENCES subjects(id),ADD COLUMN student_ids uuid[];
UPDATE assignments a SET subject_id=(SELECT min(bs.subject_id::text)::uuid FROM batch_subjects bs WHERE bs.batch_id=a.batch_id HAVING count(*)=1);
CREATE FUNCTION private.can_manage_assignment(aid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT private.is_owner() OR EXISTS(SELECT 1 FROM assignments a JOIN subjects s ON s.id=a.subject_id WHERE a.id=aid AND private.teaches_subject(a.batch_id,s.name)) $$;
CREATE FUNCTION private.assignment_is_for(aid uuid,sid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT EXISTS(SELECT 1 FROM assignments a WHERE a.id=aid AND (a.student_ids IS NULL OR sid=ANY(a.student_ids)) AND (EXISTS(SELECT 1 FROM student_batch sb WHERE sb.batch_id=a.batch_id AND sb.student_id=sid AND sb.start_date<=(now() AT TIME ZONE 'Asia/Kolkata')::date AND (sb.end_date IS NULL OR sb.end_date>=(now() AT TIME ZONE 'Asia/Kolkata')::date)) OR EXISTS(SELECT 1 FROM assignment_submissions s WHERE s.assignment_id=aid AND s.student_id=sid))) $$;
CREATE OR REPLACE FUNCTION private.can_view_assignment(aid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT private.can_manage_assignment(aid) OR (private.current_role()='student' AND EXISTS(SELECT 1 FROM users u WHERE u.id=auth.uid() AND private.assignment_is_for(aid,u.student_id))) OR (private.current_role()='parent' AND EXISTS(SELECT 1 FROM student_parent sp JOIN parents p ON p.id=sp.parent_id WHERE p.user_id=auth.uid() AND private.assignment_is_for(aid,sp.student_id))) $$;
CREATE FUNCTION private.validate_assignment_scope() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF NEW.subject_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM batch_subjects WHERE batch_id=NEW.batch_id AND subject_id=NEW.subject_id) THEN RAISE EXCEPTION 'Subject does not belong to batch'; END IF;
 IF NEW.student_ids IS NOT NULL AND (cardinality(NEW.student_ids) NOT BETWEEN 1 AND 5000 OR EXISTS(SELECT 1 FROM unnest(NEW.student_ids) value WHERE NOT EXISTS(SELECT 1 FROM student_batch sb JOIN students s ON s.id=sb.student_id WHERE sb.batch_id=NEW.batch_id AND sb.student_id=value AND s.status='active' AND sb.start_date<=(now() AT TIME ZONE 'Asia/Kolkata')::date AND (sb.end_date IS NULL OR sb.end_date>=(now() AT TIME ZONE 'Asia/Kolkata')::date)))) THEN RAISE EXCEPTION 'Select current enrolled students only'; END IF;RETURN NEW;
END $$;
CREATE TRIGGER assignment_scope BEFORE INSERT OR UPDATE ON assignments FOR EACH ROW EXECUTE FUNCTION private.validate_assignment_scope();
DROP POLICY assignments_create ON assignments;
CREATE POLICY assignments_create ON assignments FOR INSERT TO authenticated WITH CHECK(created_by=auth.uid() AND (private.is_owner() OR EXISTS(SELECT 1 FROM subjects s WHERE s.id=subject_id AND private.teaches_subject(batch_id,s.name))));
DROP POLICY submissions_read ON assignment_submissions;
CREATE POLICY submissions_read ON assignment_submissions FOR SELECT TO authenticated USING(private.can_manage_assignment(assignment_id) OR (private.current_role()='student' AND private.is_student_of(student_id)) OR private.is_parent_of(student_id));
CREATE OR REPLACE FUNCTION private.can_read_assignment_file(object_path text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT private.is_owner() OR EXISTS(SELECT 1 FROM assignments a WHERE a.question_path=object_path AND private.can_view_assignment(a.id)) OR EXISTS(SELECT 1 FROM assignment_submissions s WHERE s.file_path=object_path AND (private.can_manage_assignment(s.assignment_id) OR private.is_student_of(s.student_id) OR private.is_parent_of(s.student_id))) $$;
REVOKE ALL ON FUNCTION private.can_manage_assignment(uuid),private.assignment_is_for(uuid,uuid),private.validate_assignment_scope() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_manage_assignment(uuid),private.assignment_is_for(uuid,uuid) TO authenticated;
CREATE POLICY teacher_bank_read ON question_bank_questions FOR SELECT TO authenticated USING(private.teaches_class_subject(class_name,subject));
CREATE POLICY teacher_papers ON question_papers FOR ALL TO authenticated USING(created_by=auth.uid() AND private.teaches_class_subject(class_name,subject)) WITH CHECK(created_by=auth.uid() AND private.teaches_class_subject(class_name,subject));
DROP FUNCTION public.question_bank_catalog();
CREATE FUNCTION public.question_bank_catalog() RETURNS TABLE(class_name text,subject text,chapter text) LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$ SELECT DISTINCT q.class_name,q.subject,q.chapter FROM question_bank_questions q $$;
REVOKE ALL ON FUNCTION public.question_bank_catalog() FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.question_bank_catalog() TO authenticated;
CREATE POLICY tests_subject_guard ON tests AS RESTRICTIVE FOR ALL TO authenticated USING(private.current_role()<>'teacher' OR private.teaches_subject(batch_id,subject)) WITH CHECK(private.current_role()<>'teacher' OR private.teaches_subject(batch_id,subject));
CREATE POLICY marks_subject_guard ON test_marks AS RESTRICTIVE FOR ALL TO authenticated USING(private.current_role()<>'teacher' OR EXISTS(SELECT 1 FROM tests t WHERE t.id=test_id AND private.teaches_subject(t.batch_id,t.subject))) WITH CHECK(private.current_role()<>'teacher' OR EXISTS(SELECT 1 FROM tests t WHERE t.id=test_id AND private.teaches_subject(t.batch_id,t.subject)));
CREATE TRIGGER audit_teacher_scopes AFTER INSERT OR UPDATE OR DELETE ON teacher_batch_subjects FOR EACH ROW EXECUTE FUNCTION private.audit_sensitive_changes();
CREATE OR REPLACE FUNCTION public.grade_assignment_submission(p_id uuid,p_marks numeric,p_feedback text,p_expected_updated_at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE item assignment_submissions%ROWTYPE; maximum numeric;
BEGIN
  
  SELECT * INTO item FROM assignment_submissions WHERE id=p_id FOR UPDATE;
  IF item.id IS NULL OR NOT private.can_manage_assignment(item.assignment_id) THEN RAISE EXCEPTION 'Submission not available for grading'; END IF;
  IF item.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'Submission changed. Refresh before grading'; END IF;
  SELECT max_marks INTO maximum FROM assignments WHERE id=item.assignment_id;
  IF p_marks IS NULL OR p_marks<0 OR p_marks>maximum OR length(coalesce(p_feedback,''))>5000 THEN RAISE EXCEPTION 'Check marks and feedback'; END IF;
  UPDATE assignment_submissions SET marks_awarded=p_marks,feedback=coalesce(p_feedback,''),graded_by=auth.uid(),graded_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=p_id;
END $$;
REVOKE ALL ON FUNCTION public.grade_assignment_submission(uuid,numeric,text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.grade_assignment_submission(uuid,numeric,text,timestamptz) TO authenticated;


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
