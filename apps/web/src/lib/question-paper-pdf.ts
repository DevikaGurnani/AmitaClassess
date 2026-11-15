import {jsPDF} from 'jspdf';
import type {QuestionPaper} from './question-papers';
export function generateQuestionPaperPdf(paper:QuestionPaper,logo:Buffer){
 const pdf=new jsPDF({unit:'mm',format:'a4',compress:true});const left=20,right=190,bottom=277;let y=20;
 pdf.setProperties({title:paper.title,author:"Amita's Classes",subject:paper.subject});
 const runningHeader=()=>{pdf.setFont('times','normal');pdf.setFontSize(9);pdf.text(`Amita's Classes | ${paper.subject} | Class ${paper.class_name}`,left,14);pdf.setDrawColor(160);pdf.line(left,17,right,17);y=25;};
 const line=(text:string,size=11,bold=false,indent=0)=>{pdf.setFont('times',bold?'bold':'normal');pdf.setFontSize(size);const lines=pdf.splitTextToSize(text,right-left-indent) as string[];for(const value of lines){if(y+6>bottom){pdf.addPage();runningHeader();pdf.setFont('times',bold?'bold':'normal');pdf.setFontSize(size);}pdf.text(value,left+indent,y);y+=size>=14?7:5.3;}};
 pdf.addImage(logo,'PNG',23,16,20,20);pdf.setFont('times','bold');pdf.setFontSize(21);pdf.text("AMITA'S CLASSES",117,23,{align:'center'});pdf.setFontSize(14);const titleLines=pdf.splitTextToSize(paper.title,138) as string[];pdf.text(titleLines,117,32,{align:'center',lineHeightFactor:1.25});const headerBottom=Math.max(41,35+titleLines.length*6);pdf.setDrawColor(60);pdf.line(left,headerBottom,right,headerBottom);y=headerBottom+9;
 line(`Class: ${paper.class_name}    |    Subject: ${paper.subject}`,11,true);line(`Time: ${paper.duration_minutes} minutes    |    Maximum marks: ${paper.total_marks}`,11,true);if(paper.exam_date)line(`Examination date: ${paper.exam_date.split('-').reverse().join('/')}`);y+=4;line('Name: __________________________________    Roll no.: __________________');y+=7;
 line('General Instructions',11,true);y+=2;
 const instructions=(paper.instructions||'All questions are compulsory. Marks are indicated against each question.').split(/\n+/).flatMap(value=>value.replace(/^\s*(?:[-•]\s+|\d+[.)]\s+)/,'').split(/(?<=[A-Za-z][.!?])\s+(?=[A-Z])/)).map(value=>value.trim()).filter(Boolean);
 instructions.forEach((instruction,index)=>line(`${index+1}.  ${instruction}`,10.5,false,3));
 y+=4;if(y>265){pdf.addPage();runningHeader();}pdf.setDrawColor(140);pdf.setLineWidth(.3);pdf.line(left,y,right,y);y+=7;
 let section='';paper.questions.forEach((question,index)=>{if(question.section!==section){section=question.section;if(y>252){pdf.addPage();runningHeader();}y+=3;line(section,13,true);y+=2;}if(y>260){pdf.addPage();runningHeader();}line(`Q${index+1}.  ${question.question}  [${question.marks} mark${question.marks===1?'':'s'}]`,11);question.options.forEach((option,i)=>line(`(${String.fromCharCode(97+i)}) ${option}`,11,false,7));y+=5;});
 y+=3;line('— End of question paper —',10,true);
 const pages=pdf.getNumberOfPages();for(let page=1;page<=pages;page++){pdf.setPage(page);pdf.setFont('times','normal');pdf.setFontSize(9);pdf.setTextColor(100);pdf.line(left,284,right,284);pdf.text("Amita's Classes",left,290);pdf.text(`Page ${page} of ${pages}`,right,290,{align:'right'});}return Buffer.from(pdf.output('arraybuffer'));
}
