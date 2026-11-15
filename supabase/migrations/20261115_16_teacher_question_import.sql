BEGIN;
CREATE POLICY teacher_bank_import_create ON question_bank_imports FOR INSERT TO authenticated WITH CHECK(created_by=auth.uid() AND private.current_role()='teacher' AND EXISTS(SELECT 1 FROM batches b WHERE b.class=class_name AND private.teaches_batch(b.id)));
CREATE POLICY teacher_bank_import_read ON question_bank_imports FOR SELECT TO authenticated USING(created_by=auth.uid() AND private.current_role()='teacher' AND EXISTS(SELECT 1 FROM question_bank_questions q WHERE q.import_id=question_bank_imports.id AND private.teaches_class_subject(q.class_name,q.subject)));
CREATE POLICY teacher_bank_question_create ON question_bank_questions FOR INSERT TO authenticated WITH CHECK(created_by=auth.uid() AND private.teaches_class_subject(class_name,subject));
CREATE OR REPLACE FUNCTION public.import_question_bank(p_id uuid,p_class text,p_file_name text,p_storage_path text,p_questions jsonb) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE item jsonb;total integer:=0;BEGIN
 IF NOT (private.is_owner() OR private.current_role()='teacher') THEN RAISE EXCEPTION 'Teaching access required'; END IF;
 IF p_questions IS NULL OR jsonb_typeof(p_questions)<>'array' THEN RAISE EXCEPTION 'Invalid question import'; END IF;
 IF jsonb_array_length(p_questions) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Import 1 to 500 questions at a time'; END IF;
 INSERT INTO question_bank_imports(id,class_name,file_name,storage_path,created_by) VALUES(p_id,p_class,p_file_name,p_storage_path,auth.uid());
 FOR item IN SELECT value FROM jsonb_array_elements(p_questions) LOOP
 IF NOT private.is_owner() AND NOT private.teaches_class_subject(p_class,item->>'subject') THEN RAISE EXCEPTION 'Import only your assigned class subjects'; END IF;
  INSERT INTO question_bank_questions(import_id,class_name,subject,chapter,question,marks,options,answer,created_by) VALUES(p_id,p_class,item->>'subject',coalesce(item->>'chapter',''),item->>'question',(item->>'marks')::numeric,coalesce(item->'options','[]'),coalesce(item->>'answer',''),auth.uid());total:=total+1;
 END LOOP;RETURN total;
END $$;

NOTIFY pgrst,'reload schema';
COMMIT;
