import {validateAssignmentFile} from '@/lib/assignments';
export const libraryBucket='learning-library';
export const libraryMime={pdf:'application/pdf',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'} as const;
export type LibraryFolder={id:string;name:string;parent_id:string|null;class_name:string};
export type LibraryFile={id:string;title:string;folder_id:string|null;class_name:string;kind:'file'|'link';external_url:string|null;file_name:string|null;file_mime:string|null;file_size:number|null;created_at:string};
export function validateLibraryFile(name:string,buffer:Buffer){
 const ext=name.split('.').pop()?.toLowerCase() as keyof typeof libraryMime;
 if(!Object.hasOwn(libraryMime,ext)||!buffer.length||buffer.length>10485760)throw new Error('Choose a PDF or Word document up to 10 MB.');
 return validateAssignmentFile(name,buffer);
}
export function validateLibraryLink(value:unknown){if(typeof value!=='string'||value.length>4000)throw new Error('Enter a valid HTTPS resource link.');try{const url=new URL(value.trim());if(url.protocol!=='https:'||url.username||url.password)throw new Error();return url.href;}catch{throw new Error('Enter a valid HTTPS resource link.');}}
