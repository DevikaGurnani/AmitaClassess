import {randomUUID} from 'node:crypto';
import {libraryActor,removeLibraryObject,libraryBatchStoragePath} from '@/lib/library-server';
import {assignmentStorage,assignmentErrorResponse,AssignmentError,assignmentForm,assignmentUuid} from '@/lib/assignment-server';
import {libraryBucket,validateLibraryFile,validateLibraryLink} from '@/lib/library';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function DELETE(request:Request){
 try{
  const {sb,profile}=await libraryActor(request);if(profile.role!=='owner')throw new AssignmentError('Only the owner can delete library resources.',403);
  const body=await request.json();if(!assignmentUuid(body.id)||!['file','folder'].includes(body.kind))throw new AssignmentError('Choose a valid resource.');
  if(body.kind==='folder'){
   const {data,error}=await sb.from('library_folders').delete().eq('id',body.id).select('id').single();
   if(error)throw new AssignmentError(error.code==='23503'?'This folder contains resources or subfolders. Empty it before deleting.':'Unable to delete folder.');
   if(!data)throw new AssignmentError('Folder not found.',404);
   return Response.json({ok:true});
  }
  const {data,error}=await sb.from('library_files').delete().eq('id',body.id).select('storage_path').single();
  if(error||!data)throw new AssignmentError('Resource not found or could not be deleted.',404);
  if(data.storage_path){const result=await assignmentStorage().storage.from(libraryBucket).remove([data.storage_path]);if(result.error)return Response.json({ok:true,warning:'Resource removed. Private Storage cleanup could not finish; contact the owner.'});}
  return Response.json({ok:true});
 }catch(error){return assignmentErrorResponse(error);}
}
export async function GET(request:Request){try{
const {sb,profile}=await libraryActor();const params=new URL(request.url).searchParams,selected=params.get('batch'),student=params.get('student');if((selected&&!assignmentUuid(selected))||(student&&!assignmentUuid(student)))throw new AssignmentError('Choose a valid batch.');
const catalog=await sb.rpc('library_batch_catalog');if(catalog.error)throw new AssignmentError('Unable to load your batches.');let batches=catalog.data||[];
if(student){const {data:visible}=await sb.from('students').select('id').eq('id',student).maybeSingle();if(!visible)throw new AssignmentError('Student is not linked to your account.',403);const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'}),members=await sb.from('student_batch').select('batch_id').eq('student_id',student).lte('start_date',today).or('end_date.is.null,end_date.gte.'+today);if(members.error)throw new AssignmentError('Unable to load student batches.');batches=batches.filter((row:any)=>members.data?.some(link=>link.batch_id===row.id));}
if(selected&&!batches.some((row:any)=>row.id===selected))throw new AssignmentError('This batch is not available to your account.',403);
const [folders,files,oldFolders,oldFiles]=await Promise.all([selected?sb.from('library_folders').select('*').eq('batch_id',selected).order('name'):Promise.resolve({data:[],error:null}),selected?sb.from('library_files').select('id,batch_id,class_name,folder_id,title,kind,external_url,file_name,file_mime,file_size,created_at').eq('batch_id',selected).order('created_at',{ascending:false}):Promise.resolve({data:[],error:null}),profile.role==='owner'?sb.from('library_folders').select('class_name').is('batch_id',null):Promise.resolve({data:[],error:null}),profile.role==='owner'?sb.from('library_files').select('class_name').is('batch_id',null):Promise.resolve({data:[],error:null})]);if([folders,files,oldFolders,oldFiles].some(row=>row.error))throw new AssignmentError('Unable to load batch resources.');const legacy=[...new Set([...(oldFolders.data||[]),...(oldFiles.data||[])].map(row=>row.class_name))];return Response.json({batches,folders:folders.data,files:files.data,legacy,role:profile.role},{headers:{'Cache-Control':'private, no-store'}});
}catch(error){return assignmentErrorResponse(error);}}
export async function POST(request:Request){
 let objectPath:string|undefined;
 try{
  const {sb,user,profile}=await libraryActor(request);if(profile.role!=='owner')throw new AssignmentError('Only the owner can upload library files.',403);
  const data=await assignmentForm(request),batchId=String(data.get('batch_id')||''),folder=String(data.get('folder_id')||''),file=data.get('file'),link=data.get('url');
  if(!assignmentUuid(batchId)||(folder&&!assignmentUuid(folder)))throw new AssignmentError('Choose a batch and a valid folder.');const {data:batch}=await sb.from('batches').select('id,name,class,is_active').eq('id',batchId).single();if(!batch?.is_active)throw new AssignmentError('Choose an active batch.');const className=batch.class;
  const chain:Array<{id:string;name:string}>=[];
  if(folder){const {data:all,error}=await sb.from('library_folders').select('id,name,parent_id').eq('batch_id',batchId);if(error)throw new AssignmentError('Unable to check folder.');let next:string|null=folder;const seen=new Set();while(next){const found=all?.find(row=>row.id===next);if(!found||seen.has(next)||chain.length>=12)throw new AssignmentError('Invalid folder hierarchy for this class.');seen.add(next);chain.unshift(found);next=found.parent_id;}}
  if(link){const external=validateLibraryLink(link),title=String(data.get('title')||'').trim();if(!title||title.length>200)throw new AssignmentError('Enter a resource title.');const {data:record,error}=await sb.from('library_files').insert({batch_id:batchId,class_name:className,folder_id:folder||null,title,kind:'link',external_url:external,created_by:user.id}).select('id').single();if(error)throw new AssignmentError(error.message);return Response.json({id:record.id},{status:201});}
  if(!(file instanceof File)||!file.size||file.size>10485760)throw new AssignmentError('Choose a PDF or Word file up to 10 MB.');
  const bytes=Buffer.from(await file.arrayBuffer()),info=validateLibraryFile(file.name,bytes),id=randomUUID();
  const title=String(data.get('title')||'').trim()||info.name;if(title.length>200)throw new AssignmentError('Title is too long.');
  objectPath=libraryBatchStoragePath(batch,chain,id,info.extension,info.name);
  const {error:uploadError}=await assignmentStorage().storage.from(libraryBucket).upload(objectPath,bytes,{contentType:info.mime,upsert:false});if(uploadError)throw new AssignmentError('File upload failed. Please retry.');
  const {error}=await sb.from('library_files').insert({id,batch_id:batchId,class_name:className,folder_id:folder||null,title,storage_path:objectPath,file_name:info.name,file_mime:info.mime,file_size:bytes.length,created_by:user.id});
  if(error)throw new AssignmentError(error.message);
  return Response.json({id},{status:201});
 }catch(error){if(objectPath)await removeLibraryObject(objectPath);return assignmentErrorResponse(error);}
}
