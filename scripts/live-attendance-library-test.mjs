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
  await db.query("INSERT INTO users(id,name,email,phone,role,status,student_id) VALUES($1,$2,$3,$4,$5,'active',$6)",[id,`Temporary library check ${role}`,email,`+120255501${String(10+index).padStart(2,'0')}`,role,role==='student'?students[index-1]:null]);
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
const className=`verify-${randomUUID().slice(0,8)}`,channels=[];
function resource(folder,bytes,name='notes.pdf',link){const form=new FormData();form.set('class_name',className);form.set('title','Acceptance resource');if(folder)form.set('folder_id',folder);if(bytes)form.set('file',new File([bytes],name));if(link)form.set('url',link);return form;}
async function subscribe(actor,student){const events=[];const channel=actor.client.channel(`attendance-${randomUUID()}`).on('postgres_changes',{event:'*',schema:'public',table:'attendance',filter:`student_id=eq.${student}`},payload=>events.push(payload));channels.push([actor.client,channel]);await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Realtime subscription timeout')),20000);channel.subscribe(status=>{if(status==='SUBSCRIBED'){clearTimeout(timer);resolve();}if(status==='CHANNEL_ERROR'){clearTimeout(timer);reject(new Error('Realtime channel rejected'));}});});return events;}
async function until(check){const end=Date.now()+15000;while(!check()){if(Date.now()>end)throw new Error('Realtime event not delivered');await new Promise(resolve=>setTimeout(resolve,100));}}
try{
 await db.connect();connected=true;
 for(let i=0;i<2;i++){await db.query('INSERT INTO students(id,name,class,date_of_birth,admission_date) VALUES($1,$2,$3,\'2010-01-01\',current_date)',[students[i],`Library verifier ${i}`,i===0?className:`${className}-other`]);await db.query('INSERT INTO batches(id,name,class,base_fee) VALUES($1,$2,$3,1000)',[batches[i],`Library verifier batch ${i}`,i===0?className:`${className}-other`]);await db.query('INSERT INTO student_batch(student_id,batch_id,start_date) VALUES($1,$2,current_date)',[students[i],batches[i]]);}
 const owner=await identity('owner',0),a=await identity('student',1),b=await identity('student',2);
 const ownEvents=await subscribe(a,students[0]),foreignEvents=await subscribe(b,students[0]);
 const date=(await db.query('SELECT current_date::text AS date')).rows[0].date;
 async function mark(status,marks=[{student_id:students[0],status}]){return owner.client.rpc('mark_batch_attendance',{p_request_id:randomUUID(),p_batch_id:batches[0],p_date:date,p_marks:marks});}
 assert.equal((await mark('present')).error,null);await until(()=>ownEvents.some(item=>item.eventType==='INSERT'));
 assert.equal((await mark('absent')).error,null);await until(()=>ownEvents.some(item=>item.eventType==='UPDATE'&&item.new.status==='absent'));
 assert.equal(foreignEvents.length,0);
 assert.ok((await mark('present',[{student_id:students[0],status:'present'},{student_id:students[1],status:'present'}])).error);
 assert.equal((await a.client.from('attendance').select('status').eq('student_id',students[0]).single()).data.status,'absent');
 assert.ok((await a.client.rpc('mark_batch_attendance',{p_request_id:randomUUID(),p_batch_id:batches[0],p_date:date,p_marks:[{student_id:students[0],status:'present'}]})).error);
 console.log('PASS real student WebSocket INSERT/UPDATE, other-class isolation and atomic batch rollback');
 async function folder(name,parent){return (await (await ok(await api(owner,'/api/library/folders',{method:'POST',body:{name,class_name:className,parent_id:parent}}),201)).json()).id;}
 const top=await folder('Science'),nested=await folder('Chapter One',top);
 const pdf=new jsPDF();pdf.text('Private class library PDF',20,20);const bytes=Buffer.from(pdf.output('arraybuffer'));
 const rootFile=(await (await ok(await api(owner,'/api/library',{method:'POST',body:resource(null,bytes)}),201)).json()).id;
 const nestedFile=(await (await ok(await api(owner,'/api/library',{method:'POST',body:resource(nested,bytes)}),201)).json()).id;
 const link=(await (await ok(await api(owner,'/api/library',{method:'POST',body:resource(nested,null,'', 'https://example.com/learning')}),201)).json()).id;
 const zip=new JSZip();zip.file('[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');zip.file('word/document.xml','<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Private library Word content</w:t></w:r></w:p></w:body></w:document>');
 const word=(await (await ok(await api(owner,'/api/library',{method:'POST',body:resource(nested,await zip.generateAsync({type:'nodebuffer'}),'notes.docx')}),201)).json()).id;
 const stored=(await db.query('SELECT * FROM library_files WHERE class_name=$1',[className])).rows;
 assert.match(stored.find(row=>row.id===nestedFile).storage_path,/^classes\/[^/]+\/science-[^/]+\/chapter-one-[^/]+\//i);assert.equal(stored.find(row=>row.id===link).external_url,'https://example.com/learning');assert.equal(stored.find(row=>row.id===link).storage_path,null);
 const visible=await (await ok(await api(a,`/api/library?class=${className}`))).json();assert.equal(visible.files.length,4);assert.equal(visible.folders.length,2);
 if(process.env.BROWSER_TEST==='1'){
  const {chromium}=await import('../.runtime/browser-tools/node_modules/playwright-core/index.mjs');const {mkdirSync}=await import('node:fs');mkdirSync(path.join(root,'.runtime/screenshots'),{recursive:true});
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try{
   const studentContext=await browser.newContext({viewport:{width:1440,height:1000}});await studentContext.addCookies([...a.jar].map(([name,value])=>({name,value,url:origin})));
   const studentPage=await studentContext.newPage();await studentPage.goto(`${origin}/student?view=materials`);await studentPage.locator('.library-folder-nav').getByRole('button',{name:/^Science/}).click();await studentPage.locator('.library-folder-nav').getByRole('button',{name:/^Chapter One/}).click();await studentPage.locator('.library-chapter-heading h3').filter({hasText:'Chapter One'}).waitFor();assert.equal(await studentPage.getByRole('heading',{name:'Your learning library',exact:true}).count(),0);assert.equal(await studentPage.getByRole('button',{name:'Upload',exact:true}).count(),0);await studentPage.screenshot({path:path.join(root,'.runtime/screenshots/student-library.png'),fullPage:true});
   await studentPage.setViewportSize({width:390,height:844});await studentPage.waitForTimeout(400);await studentPage.screenshot({path:path.join(root,'.runtime/screenshots/student-library-mobile.png'),fullPage:true});assert.ok(await studentPage.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2));
   const ownerContext=await browser.newContext({viewport:{width:1440,height:1000}});await ownerContext.addCookies([...owner.jar].map(([name,value])=>({name,value,url:origin})));
   const ownerPage=await ownerContext.newPage();await ownerPage.goto(`${origin}/owner/materials`);await ownerPage.screenshot({path:path.join(root,'.runtime/screenshots/owner-before-select.png'),fullPage:true});await ownerPage.locator('.library-class-picker select').selectOption(className);await ownerPage.locator('.library-folder-nav').getByRole('button',{name:/^Chapter One/}).click();await ownerPage.getByRole('button',{name:'Upload',exact:true}).click();assert.equal(await ownerPage.getByLabel('Resource destination folder').inputValue(),nested);await ownerPage.screenshot({path:path.join(root,'.runtime/screenshots/owner-library.png'),fullPage:true});
   await ownerPage.getByRole('button',{name:'Close resource form'}).click();await ownerPage.getByRole('button',{name:'New folder',exact:true}).click();await ownerPage.getByLabel('Folder or chapter name').fill('UI acceptance folder');await ownerPage.getByRole('button',{name:'Create folder',exact:true}).click();await ownerPage.locator('.app-toast').filter({hasText:'Folder created'}).waitFor();await ownerPage.locator('.library-chapter-heading h3').filter({hasText:'UI acceptance folder'}).waitFor();await ownerPage.getByRole('button',{name:'Back',exact:true}).click();await ownerPage.getByRole('button',{name:'Delete folder UI acceptance folder',exact:true}).click();await ownerPage.getByRole('alertdialog').getByRole('button',{name:'Delete',exact:true}).click();await ownerPage.locator('.app-toast').filter({hasText:'Resource deleted'}).waitFor();
   await ownerPage.getByRole('button',{name:/^Notifications/}).click();await ownerPage.getByRole('region',{name:'Recent notifications'}).waitFor();
   console.log('PASS Chrome student/owner folder navigation, selected chapter, mobile overflow, destination selector, upload form and create/delete right-side toasts');
  }finally{await browser.close();}
 }
 assert.equal((await (await ok(await api(b,`/api/library?class=${className}`))).json()).files.length,0);
 const inline=await ok(await api(a,`/api/library/file?id=${rootFile}`));assert.match(inline.headers.get('content-disposition'),/^inline/);assert.equal(inline.headers.get('content-type'),'application/pdf');
 assert.match((await (await ok(await api(a,`/api/library/file?id=${word}&preview=text`))).json()).text,/Private library Word content/);
 assert.equal((await api(b,`/api/library/file?id=${rootFile}`)).status,404);assert.equal((await api(null,`/api/library/file?id=${rootFile}`)).status,401);
 assert.equal((await api(a,'/api/library',{method:'POST',body:resource(null,bytes)})).status,403);
 assert.equal((await api(a,'/api/library/folders',{method:'POST',body:{name:'Forbidden',class_name:className}})).status,403);
 assert.ok((await a.client.from('library_files').insert({class_name:className,title:'Forbidden link',kind:'link',external_url:'https://example.com',created_by:authIds[1]})).error);
 assert.equal((await api(owner,'/api/library',{method:'POST',body:resource(null,Buffer.from('not PDF'),'fake.pdf')})).status,400);
 assert.equal((await api(owner,'/api/library',{method:'POST',body:resource(null,Buffer.from('text'),'notes.txt')})).status,400);
 assert.equal((await api(owner,'/api/library',{method:'POST',body:resource(null,null,'','http://example.com')})).status,400);
 const bucket=await admin.storage.getBucket('learning-library');assert.equal(bucket.data.public,false);
 const foreign=await b.client.storage.from('learning-library').download(stored.find(row=>row.id===rootFile).storage_path);assert.ok(foreign.error);
 const events=[];const activityChannel=a.client.channel(`activity-${randomUUID()}`).on('postgres_changes',{event:'INSERT',schema:'public',table:'library_activity',filter:`class_name=eq.${className}`},payload=>events.push(payload.new));channels.push([a.client,activityChannel]);
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Activity channel timeout')),15000);activityChannel.subscribe(status=>{if(status==='SUBSCRIBED'){clearTimeout(timer);resolve();}});});
 assert.equal((await api(a,'/api/library',{method:'DELETE',body:{id:rootFile,kind:'file'}})).status,403);
 assert.equal((await api(owner,'/api/library',{method:'DELETE',body:{id:top,kind:'folder'}})).status,400);
 await ok(await api(owner,'/api/library',{method:'DELETE',body:{id:rootFile,kind:'file'}}));
 await until(()=>events.some(row=>row.action==='deleted'&&row.title==='Acceptance resource'));
 assert.equal((await admin.storage.from('learning-library').download(stored.find(row=>row.id===rootFile).storage_path)).data,null);
 const activity=await a.client.from('library_activity').select('action,actor_id').eq('class_name',className);assert.ok(activity.data.some(row=>row.action==='deleted'&&row.actor_id===authIds[0]));
 assert.equal((await b.client.from('library_activity').select('id').eq('class_name',className)).data.length,0);
 assert.ok((await a.client.from('library_activity').insert({class_name:className,action:'created',resource_kind:'file',title:'Spoofed'})).error);
 const empty=await folder('Empty folder');await ok(await api(owner,'/api/library',{method:'DELETE',body:{id:empty,kind:'folder'}}));
 console.log('PASS owner-only deletion, nonempty folder protection, Storage removal and class-scoped realtime delete notifications');
 console.log('PASS owner-only nested/root PDF and Word uploads, database links, structured private Storage, inline preview, student class RLS and invalid-file rejection');
}finally{
 for(const [client,channel] of channels)await client.removeChannel(channel);
 for(const client of clients){client.auth.stopAutoRefresh();client.realtime.disconnect();}
 if(connected){
  const files=(await db.query('SELECT id,storage_path FROM library_files WHERE class_name=$1',[className])).rows;
  const paths=files.filter(row=>row.storage_path).map(row=>row.storage_path);if(paths.length){const result=await admin.storage.from('learning-library').remove(paths);if(result.error)throw new Error('Test Storage cleanup failed');}
  await db.query('DELETE FROM library_files WHERE class_name=$1',[className]);
  const folders=(await db.query('SELECT id FROM library_folders WHERE class_name=$1',[className])).rows;
  while((await db.query('DELETE FROM library_folders f WHERE class_name=$1 AND NOT EXISTS(SELECT 1 FROM library_folders c WHERE c.parent_id=f.id)',[className])).rowCount){}
  await db.query('DELETE FROM library_activity WHERE class_name=$1',[className]);
  await db.query('DELETE FROM attendance_sync_keys WHERE user_id=ANY($1::uuid[])',[authIds]);
  await db.query('DELETE FROM attendance WHERE student_id=ANY($1::uuid[])',[students]);
  await db.query('DELETE FROM student_batch WHERE student_id=ANY($1::uuid[])',[students]);
  await db.query('DELETE FROM batches WHERE id=ANY($1::uuid[])',[batches]);
  for(const id of authIds){const result=await admin.auth.admin.deleteUser(id);if(result.error)throw new Error('Test identity cleanup failed');}
  await db.query('DELETE FROM students WHERE id=ANY($1::uuid[])',[students]);
  await db.query('DELETE FROM audit_log WHERE entity_id=ANY($1::uuid[])',[[...students,...batches,...authIds,...files.map(row=>row.id),...folders.map(row=>row.id)]]);
  await db.end();console.log('Temporary verification accounts, records and files cleaned up.');
 }
}
