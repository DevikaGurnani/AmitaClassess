import * as XLSX from 'xlsx';
import {validateWordExpansion} from './assignment-word';
import {parseQuestionText,questionRow,type ImportedQuestion} from './question-papers';
import {extractQuestionPdf} from './question-pdf-import';
import {validateAssignmentFile} from './assignments';
import mammoth from 'mammoth';
export async function parseQuestionUpload(name:string,bytes:Buffer,subject:string):Promise<ImportedQuestion[]>{
 if(!bytes.length||bytes.length>5242880)throw new Error('Upload a TXT, XLSX, CSV, DOCX or text PDF file up to 5 MB.');
 const extension=name.split('.').pop()?.toLowerCase();
 if(extension==='txt'){const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(text.includes('\0'))throw new Error('Use a UTF-8 text file.');return parseQuestionText(text,subject);}
 if(extension==='pdf'){validateAssignmentFile(name,bytes);return parseQuestionText(await extractQuestionPdf(bytes),subject);}
 if(extension==='docx'){validateAssignmentFile(name,bytes);validateWordExpansion(bytes);return parseQuestionText((await mammoth.extractRawText({buffer:bytes})).value,subject);}
 if(extension==='csv'){const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(text.includes('\0'))throw new Error('Use a UTF-8 CSV file.');const workbook=XLSX.read(text,{type:'string',cellFormula:false,raw:true,sheetRows:502});const sheet=workbook.Sheets[workbook.SheetNames[0]],range=XLSX.utils.decode_range(sheet['!fullref']||sheet['!ref']||'A1');if(range.e.r>500||range.e.c>30)throw new Error('Use at most 500 questions and 31 columns.');const rows=XLSX.utils.sheet_to_json<Record<string,unknown>>(sheet,{defval:'',raw:false});if(!rows.length||rows.length>500)throw new Error('Import between 1 and 500 questions per file.');return rows.map((row,index)=>questionRow(row,subject,index+2));}
 if(extension!=='xlsx'||bytes.length<2||bytes.readUInt16LE(0)!==0x4b50)throw new Error('Use TXT, XLSX, CSV, DOCX or PDF. Download a template to get started.');
 try{validateWordExpansion(bytes);}catch{throw new Error('Invalid or oversized Excel archive.');}
 const workbook=XLSX.read(bytes,{type:'buffer',cellFormula:false,cellHTML:false,cellStyles:false,bookVBA:false,sheetRows:502});
 if(workbook.SheetNames.length!==1)throw new Error('Use one worksheet per upload.');
 const sheet=workbook.Sheets[workbook.SheetNames[0]],range=XLSX.utils.decode_range(sheet['!fullref']||sheet['!ref']||'A1');
 if(range.e.r>500||range.e.c>30)throw new Error('Use at most 500 questions and 31 columns.');
 const rows=XLSX.utils.sheet_to_json<Record<string,unknown>>(sheet,{defval:'',raw:false});
 if(!rows.length||rows.length>500)throw new Error('Import between 1 and 500 questions per file.');
 return rows.map((row,index)=>questionRow(row,subject,index+2));
}
