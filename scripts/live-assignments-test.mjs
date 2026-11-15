// Real API/Storage integration with disposable identities and scoped cleanup.
import nextEnv from '@next/env';
import pg from 'pg';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
import {root} from './database-upgrade.mjs';
nextEnv.loadEnvConfig(path.join(root,'apps/web'));
const require=createRequire(import.meta.url),{jsPDF}=require('jspdf'),JSZip=require('jszip');
const env=process.env,origin=env.APP_TEST_ORIGIN||'http://localhost:3000';
const url=env.NEXT_PUBLIC_SUPABASE_URL,ref=new URL(url).hostname.split('.')[0],connection=new URL(env.SUPABASE_DB_URL||env.DATABASE_URL);
if(connection.hostname!==`db.${ref}.supabase.co`&&!(connection.hostname.endsWith('.pooler.supabase.com')&&decodeURIComponent(connection.username)===`postgres.${ref}`))throw new Error('Database project mismatch');
for(const name of ['sslmode','sslrootcert','sslcert','sslkey'])connection.searchParams.delete(name);
const db=new pg.Client({connectionString:connection.toString(),connectionTimeoutMillis:15000,ssl:{ca:readFileSync(env.SUPABASE_DB_CA_PATH||path.join(root,'.runtime/supabase-ca.crt'),'utf8'),rejectUnauthorized:true,servername:connection.hostname}});
const admin=createClient(url,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const authIds=[],students=[randomUUID(),randomUUID()],batches=[randomUUID(),randomUUID()],assignments=[randomUUID(),randomUUID(),randomUUID(),randomUUID()];
const clients=[];let connected=false;let submissionIds=[];
async function identity(role,index){
  const email=`assignments-${randomUUID()}@example.com`,password=`Private-${randomUUID()}!`;
  const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true});if(error)throw new Error(`Test identity setup failed: ${error.code||error.name}`);
  const id=data.user.id;authIds.push(id);
  await db.query("INSERT INTO users(id,name,email,phone,role,status,student_id) VALUES($1,$2,$3,$4,$5,'active',$6)",[id,`Assignment verifier ${index}`,email,`+120255501${String(10+index).padStart(2,'0')}`,role,role==='student'?students[index-1]:null]);
  const jar=new Map();const client=createServerClient(url,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:items=>items.forEach(({name,value})=>value?jar.set(name,value):jar.delete(name))}});
  const login=await client.auth.signInWithPassword({email,password});if(login.error)throw new Error('Test identity login failed');clients.push(client);
  return {client,jar};
}
async function api(actor,pathname,{method='GET',body}={}){
  const headers={origin,...(actor?{cookie:[...actor.jar].map(([name,value])=>`${name}=${value}`).join('; ')}:{})};
  if(body&&!(body instanceof FormData))headers['Content-Type']='application/json';
  return fetch(`${origin}${pathname}`,{method,headers,body:body instanceof FormData?body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)});
}
async function ok(response,status=200){if(response.status!==status){let error;try{error=(await response.json()).error;}catch{}throw new Error(`API HTTP ${response.status} expected ${status}: ${error||'failed'}`);}return response;}
function creation(id,batch,bytes,name='questions.pdf'){
  const form=new FormData();form.set('id',id);form.set('batch_id',batch);form.set('title','Temporary assignment acceptance');form.set('question_text','Answer the attached questions.');form.set('due_at',new Date(Date.now()+86400000).toISOString());form.set('max_marks','20');if(bytes)form.set('file',new File([bytes],name));return form;
}
function upload(id,bytes,name){const form=new FormData();form.set('assignment_id',id);form.set('file',new File([bytes],name));return form;}
try{
  await db.connect();connected=true;
  for(let i=0;i<2;i++)await db.query("INSERT INTO students(id,name,class,date_of_birth,admission_date) VALUES($1,$2,'10','2010-01-01',current_date)",[students[i],`Temporary learner ${i}`]);
  for(let i=0;i<2;i++)await db.query("INSERT INTO batches(id,name,class,base_fee) VALUES($1,$2,'10',1000)",[batches[i],`Temporary assignment batch ${i}`]);
  await db.query('INSERT INTO student_batch(student_id,batch_id,start_date) VALUES($1,$3,current_date),($2,$4,current_date)',[...students,...batches]);
  const owner=await identity('owner',0),a=await identity('student',1),b=await identity('student',2);
  const pdf=new jsPDF();pdf.text('Private assignment question',20,20);const pdfBytes=Buffer.from(pdf.output('arraybuffer'));
  const zip=new JSZip();zip.file('[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');zip.file('word/document.xml','<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Private Word assignment answer</w:t></w:r></w:p></w:body></w:document>');
  const docx=await zip.generateAsync({type:'nodebuffer'});
  await ok(await api(owner,'/api/assignments',{method:'POST',body:creation(assignments[0],batches[0],pdfBytes)}),201);
  await ok(await api(owner,'/api/assignments',{method:'POST',body:creation(assignments[1],batches[1])}),201);
  await ok(await api(owner,'/api/assignments',{method:'POST',body:creation(assignments[2],batches[0],docx,'questions.docx')}),201);
  await ok(await api(owner,'/api/assignments',{method:'POST',body:creation(assignments[3],batches[0])}),201);
  assert.equal((await api(a,'/api/assignments',{method:'POST',body:creation(randomUUID(),batches[0])})).status,403);
  const visible=(await (await ok(await api(a,'/api/assignments'))).json()).assignments;
  assert.ok(visible.some(item=>item.id===assignments[0]));assert.ok(!visible.some(item=>item.id===assignments[1]));
  console.log('PASS: real owner publication and student batch isolation');
  const question=`/api/assignments/file?assignment=${assignments[0]}`;
  const inline=await ok(await api(a,question));assert.equal(inline.headers.get('content-type'),'application/pdf');assert.ok(inline.headers.get('content-disposition').startsWith('inline'));assert.equal(Buffer.from(await inline.arrayBuffer()).subarray(0,5).toString(),'%PDF-');
  assert.equal((await api(b,question)).status,404);assert.equal((await api(null,question)).status,401);
  const wordQuestion=await ok(await api(a,`/api/assignments/file?assignment=${assignments[2]}&preview=text`));assert.match((await wordQuestion.json()).text,/Private Word assignment answer/);
  console.log('PASS: private inline PDF and DOCX text preview; other-student/anonymous access denied');
  const first=await (await ok(await api(a,'/api/assignments/submit',{method:'POST',body:upload(assignments[0],pdfBytes,'answer.pdf')}))).json();submissionIds.push(first.id);
  await ok(await api(owner,`/api/assignments/file?assignment=${assignments[0]}&submission=${first.id}`));
  assert.equal((await api(b,`/api/assignments/file?assignment=${assignments[0]}&submission=${first.id}`)).status,404);
  const replacement=await (await ok(await api(a,'/api/assignments/submit',{method:'POST',body:upload(assignments[0],docx,'answer.docx')}))).json();assert.equal(replacement.id,first.id);
  const preview=await (await ok(await api(owner,`/api/assignments/file?assignment=${assignments[0]}&submission=${first.id}&preview=text`))).json();assert.match(preview.text,/Private Word assignment answer/);
  const all=(await (await ok(await api(owner,'/api/assignments'))).json()).assignments;
  const submitted=all.find(item=>item.id===assignments[0]).assignment_submissions[0];
  assert.equal(submitted.student_id,students[0]);
  assert.equal((await api(a,'/api/assignments/grade',{method:'POST',body:{id:first.id,marks:10,feedback:'',version:submitted.updated_at}})).status,403);
  assert.equal((await api(owner,'/api/assignments/grade',{method:'POST',body:{id:first.id,marks:21,feedback:'',version:submitted.updated_at}})).status,400);
  await ok(await api(owner,'/api/assignments/grade',{method:'POST',body:{id:first.id,marks:15,feedback:'Reviewed inside portal',version:submitted.updated_at}}));
  assert.equal((await api(a,'/api/assignments/submit',{method:'POST',body:upload(assignments[0],pdfBytes,'changed.pdf')})).status,400);
  await db.query("UPDATE assignments SET due_at=now()-interval '1 minute' WHERE id=$1",[assignments[3]]);
  assert.equal((await api(a,'/api/assignments/submit',{method:'POST',body:upload(assignments[3],pdfBytes,'late.pdf')})).status,400);
  assert.equal((await api(a,'/api/assignments/submit',{method:'POST',body:upload(assignments[2],Buffer.from('<html>bad document</html>'),'fake.pdf')})).status,400);
  const own=(await (await ok(await api(a,'/api/assignments'))).json()).assignments.find(item=>item.id===assignments[0]).assignment_submissions[0];assert.equal(Number(own.marks_awarded),15);assert.equal(own.feedback,'Reviewed inside portal');
  const bucket=await admin.storage.getBucket('assignment-files');assert.equal(bucket.data.public,false);
  console.log('PASS: PDF/Word submission, replacement, owner review/grading, feedback, deadline and invalid-file protection');
}finally{
  let failed=false;
  if(connected){
    submissionIds=(await db.query('SELECT id FROM assignment_submissions WHERE assignment_id=ANY($1::uuid[])',[assignments])).rows.map(row=>row.id);
    const files=[];
    for(const id of assignments){
      for(const prefix of [`questions/${id}`,...students.map(student=>`submissions/${id}/${student}`)]){
        const {data,error}=await admin.storage.from('assignment-files').list(prefix);
        if(error){failed=true;continue;}for(const file of data||[])if(file.id)files.push(`${prefix}/${file.name}`);
      }
    }
    if(files.length){const {error}=await admin.storage.from('assignment-files').remove(files);if(error)failed=true;}
    await db.query('DELETE FROM assignment_submissions WHERE assignment_id=ANY($1::uuid[])',[assignments]);
    await db.query('DELETE FROM assignments WHERE id=ANY($1::uuid[])',[assignments]);
    await db.query('DELETE FROM student_batch WHERE batch_id=ANY($1::uuid[])',[batches]);
    await db.query('DELETE FROM batches WHERE id=ANY($1::uuid[])',[batches]);
    for(const id of authIds){const {error}=await admin.auth.admin.deleteUser(id);if(error)failed=true;}
    await db.query('DELETE FROM students WHERE id=ANY($1::uuid[])',[students]);
    await db.query('DELETE FROM audit_log WHERE entity_id=ANY($1::uuid[])',[[...students,...batches,...assignments,...submissionIds,...authIds]]);
    await db.end();
  }
  if(failed){console.error('Temporary record cleanup requires review.');process.exitCode=1;}else console.log('Temporary assignment accounts, records and storage objects cleaned up.');
}
