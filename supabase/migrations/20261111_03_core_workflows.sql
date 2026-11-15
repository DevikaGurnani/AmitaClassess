-- Phase 3 core workflows. Apply after the Phase 0 and Phase 2 migrations.
BEGIN;

-- Remove permissive policies left by the original foundation migration.
DROP POLICY IF EXISTS "Owner full access" ON public.users;
DROP POLICY IF EXISTS "Staff access" ON public.users;
DROP POLICY IF EXISTS "Teacher access" ON public.users;
DROP POLICY IF EXISTS "Parent self access" ON public.users;

CREATE OR REPLACE FUNCTION public.save_student_profile(
  p_id uuid, p_create boolean, p_student jsonb, p_parent_id uuid,
  p_guardian jsonb, p_batch_ids uuid[], p_expected_updated_at timestamptz DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE
  v_student students%ROWTYPE;
  v_parent_id uuid := p_parent_id;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_admission date := (p_student->>'admission_date')::date;
  v_dob date := (p_student->>'date_of_birth')::date;
  v_relation text := p_guardian->>'relation';
BEGIN
  IF NOT private.is_admin() THEN RAISE EXCEPTION 'Owner or staff access required'; END IF;
  -- One student lock serializes enrollment and profile changes, including retries.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text, 0));
  SELECT * INTO v_student FROM students WHERE id=p_id FOR UPDATE;
  IF p_create AND FOUND THEN RETURN p_id; END IF;
  IF NOT p_create THEN
    IF v_student.id IS NULL THEN RAISE EXCEPTION 'Student not found'; END IF;
    IF p_expected_updated_at IS DISTINCT FROM v_student.updated_at THEN
      RAISE EXCEPTION 'This student was updated by someone else. Reload the profile before saving';
    END IF;
  END IF;
  IF nullif(trim(p_student->>'name'),'') IS NULL OR nullif(trim(p_student->>'class'),'') IS NULL THEN
    RAISE EXCEPTION 'Student name and class are required';
  END IF;
  IF v_dob IS NULL OR v_admission IS NULL OR v_dob>v_admission OR v_admission>v_today THEN
    RAISE EXCEPTION 'Check the birth and admission dates';
  END IF;
  IF v_relation IS NULL OR v_relation NOT IN ('father','mother','guardian','other') THEN
    RAISE EXCEPTION 'Choose a guardian relationship';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_batch_ids) bid WHERE NOT EXISTS (
    SELECT 1 FROM batches b WHERE b.id=bid AND (b.is_active OR EXISTS (
      SELECT 1 FROM student_batch sb WHERE sb.student_id=p_id AND sb.batch_id=b.id
        AND (sb.end_date IS NULL OR sb.end_date>=v_today)
    ))
  )) THEN RAISE EXCEPTION 'Choose active batches'; END IF;

  IF v_parent_id IS NULL THEN
    IF nullif(trim(p_guardian->>'name'),'') IS NULL OR
       COALESCE(p_guardian->>'phone','') !~ '^\+[1-9][0-9]{7,14}$' THEN
      RAISE EXCEPTION 'Guardian name and a phone number with country code are required';
    END IF;
    IF nullif(p_guardian->>'user_id','') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM users WHERE id=(p_guardian->>'user_id')::uuid AND role='parent' AND status='active'
    ) THEN RAISE EXCEPTION 'Choose an active parent account'; END IF;
    INSERT INTO parents(name,phone,relation,email,whatsapp,address,user_id)
    VALUES(trim(p_guardian->>'name'),p_guardian->>'phone',v_relation,
      nullif(trim(p_guardian->>'email'),''),nullif(trim(p_guardian->>'whatsapp'),''),
      nullif(trim(p_guardian->>'address'),''),nullif(p_guardian->>'user_id','')::uuid)
    RETURNING id INTO v_parent_id;
  ELSIF NOT EXISTS (SELECT 1 FROM parents WHERE id=v_parent_id) THEN
    RAISE EXCEPTION 'Guardian not found';
  ELSIF nullif(p_guardian->>'user_id','') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM users WHERE id=(p_guardian->>'user_id')::uuid AND role='parent' AND status='active') THEN
      RAISE EXCEPTION 'Choose an active parent account';
    END IF;
    UPDATE parents SET user_id=(p_guardian->>'user_id')::uuid WHERE id=v_parent_id AND user_id IS NULL;
  END IF;

  INSERT INTO students(id,name,class,school,board,date_of_birth,admission_date,address,status)
  VALUES(p_id,trim(p_student->>'name'),trim(p_student->>'class'),nullif(trim(p_student->>'school'),''),
    nullif(p_student->>'board',''),v_dob,v_admission,nullif(trim(p_student->>'address'),''),p_student->>'status')
  ON CONFLICT(id) DO UPDATE SET name=excluded.name,class=excluded.class,school=excluded.school,
    board=excluded.board,date_of_birth=excluded.date_of_birth,admission_date=excluded.admission_date,
    address=excluded.address,status=excluded.status;
  UPDATE student_parent SET is_primary=false WHERE student_id=p_id AND is_primary;
  INSERT INTO student_parent(student_id,parent_id,relation,is_primary)
  VALUES(p_id,v_parent_id,v_relation,true)
  ON CONFLICT(student_id,parent_id) DO UPDATE SET relation=excluded.relation,is_primary=true;

  -- Keep ended enrollment rows and their custom fees for historical records.
  UPDATE student_batch SET end_date=v_today-1
  WHERE student_id=p_id AND (end_date IS NULL OR end_date>=v_today)
    AND NOT (batch_id=ANY(COALESCE(p_batch_ids,'{}'::uuid[])));
  INSERT INTO student_batch(student_id,batch_id,start_date)
  SELECT p_id,bid,greatest(v_admission,v_today) FROM (SELECT DISTINCT unnest(p_batch_ids) bid) selected
  ON CONFLICT(student_id,batch_id) DO UPDATE SET end_date=NULL;
  RETURN p_id;
