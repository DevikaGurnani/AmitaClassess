'use client';
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
export function useUploadConfirmation(){
 const [name,setName]=useState<string|null>(null),resolve=useRef<((value:boolean)=>void)|null>(null),button=useRef<HTMLButtonElement>(null);
 function close(value:boolean){resolve.current?.(value);resolve.current=null;setName(null);}
 useEffect(()=>()=>{resolve.current?.(false);},[]);
 useEffect(()=>{if(name===null)return;const previous=document.activeElement as HTMLElement|null;button.current?.focus();const key=(event:KeyboardEvent)=>{if(event.key==='Escape')close(false);if(event.key==='Tab'){event.preventDefault();const controls=document.querySelectorAll<HTMLButtonElement>('.upload-confirmation button');const next=document.activeElement===controls[0]?controls[1]:controls[0];next?.focus();}};document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);previous?.focus();};},[name]);
 function confirmUpload(fileName:string){return new Promise<boolean>(done=>{resolve.current=done;setName(fileName);});}
 const confirmation=name===null?null:createPortal(<div className="assignment-viewer-backdrop upload-confirmation-backdrop"><section className="dashboard-panel upload-confirmation" role="alertdialog" aria-modal="true" aria-labelledby="upload-confirmation-title" aria-describedby="upload-confirmation-detail"><h2 id="upload-confirmation-title">Submit your answer sheet?</h2><p id="upload-confirmation-detail"><strong>{name}</strong><br/>This is your final submission. Once uploaded, you cannot replace or edit this answer sheet.</p><div className="answer-sheet-actions"><button ref={button} type="button" className="secondary-button" onClick={()=>close(false)}>Cancel</button><button type="button" className="primary-button" onClick={()=>close(true)}>Confirm and upload</button></div></section></div>,document.body);
 return{confirmUpload,confirmation};
}
