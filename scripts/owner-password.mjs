// Server/CLI only. Never import owner environment credentials into web clients.
export function readOwnerPassword(env=process.env) {
  const password=env.ACADEMY_ACCOUNT_PASSWORD;
  if(typeof password!=='string' || password.length<6 || !password.trim()) throw new Error('Set ACADEMY_ACCOUNT_PASSWORD locally (at least 6 characters).');
  return password;
}
export async function synchronizeOwnerPassword({admin,verifier,email,phone,password}) {
  const {data:profile,error:profileError}=await admin.from('users').select('id,email,phone,role,status').eq('email',email).eq('phone',phone).eq('role','owner').eq('status','active').maybeSingle();
  if(profileError || !profile) throw new Error('No matching active owner profile. Owner password was not changed.');
  const {data:identity,error:identityError}=await admin.auth.admin.getUserById(profile.id);
  if(identityError || identity.user?.email?.toLowerCase()!==email) throw new Error('Owner Auth identity does not match the configured email. No password change performed.');
  const {error:loginError}=await verifier.auth.signInWithPassword({email,password});
  if(!loginError) { await verifier.auth.signOut({scope:'local'}); return 'already-matches'; }
  if(loginError.code!=='invalid_credentials') throw new Error('Unable to verify owner credentials; password was not changed.');
  const {error:updateError}=await admin.auth.admin.updateUserById(profile.id,{password});
  if(updateError) throw new Error(`Owner password update failed (${updateError.code || updateError.name}).`);
  const {error:flagError}=await admin.auth.admin.updateUserById(profile.id,{app_metadata:{...identity.user.app_metadata,must_change_password:true}});
  if(flagError) throw new Error('Owner password updated, but first-login flag setup needs administrator review.');
  return 'updated';
}
