BEGIN;
CREATE TABLE public.library_folders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),class_name text NOT NULL CHECK(length(trim(class_name)) BETWEEN 1 AND 40),
 parent_id uuid,name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 120),
 created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,class_name),FOREIGN KEY(parent_id,class_name) REFERENCES public.library_folders(id,class_name) ON DELETE RESTRICT,
 CHECK(parent_id IS NULL OR parent_id<>id)
);
CREATE UNIQUE INDEX library_folder_unique_name ON public.library_folders(class_name,coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),lower(name));
CREATE TABLE public.library_files (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),class_name text NOT NULL CHECK(length(trim(class_name)) BETWEEN 1 AND 40),
 folder_id uuid,title text NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 200),
 kind text NOT NULL DEFAULT 'file' CHECK(kind IN ('file','link')),
 storage_path text UNIQUE,file_name text,file_mime text,file_size integer,external_url text,
 created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(folder_id,class_name) REFERENCES public.library_folders(id,class_name) ON DELETE RESTRICT,
 CHECK((kind='file' AND storage_path IS NOT NULL AND file_name IS NOT NULL AND file_mime IS NOT NULL AND file_size IS NOT NULL AND file_mime IN ('application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document') AND file_size BETWEEN 1 AND 10485760 AND external_url IS NULL)
 OR (kind='link' AND external_url IS NOT NULL AND external_url ~ '^https://' AND storage_path IS NULL AND file_name IS NULL AND file_mime IS NULL AND file_size IS NULL))
);
CREATE INDEX library_files_class_folder ON public.library_files(class_name,folder_id);
ALTER TABLE public.library_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_files ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION private.can_view_library_class(cname text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT private.is_admin()
 OR (private.current_role()='student' AND EXISTS(SELECT 1 FROM users u JOIN students s ON s.id=u.student_id WHERE u.id=auth.uid() AND u.role='student' AND u.status='active' AND s.status='active' AND s.class=cname))
 OR (private.current_role()='parent' AND EXISTS(SELECT 1 FROM parents p JOIN student_parent sp ON sp.parent_id=p.id JOIN students s ON s.id=sp.student_id WHERE p.user_id=auth.uid() AND s.class=cname AND s.status='active'))
 OR (private.current_role()='teacher' AND EXISTS(SELECT 1 FROM batches b WHERE b.teacher_id=auth.uid() AND b.class=cname AND b.is_active))
$$;
REVOKE ALL ON FUNCTION private.can_view_library_class(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_view_library_class(text) TO authenticated;
CREATE POLICY library_folders_read ON public.library_folders FOR SELECT TO authenticated USING(private.can_view_library_class(class_name));
CREATE POLICY library_folders_create ON public.library_folders FOR INSERT TO authenticated WITH CHECK(private.is_owner() AND created_by=auth.uid());
CREATE POLICY library_files_read ON public.library_files FOR SELECT TO authenticated USING(private.can_view_library_class(class_name));
CREATE POLICY library_files_create ON public.library_files FOR INSERT TO authenticated WITH CHECK(private.is_owner() AND created_by=auth.uid());
GRANT SELECT,INSERT ON public.library_folders,public.library_files TO authenticated;
GRANT ALL ON public.library_folders,public.library_files TO service_role;
REVOKE ALL ON public.library_folders,public.library_files FROM anon;
CREATE OR REPLACE FUNCTION private.can_read_library_file(object_path text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT private.is_owner() OR EXISTS(SELECT 1 FROM library_files f WHERE f.storage_path=object_path AND private.can_view_library_class(f.class_name))
$$;
REVOKE ALL ON FUNCTION private.can_read_library_file(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_read_library_file(text) TO authenticated;
CREATE POLICY library_storage_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='learning-library' AND private.can_read_library_file(name));
CREATE POLICY library_storage_read_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated USING(bucket_id<>'learning-library' OR private.can_read_library_file(name));
CREATE POLICY library_storage_anon_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO anon USING(bucket_id<>'learning-library');
CREATE POLICY library_storage_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(bucket_id<>'learning-library');
CREATE POLICY library_storage_update_guard ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING(bucket_id<>'learning-library') WITH CHECK(bucket_id<>'learning-library');
CREATE POLICY library_storage_delete_guard ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING(bucket_id<>'learning-library');
CREATE TRIGGER audit_library_folders AFTER INSERT OR UPDATE OR DELETE ON public.library_folders FOR EACH ROW EXECUTE FUNCTION private.audit_sensitive_changes();
CREATE TRIGGER audit_library_files AFTER INSERT OR UPDATE OR DELETE ON public.library_files FOR EACH ROW EXECUTE FUNCTION private.audit_sensitive_changes();
-- The current requirement permits only the owner to publish resources, including
-- the older batch-link workflow retained for compatibility.
DROP POLICY IF EXISTS materials_add ON public.materials;
DROP POLICY IF EXISTS materials_edit ON public.materials;
DROP POLICY IF EXISTS materials_delete ON public.materials;
CREATE POLICY materials_add ON public.materials FOR INSERT TO authenticated WITH CHECK(private.is_owner() AND uploaded_by=auth.uid());
CREATE POLICY materials_edit ON public.materials FOR UPDATE TO authenticated USING(private.is_owner()) WITH CHECK(private.is_owner());
CREATE POLICY materials_delete ON public.materials FOR DELETE TO authenticated USING(private.is_owner());

CREATE OR REPLACE FUNCTION public.mark_batch_attendance(p_request_id uuid,p_batch_id uuid,p_date date,p_marks jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE item jsonb;total integer:=0;
BEGIN
 IF NOT private.is_admin() THEN RAISE EXCEPTION 'Owner or staff access required'; END IF;
 IF p_request_id IS NULL OR p_marks IS NULL OR jsonb_typeof(p_marks)<>'array' THEN RAISE EXCEPTION 'Choose students to mark'; END IF;
 IF jsonb_array_length(p_marks) NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'Choose students to mark'; END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(p_marks))<>(SELECT count(DISTINCT value->>'student_id') FROM jsonb_array_elements(p_marks)) THEN RAISE EXCEPTION 'Duplicate student in attendance request'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_marks) LOOP
   PERFORM public.sync_attendance(md5(p_request_id::text||(item->>'student_id'))::uuid,(item->>'student_id')::uuid,p_batch_id,p_date,item->>'status');
   total:=total+1;
 END LOOP;
 RETURN total;
END $$;
REVOKE ALL ON FUNCTION public.mark_batch_attendance(uuid,uuid,date,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mark_batch_attendance(uuid,uuid,date,jsonb) TO authenticated;

-- INSERT/UPDATE only are consumed by the clients; no unauthorised DELETE payload
-- is used to update a learner's view.
DO $$ DECLARE target text; BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN CREATE PUBLICATION supabase_realtime; END IF;
 FOREACH target IN ARRAY ARRAY['attendance','library_folders','library_files'] LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=target) THEN
     EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',target);
   END IF;
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
