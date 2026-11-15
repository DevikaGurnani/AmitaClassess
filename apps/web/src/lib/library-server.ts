import {assignmentActor,assignmentStorage} from '@/lib/assignment-server';
import {libraryBucket} from '@/lib/library';
import {createHash} from 'node:crypto';
export const libraryActor=(request?:Request)=>assignmentActor(request,['owner','staff','teacher','parent','student']);
export async function removeLibraryObject(path:string){try{await assignmentStorage().storage.from(libraryBucket).remove([path]);}catch{/* Keep private orphan for administrator cleanup if storage is unavailable. */}}
export function librarySegment(value:string){return value.normalize('NFKD').replace(/[^a-zA-Z0-9_-]/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').slice(0,45)||'folder';}
export function libraryStoragePath(className:string,folders:Array<{id:string;name:string}>,id:string,extension:string,name:string){
 const classSegment=/^\d+$/.test(className)?`class-${className}`:`class-${librarySegment(className)}-${createHash('sha256').update(className).digest('hex').slice(0,6)}`;
 const parts=['classes',classSegment,...folders.map(folder=>`${librarySegment(folder.name)}-${folder.id.slice(0,8)}`),`${id}-${librarySegment(name.replace(/\.[^.]+$/,''))}.${extension}`];
 const result=parts.join('/');if(result.length>1000)throw new Error('Folder path is too deep.');return result;
}
export function libraryBatchStoragePath(batch:{id:string;name:string},folders:Array<{id:string;name:string}>,id:string,extension:string,name:string){return ['batches',`${librarySegment(batch.name)}-${batch.id}`,...folders.map(folder=>`${librarySegment(folder.name)}-${folder.id.slice(0,8)}`),`${id}-${librarySegment(name.replace(/\.[^.]+$/,''))}.${extension}`].join('/');}
