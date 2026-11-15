BEGIN;
CREATE OR REPLACE FUNCTION private.can_view_library_class(cname text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT private.is_admin()
 OR (private.current_role()='student' AND EXISTS(SELECT 1 FROM users u JOIN students s ON s.id=u.student_id WHERE u.id=auth.uid() AND s.status='active' AND s.class=cname))
 OR (private.current_role()='parent' AND EXISTS(SELECT 1 FROM parents p JOIN student_parent sp ON sp.parent_id=p.id JOIN students s ON s.id=sp.student_id WHERE p.user_id=auth.uid() AND s.class=cname AND s.status='active'))
 OR (private.current_role()='teacher' AND EXISTS(SELECT 1 FROM batches b WHERE b.class=cname AND private.teaches_batch(b.id))) $$;
CREATE POLICY teacher_notices_scope ON notices AS RESTRICTIVE FOR SELECT TO authenticated USING(private.current_role()<>'teacher' OR audience IN ('all','teachers') OR (audience='batch' AND private.teaches_batch(batch_id)) OR (audience='class' AND EXISTS(SELECT 1 FROM batches b WHERE b.class=class_id AND private.teaches_batch(b.id))));
CREATE POLICY teacher_notice_write_scope ON notices AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(private.current_role()<>'teacher' OR (audience='batch' AND private.teaches_batch(batch_id)));
CREATE POLICY teacher_notice_update_scope ON notices AS RESTRICTIVE FOR UPDATE TO authenticated USING(private.current_role()<>'teacher' OR (audience='batch' AND private.teaches_batch(batch_id))) WITH CHECK(private.current_role()<>'teacher' OR (audience='batch' AND private.teaches_batch(batch_id)));
CREATE POLICY teacher_notice_delete_scope ON notices AS RESTRICTIVE FOR DELETE TO authenticated USING(private.current_role()<>'teacher' OR (audience='batch' AND private.teaches_batch(batch_id)));
CREATE TRIGGER audit_subject_catalog AFTER INSERT OR UPDATE OR DELETE ON subjects FOR EACH ROW EXECUTE FUNCTION private.audit_sensitive_changes();
NOTIFY pgrst,'reload schema';
COMMIT;
