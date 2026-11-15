BEGIN;
ALTER TABLE teacher_batch_subjects ADD CONSTRAINT teacher_scope_subject FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE CASCADE;
NOTIFY pgrst,'reload schema';
COMMIT;
