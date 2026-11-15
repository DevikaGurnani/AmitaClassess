BEGIN;
CREATE TABLE public.question_bank_imports(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),class_name text NOT NULL CHECK(length(trim(class_name)) BETWEEN 1 AND 40),file_name text NOT NULL,storage_path text UNIQUE NOT NULL,created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.question_bank_questions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),import_id uuid REFERENCES question_bank_imports(id) ON DELETE RESTRICT,
 class_name text NOT NULL CHECK(length(trim(class_name)) BETWEEN 1 AND 40),subject text NOT NULL CHECK(length(trim(subject)) BETWEEN 1 AND 100),chapter text NOT NULL DEFAULT '' CHECK(length(chapter)<=150),
 question text NOT NULL CHECK(length(trim(question)) BETWEEN 1 AND 6000),marks numeric(8,2) NOT NULL CHECK(marks>0 AND marks<=1000),
 options jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(options)='array' AND jsonb_array_length(options)<=6),answer text NOT NULL DEFAULT '' CHECK(length(answer)<=6000),
 created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX question_bank_class_subject ON question_bank_questions(class_name,subject,chapter,created_at DESC);
CREATE TABLE public.question_papers(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),class_name text NOT NULL CHECK(length(trim(class_name)) BETWEEN 1 AND 40),subject text NOT NULL CHECK(length(trim(subject)) BETWEEN 1 AND 100),title text NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 160),
 exam_date date,duration_minutes integer NOT NULL CHECK(duration_minutes BETWEEN 1 AND 600),instructions text NOT NULL DEFAULT '' CHECK(length(instructions)<=4000),
 questions jsonb NOT NULL CHECK(jsonb_typeof(questions)='array' AND jsonb_array_length(questions) BETWEEN 1 AND 100),total_marks numeric(10,2) NOT NULL CHECK(total_marks>0 AND total_marks<=10000),
 created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE question_bank_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_bank_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_papers ENABLE ROW LEVEL SECURITY;
CREATE POLICY bank_imports_owner ON question_bank_imports FOR ALL TO authenticated USING(private.is_owner()) WITH CHECK(private.is_owner() AND created_by=auth.uid());
CREATE POLICY bank_questions_owner ON question_bank_questions FOR ALL TO authenticated USING(private.is_owner()) WITH CHECK(private.is_owner() AND created_by=auth.uid());
CREATE POLICY papers_owner ON question_papers FOR ALL TO authenticated USING(private.is_owner()) WITH CHECK(private.is_owner() AND created_by=auth.uid());
REVOKE ALL ON question_bank_imports,question_bank_questions,question_papers FROM anon,authenticated;
GRANT SELECT,INSERT ON question_bank_imports,question_bank_questions TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON question_papers TO authenticated;
GRANT ALL ON question_bank_imports,question_bank_questions,question_papers TO service_role;
CREATE TRIGGER audit_question_imports AFTER INSERT OR UPDATE OR DELETE ON question_bank_imports FOR EACH ROW EXECUTE FUNCTION private.audit_sensitive_changes();
CREATE TRIGGER audit_question_bank AFTER INSERT OR UPDATE OR DELETE ON question_bank_questions FOR EACH ROW EXECUTE FUNCTION private.audit_sensitive_changes();
CREATE TRIGGER audit_question_papers AFTER INSERT OR UPDATE OR DELETE ON question_papers FOR EACH ROW EXECUTE FUNCTION private.audit_sensitive_changes();
CREATE FUNCTION public.import_question_bank(p_id uuid,p_class text,p_file_name text,p_storage_path text,p_questions jsonb) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE item jsonb;total integer:=0;BEGIN
 IF NOT private.is_owner() THEN RAISE EXCEPTION 'Only the owner can import questions'; END IF;
 IF p_questions IS NULL OR jsonb_typeof(p_questions)<>'array' THEN RAISE EXCEPTION 'Invalid question import'; END IF;
 IF jsonb_array_length(p_questions) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Import 1 to 500 questions at a time'; END IF;
 INSERT INTO question_bank_imports(id,class_name,file_name,storage_path,created_by) VALUES(p_id,p_class,p_file_name,p_storage_path,auth.uid());
 FOR item IN SELECT value FROM jsonb_array_elements(p_questions) LOOP
  INSERT INTO question_bank_questions(import_id,class_name,subject,chapter,question,marks,options,answer,created_by) VALUES(p_id,p_class,item->>'subject',coalesce(item->>'chapter',''),item->>'question',(item->>'marks')::numeric,coalesce(item->'options','[]'),coalesce(item->>'answer',''),auth.uid());total:=total+1;
 END LOOP;RETURN total;
END $$;
CREATE FUNCTION public.question_bank_catalog() RETURNS TABLE(class_name text,subject text,chapter text) LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$ SELECT DISTINCT q.class_name,q.subject,q.chapter FROM question_bank_questions q WHERE private.is_owner() $$;
REVOKE ALL ON FUNCTION public.import_question_bank(uuid,text,text,text,jsonb),public.question_bank_catalog() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.import_question_bank(uuid,text,text,text,jsonb),public.question_bank_catalog() TO authenticated;
CREATE POLICY bank_source_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='question-bank' AND private.is_owner());
CREATE POLICY bank_source_read_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated USING(bucket_id<>'question-bank' OR private.is_owner());
CREATE POLICY bank_source_anon_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO anon USING(bucket_id<>'question-bank');
CREATE POLICY bank_source_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(bucket_id<>'question-bank');
CREATE POLICY bank_source_update_guard ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING(bucket_id<>'question-bank') WITH CHECK(bucket_id<>'question-bank');
CREATE POLICY bank_source_delete_guard ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING(bucket_id<>'question-bank');
NOTIFY pgrst,'reload schema';
COMMIT;
