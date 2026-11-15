import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {createHmac} from 'node:crypto';
const require=createRequire(import.meta.url);
let ts; try { ts=require('typescript'); } catch { ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript'); }
const root=resolve(import.meta.dirname,'..');
function loadSource(path){const src=readFileSync(join(root,path),'utf8');const out=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;const module={exports:{}};new Function('require','module','exports',out)(require,module,module.exports);return module.exports;}
const sql=readFileSync(join(root,'supabase/migrations/20261110_02_phase2.sql'),'utf8');
function allSources(dir){return readdirSync(dir).flatMap(f=>{const fp=join(dir,f);return statSync(fp).isDirectory()?allSources(fp):/\.tsx?$/.test(f)?[fp]:[];});}
test('all source files parse as TypeScript/TSX',()=>{const files=[...allSources(join(root,'apps/web/src')),...allSources(join(root,'packages/shared/src'))];assert.ok(files.length>=35);for(const f of files){const sf=ts.createSourceFile(f,readFileSync(f,'utf8'),ts.ScriptTarget.Latest,true,f.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);assert.equal(sf.parseDiagnostics.length,0,`${f}: ${sf.parseDiagnostics.map(x=>ts.flattenDiagnosticMessageText(x.messageText,' '))}`);}});
test('valid gateway HMAC accepted, altered payload and malformed HMAC rejected',()=>{const {verifyWebhookSignature}=loadSource('apps/web/src/lib/phase2/gateway.ts');const body='{"event":"payment.captured"}';const signature=createHmac('sha256','secret').update(body).digest('hex');assert.equal(verifyWebhookSignature(body,signature,'secret'),true);assert.equal(verifyWebhookSignature(body+' ',signature,'secret'),false);assert.equal(verifyWebhookSignature(body,'not-hex','secret'),false);assert.equal(verifyWebhookSignature(body,signature,'wrong'),false);});
test('offline queue stores marks and removes only confirmed keys',()=>{const store=new Map();globalThis.window={};globalThis.localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)};const {readQueue,queueMark,removeMark}=loadSource('apps/web/src/lib/phase2/offline.ts');const a={clientKey:'a',studentId:'s',batchId:'b',date:'2026-11-10',status:'present',queuedBy:'u'};assert.equal(readQueue().length,0);queueMark(a);queueMark({...a,clientKey:'b',status:'absent'});assert.equal(readQueue().length,2);removeMark('a');assert.equal(readQueue().length,1);assert.equal(readQueue()[0].clientKey,'b');delete globalThis.window;delete globalThis.localStorage;});
test('test scores constrained to valid enrollment and test maximum',()=>{assert.match(sql,/marks <= \(SELECT t\.max_marks/);assert.match(sql,/JOIN student_batch sb ON sb\.batch_id=t\.batch_id/);});
test('test and marks parent/teacher RLS present',()=>{assert.match(sql,/CREATE POLICY marks_read/);assert.match(sql,/private\.is_parent_of\(student_id\)/);assert.match(sql,/private\.teaches_batch\(t\.batch_id\)/);});
test('offline sync enforces permissions and idempotency',()=>{assert.match(sql,/UNIQUE\(user_id,client_key\)/);assert.match(sql,/p_date<>v_date_today/);assert.match(sql,/private\.teaches_batch\(p_batch_id\)/);});
test('gateway settlement RPC restricted to service role',()=>{assert.match(sql,/REVOKE ALL ON FUNCTION public\.settle_gateway_payment/);assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.settle_gateway_payment\(text,text,bigint\) TO service_role/);});
test('gateway records transaction and updates dues with trigger',()=>{assert.match(sql,/CREATE TRIGGER recalculate_due_after_payment/);assert.match(sql,/INSERT INTO payments\(due_id,student_id,amount,mode/);});
test('gateway webhook verifies signature before settlement',()=>{const src=readFileSync(join(root,'apps/web/src/app/api/payments/webhook/route.ts'),'utf8');assert.ok(src.indexOf('verifyWebhookSignature(')<src.indexOf("sb.rpc('settle_gateway_payment'"));});
test('public order creation authenticates user and reads dues through RLS',()=>{const src=readFileSync(join(root,'apps/web/src/app/api/payments/create-order/route.ts'),'utf8');assert.match(src,/sb\.auth\.getUser\(\)/);assert.match(src,/\.from\('fee_dues'\)/);});
test('notification jobs cannot be called by public users',()=>{assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.claim_notification_jobs\(integer\) TO service_role/);assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.generate_reminder_notifications\(\) TO service_role/);});
test('notification reminder deduplication exists',()=>{assert.match(sql,/idx_notification_dedupe_key/);assert.match(sql,/absence:'\|\|a\.id/);});
test('notices teacher publishing restricted to assigned batch',()=>{assert.match(sql,/CREATE POLICY notices_add[\s\S]*?private\.teaches_batch\(batch_id\)/);});
test('report formats include xlsx and pdf',()=>{const src=readFileSync(join(root,'apps/web/src/lib/phase2/export.ts'),'utf8');assert.match(src,/XLSX\.writeFile/);assert.match(src,/autoTable\(pdf/);});
test('no demo account or leaked environment values in new source',()=>{for(const f of allSources(join(root,'apps/web/src'))){const s=readFileSync(f,'utf8');assert.doesNotMatch(s,/demo123|admin@demo\.com/i,f);}});
