export const assignmentBucket = 'assignment-files';
export const assignmentFileLimit = 10 * 1024 * 1024;
export const assignmentMime = { pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' } as const;
export type AssignmentSubmission = { id: string; student_id: string; file_name: string; file_mime: string; submitted_at: string; updated_at: string; marks_awarded: number | null; feedback: string; students?: { name: string; class: string } | null };
export type Assignment = { id: string; batch_id: string; answer_upload_mode?:'document'|'scanned_pdf'; title: string; question_text: string; due_at: string; max_marks: number; question_name: string | null; question_mime: string | null; batches?: { name: string } | null; assignment_submissions: AssignmentSubmission[] };
export function assignmentDeadline(value: string) { return new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }); }
export function validateAssignmentFile(name: string, buffer: Buffer) {
  const extension = name.split('.').pop()?.toLowerCase() as keyof typeof assignmentMime;
  if (!Object.hasOwn(assignmentMime, extension) || buffer.length < 8 || buffer.length > assignmentFileLimit) throw new Error('Choose a PDF, DOC or DOCX file up to 10 MB.');
  if (extension === 'pdf' && (buffer.subarray(0,5).toString() !== '%PDF-' || !buffer.subarray(-2048).toString().includes('%%EOF'))) throw new Error('This file is not a valid PDF.');
  if (extension === 'doc' && buffer.subarray(0,8).toString('hex') !== 'd0cf11e0a1b11ae1') throw new Error('This file is not a Word DOC document.');
  if (extension === 'docx') {
    // Validate ZIP metadata before a DOCX parser decompresses document content.
    let end = -1;
    for (let i=buffer.length-22;i>=Math.max(0,buffer.length-65557);i--) if (buffer.readUInt32LE(i)===0x06054b50) { end=i; break; }
    if(end<0 || buffer.readUInt16LE(end+4)!==0 || buffer.readUInt16LE(end+6)!==0) throw new Error('Invalid DOCX archive.');
    const entries=buffer.readUInt16LE(end+10);let offset=buffer.readUInt32LE(end+16),total=0;const names:string[]=[];
    if(entries<1 || entries>2000)throw new Error('DOCX document is too complex.');
    for(let n=0;n<entries;n++){
      if(offset+46>buffer.length || buffer.readUInt32LE(offset)!==0x02014b50)throw new Error('Invalid DOCX contents.');
      const flags=buffer.readUInt16LE(offset+8),size=buffer.readUInt32LE(offset+24),nameSize=buffer.readUInt16LE(offset+28),extra=buffer.readUInt16LE(offset+30),comment=buffer.readUInt16LE(offset+32);
      const entry=buffer.subarray(offset+46,offset+46+nameSize).toString();total+=size;names.push(entry);
      if(flags&1 || size===0xffffffff || total>32*1024*1024 || (entry==='word/document.xml' && size>2*1024*1024) || /vbaProject\.bin/i.test(entry))throw new Error('Encrypted, macro-enabled or oversized Word content is not supported.');
      offset+=46+nameSize+extra+comment;
    }
    if(!names.includes('word/document.xml') || !names.includes('[Content_Types].xml'))throw new Error('This ZIP file is not a DOCX document.');
  }
  return { extension, mime: assignmentMime[extension], name: name.replace(/[\x00-\x1f/\\]/g,'_').slice(0,200) };
}
