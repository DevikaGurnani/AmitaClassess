import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readOwnerPassword,synchronizeOwnerPassword} from './owner-password.mjs';
test('owner password is required from env and never silently defaults',()=>{
  assert.throws(()=>readOwnerPassword({}));
  assert.throws(()=>readOwnerPassword({ACADEMY_ACCOUNT_PASSWORD:'123'}));
  assert.equal(readOwnerPassword({ACADEMY_ACCOUNT_PASSWORD:'env-only-secret'}),'env-only-secret');
});
function fixture(){
  const state={profile:{id:'owner-id'},user:{email:'owner@example.test',app_metadata:{provider:'email'}},updates:[],loginError:null,signOut:false};
  const query={eq:()=>query,maybeSingle:async()=>({data:state.profile})};
  const admin={from:()=>({select:()=>query}),auth:{admin:{getUserById:async()=>({data:{user:state.user}}),updateUserById:async(id,attributes)=>{state.updates.push({id,attributes});return {error:null};}}}};
  const verifier={auth:{signInWithPassword:async()=>({error:state.loginError}),signOut:async()=>{state.signOut=true;}}};
  return {state,args:{admin,verifier,email:'owner@example.test',phone:'+919000000001',password:'env-only-secret'}};
}
test('matching password is verified without reset or metadata changes',async()=>{
  const {state,args}=fixture();assert.equal(await synchronizeOwnerPassword(args),'already-matches');
  assert.equal(state.updates.length,0);assert.equal(state.signOut,true);
});
test('missing owner, mismatched identity and network failure never overwrite credentials',async()=>{
  let f=fixture();f.state.profile=null;await assert.rejects(synchronizeOwnerPassword(f.args));assert.equal(f.state.updates.length,0);
  f=fixture();f.state.user.email='other@example.test';await assert.rejects(synchronizeOwnerPassword(f.args));assert.equal(f.state.updates.length,0);
  f=fixture();f.state.loginError={code:'fetch_failed'};await assert.rejects(synchronizeOwnerPassword(f.args));assert.equal(f.state.updates.length,0);
});
test('explicit sync updates only matched owner and preserves app metadata with first-change flag',async()=>{
  const {state,args}=fixture();state.loginError={code:'invalid_credentials'};
  assert.equal(await synchronizeOwnerPassword(args),'updated');
  assert.deepEqual(state.updates,[{id:'owner-id',attributes:{password:'env-only-secret'}},{id:'owner-id',attributes:{app_metadata:{provider:'email',must_change_password:true}}}]);
});
