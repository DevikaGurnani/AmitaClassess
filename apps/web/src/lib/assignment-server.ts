import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { assignmentBucket,assignmentFileLimit } from '@/lib/assignments';
export class AssignmentError extends Error { constructor(message: string, public status=400) { super(message); } }
export async function assignmentActor(request?: Request,roles=['owner','teacher','student','parent']) {
  if(request && request.method!=='GET' && request.headers.get('origin')!==new URL(request.url).origin)throw new AssignmentError('Invalid request origin.',403);
  const sb=createServerSupabaseClient();
  const {data:{user},error}=await sb.auth.getUser();
  if(error || !user)throw new AssignmentError('Please sign in.',401);
  if(user.app_metadata.must_change_password)throw new AssignmentError('Change your temporary password first.',403);
  const {data:profile,error:profileError}=await sb.from('users').select('id,role,status,student_id').eq('id',user.id).single();
  if(profileError || profile?.status!=='active' || !roles.includes(profile.role))throw new AssignmentError('Your account cannot access this section.',403);
  return {sb,user,profile};
}
export function assignmentStorage() {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url || !key)throw new AssignmentError('File storage is not configured.',503);
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
export async function assignmentForm(request:Request){
  const limit=assignmentFileLimit+256000;
  if(Number(request.headers.get('content-length'))>limit)throw new AssignmentError('Upload is too large.',413);
  const reader=request.body?.getReader();
  if(!reader)throw new AssignmentError('Upload body is missing.');
  const chunks:Uint8Array[]=[];let length=0;
  while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>limit){await reader.cancel();throw new AssignmentError('Upload is too large.',413);}chunks.push(value);}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return new Response(bytes,{headers:{'Content-Type':request.headers.get('content-type')||''}}).formData();
}
export const assignmentErrorResponse=(error:unknown)=>Response.json({error:error instanceof Error?error.message:'Unable to process assignment.'},{status:error instanceof AssignmentError?error.status:400});
export async function cleanupAssignmentFile(path:string){try{await assignmentStorage().storage.from(assignmentBucket).remove([path]);}catch{/* Retain original action error; the object remains private if cleanup must be retried. */}}
export function assignmentUuid(value: unknown): value is string { return typeof value==='string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value); }
