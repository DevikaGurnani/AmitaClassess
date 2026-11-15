BEGIN;
GRANT DELETE ON public.library_files,public.library_folders TO authenticated;
CREATE POLICY library_files_delete ON public.library_files FOR DELETE TO authenticated USING(private.is_owner());
CREATE POLICY library_folders_delete ON public.library_folders FOR DELETE TO authenticated USING(private.is_owner());
CREATE TABLE public.library_activity (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 class_name text NOT NULL,
 actor_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
 action text NOT NULL CHECK(action IN ('created','deleted')),
 resource_kind text NOT NULL CHECK(resource_kind IN ('file','link','folder')),
 title text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX library_activity_class_date ON public.library_activity(class_name,created_at DESC);
ALTER TABLE public.library_activity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.library_activity FROM anon,authenticated;
GRANT SELECT ON public.library_activity TO authenticated;
GRANT ALL ON public.library_activity TO service_role;
CREATE POLICY library_activity_read ON public.library_activity FOR SELECT TO authenticated USING(private.can_view_library_class(class_name));
CREATE FUNCTION private.record_library_activity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE row_data jsonb; BEGIN
 row_data:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 INSERT INTO public.library_activity(class_name,actor_id,action,resource_kind,title)
 VALUES(row_data->>'class_name',auth.uid(),CASE WHEN TG_OP='DELETE' THEN 'deleted' ELSE 'created' END,
 CASE WHEN TG_TABLE_NAME='library_folders' THEN 'folder' ELSE row_data->>'kind' END,
 coalesce(row_data->>'title',row_data->>'name'));
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION private.record_library_activity() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER activity_library_files AFTER INSERT OR DELETE ON public.library_files FOR EACH ROW EXECUTE FUNCTION private.record_library_activity();
CREATE TRIGGER activity_library_folders AFTER INSERT OR DELETE ON public.library_folders FOR EACH ROW EXECUTE FUNCTION private.record_library_activity();
ALTER PUBLICATION supabase_realtime ADD TABLE public.library_activity;
NOTIFY pgrst,'reload schema';
COMMIT;
