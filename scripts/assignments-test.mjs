import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
import {migrationFiles,root} from './database-upgrade.mjs';
import path from 'node:path';
const require=createRequire(import.meta.url),ts=require('typescript');
const module={exports:{}};
new Function('module','exports',ts.transpileModule(readFileSync(path.join(root,'apps/web/src/lib/assignments.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(module,module.exports);
test('assignment upload signatures, limits and DOCX structure are validated',async()=>{
  const {validateAssignmentFile}=module.exports;
  assert.equal(validateAssignmentFile('work.pdf',Buffer.from('%PDF-1.4\n1 0 obj\n%%EOF')).mime,'application/pdf');
  assert.throws(()=>validateAssignmentFile('fake.pdf',Buffer.from('<html>not a PDF</html>')));
  assert.throws(()=>validateAssignmentFile('work.exe',Buffer.alloc(40)));
  assert.throws(()=>validateAssignmentFile('large.pdf',Buffer.alloc(10485761)));
  const JSZip=require('jszip'),zip=new JSZip();zip.file('[Content_Types].xml','<Types/>');zip.file('word/document.xml','<document/>');
  assert.equal(validateAssignmentFile('work.docx',await zip.generateAsync({type:'nodebuffer'})).extension,'docx');
  zip.file('word/vbaProject.bin','macro');
  const macro=await zip.generateAsync({type:'nodebuffer'});assert.throws(()=>validateAssignmentFile('macro.docx',macro),/macro/);
});
test('Word preview checks actual inflated bytes rather than trusting archive size claims',async()=>{
  const mod={exports:{}};
  new Function('module','exports','require',ts.transpileModule(readFileSync(path.join(root,'apps/web/src/lib/assignment-word.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(mod,mod.exports,require);
  const zip=new (require('jszip'))();zip.file('word/document.xml','<document>Bounded preview content</document>');
  const valid=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
  mod.exports.validateWordExpansion(valid);
  const tampered=Buffer.from(valid),directory=tampered.indexOf(Buffer.from('504b0102','hex'));
  tampered.writeUInt32LE(1,directory+24);
  assert.throws(()=>mod.exports.validateWordExpansion(tampered),/oversized/);
});
test('assignment SQL isolates batches/submissions, enforces deadlines and protects grading',async t=>{
  const db=new PGlite();
  try{
    await db.exec(`CREATE ROLE authenticated;CREATE ROLE anon;CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,encrypted_password text,raw_app_meta_data jsonb DEFAULT '{}');
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE FUNCTION public.uuid_generate_v4() RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;
      GRANT USAGE ON SCHEMA auth TO authenticated;GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
      CREATE SCHEMA storage;CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text);
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      GRANT USAGE ON SCHEMA storage TO authenticated,anon;GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;GRANT SELECT ON storage.objects TO anon;
      CREATE POLICY broad_legacy ON storage.objects FOR ALL TO authenticated USING(true) WITH CHECK(true);
      CREATE POLICY broad_anon ON storage.objects FOR SELECT TO anon USING(true);`);
    for(const file of [...migrationFiles,'20261115_07_assignments.sql'])await db.exec(readFileSync(path.join(root,'supabase/migrations',file),'utf8').replace('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',''));
    const owner=randomUUID(),a=randomUUID(),b=randomUUID(),sid=randomUUID(),other=randomUUID(),batch=randomUUID(),foreignBatch=randomUUID(),assignment=randomUUID(),foreignAssignment=randomUUID(),late=randomUUID();
    for(const [id,role,index] of [[owner,'owner',1],[a,'student',2],[b,'student',3]]){
      await db.query('INSERT INTO auth.users(id) VALUES($1)',[id]);
      await db.query('INSERT INTO users(id,name,email,phone,role) VALUES($1,$2,$3,$4,$2)',[id,role,`${index}@example.test`,`+91900000000${index}`]);
    }
    await db.query("INSERT INTO students(id,name,class,date_of_birth,admission_date) VALUES($1,'Student A','10','2010-01-01',current_date),($2,'Student B','10','2010-01-01',current_date)",[sid,other]);
    await db.query('UPDATE users SET student_id=$1 WHERE id=$2',[sid,a]);await db.query('UPDATE users SET student_id=$1 WHERE id=$2',[other,b]);
    await db.query("INSERT INTO batches(id,name,class,base_fee) VALUES($1,'A','10',1000),($2,'B','10',1000)",[batch,foreignBatch]);
    await db.query('INSERT INTO student_batch(student_id,batch_id,start_date) VALUES($1,$3,current_date-1),($2,$4,current_date-1)',[sid,other,batch,foreignBatch]);
    for(const [id,bid,due] of [[assignment,batch,'1 day'],[foreignAssignment,foreignBatch,'1 day'],[late,batch,'-1 day']])await db.query("INSERT INTO assignments(id,batch_id,title,question_text,due_at,max_marks,created_by) VALUES($1,$2,'Exercise','Answer questions',now()+$3::interval,20,$4)",[id,bid,due,owner]);
    const file=`submissions/${assignment}/${sid}/${randomUUID()}.pdf`,otherFile=`submissions/${foreignAssignment}/${other}/${randomUUID()}.pdf`,question=`questions/${foreignAssignment}/file.pdf`;
    await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('assignment-files',$1),('assignment-files',$2),('assignment-files',$3)",[file,otherFile,question]);
    async function actor(id){await db.exec('RESET ROLE');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('SET ROLE authenticated');}
    const submit=(aid,p=file)=>db.query("SELECT submit_assignment($1,$2,'answer.pdf','application/pdf',100) AS result",[aid,p]);
    await actor(a);
    await t.test('only own batch assignments are visible',async()=>{assert.equal((await db.query('SELECT count(*)::int total FROM assignments')).rows[0].total,2);await assert.rejects(submit(foreignAssignment,otherFile),/enrolled/);});
    await t.test('deadline and uploaded-object checks are enforced',async()=>{await assert.rejects(submit(late),/deadline/);await assert.rejects(submit(assignment,`submissions/${assignment}/${sid}/missing.pdf`),/Upload/);await assert.rejects(submit(assignment,otherFile),/Invalid/);});
    const result=(await submit(assignment)).rows[0].result,id=result.id;
    await t.test('student cannot grade or write submission rows directly',async()=>{await assert.rejects(db.query('UPDATE assignment_submissions SET marks_awarded=20 WHERE id=$1',[id]));await assert.rejects(db.query("SELECT grade_assignment_submission($1,10,'',now())",[id]),/Owner/);});
    await actor(b);
    await t.test('other student cannot see submission or its file',async()=>{assert.equal((await db.query('SELECT count(*)::int total FROM assignment_submissions')).rows[0].total,0);assert.equal((await db.query('SELECT count(*)::int total FROM storage.objects WHERE name=$1',[file])).rows[0].total,0);});
    await actor(a);
    await t.test('broad old storage rules do not allow direct upload or anonymous reads',async()=>{
      await assert.rejects(db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('assignment-files','untrusted.pdf')"));
      await db.exec('RESET ROLE;SET ROLE anon');assert.equal((await db.query("SELECT count(*)::int total FROM storage.objects WHERE bucket_id='assignment-files'")).rows[0].total,0);await actor(a);
    });
    await actor(owner);
    const version=(await db.query('SELECT updated_at::text AS value FROM assignment_submissions WHERE id=$1',[id])).rows[0].value;
    await t.test('owner reviews but marks must respect maximum and current revision',async()=>{await assert.rejects(db.query("SELECT grade_assignment_submission($1,21,'',$2)",[id,version]),/marks/);await assert.rejects(db.query("SELECT grade_assignment_submission($1,10,'','2000-01-01')",[id]),/changed/);await db.query("SELECT grade_assignment_submission($1,15,'Good work',$2)",[id,version]);});
    await actor(a);
    await t.test('student sees feedback but cannot replace graded work',async()=>{const row=(await db.query('SELECT marks_awarded,feedback FROM assignment_submissions WHERE id=$1',[id])).rows[0];assert.equal(Number(row.marks_awarded),15);assert.equal(row.feedback,'Good work');await assert.rejects(submit(assignment),/graded/);});
  }finally{await db.close();}
});
