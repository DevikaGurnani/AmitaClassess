import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
export const root = fileURLToPath(new URL('../', import.meta.url));
export const migrationFiles = [
  '20261031_01_initial_schema.sql', '20261110_02_phase2.sql',
  '20261111_03_core_workflows.sql', '20261113_04_student_console.sql',
  '20261113_05_account_passwords.sql', '20261115_06_student_contacts.sql',
];
export const applicationTables = [
  'users','students','parents','student_parent','batches','student_batch',
  'attendance','holidays','fee_plans','fee_dues','payments','materials','notices',
  'contact_change_requests','audit_log','notifications','tests','test_marks',
  'attendance_sync_keys','payment_orders',
];
const list = applicationTables.map(name => `'${name}'`).join(',');
export function buildUpgrade() {
  const scripts = migrationFiles.map(file => {
    let sql = readFileSync(path.join(root,'supabase/migrations',file),'utf8');
    // The full repair is committed atomically, not migration-by-migration.
    sql = sql.replace(/^\s*(?:BEGIN|COMMIT);\s*$/gm,'');
    sql = sql.replace(/^CREATE POLICY ("[^"]+"|\w+) ON ([\w.]+)/gm,
      'DROP POLICY IF EXISTS $1 ON $2;\nCREATE POLICY $1 ON $2');
    sql = sql.replace(/^CREATE TRIGGER (\w+)\s+((?:BEFORE|AFTER)[\s\S]*?)\s+ON\s+([\w.]+)/gm,
      'DROP TRIGGER IF EXISTS $1 ON $3;\nCREATE TRIGGER $1 $2 ON $3');
    sql = sql.replace(/^ALTER TABLE ([\w.]+) ADD CONSTRAINT (\w+)/gm,
      'ALTER TABLE $1 DROP CONSTRAINT IF EXISTS $2;\nALTER TABLE $1 ADD CONSTRAINT $2');
    return `\n-- SOURCE: ${file}\n${sql}`;
  });
  return `-- TuitionApp complete schema repair, generated from six migrations.
-- Preserves application rows. Replaces policy definitions on these 20 app tables.
-- Run as the database owner, not through the public/service-role REST API.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';
SET LOCAL search_path=public,extensions,pg_catalog;
SELECT pg_advisory_xact_lock(hashtextextended('tuitionapp_schema_upgrade',0));

-- The connected legacy database used notices.class; current queries use class_id.
-- Rename, rather than discard/recreate, so existing notice audiences survive.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='notices' AND column_name='class')
    AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='notices' AND column_name='class_id') THEN
    ALTER TABLE public.notices RENAME COLUMN class TO class_id;
  END IF;
END $$;

-- Record row counts and policy/trigger definitions BEFORE changing metadata.
-- Export catalog preflight separately before applying this script.
CREATE TEMP TABLE tuition_upgrade_counts(table_name text PRIMARY KEY,total bigint) ON COMMIT DROP;
DO $$ DECLARE target text; total bigint; BEGIN
  FOR target IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN (${list}) LOOP
    EXECUTE format('SELECT count(*) FROM public.%I',target) INTO total;
    INSERT INTO tuition_upgrade_counts VALUES(target,total);
  END LOOP;
END $$;
-- Eliminate old permissive policies as well as duplicate/new restrictive policies.
-- Final policies are restored below before this transaction commits.
DO $$ DECLARE p record; BEGIN
  FOR p IN SELECT tablename,policyname FROM pg_policies WHERE schemaname='public' AND tablename IN (${list}) LOOP
    EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,p.tablename);
  END LOOP;
END $$;
${scripts.join('\n')}

-- Existing legacy tables may still have destructive payment FK delete actions.
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_due_id_fkey;
ALTER TABLE public.payments ADD CONSTRAINT payments_due_id_fkey FOREIGN KEY(due_id) REFERENCES public.fee_dues(id) ON DELETE RESTRICT;
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_student_id_fkey;
ALTER TABLE public.payments ADD CONSTRAINT payments_student_id_fkey FOREIGN KEY(student_id) REFERENCES public.students(id) ON DELETE RESTRICT;
DO $$ DECLARE target text; BEGIN
  FOREACH target IN ARRAY ARRAY[${list}] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',target);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon',target);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.%I TO authenticated',target);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role',target);
  END LOOP;
END $$;
-- Abort rather than commit any change that unexpectedly removed existing rows.
DO $$ DECLARE item record; total bigint; BEGIN
  FOR item IN SELECT * FROM tuition_upgrade_counts LOOP
    EXECUTE format('SELECT count(*) FROM public.%I',item.table_name) INTO total;
    IF total <> item.total THEN RAISE EXCEPTION 'Row count changed for %',item.table_name; END IF;
  END LOOP;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
`;
}
export function writeUpgrade() {
  const dir = path.join(root,'supabase/setup');
  mkdirSync(dir,{recursive:true});
  const file = path.join(dir,'complete-database-setup.sql');
  writeFileSync(file,buildUpgrade());
  return file;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeUpgrade(); console.log('Generated supabase/setup/complete-database-setup.sql (no remote changes).');
}
