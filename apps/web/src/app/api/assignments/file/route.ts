import mammoth from 'mammoth';
import { assignmentActor,assignmentStorage,assignmentErrorResponse,AssignmentError,assignmentUuid } from '@/lib/assignment-server';
import { assignmentBucket,validateAssignmentFile } from '@/lib/assignments';
import { validateWordExpansion } from '@/lib/assignment-word';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  try{
    const {sb}=await assignmentActor();const params=new URL(request.url).searchParams;
    const id=params.get('assignment'),submission=params.get('submission');
    if(!assignmentUuid(id)||(submission&&!assignmentUuid(submission)))throw new AssignmentError('Invalid document.',404);
    let path:string,name:string,mime:string;
    if(submission){
      const {data,error}=await sb.from('assignment_submissions').select('file_path,file_name,file_mime').eq('id',submission).eq('assignment_id',id).single();
      if(error||!data)throw new AssignmentError('Document not found.',404);
      path=data.file_path;name=data.file_name;mime=data.file_mime;
    }else{
      const {data,error}=await sb.from('assignments').select('question_path,question_name,question_mime').eq('id',id).single();
      if(error||!data?.question_path)throw new AssignmentError('Document not found.',404);
      path=data.question_path;name=data.question_name;mime=data.question_mime;
    }
    const {data,error}=await assignmentStorage().storage.from(assignmentBucket).download(path);
    if(error||!data)throw new AssignmentError('Unable to open this document.',404);
    if(params.get('preview')==='text'){
      if(!name.toLowerCase().endsWith('.docx'))throw new AssignmentError('Text preview is available for DOCX files only.');
      const buffer=Buffer.from(await data.arrayBuffer());validateAssignmentFile(name,buffer);validateWordExpansion(buffer);
      const result=await mammoth.extractRawText({buffer});
      return Response.json({text:result.value.slice(0,300000)},{headers:{'Cache-Control':'private, no-store'}});
    }
    const disposition=params.get('download')==='1'||mime!=='application/pdf'?'attachment':'inline';
    return new Response(data,{headers:{'Content-Type':mime,'Content-Disposition':`${disposition}; filename*=UTF-8''${encodeURIComponent(name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
  }catch(error){return assignmentErrorResponse(error);}
}
