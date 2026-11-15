BEGIN;
CREATE TABLE public.student_notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,batch_id uuid REFERENCES batches(id) ON DELETE SET NULL,title text NOT NULL,detail text NOT NULL,view text NOT NULL CHECK(view IN ('schedule','materials','assignments','answer-sheets','results','attendance','notices')),created_at timestamptz NOT NULL DEFAULT now(),read_at timestamptz);
CREATE INDEX student_notifications_inbox ON student_notifications(user_id,created_at DESC);
ALTER TABLE student_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_notifications FROM anon,authenticated;
GRANT SELECT ON public.student_notifications TO authenticated;
CREATE POLICY own_student_inbox ON public.student_notifications FOR SELECT TO authenticated USING(user_id=auth.uid() AND EXISTS(SELECT 1 FROM users WHERE id=auth.uid() AND status='active' AND role='student'));
CREATE FUNCTION public.read_student_notifications(p_ids uuid[]) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$ UPDATE student_notifications SET read_at=coalesce(read_at,now()) WHERE user_id=auth.uid() AND id=ANY(p_ids) $$;
REVOKE ALL ON FUNCTION public.read_student_notifications(uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_student_notifications(uuid[]) TO authenticated;
CREATE FUNCTION private.notify_batch_students(bid uuid,heading text,message text,destination text,only_students uuid[] DEFAULT NULL) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 INSERT INTO student_notifications(user_id,batch_id,title,detail,view)
 SELECT DISTINCT u.id,bid,heading,left(message,500),destination FROM users u JOIN student_batch sb ON sb.student_id=u.student_id
 WHERE u.role='student' AND u.status='active' AND sb.batch_id=bid AND sb.start_date<=(now() AT TIME ZONE 'Asia/Kolkata')::date AND (sb.end_date IS NULL OR sb.end_date>=(now() AT TIME ZONE 'Asia/Kolkata')::date) AND (only_students IS NULL OR u.student_id=ANY(only_students));
$$;
CREATE FUNCTION private.student_update_notification() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r jsonb:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END; bid uuid; sid uuid; heading text; message text; destination text; audience uuid[]; b record;
BEGIN
 bid:=(r->>'batch_id')::uuid;
 IF TG_OP='UPDATE' AND (r-ARRAY['updated_at','marked_at'])=(to_jsonb(OLD)-ARRAY['updated_at','marked_at']) THEN RETURN NEW;END IF;
 CASE TG_TABLE_NAME
 WHEN 'assignments' THEN heading:='Assignment '||CASE WHEN TG_OP='DELETE' THEN 'removed' WHEN TG_OP='INSERT' THEN 'published' ELSE 'updated' END;message:=r->>'title';destination:='assignments';SELECT array_agg(value::uuid) INTO audience FROM jsonb_array_elements_text(nullif(r->'student_ids','null'::jsonb));
 WHEN 'tests' THEN heading:='Test '||CASE WHEN TG_OP='DELETE' THEN 'removed' WHEN TG_OP='INSERT' THEN 'announced' ELSE 'updated' END;message:=(r->>'title')||' · '||(r->>'subject');destination:='answer-sheets';
 WHEN 'library_activity' THEN heading:='Learning library updated';message:=(r->>'title')||' · '||(r->>'action');destination:='materials';
 WHEN 'batches' THEN bid:=(r->>'id')::uuid;heading:='Batch details updated';message:=r->>'name';destination:='schedule';
 WHEN 'attendance' THEN heading:='Attendance updated';message:=(r->>'date')||' · '||(r->>'status');destination:='attendance';audience:=ARRAY[(r->>'student_id')::uuid];
 WHEN 'test_marks' THEN SELECT batch_id,title INTO bid,message FROM tests WHERE id=(r->>'test_id')::uuid;heading:='Test result published';destination:='results';audience:=ARRAY[(r->>'student_id')::uuid];
 WHEN 'assignment_submissions' THEN IF r->>'marks_awarded' IS NULL THEN RETURN NEW;END IF;SELECT batch_id,title INTO bid,message FROM assignments WHERE id=(r->>'assignment_id')::uuid;heading:='Assignment checked';destination:='assignments';audience:=ARRAY[(r->>'student_id')::uuid];
 WHEN 'notices' THEN
  FOR b IN SELECT id FROM batches WHERE is_active AND ((r->>'audience')='all' OR ((r->>'audience')='batch' AND id=bid) OR ((r->>'audience')='class' AND class=r->>'class_id')) LOOP PERFORM private.notify_batch_students(b.id,'New announcement',r->>'title','notices');END LOOP;RETURN NEW;
 ELSE RETURN NEW;
 END CASE;
 IF bid IS NOT NULL THEN SELECT coalesce(name,'Your batch')||' · '||coalesce(message,'') INTO message FROM batches WHERE id=bid;PERFORM private.notify_batch_students(bid,heading,message,destination,audience);END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER student_assignment_news AFTER INSERT OR UPDATE OR DELETE ON assignments FOR EACH ROW EXECUTE FUNCTION private.student_update_notification();
CREATE TRIGGER student_test_news AFTER INSERT OR UPDATE OR DELETE ON tests FOR EACH ROW EXECUTE FUNCTION private.student_update_notification();
CREATE TRIGGER student_library_news AFTER INSERT ON library_activity FOR EACH ROW EXECUTE FUNCTION private.student_update_notification();
CREATE TRIGGER student_batch_news AFTER UPDATE ON batches FOR EACH ROW EXECUTE FUNCTION private.student_update_notification();
CREATE TRIGGER student_attendance_news AFTER INSERT OR UPDATE ON attendance FOR EACH ROW EXECUTE FUNCTION private.student_update_notification();
CREATE TRIGGER student_marks_news AFTER INSERT OR UPDATE ON test_marks FOR EACH ROW EXECUTE FUNCTION private.student_update_notification();
CREATE TRIGGER student_assignment_marks_news AFTER UPDATE OF marks_awarded,feedback ON assignment_submissions FOR EACH ROW EXECUTE FUNCTION private.student_update_notification();
CREATE TRIGGER student_notice_news AFTER INSERT OR UPDATE ON notices FOR EACH ROW EXECUTE FUNCTION private.student_update_notification();
REVOKE ALL ON FUNCTION private.notify_batch_students(uuid,text,text,text,uuid[]),private.student_update_notification() FROM PUBLIC,anon,authenticated;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='student_notifications' AND schemaname='public') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.student_notifications;END IF;END $$;
COMMIT;
