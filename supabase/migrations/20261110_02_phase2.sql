-- Phase 2: Apply after the repaired baseline migration. Amounts are whole INR.
-- Never use this migration as a replacement for the baseline or on unreviewed production data.
BEGIN;

CREATE TABLE IF NOT EXISTS tests (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), batch_id uuid NOT NULL REFERENCES batches(id),
 title text NOT NULL CHECK (length(trim(title))>0), subject text NOT NULL,
 test_date date NOT NULL, max_marks numeric(8,2) NOT NULL CHECK(max_marks>0),
 created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS test_marks (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), test_id uuid NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
 student_id uuid NOT NULL REFERENCES students(id), marks numeric(8,2) NOT NULL CHECK(marks>=0),
 remarks text, entered_by uuid NOT NULL REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(test_id,student_id)
);
CREATE INDEX IF NOT EXISTS idx_tests_batch_date ON tests(batch_id,test_date DESC);
CREATE INDEX IF NOT EXISTS idx_test_marks_student ON test_marks(student_id);
ALTER TABLE tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_marks ENABLE ROW LEVEL SECURITY;
CREATE POLICY tests_read ON tests FOR SELECT TO authenticated USING (
 private.is_admin() OR private.teaches_batch(batch_id) OR private.is_parent_in_batch(batch_id));
CREATE POLICY tests_add ON tests FOR INSERT TO authenticated WITH CHECK (
 (private.is_admin() OR private.teaches_batch(batch_id)) AND created_by=auth.uid());
CREATE POLICY tests_change ON tests FOR UPDATE TO authenticated USING (
 private.is_admin() OR private.teaches_batch(batch_id)) WITH CHECK(private.is_admin() OR private.teaches_batch(batch_id));
CREATE POLICY marks_read ON test_marks FOR SELECT TO authenticated USING (
 private.is_admin() OR private.is_parent_of(student_id) OR EXISTS (
  SELECT 1 FROM tests t WHERE t.id=test_marks.test_id AND private.teaches_batch(t.batch_id)));
CREATE POLICY marks_add ON test_marks FOR INSERT TO authenticated WITH CHECK (
 entered_by=auth.uid() AND EXISTS (SELECT 1 FROM tests t JOIN student_batch sb ON sb.batch_id=t.batch_id
 WHERE t.id=test_id AND sb.student_id=test_marks.student_id AND (private.is_admin() OR private.teaches_batch(t.batch_id)))
 AND marks <= (SELECT t.max_marks FROM tests t WHERE t.id=test_id));
CREATE POLICY marks_update ON test_marks FOR UPDATE TO authenticated USING (
 private.is_admin() OR EXISTS (SELECT 1 FROM tests t WHERE t.id=test_id AND private.teaches_batch(t.batch_id)))
 WITH CHECK (entered_by=auth.uid() AND marks <= (SELECT t.max_marks FROM tests t WHERE t.id=test_id)
 AND EXISTS (SELECT 1 FROM tests t JOIN student_batch sb ON sb.batch_id=t.batch_id
 WHERE t.id=test_id AND sb.student_id=test_marks.student_id
 AND (private.is_admin() OR private.teaches_batch(t.batch_id))));