END $$;
REVOKE ALL ON FUNCTION public.save_student_profile(uuid,boolean,jsonb,uuid,jsonb,uuid[],timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_student_profile(uuid,boolean,jsonb,uuid,jsonb,uuid[],timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_student_due(p_student_id uuid,p_month date)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid; v_amount integer; v_month date := date_trunc('month',p_month)::date;
BEGIN
  IF NOT private.is_admin() THEN RAISE EXCEPTION 'Owner or staff access required'; END IF;
  IF p_month IS NULL THEN RAISE EXCEPTION 'Choose a billing month'; END IF;
  PERFORM 1 FROM students WHERE id=p_student_id AND status='active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active student not found'; END IF;
  SELECT id INTO v_id FROM fee_dues WHERE student_id=p_student_id AND month IN (v_month::text,to_char(v_month,'YYYY-MM'))
    ORDER BY month DESC LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  SELECT sum(COALESCE(sb.custom_fee,b.base_fee)) INTO v_amount
  FROM student_batch sb JOIN batches b ON b.id=sb.batch_id
  WHERE sb.student_id=p_student_id AND b.is_active
    AND sb.start_date<(v_month+interval '1 month')::date
    AND (sb.end_date IS NULL OR (sb.end_date>=v_month AND sb.end_date>=sb.start_date));
  IF COALESCE(v_amount,0)<=0 THEN RAISE EXCEPTION 'No positive enrolled batch fee for this month'; END IF;
  INSERT INTO fee_dues(student_id,month,amount,discount,generated_amount,paid_amount,due_date,grace_period_days,status)
  VALUES(p_student_id,v_month::text,v_amount,0,v_amount,0,v_month+9,5,
    CASE WHEN (now() AT TIME ZONE 'Asia/Kolkata')::date>v_month+14 THEN 'overdue' ELSE 'due' END)
  ON CONFLICT(student_id,month) DO NOTHING RETURNING id INTO v_id;
  IF v_id IS NULL THEN SELECT id INTO v_id FROM fee_dues WHERE student_id=p_student_id AND month=v_month::text; END IF;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.generate_student_due(uuid,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.generate_student_due(uuid,date) TO authenticated;

CREATE TRIGGER audit_students AFTER INSERT OR UPDATE ON students
  FOR EACH ROW EXECUTE FUNCTION private.audit_sensitive_changes();
CREATE TRIGGER audit_parents AFTER INSERT OR UPDATE ON parents
  FOR EACH ROW EXECUTE FUNCTION private.audit_sensitive_changes();

CREATE OR REPLACE FUNCTION public.record_manual_payment(
  p_id uuid,p_due_id uuid,p_amount integer,p_mode text,p_reference text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v_due fee_dues%ROWTYPE; v_payment payments%ROWTYPE;
BEGIN
  IF NOT private.is_admin() THEN RAISE EXCEPTION 'Owner or staff access required'; END IF;
  IF p_id IS NULL OR p_amount IS NULL OR p_amount<=0 OR p_mode IS NULL OR
    p_mode NOT IN ('cash','upi','bank_transfer','cheque') THEN RAISE EXCEPTION 'Invalid payment'; END IF;
  SELECT * INTO v_due FROM fee_dues WHERE id=p_due_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fee due not found'; END IF;
  SELECT * INTO v_payment FROM payments WHERE id=p_id;
  IF FOUND THEN
    IF v_payment.due_id IS DISTINCT FROM p_due_id OR v_payment.amount<>p_amount OR
      v_payment.mode<>p_mode OR v_payment.is_reversal OR
      v_payment.reference IS DISTINCT FROM nullif(trim(p_reference),'') THEN
      RAISE EXCEPTION 'Payment retry details changed. Reload the payment history';
    END IF;
    RETURN p_id;
  END IF;
  IF p_amount>v_due.generated_amount-v_due.paid_amount THEN RAISE EXCEPTION 'Payment exceeds outstanding balance'; END IF;
  INSERT INTO payments(id,due_id,student_id,amount,mode,reference,received_by,receipt_no)
  VALUES(p_id,p_due_id,v_due.student_id,p_amount,p_mode,nullif(trim(p_reference),''),auth.uid(),
    'PAY-'||replace(p_id::text,'-',''));
  RETURN p_id;
END $$;
REVOKE ALL ON FUNCTION public.record_manual_payment(uuid,uuid,integer,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_manual_payment(uuid,uuid,integer,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.reverse_manual_payment(p_id uuid,p_payment_id uuid,p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v_payment payments%ROWTYPE; v_existing uuid;
BEGIN
  IF NOT private.is_owner() THEN RAISE EXCEPTION 'Owner access required'; END IF;
  IF p_id IS NULL OR nullif(trim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Reversal reason is required'; END IF;
  SELECT * INTO v_payment FROM payments WHERE id=p_payment_id;
  IF NOT FOUND OR v_payment.is_reversal OR v_payment.mode='online' THEN
    RAISE EXCEPTION 'Choose an original manual payment';
  END IF;
  PERFORM 1 FROM fee_dues WHERE id=v_payment.due_id FOR UPDATE;
  SELECT id INTO v_existing FROM payments WHERE reversal_of=p_payment_id;
  IF FOUND THEN RETURN v_existing; END IF;
  INSERT INTO payments(id,due_id,student_id,amount,mode,reference,received_by,receipt_no,is_reversal,reversal_of,reversal_reason)
  VALUES(p_id,v_payment.due_id,v_payment.student_id,v_payment.amount,v_payment.mode,v_payment.reference,
    auth.uid(),'REV-'||replace(p_id::text,'-',''),true,p_payment_id,trim(p_reason));
  RETURN p_id;
END $$;
REVOKE ALL ON FUNCTION public.reverse_manual_payment(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reverse_manual_payment(uuid,uuid,text) TO authenticated;
COMMIT;
