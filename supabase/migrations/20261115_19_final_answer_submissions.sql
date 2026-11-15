BEGIN;
-- Enforce final submissions for RPCs and direct writes, including concurrent uploads.
CREATE FUNCTION private.keep_original_answer_sheet() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.file_path IS DISTINCT FROM OLD.file_path OR NEW.file_name IS DISTINCT FROM OLD.file_name OR NEW.file_mime IS DISTINCT FROM OLD.file_mime OR NEW.file_size IS DISTINCT FROM OLD.file_size THEN
  RAISE EXCEPTION 'This answer sheet has already been submitted and cannot be replaced.';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER final_assignment_answer BEFORE UPDATE ON public.assignment_submissions FOR EACH ROW EXECUTE FUNCTION private.keep_original_answer_sheet();
CREATE TRIGGER final_test_answer BEFORE UPDATE ON public.test_answer_sheets FOR EACH ROW EXECUTE FUNCTION private.keep_original_answer_sheet();
COMMIT;
