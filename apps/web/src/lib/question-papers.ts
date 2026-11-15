export type BankQuestion={id:string;class_name:string;subject:string;chapter:string;question:string;marks:number;options:string[];answer:string};
export type ImportedQuestion=Omit<BankQuestion,'id'|'class_name'>;
export type PaperQuestion={source_id:string;question:string;options:string[];marks:number;section:string};
export type QuestionPaper={id:string;class_name:string;subject:string;title:string;exam_date:string|null;duration_minutes:number;instructions:string;questions:PaperQuestion[];total_marks:number;updated_at:string};
export function questionRow(row:Record<string,unknown>,defaultSubject:string,line:number):ImportedQuestion{
 const normalized=Object.fromEntries(Object.entries(row).map(([key,value])=>[key.toLowerCase().trim().replace(/[ _-]/g,''),value]));
 const text=(key:string)=>String(normalized[key]??'').trim();
 const question=text('question'),subject=text('subject')||defaultSubject.trim(),chapter=text('chapter'),answer=text('answer');
 const marks=Number(normalized.marks??''),options=['a','b','c','d','e','f'].map(letter=>text(`option${letter}`)).filter(Boolean);
 if(!question||question.length>6000||!subject||subject.length>100||chapter.length>150||answer.length>6000||options.some(option=>option.length>1500)||!Number.isFinite(marks)||marks<=0||marks>1000||Math.abs(Math.round(marks*100)-marks*100)>0.000001)throw new Error(`Question ${line}: supply a question, subject and positive marks (up to 1000, two decimal places). Check field lengths.`);
 return{question,subject,chapter,answer,marks,options};
}
export function parseQuestionText(text:string,subject:string):ImportedQuestion[]{
 if(!/^\s*Question\s*:/im.test(text)){
  const chunks=text.replace(/\r\n?/g,'\n').split(/^(?:Q(?:uestion)?\s*)?\d+[.)]\s+/im).slice(1).map(value=>value.trim()).filter(Boolean);
  if(!chunks.length||chunks.length>500)throw new Error('Use labelled Question:/Marks: fields or numbered questions (1., 2., …). Download a template.');
  return chunks.map((chunk,index)=>{const marks=chunk.match(/\[(\d+(?:\.\d{1,2})?)\s*marks?\]/i),row:Record<string,unknown>={marks:marks?.[1]||1};let question='';for(const line of chunk.replace(/\[\d+(?:\.\d{1,2})?\s*marks?\]/i,'').split('\n')){const option=line.match(/^\s*([a-f])[.)]\s+(.+)$/i),answer=line.match(/^\s*Answer\s*:\s*(.+)$/i);if(option)row[`option${option[1].toLowerCase()}`]=option[2];else if(answer)row.answer=answer[1];else question+=(question?'\n':'')+line;}return questionRow({...row,question},subject,index+1);});
 }
 const blocks=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split(/^\s*---+\s*$/m).map(block=>block.trim()).filter(Boolean);
 const rows=blocks.map((block,index)=>{const row:Record<string,string>={};let field='';for(const line of block.split('\n')){const match=line.match(/^(Question|Subject|Chapter|Marks|Answer|Option\s*[A-F])\s*:\s*(.*)$/i);if(match){field=match[1].replace(/\s/g,'').toLowerCase();if(field in row)throw new Error(`Question ${index+1}: duplicate ${field} field.`);row[field]=match[2];}else if(field){row[field]+=`\n${line}`;}else if(line.trim()){throw new Error(`Question ${index+1}: use the TXT template with Question:, Marks: and --- between questions.`);}}return questionRow(row,subject,index+1);});
 if(!rows.length||rows.length>500)throw new Error('Import between 1 and 500 questions per file.');return rows;
}
export function buildPaperQuestions(selected:Array<{id:string;marks:number;section:string}>,bank:BankQuestion[],className:string,subject:string){
 if(!Array.isArray(selected)||!selected.length||selected.length>100)throw new Error('Select between 1 and 100 questions.');
 if(selected.reduce((sum,item)=>sum+(bank.find(row=>row.id===item.id)?.question.length||0),0)>100000)throw new Error('The selected question text is too long for one paper.');
 const seen=new Set<string>();let total=0;
 const questions=selected.map((item,index)=>{const row=bank.find(question=>question.id===item.id);const marks=Number(item.marks),section=String(item.section||'Section A').trim();if(!row||row.class_name!==className||row.subject!==subject||seen.has(item.id)||!Number.isFinite(marks)||marks<=0||marks>1000||Math.abs(Math.round(marks*100)-marks*100)>0.000001||!section||section.length>100)throw new Error(`Question ${index+1}: choose a unique question from this class and subject, valid marks and a section.`);seen.add(item.id);total+=Math.round(marks*100);return{source_id:row.id,question:row.question,options:row.options,marks,section};});
 if(total>1000000)throw new Error('A paper cannot exceed 10,000 marks.');return{questions,total_marks:total/100};
}
export const questionTextTemplate=`Subject: Mathematics\nChapter: Algebra\nQuestion: Solve 2x + 5 = 15.\nMarks: 2\nAnswer: x = 5\n---\nSubject: Mathematics\nChapter: Algebra\nQuestion: Which number is a solution of x + 3 = 7?\nMarks: 1\nOption A: 2\nOption B: 4\nOption C: 7\nOption D: 10\nAnswer: B\n`;
