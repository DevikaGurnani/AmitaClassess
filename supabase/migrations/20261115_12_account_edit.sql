BEGIN;
CREATE FUNCTION public.edit_academy_account(p_id uuid,p_name text,p_email text,p_phone text,p_status text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE target users%ROWTYPE;BEGIN
 IF NOT private.is_owner() THEN RAISE EXCEPTION 'Owner access required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('academy_account_edit',0));
 SELECT * INTO target FROM users WHERE id=p_id FOR UPDATE;
 IF target.id IS NULL OR length(trim(p_name)) NOT BETWEEN 1 AND 150 OR p_email!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR p_phone!~'^\+[1-9][0-9]{7,14}$' OR p_status NOT IN ('active','inactive') THEN RAISE EXCEPTION 'Check account details'; END IF;
 IF p_status<>'active' AND target.id=auth.uid() THEN RAISE EXCEPTION 'You cannot deactivate your own account'; END IF;
 IF p_status<>'active' AND target.role='owner' AND NOT EXISTS(SELECT 1 FROM users WHERE role='owner' AND status='active' AND id<>p_id) THEN RAISE EXCEPTION 'Keep at least one active owner'; END IF;
 UPDATE users SET name=trim(p_name),email=lower(trim(p_email)),phone=p_phone,status=p_status WHERE id=p_id;
 IF target.role='student' AND target.student_id IS NOT NULL THEN UPDATE students SET name=trim(p_name),email=lower(trim(p_email)),phone=p_phone WHERE id=target.student_id; END IF;
 IF target.role='parent' THEN UPDATE parents SET name=trim(p_name),email=lower(trim(p_email)),phone=p_phone WHERE user_id=p_id; END IF;
 RETURN (SELECT to_jsonb(u) FROM users u WHERE id=p_id);
END $$;
REVOKE ALL ON FUNCTION public.edit_academy_account(uuid,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.edit_academy_account(uuid,text,text,text,text) TO authenticated;
CREATE FUNCTION public.assign_new_teacher_scopes(p_teacher uuid,p_scopes jsonb) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$ DECLARE item jsonb;BEGIN
 IF NOT private.is_owner() OR p_scopes IS NULL OR jsonb_typeof(p_scopes)<>'array' THEN RAISE EXCEPTION 'Owner and teaching assignments required'; END IF;
 IF jsonb_array_length(p_scopes) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Assign at least one batch'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_scopes) LOOP
  IF jsonb_array_length(item->'subject_ids')<1 THEN RAISE EXCEPTION 'Assign at least one subject per batch'; END IF;
  PERFORM public.set_teacher_batch_subjects(p_teacher,(item->>'batch_id')::uuid,ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(item->'subject_ids')));
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.assign_new_teacher_scopes(uuid,jsonb) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.assign_new_teacher_scopes(uuid,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
