BEGIN;
ALTER TABLE library_folders ADD COLUMN batch_id uuid REFERENCES batches(id) ON DELETE RESTRICT;
ALTER TABLE library_files ADD COLUMN batch_id uuid REFERENCES batches(id) ON DELETE RESTRICT;
ALTER TABLE library_activity ADD COLUMN batch_id uuid REFERENCES batches(id) ON DELETE SET NULL,ADD COLUMN batch_name text;
ALTER TABLE library_folders DROP CONSTRAINT library_folders_parent_id_class_name_fkey;
ALTER TABLE library_files DROP CONSTRAINT library_files_folder_id_class_name_fkey;
DROP INDEX library_folder_unique_name;
-- Only migrate a legacy class when exactly one active batch matches it. Ordinal
-- suffixes such as 10th are treated as the same standard as 10 for this backfill.
CREATE FUNCTION private.legacy_library_batch(cname text) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT CASE WHEN count(*)=1 THEN min(id::text)::uuid ELSE NULL END FROM batches
 WHERE is_active AND regexp_replace(lower(trim(class)),'(st|nd|rd|th)$','')=regexp_replace(lower(trim(cname)),'(st|nd|rd|th)$','')
$$;
UPDATE library_folders SET batch_id=private.legacy_library_batch(class_name);
UPDATE library_files SET batch_id=private.legacy_library_batch(class_name);
UPDATE library_activity SET batch_id=private.legacy_library_batch(class_name);
UPDATE library_folders f SET class_name=b.class FROM batches b WHERE f.batch_id=b.id;
UPDATE library_files f SET class_name=b.class FROM batches b WHERE f.batch_id=b.id;
UPDATE library_activity a SET batch_name=b.name FROM batches b WHERE a.batch_id=b.id;
WITH ranked AS(SELECT id,row_number() OVER(PARTITION BY batch_id,coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),lower(name) ORDER BY created_at,id) n FROM library_folders WHERE batch_id IS NOT NULL)
 UPDATE library_folders f SET name=left(f.name,95)||' (previous '||left(f.id::text,6)||')' FROM ranked r WHERE f.id=r.id AND r.n>1;
