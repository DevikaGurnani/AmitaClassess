import { randomUUID } from 'node:crypto';
import { assignmentActor,assignmentStorage,assignmentErrorResponse,AssignmentError,assignmentUuid,cleanupAssignmentFile,assignmentForm } from '@/lib/assignment-server';
import { assignmentBucket,validateAssignmentFile,assignmentFileLimit } from '@/lib/assignments';
export const runtime='nodejs';
export async function POST(request:Request){
  let path:string|undefined;
  try {
    const {sb,profile}=await assignmentActor(request);
    if(profile.role!=='student'||!profile.student_id)throw new AssignmentError('A linked student account is required.',403);
    const form=await assignmentForm(request),id=String(form.get('assignment_id')||''),file=form.get('file');
    if(!assignmentUuid(id)||!(file instanceof File)||!file.size||file.size>assignmentFileLimit)throw new AssignmentError('Choose your PDF/Word submission (up to 10 MB).');
    const {data:assignment,error:assignmentError}=await sb.from('assignments').select('id,due_at').eq('id',id).single();
    if(assignmentError||!assignment)throw new AssignmentError('Assignment not found.',404);
    if(Date.parse(assignment.due_at)<Date.now())throw new AssignmentError('The submission deadline has passed.');
    const existing=await sb.from('assignment_submissions').select('id').eq('assignment_id',id).eq('student_id',profile.student_id).maybeSingle();
    if(existing.error)throw new AssignmentError('Unable to verify your submission. Please retry.');
    if(existing.data)throw new AssignmentError('This answer sheet has already been submitted and cannot be replaced.',409);
    const buffer=Buffer.from(await file.arrayBuffer()),info=validateAssignmentFile(file.name,buffer);
    path=`submissions/${id}/${profile.student_id}/${randomUUID()}.${info.extension}`;
    const storage=assignmentStorage().storage.from(assignmentBucket);
    const {error:uploadError}=await storage.upload(path,buffer,{contentType:info.mime,upsert:false});
    if(uploadError)throw new AssignmentError('Submission upload failed. Please retry.');
    const {data,error}=await sb.rpc('submit_assignment',{p_assignment_id:id,p_path:path,p_filename:info.name,p_mime:info.mime,p_size:buffer.length});
    if(error)throw new AssignmentError(error.message);
    if(data.old_path&&data.old_path!==path)await storage.remove([data.old_path]);
    return Response.json({id:data.id});
  }catch(error){if(path)await cleanupAssignmentFile(path);return assignmentErrorResponse(error);}
}
