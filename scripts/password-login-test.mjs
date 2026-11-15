import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
function compile(file,imports={}) {
  const module={exports:{}};
  new Function('module','exports','require',ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(module,module.exports,name=>{
    if(!(name in imports))throw new Error(`Unexpected import ${name}`);
    return imports[name];
  });return module.exports;
}
test('unified password endpoint verifies Auth credentials for both email and mobile',async t=>{
  let state;
  const profile={id:'identity-1',status:'active'};
  const reset=()=>{state={profile:{...profile},mapping:{...profile,email:'student@example.com'},user:{id:profile.id,app_metadata:{}},calls:[],signedOut:false};};
  const client={auth:{
    signInWithPassword:async credentials=>{state.calls.push(credentials);return {data:{user:state.user},error:state.authError};},
    signOut:async()=>{state.signedOut=true;return {error:null};},
  },from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:state.profile})})})})};
  const admin={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:state.mapping,error:null})})})})};
  const route=compile('../apps/web/src/app/api/auth/password/route.ts',{
    'next/server':{NextResponse:{json:(body,options)=>Response.json(body,options)}},
    '@supabase/supabase-js':{createClient:()=>admin},
    '@/lib/supabase/server':{createServerSupabaseClient:()=>client},
    '@/lib/account-validation':compile('../apps/web/src/lib/account-validation.ts'),
  });
  const oldUrl=process.env.NEXT_PUBLIC_SUPABASE_URL,oldKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL='https://test.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='test-only';
  const send=(identifier='student@example.com',password='123456',origin='http://localhost:3000')=>route.POST(new Request('http://localhost:3000/api/auth/password',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({identifier,password})}));
  try {
    await t.test('cross-origin and invalid identifiers do not reach Auth',async()=>{
      reset();assert.equal((await send('student@example.com','123456','https://other.test')).status,403);
      assert.equal((await send('invalid')).status,400);assert.equal(state.calls.length,0);
    });
    await t.test('email goes to Supabase Auth, and mobile resolves to its registered email',async()=>{
      reset();assert.equal((await send()).status,200);assert.deepEqual(state.calls[0],{email:'student@example.com',password:'123456'});
      reset();assert.equal((await send('9876543210')).status,200);assert.equal(state.calls[0].email,'student@example.com');
    });
    await t.test('temporary password is never accepted without Auth validation',async()=>{
      reset();state.authError={name:'AuthApiError'};assert.equal((await send()).status,401);
      assert.equal(state.calls.length,1);
    });
    await t.test('missing/inactive mobile mapping and inactive profiles are denied',async()=>{
      reset();state.mapping=null;assert.equal((await send('9876543210')).status,401);assert.equal(state.calls.length,0);
      reset();state.mapping.status='inactive';assert.equal((await send('9876543210')).status,401);
      reset();state.profile.status='inactive';assert.equal((await send()).status,403);assert.equal(state.signedOut,true);
    });
    await t.test('mapped identity cannot authenticate as a different Auth user',async()=>{
      reset();state.user.id='other-identity';assert.equal((await send('9876543210')).status,401);assert.equal(state.signedOut,true);
    });
    await t.test('first-login redirect is server-owned and responses never expose mapped email',async()=>{
      reset();state.user.app_metadata.must_change_password=true;
      const response=await send('9876543210');const body=await response.json();
      assert.deepEqual(body,{redirect:'/auth/update-password'});assert.equal('email' in body,false);
    });
  } finally {
    if(oldUrl===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=oldUrl;
    if(oldKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=oldKey;
  }
});
test('email recovery endpoint rejects SMS input and verifies only recovery email codes',async()=>{
  let captured,expired=false;
  const client={auth:{verifyOtp:async input=>{captured=input;return {data:{user:{id:'test-user'}},error:expired ? {message:'expired'} : null};},signOut:async()=>({error:null})},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{status:'active'}})})})})};
  const route=compile('../apps/web/src/app/api/auth/signin/route.ts',{
    'next/server':{NextResponse:{json:(body,options)=>Response.json(body,options)}},
    '@/lib/supabase/server':{createServerSupabaseClient:()=>client},
    '@/lib/account-validation':compile('../apps/web/src/lib/account-validation.ts'),
  });
  const send=body=>route.POST(new Request('http://localhost:3000/api/auth/signin',{method:'POST',headers:{origin:'http://localhost:3000','Content-Type':'application/json'},body:JSON.stringify(body)}));
  assert.equal((await send({phone:'+919876543210',otp:'123456'})).status,400);
  assert.equal(captured,undefined);
  const valid=await send({email:'Student@Example.com',otp:'123456'});
  assert.equal(valid.status,200);assert.deepEqual(captured,{email:'student@example.com',token:'123456',type:'recovery'});
  assert.deepEqual(await valid.json(),{redirect:'/auth/update-password'});
  expired=true;assert.equal((await send({email:'student@example.com',otp:'123456'})).status,401);
});
test('recovery email is code-only and frontend does not request an email redirect',()=>{
  const template=readFileSync(new URL('../supabase/templates/recovery.html',import.meta.url),'utf8');
  assert.match(template,/\{\{ \.Token \}\}/);
  assert.doesNotMatch(template,/href\s*=|ConfirmationURL|TokenHash/);
  const page=readFileSync(new URL('../apps/web/src/app/page.tsx',import.meta.url),'utf8');
  assert.match(page,/resetPasswordForEmail\(identity.email\)/);
  assert.doesNotMatch(page,/redirectTo|use the emailed reset link/);
});
