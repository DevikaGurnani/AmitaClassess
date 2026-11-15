import { randomUUID } from 'node:crypto';
import { assignmentActor,assignmentStorage,assignmentErrorResponse,AssignmentError,assignmentUuid,cleanupAssignmentFile,assignmentForm } from '@/lib/assignment-server';
import { assignmentBucket,validateAssignmentFile,assignmentFileLimit } from '@/lib/assignments';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){
  try {
    const {sb,profile}=await assignmentActor();
    const [assignments,batches]=await Promise.all([
      sb.from('assignments').select('*,batches(name),assignment_submissions(*,students(name,class))').order('due_at',{ascending:false}),
      ['owner','teacher'].includes(profile.role)?sb.from('batches').select('id,name').eq('is_active',true).order('name'):Promise.resolve({data:[],error:null}),
    ]);
    if(assignments.error || batches.error)throw new AssignmentError(assignments.error?.message || batches.error?.message || 'Unable to load assignments.');
    return Response.json({assignments:assignments.data,batches:batches.data,role:profile.role},{headers:{'Cache-Control':'private, no-store'}});
  }catch(error){return assignmentErrorResponse(error);}
}
export async function POST(request:Request){
  let path:string|undefined;
  try {
    const {sb,user,profile}=await assignmentActor(request);
    if(!['owner','teacher'].includes(profile.role))throw new AssignmentError('Teaching access required.',403);
    const form=await assignmentForm(request);
    const id=String(form.get('id')||''),batch=String(form.get('batch_id')||''),title=String(form.get('title')||'').trim(),question=String(form.get('question_text')||'').trim();
    const subject=String(form.get('subject_id')||'');let recipients:unknown=null;try{recipients=JSON.parse(String(form.get('student_ids')||'null'));}catch{throw new AssignmentError('Invalid selected students.');}if((subject&&!assignmentUuid(subject))||(recipients!==null&&(!Array.isArray(recipients)||!recipients.length||recipients.some((id:unknown)=>!assignmentUuid(id)))))throw new AssignmentError('Select a valid subject and students.');if(profile.role==='teacher'&&!subject)throw new AssignmentError('Choose your assigned subject.');const mode=String(form.get('answer_upload_mode')||'document');if(!['document','scanned_pdf'].includes(mode))throw new AssignmentError('Choose the answer format.');const deadline=String(form.get('due_at')||''),marks=Number(form.get('max_marks')),file=form.get('file');
    if(!assignmentUuid(id)||!assignmentUuid(batch)||!title||title.length>160||question.length>30000||!Number.isFinite(marks)||marks<=0||marks>100000||!Number.isFinite(Date.parse(deadline))||Date.parse(deadline)<=Date.now())throw new AssignmentError('Check title, batch, future deadline and maximum marks.');
    const {data:existing,error:existingError}=await sb.from('assignments').select('id').eq('id',id).maybeSingle();
    if(existingError)throw new AssignmentError(existingError.message);
    if(existing)throw new AssignmentError('This assignment is already saved. Refresh the list before publishing another.',409);
    let info:ReturnType<typeof validateAssignmentFile>|undefined;let buffer:Buffer|undefined;
    if(file instanceof File && file.size){ if(file.size>assignmentFileLimit)throw new AssignmentError('Choose a file up to 10 MB.',413);buffer=Buffer.from(await file.arrayBuffer());info=validateAssignmentFile(file.name,buffer); }
    if(!question&&!info)throw new AssignmentError('Enter question text or attach a question document.');
    if(info&&buffer){
      path=`questions/${id}/${randomUUID()}.${info.extension}`;
      const {error}=await assignmentStorage().storage.from(assignmentBucket).upload(path,buffer,{contentType:info.mime,upsert:false});
      if(error)throw new AssignmentError('Question upload failed. Please retry.');
    }
    const {error}=await sb.from('assignments').insert({id,batch_id:batch,subject_id:subject||null,student_ids:recipients,answer_upload_mode:mode,title,question_text:question,due_at:new Date(deadline).toISOString(),max_marks:marks,created_by:user.id,question_path:path||null,question_name:info?.name||null,question_mime:info?.mime||null,question_size:buffer?.length||null});
    if(error)throw new AssignmentError(error.message);
    return Response.json({id},{status:201});
  }catch(error){if(path)await cleanupAssignmentFile(path);return assignmentErrorResponse(error);}
}