CREATE UNIQUE INDEX library_folder_unique_name ON library_folders(class_name,coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),lower(name)) WHERE batch_id IS NULL;
CREATE UNIQUE INDEX library_folder_batch_name ON library_folders(batch_id,coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),lower(name)) WHERE batch_id IS NOT NULL;
ALTER TABLE library_folders ADD UNIQUE(id,batch_id),ADD CONSTRAINT library_parent_batch FOREIGN KEY(parent_id,batch_id) REFERENCES library_folders(id,batch_id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE library_files ADD CONSTRAINT library_file_batch FOREIGN KEY(folder_id,batch_id) REFERENCES library_folders(id,batch_id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX library_files_batch ON library_files(batch_id,folder_id);
CREATE FUNCTION private.can_view_library_batch(bid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT private.is_admin() OR (bid IS NOT NULL AND EXISTS(SELECT 1 FROM batches b WHERE b.id=bid AND b.is_active) AND (
 private.teaches_batch(bid) OR (private.current_role()='student' AND private.student_in_batch(bid))
 OR (private.current_role()='parent' AND EXISTS(SELECT 1 FROM student_batch sb JOIN student_parent sp ON sp.student_id=sb.student_id JOIN parents p ON p.id=sp.parent_id JOIN students s ON s.id=sb.student_id WHERE p.user_id=auth.uid() AND s.status='active' AND sb.batch_id=bid AND sb.start_date<=(now() AT TIME ZONE 'Asia/Kolkata')::date AND (sb.end_date IS NULL OR sb.end_date>=(now() AT TIME ZONE 'Asia/Kolkata')::date)))))
$$;
REVOKE ALL ON FUNCTION private.can_view_library_batch(uuid),private.legacy_library_batch(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_view_library_batch(uuid) TO authenticated;
DROP POLICY library_folders_read ON library_folders;DROP POLICY library_files_read ON library_files;DROP POLICY library_activity_read ON library_activity;
CREATE POLICY library_folders_read ON library_folders FOR SELECT TO authenticated USING((batch_id IS NOT NULL AND private.can_view_library_batch(batch_id)) OR (batch_id IS NULL AND private.is_owner()));
CREATE POLICY library_files_read ON library_files FOR SELECT TO authenticated USING((batch_id IS NOT NULL AND private.can_view_library_batch(batch_id)) OR (batch_id IS NULL AND private.is_owner()));
CREATE POLICY library_activity_read ON library_activity FOR SELECT TO authenticated USING((batch_id IS NOT NULL AND private.can_view_library_batch(batch_id)) OR (batch_id IS NULL AND private.is_owner()));
DROP POLICY library_folders_create ON library_folders;DROP POLICY library_files_create ON library_files;
CREATE POLICY library_folders_create ON library_folders FOR INSERT TO authenticated WITH CHECK(private.is_owner() AND created_by=auth.uid() AND batch_id IS NOT NULL);
CREATE POLICY library_files_create ON library_files FOR INSERT TO authenticated WITH CHECK(private.is_owner() AND created_by=auth.uid() AND batch_id IS NOT NULL);
CREATE OR REPLACE FUNCTION private.can_read_library_file(object_path text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT private.is_owner() OR EXISTS(SELECT 1 FROM library_files f WHERE f.storage_path=object_path AND f.batch_id IS NOT NULL AND private.can_view_library_batch(f.batch_id)) $$;
CREATE FUNCTION private.validate_library_batch() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE parent_batch uuid;pid uuid;BEGIN
 IF NEW.batch_id IS NOT NULL THEN SELECT class INTO NEW.class_name FROM batches WHERE id=NEW.batch_id; END IF;
 pid:=CASE WHEN TG_TABLE_NAME='library_folders' THEN (to_jsonb(NEW)->>'parent_id')::uuid ELSE (to_jsonb(NEW)->>'folder_id')::uuid END;
 IF pid IS NOT NULL THEN SELECT batch_id INTO parent_batch FROM library_folders WHERE id=pid;IF NOT FOUND OR parent_batch IS DISTINCT FROM NEW.batch_id THEN RAISE EXCEPTION 'Folder must belong to the selected batch'; END IF;END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.validate_library_batch() FROM PUBLIC;
CREATE TRIGGER validate_library_folder_batch BEFORE INSERT OR UPDATE ON library_folders FOR EACH ROW EXECUTE FUNCTION private.validate_library_batch();
CREATE TRIGGER validate_library_file_batch BEFORE INSERT OR UPDATE ON library_files FOR EACH ROW EXECUTE FUNCTION private.validate_library_batch();
CREATE OR REPLACE FUNCTION private.record_library_activity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE item jsonb;BEGIN
 item:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 INSERT INTO library_activity(class_name,batch_id,batch_name,actor_id,action,resource_kind,title) VALUES(item->>'class_name',(item->>'batch_id')::uuid,(SELECT name FROM batches WHERE id=(item->>'batch_id')::uuid),auth.uid(),CASE WHEN TG_OP='DELETE' THEN 'deleted' ELSE 'created' END,CASE WHEN TG_TABLE_NAME='library_folders' THEN 'folder' ELSE item->>'kind' END,coalesce(item->>'title',item->>'name'));RETURN NULL;
END $$;
CREATE FUNCTION public.library_batch_catalog() RETURNS TABLE(id uuid,name text,class text,is_active boolean) LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$ SELECT b.id,b.name,b.class,b.is_active FROM batches b WHERE private.can_view_library_batch(b.id) ORDER BY b.name $$;
REVOKE ALL ON FUNCTION public.library_batch_catalog() FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.library_batch_catalog() TO authenticated;
CREATE FUNCTION public.recover_class_library(p_class text,p_batch uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE cname text;folder_id uuid;BEGIN
 IF NOT private.is_owner() THEN RAISE EXCEPTION 'Owner access required'; END IF;
 SELECT class INTO cname FROM batches WHERE id=p_batch;IF NOT FOUND THEN RAISE EXCEPTION 'Batch not found'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('library_recovery_'||p_class,0));
 UPDATE library_folders f SET name=left(f.name,85)||' (previous '||left(f.id::text,8)||')' WHERE f.batch_id IS NULL AND f.class_name=p_class AND f.parent_id IS NULL AND EXISTS(SELECT 1 FROM library_folders target WHERE target.batch_id=p_batch AND target.parent_id IS NULL AND lower(target.name)=lower(f.name));
 -- Children are updated after their parent; deferred FKs protect the whole tree.
 FOR folder_id IN WITH RECURSIVE tree AS(SELECT id,0 depth FROM library_folders WHERE batch_id IS NULL AND class_name=p_class AND parent_id IS NULL UNION ALL SELECT f.id,t.depth+1 FROM library_folders f JOIN tree t ON f.parent_id=t.id WHERE f.batch_id IS NULL AND f.class_name=p_class) SELECT id FROM tree ORDER BY depth LOOP
  UPDATE library_folders SET batch_id=p_batch,class_name=cname WHERE id=folder_id;
 END LOOP;
 UPDATE library_files SET batch_id=p_batch,class_name=cname WHERE batch_id IS NULL AND class_name=p_class;
 UPDATE library_activity SET batch_id=p_batch,batch_name=(SELECT name FROM batches WHERE id=p_batch) WHERE batch_id IS NULL AND class_name=p_class;
 INSERT INTO library_activity(class_name,batch_id,batch_name,actor_id,action,resource_kind,title) VALUES(cname,p_batch,(SELECT name FROM batches WHERE id=p_batch),auth.uid(),'created','folder','Previous learning resources restored');
END $$;
REVOKE ALL ON FUNCTION public.recover_class_library(text,uuid) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.recover_class_library(text,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
