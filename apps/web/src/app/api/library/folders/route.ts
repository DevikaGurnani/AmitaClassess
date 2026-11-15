import {libraryActor} from '@/lib/library-server';
import {assignmentErrorResponse,AssignmentError,assignmentUuid} from '@/lib/assignment-server';
export async function POST(request:Request){
 try{
  const {sb,user,profile}=await libraryActor(request);if(profile.role!=='owner')throw new AssignmentError('Only the owner can create folders.',403);
  const data=await request.json(),name=typeof data.name==='string'?data.name.trim():'',batchId=String(data.batch_id||'');
  if(!name||name.length>120||/[\x00-\x1f/\\]/.test(name)||!assignmentUuid(batchId)||(data.parent_id&&!assignmentUuid(data.parent_id)))throw new AssignmentError('Enter a valid folder name and class.');
  const {data:batch}=await sb.from('batches').select('class,is_active').eq('id',batchId).single();if(!batch?.is_active)throw new AssignmentError('Choose an active batch.');const className=batch.class;
  if(data.parent_id){const {data:folders,error}=await sb.from('library_folders').select('id,parent_id').eq('batch_id',batchId);if(error)throw new AssignmentError('Unable to check folders.');let next=data.parent_id,depth=0;while(next){const item=folders?.find(row=>row.id===next);if(!item||++depth>=12)throw new AssignmentError('Invalid parent folder or folder nesting exceeds 12 levels.');next=item.parent_id;}}
  const {data:folder,error}=await sb.from('library_folders').insert({batch_id:batchId,class_name:className,name,parent_id:data.parent_id||null,created_by:user.id}).select('id').single();
  if(error)throw new AssignmentError(error.code==='23505'?'A folder with this name already exists here.':error.message);
  return Response.json({id:folder.id},{status:201});
 }catch(error){return assignmentErrorResponse(error);}
}
