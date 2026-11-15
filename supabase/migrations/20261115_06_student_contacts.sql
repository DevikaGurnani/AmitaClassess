BEGIN;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS phone text;

-- Keep contacts and admission/guardian/enrolment writes in a single transaction.
-- The original RPC remains compatible with existing callers and records.
CREATE OR REPLACE FUNCTION public.save_student_admission(
  p_id uuid, p_create boolean, p_student jsonb, p_parent_id uuid,
  p_guardian jsonb, p_batch_ids uuid[], p_expected_updated_at timestamptz DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE
  v_id uuid;
  v_email text := lower(trim(p_student->>'email'));
  v_phone text := p_student->>'phone';
  v_existing students%ROWTYPE;
BEGIN
  IF NOT private.is_admin() THEN RAISE EXCEPTION 'Owner or staff access required'; END IF;
  IF v_email IS NULL OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Student email is required';
  END IF;
  IF v_phone IS NULL OR v_phone !~ '^\+[1-9][0-9]{7,14}$' THEN
    RAISE EXCEPTION 'Student mobile number with country code is required';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  SELECT * INTO v_existing FROM students WHERE id=p_id FOR UPDATE;
  IF p_create AND FOUND THEN
    IF v_existing.email IS DISTINCT FROM v_email OR v_existing.phone IS DISTINCT FROM v_phone THEN
      RAISE EXCEPTION 'Admission already saved. Open its profile to edit contacts';
    END IF;
    RETURN p_id;
  END IF;
  -- Login contacts must be changed in Auth as well; do not silently desynchronize.
  IF EXISTS (SELECT 1 FROM users u WHERE u.role='student' AND u.student_id=p_id
    AND (lower(u.email) IS DISTINCT FROM v_email OR u.phone IS DISTINCT FROM v_phone)) THEN
    RAISE EXCEPTION 'This student has a login. Login contact changes require an administrator account update';
  END IF;
  v_id := public.save_student_profile(p_id,p_create,p_student,p_parent_id,p_guardian,p_batch_ids,p_expected_updated_at);
  UPDATE students SET email=v_email, phone=v_phone WHERE id=v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.save_student_admission(uuid,boolean,jsonb,uuid,jsonb,uuid[],timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_student_admission(uuid,boolean,jsonb,uuid,jsonb,uuid[],timestamptz) TO authenticated;
COMMIT;
