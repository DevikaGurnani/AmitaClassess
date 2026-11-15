BEGIN;
DO $$ DECLARE name text; BEGIN
 FOREACH name IN ARRAY ARRAY['test_marks','tests'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=name) THEN EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',name);END IF;
 END LOOP;
END $$;
COMMIT;
