import { assignmentActor,assignmentErrorResponse,AssignmentError,assignmentUuid } from '@/lib/assignment-server';
export async function POST(request:Request){
  try{
    const {sb,profile}=await assignmentActor(request);
    if(!['owner','teacher'].includes(profile.role))throw new AssignmentError('Teaching access required.',403);
    const body=await request.json();
    if(!assignmentUuid(body.id)||typeof body.marks!=='number'||!Number.isFinite(body.marks)||body.marks<0||typeof body.feedback!=='string'||body.feedback.length>5000||typeof body.version!=='string')throw new AssignmentError('Check marks and feedback.');
    const {error}=await sb.rpc('grade_assignment_submission',{p_id:body.id,p_marks:body.marks,p_feedback:body.feedback,p_expected_updated_at:body.version});
    if(error)throw new AssignmentError(error.message);
    return Response.json({ok:true});
  }catch(error){return assignmentErrorResponse(error);}
}