-- Offline attendance uses a per-device idempotency key and an RPC that rechecks batch permissions.
CREATE TABLE IF NOT EXISTS attendance_sync_keys (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), client_key uuid NOT NULL,
 user_id uuid NOT NULL REFERENCES users(id), attendance_id uuid NOT NULL REFERENCES attendance(id),
 synced_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,client_key)
);
ALTER TABLE attendance_sync_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY sync_keys_read ON attendance_sync_keys FOR SELECT TO authenticated USING (user_id=auth.uid() OR private.is_admin());
CREATE OR REPLACE FUNCTION public.sync_attendance(
 p_client_key uuid, p_student_id uuid, p_batch_id uuid, p_date date, p_status text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private,pg_temp AS $$
DECLARE v_id uuid; v_existing uuid; v_date_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
 IF auth.uid() IS NULL OR private.current_role() IS NULL THEN RAISE EXCEPTION 'Unauthenticated'; END IF;
 SELECT attendance_id INTO v_existing FROM attendance_sync_keys WHERE client_key=p_client_key AND user_id=auth.uid();
 IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
 IF p_status NOT IN ('present','absent','late','leave') THEN RAISE EXCEPTION 'Invalid status'; END IF;
 IF p_date > v_date_today THEN RAISE EXCEPTION 'Future attendance not permitted'; END IF;
 IF NOT (private.is_admin() OR private.teaches_batch(p_batch_id)) THEN RAISE EXCEPTION 'Batch access denied'; END IF;
 IF NOT EXISTS(SELECT 1 FROM student_batch sb JOIN students s ON s.id=sb.student_id
 WHERE sb.student_id=p_student_id AND sb.batch_id=p_batch_id AND s.status='active'
 AND sb.start_date<=p_date AND (sb.end_date IS NULL OR sb.end_date>=p_date)) THEN
 RAISE EXCEPTION 'Student is not enrolled on date'; END IF;
 IF NOT private.is_admin() THEN
  IF p_date<>v_date_today THEN RAISE EXCEPTION 'Teacher may only sync today''s attendance'; END IF;
  IF EXISTS(SELECT 1 FROM attendance WHERE student_id=p_student_id AND batch_id=p_batch_id AND date=p_date
     AND marked_at<now()-interval '24 hours') THEN RAISE EXCEPTION 'Edit window expired'; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM holidays WHERE date=p_date AND (batch_id IS NULL OR batch_id=p_batch_id))
 AND NOT private.is_admin() THEN RAISE EXCEPTION 'Holiday'; END IF;
 INSERT INTO attendance(student_id,batch_id,date,status,marked_by,marked_at)
 VALUES(p_student_id,p_batch_id,p_date,p_status,auth.uid(),now())
 ON CONFLICT(student_id,batch_id,date) DO UPDATE SET status=excluded.status,marked_by=auth.uid(),marked_at=now()
 RETURNING id INTO v_id;
 INSERT INTO attendance_sync_keys(client_key,user_id,attendance_id) VALUES(p_client_key,auth.uid(),v_id);
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.sync_attendance(uuid,uuid,uuid,date,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_attendance(uuid,uuid,uuid,date,text) TO authenticated;

-- Payment settlement must be webhook-verified, never claimed by browser UI.
CREATE TABLE IF NOT EXISTS payment_orders (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), due_id uuid NOT NULL REFERENCES fee_dues(id) ON DELETE RESTRICT,
 student_id uuid NOT NULL REFERENCES students(id), requested_by uuid NOT NULL REFERENCES users(id),
 amount_inr integer NOT NULL CHECK(amount_inr>0), gateway text NOT NULL DEFAULT 'razorpay' CHECK(gateway='razorpay'),
 gateway_order_id text UNIQUE NOT NULL, gateway_payment_id text UNIQUE,
 status text NOT NULL DEFAULT 'created' CHECK(status IN('created','captured','failed')),
 created_at timestamptz NOT NULL DEFAULT now(), captured_at timestamptz,
 UNIQUE(id,due_id)
);
ALTER TABLE payment_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY orders_read ON payment_orders FOR SELECT TO authenticated USING(
 private.is_admin() OR (requested_by=auth.uid() AND private.is_parent_of(student_id)));
CREATE POLICY orders_insert ON payment_orders FOR INSERT TO authenticated WITH CHECK (
 requested_by=auth.uid() AND (private.is_admin() OR private.is_parent_of(student_id))
 AND status='created' AND EXISTS (SELECT 1 FROM fee_dues d WHERE d.id=due_id AND d.student_id=payment_orders.student_id
 AND amount_inr<=greatest(0,d.generated_amount-d.paid_amount)));
-- No authenticated UPDATE or DELETE policy on gateway orders.

