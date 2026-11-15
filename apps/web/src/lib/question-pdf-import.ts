import path from 'node:path';import {pathToFileURL} from 'node:url';
export async function extractQuestionPdf(bytes:Buffer){
 const moduleUrl=pathToFileURL(path.join(process.cwd(),'public/pdfjs/pdf.min.mjs')).href,workerUrl=pathToFileURL(path.join(process.cwd(),'public/pdfjs/pdf.worker.min.mjs')).href;
 const library=await import(/* webpackIgnore: true */ moduleUrl);library.GlobalWorkerOptions.workerSrc=workerUrl;
 const task=library.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,useSystemFonts:true});let document:any;
 try{document=await task.promise;if(document.numPages>50)throw new Error('Use a PDF with up to 50 pages per import.');const lines:string[]=[];let length=0;
  for(let page=1;page<=document.numPages;page++){const content=await(await document.getPage(page)).getTextContent();let line='',lastY:number|undefined;for(const item of content.items){if(typeof item.str!=='string')continue;const y=item.transform?.[5];if(line&&lastY!==undefined&&y!==undefined&&Math.abs(y-lastY)>3){lines.push(line);line='';}line+=(line?' ':'')+item.str;lastY=y;if(item.hasEOL){lines.push(line);line='';lastY=undefined;}length+=item.str.length;if(length>500000)throw new Error('PDF text is too large. Split the question bank into smaller files.');}if(line)lines.push(line);lines.push('');}
  const text=lines.join('\n').trim();if(!text)throw new Error('This PDF has no selectable text. Scanned/image PDFs need OCR before import.');return text;
 }catch(error){if((error as Error).name==='PasswordException')throw new Error('Remove the PDF password before importing.');throw error;}finally{await task.destroy();}
}
