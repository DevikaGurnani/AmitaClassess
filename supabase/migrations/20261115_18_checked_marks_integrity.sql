BEGIN;
CREATE FUNCTION private.keep_checked_assignment_marks() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE review submission_reviews%ROWTYPE;BEGIN
 SELECT * INTO review FROM submission_reviews WHERE assignment_submission_id=NEW.id AND status='published';
 IF review.id IS NOT NULL AND (NEW.marks_awarded IS DISTINCT FROM review.marks OR coalesce(NEW.feedback,'') IS DISTINCT FROM review.feedback) THEN RAISE EXCEPTION 'Update marks and feedback through the digital checking workspace so the checked PDF stays consistent'; END IF;RETURN NEW;
END $$;
CREATE FUNCTION private.keep_checked_test_marks() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE review submission_reviews%ROWTYPE;BEGIN
 SELECT r.* INTO review FROM submission_reviews r JOIN test_answer_sheets s ON s.id=r.test_submission_id WHERE s.test_id=NEW.test_id AND s.student_id=NEW.student_id AND r.status='published';
 IF review.id IS NOT NULL AND (NEW.marks IS DISTINCT FROM review.marks OR coalesce(NEW.remarks,'') IS DISTINCT FROM review.feedback) THEN RAISE EXCEPTION 'Update marks and feedback through the digital checking workspace so the checked PDF stays consistent'; END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.keep_checked_assignment_marks(),private.keep_checked_test_marks() FROM PUBLIC;
CREATE TRIGGER keep_checked_assignment_marks BEFORE UPDATE OF marks_awarded,feedback ON assignment_submissions FOR EACH ROW EXECUTE FUNCTION private.keep_checked_assignment_marks();
CREATE TRIGGER keep_checked_test_marks BEFORE INSERT OR UPDATE ON test_marks FOR EACH ROW EXECUTE FUNCTION private.keep_checked_test_marks();
NOTIFY pgrst,'reload schema';
COMMIT;
