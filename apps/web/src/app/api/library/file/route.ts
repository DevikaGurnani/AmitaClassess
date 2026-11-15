import mammoth from 'mammoth';
import {libraryActor} from '@/lib/library-server';
import {assignmentStorage,assignmentErrorResponse,AssignmentError,assignmentUuid} from '@/lib/assignment-server';
import {libraryBucket,validateLibraryFile} from '@/lib/library';
import {validateWordExpansion} from '@/lib/assignment-word';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 try{
  const {sb}=await libraryActor();const params=new URL(request.url).searchParams,id=params.get('id');if(!assignmentUuid(id))throw new AssignmentError('Invalid file.',404);
  const {data:file,error}=await sb.from('library_files').select('*').eq('id',id).single();if(error||!file)throw new AssignmentError('File not found.',404);
  if(file.kind!=='file')throw new AssignmentError('Open this resource using its saved link.');
  const {data,error:downloadError}=await assignmentStorage().storage.from(libraryBucket).download(file.storage_path);if(downloadError||!data)throw new AssignmentError('Unable to open file.',404);
  if(params.get('preview')==='text'){
   const bytes=Buffer.from(await data.arrayBuffer());const info=validateLibraryFile(file.file_name,bytes);let text:string;
   if(info.extension==='docx'){validateWordExpansion(bytes);text=(await mammoth.extractRawText({buffer:bytes})).value;}
   else throw new AssignmentError('Text preview is not supported for this file.');
   return Response.json({text:text.slice(0,300000)},{headers:{'Cache-Control':'private, no-store'}});
  }
  const inline=file.file_mime==='application/pdf'||file.file_mime.startsWith('image/');
  return new Response(data,{headers:{'Content-Type':file.file_mime,'Content-Disposition':`${params.get('download')==='1'||!inline?'attachment':'inline'}; filename*=UTF-8''${encodeURIComponent(file.file_name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
 }catch(error){return assignmentErrorResponse(error);}
}