CREATE OR REPLACE FUNCTION private.recalculate_due_payment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_paid integer; v_total integer; v_date date; v_grace integer;
BEGIN
 -- Serialize all inserts for one due *before* summing to prevent concurrent overpayment.
 SELECT generated_amount,due_date,grace_period_days INTO v_total,v_date,v_grace FROM fee_dues WHERE id=NEW.due_id FOR UPDATE;
 SELECT COALESCE(SUM(CASE WHEN is_reversal THEN -amount ELSE amount END),0) INTO v_paid
 FROM payments WHERE due_id=NEW.due_id;
 IF v_paid<0 OR v_paid>v_total THEN RAISE EXCEPTION 'Payment total outside fee due'; END IF;
 UPDATE fee_dues SET paid_amount=v_paid, status=CASE
  WHEN v_paid=v_total THEN 'paid'
  WHEN current_date>v_date+v_grace THEN 'overdue'
  WHEN v_paid>0 THEN 'partly_paid' ELSE 'due' END,
  updated_at=now() WHERE id=NEW.due_id;
 RETURN NEW;
END $$;
CREATE TRIGGER recalculate_due_after_payment AFTER INSERT ON payments
 FOR EACH ROW EXECUTE FUNCTION private.recalculate_due_payment();

CREATE OR REPLACE FUNCTION public.settle_gateway_payment(p_order text,p_payment text,p_amount_paise bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private,pg_temp AS $$
DECLARE v_order payment_orders%ROWTYPE; v_remaining integer;
BEGIN
 -- Service role only; caller MUST have verified Razorpay webhook signature and captured event.
 SELECT * INTO v_order FROM payment_orders WHERE gateway_order_id=p_order FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown gateway order'; END IF;
 IF v_order.status='captured' THEN
  IF v_order.gateway_payment_id=p_payment THEN RETURN false; END IF;
  RAISE EXCEPTION 'Order already settled by another payment';
 END IF;
 IF p_amount_paise <> v_order.amount_inr::bigint*100 THEN RAISE EXCEPTION 'Amount mismatch'; END IF;
 SELECT generated_amount-paid_amount INTO v_remaining FROM fee_dues WHERE id=v_order.due_id FOR UPDATE;
 IF v_remaining<v_order.amount_inr THEN RAISE EXCEPTION 'Due has already been paid'; END IF;
 INSERT INTO payments(due_id,student_id,amount,mode,reference,received_by,receipt_no)
 VALUES(v_order.due_id,v_order.student_id,v_order.amount_inr,'online',p_payment,v_order.requested_by,
 'RZP-'||substr(v_order.id::text,1,8)||'-'||substr(p_payment,1,14));
 UPDATE payment_orders SET status='captured',gateway_payment_id=p_payment,captured_at=now() WHERE id=v_order.id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.settle_gateway_payment(text,text,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.settle_gateway_payment(text,text,bigint) TO service_role;

-- Notifications are queue records, not an assertion that SMS/WhatsApp was delivered.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS template_key text;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS scheduled_for timestamptz NOT NULL DEFAULT now();
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS provider_message_id text;
CREATE INDEX IF NOT EXISTS idx_notifications_queue ON notifications(status,scheduled_for) WHERE status='pending';
-- Teacher notices may be sent only to their own batch, or admin to any audience.
DROP POLICY IF EXISTS notices_write ON notices;
CREATE POLICY notices_add ON notices FOR INSERT TO authenticated WITH CHECK(
 created_by=auth.uid() AND (private.is_admin() OR (audience='batch' AND private.teaches_batch(batch_id))));
CREATE POLICY notices_update ON notices FOR UPDATE TO authenticated USING(private.is_admin() OR (created_by=auth.uid() AND private.teaches_batch(batch_id)))
 WITH CHECK(private.is_admin() OR (created_by=auth.uid() AND audience='batch' AND private.teaches_batch(batch_id)));
CREATE POLICY notices_delete ON notices FOR DELETE TO authenticated USING(private.is_admin());
CREATE POLICY teacher_notification_read ON notifications FOR SELECT TO authenticated USING(
 private.current_role()='teacher' AND user_id=auth.uid());

CREATE TRIGGER audit_tests AFTER INSERT OR UPDATE OR DELETE ON tests FOR EACH ROW EXECUTE FUNCTION private.audit_sensitive_changes();
CREATE TRIGGER audit_marks AFTER INSERT OR UPDATE OR DELETE ON test_marks FOR EACH ROW EXECUTE FUNCTION private.audit_sensitive_changes();
CREATE TRIGGER audit_orders AFTER INSERT OR UPDATE ON payment_orders FOR EACH ROW EXECUTE FUNCTION private.audit_sensitive_changes();
COMMIT;

-- Follow-up migration section: idempotent reminder enqueue and safe worker claims.
BEGIN;
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_status_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_status_check CHECK(status IN ('pending','processing','sent','delivered','failed'));
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS dedupe_key text;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_dedupe_key ON notifications(dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE OR REPLACE FUNCTION public.generate_reminder_notifications()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private,pg_temp AS $$
DECLARE v_total integer:=0; v_count integer; v_today date:=(now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
 -- Never grant this RPC to an authenticated user; server scheduler invokes with service_role.
 INSERT INTO notifications(user_id,channel,message,status,template_key,dedupe_key)
 SELECT DISTINCT p.user_id,'in_app',
  CASE WHEN d.due_date<v_today THEN 'Overdue tuition fee: INR '||(d.generated_amount-d.paid_amount)||' for '||s.name
    WHEN d.due_date=v_today THEN 'Tuition fee due today: INR '||(d.generated_amount-d.paid_amount)||' for '||s.name
    ELSE 'Tuition fee due soon: INR '||(d.generated_amount-d.paid_amount)||' for '||s.name END,
  'pending','fee_reminder','fee:'||d.id||':'||CASE WHEN d.due_date<v_today THEN 'overdue' WHEN d.due_date=v_today THEN 'due' ELSE 'before' END||':'||p.user_id
 FROM fee_dues d JOIN students s ON s.id=d.student_id
 JOIN student_parent sp ON sp.student_id=d.student_id JOIN parents p ON p.id=sp.parent_id
 JOIN users u ON u.id=p.user_id AND u.status='active'
 WHERE d.generated_amount>d.paid_amount AND
 (d.due_date=v_today OR d.due_date=v_today+interval '3 days' OR d.due_date+ d.grace_period_days+1=v_today)
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS v_count=ROW_COUNT;v_total:=v_total+v_count;
 INSERT INTO notifications(user_id,channel,message,status,template_key,dedupe_key)
 SELECT DISTINCT p.user_id,'in_app','Attendance alert: '||s.name||' was marked absent on '||a.date||'.',
  'pending','absence','absence:'||a.id||':'||p.user_id
 FROM attendance a JOIN students s ON s.id=a.student_id
 JOIN student_parent sp ON sp.student_id=a.student_id JOIN parents p ON p.id=sp.parent_id
 JOIN users u ON u.id=p.user_id AND u.status='active'
 WHERE a.date=v_today AND a.status='absent'
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS v_count=ROW_COUNT;RETURN v_total+v_count;
END $$;
REVOKE ALL ON FUNCTION public.generate_reminder_notifications() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.generate_reminder_notifications() TO service_role;

CREATE OR REPLACE FUNCTION public.claim_notification_jobs(p_limit integer DEFAULT 20)
RETURNS SETOF notifications LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 RETURN QUERY WITH candidates AS (
  SELECT id FROM notifications WHERE ((status='pending' AND scheduled_for<=now()) OR (status='processing' AND claimed_at<now()-interval '10 minutes')) AND attempts<3
  ORDER BY scheduled_for,id FOR UPDATE SKIP LOCKED LIMIT LEAST(GREATEST(p_limit,1),100)
 ) UPDATE notifications n SET status='processing',claimed_at=now(),attempts=attempts+1
 FROM candidates WHERE n.id=candidates.id RETURNING n.*;
END $$;
REVOKE ALL ON FUNCTION public.claim_notification_jobs(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_jobs(integer) TO service_role;
COMMIT;
