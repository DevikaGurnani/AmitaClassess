BEGIN;
-- App metadata is server-owned. Users cannot remove the first-login requirement
-- by editing their own user_metadata or by navigating straight to a portal.
CREATE OR REPLACE FUNCTION private.password_ready() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM auth.users WHERE id=(SELECT auth.uid())
    AND COALESCE(raw_app_meta_data->>'must_change_password','false') <> 'true')
$$;
REVOKE ALL ON FUNCTION private.password_ready() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.password_ready() TO authenticated;

CREATE OR REPLACE FUNCTION private.current_role() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT role FROM public.users WHERE id=(SELECT auth.uid()) AND status='active'
    AND private.password_ready() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION private.complete_first_password_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password
    AND COALESCE(NEW.encrypted_password,'') <> '' THEN
    NEW.raw_app_meta_data := COALESCE(NEW.raw_app_meta_data,'{}'::jsonb)
      || '{"must_change_password":false}'::jsonb;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.complete_first_password_change() FROM PUBLIC;
CREATE TRIGGER complete_first_password_change BEFORE UPDATE OF encrypted_password ON auth.users
FOR EACH ROW EXECUTE FUNCTION private.complete_first_password_change();

-- Restrictive policies intersect all existing permissive policies, including
-- student read policies. The user's own profile remains readable for login.
DO $$ DECLARE target text; BEGIN
  FOR target IN SELECT tablename FROM pg_tables WHERE schemaname='public'
    AND tablename IN ('students','parents','student_parent','batches','student_batch','attendance',
    'holidays','fee_plans','fee_dues','payments','materials','notices','contact_change_requests',
    'audit_log','notifications','tests','test_marks','attendance_sync_keys','payment_orders')
  LOOP
    EXECUTE format('CREATE POLICY require_password_change ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (private.password_ready()) WITH CHECK (private.password_ready())',target);
  END LOOP;
END $$;
-- Require email on new profiles without blocking updates to legacy profiles.
CREATE OR REPLACE FUNCTION private.require_account_email() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.email IS NULL OR NEW.email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'A valid email address is required for new accounts';
  END IF;
  NEW.email := lower(trim(NEW.email));
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.require_account_email() FROM PUBLIC;
CREATE TRIGGER require_account_email BEFORE INSERT ON public.users
FOR EACH ROW EXECUTE FUNCTION private.require_account_email();
COMMIT;
