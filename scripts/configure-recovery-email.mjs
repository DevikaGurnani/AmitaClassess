// Only changes recovery subject/body; never touches SMTP, providers or Site URL.
import nextEnv from '@next/env';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { root } from './database-upgrade.mjs';
nextEnv.loadEnvConfig(path.join(root,'apps/web'));
const template=readFileSync(path.join(root,'supabase/templates/recovery.html'),'utf8');
if(!template.includes('{{ .Token }}') || /ConfirmationURL|TokenHash|href\s*=/i.test(template))throw new Error('Recovery template must contain the OTP and no reset links.');
const token=process.env.SUPABASE_ACCESS_TOKEN;
if(!token)throw new Error('Hosted template not changed: SUPABASE_ACCESS_TOKEN missing. Paste supabase/templates/recovery.html into the Supabase Reset Password template, or set the token locally.');
const host=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname;
if(!/^[a-z0-9]+\.supabase\.co$/.test(host))throw new Error('Use the canonical project URL.');
const endpoint=`https://api.supabase.com/v1/projects/${host.split('.')[0]}/config/auth`;
const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
async function call(method,body){
  const response=await fetch(endpoint,{method,headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error(`Auth configuration HTTP ${response.status}; no settings response is printed.`);
  return response.json();
}
const before=await call('GET');
console.log('Current hosted recovery contains OTP:',Boolean(before.mailer_templates_recovery_content?.includes('{{ .Token }}')));
console.log('Current hosted recovery contains a link:',/ConfirmationURL|TokenHash|href\s*=/i.test(before.mailer_templates_recovery_content||''));
if(process.argv.includes('--apply')){
  const dir=path.join(root,'.runtime','auth-config-backups');mkdirSync(dir,{recursive:true});
  writeFileSync(path.join(dir,`recovery-${Date.now()}.json`),JSON.stringify({mailer_subjects_recovery:before.mailer_subjects_recovery,mailer_templates_recovery_content:before.mailer_templates_recovery_content},null,2));
  await call('PATCH',{mailer_subjects_recovery:'TuitionApp password reset code',mailer_templates_recovery_content:template});
  const after=await call('GET');
  if(after.mailer_templates_recovery_content?.trim()!==template.trim())throw new Error('Hosted template verification failed.');
  console.log('OTP-only recovery email template applied and verified. Request a fresh email; old messages do not change.');
}
