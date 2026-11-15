import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
const read=file=>readFileSync(new URL(`../apps/web/src/${file}`,import.meta.url),'utf8');
function load(file,imports={}){
  const module={exports:{}};
  new Function('module','exports','require',ts.transpileModule(read(file),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(module,module.exports,name=>imports[name]);
  return module.exports;
}
test('retiring the old identity preserves tab-stored admission data',()=>{
  const store=new Map([['tuition-demo-session','owner'],['tuition-demo-data-v1','saved-admissions']]);
  globalThis.window={sessionStorage:{removeItem:key=>store.delete(key)}};
  try {
    load('lib/retire-demo.ts').retireDemoSession();
    assert.equal(store.has('tuition-demo-session'),false);
    assert.equal(store.get('tuition-demo-data-v1'),'saved-admissions');
  } finally {delete globalThis.window;}
});
test('data hook always returns the actual Supabase client even with an old mock session',()=>{
  const actual={from:()=>{},rpc:()=>{}};
  const hook=load('lib/auth-context.ts',{
    react:{},'@/lib/supabase/client':{createBrowserSupabaseClient:()=>actual},
    '@/lib/retire-demo':{retireDemoSession:()=>{}},'@/lib/account-validation':{},
  });
  assert.equal(hook.useSupabase().supabase,actual);
});
test('old fixture identities are disabled and cannot restart in development',()=>{
  const auth=load('lib/demo-auth.ts');
  assert.equal(auth.demoLoginEnabled,false);
  assert.equal(auth.getDemoUser(),null);
  assert.equal(auth.isDemoPhone('123456789'),false);
  assert.throws(()=>auth.startDemoSession('123456789','1234','owner'));
});
test('login and admissions do not offer or route data to mock storage',()=>{
  assert.doesNotMatch(read('app/page.tsx'),/demo-auth|demoLoginEnabled|Explore sample demo|verifyPhoneOtp/);
  assert.doesNotMatch(read('lib/auth-context.ts'),/demoClient|getDemoUser|demo-data/);
  assert.doesNotMatch(read('components/StudentEditor.tsx'),/demoRole|isDemo|Demo admission/);
  assert.match(read('components/StudentEditor.tsx'),/save_student_admission/);
});
