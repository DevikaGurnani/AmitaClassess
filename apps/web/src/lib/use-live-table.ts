'use client';
import {useEffect,useRef,useState,useCallback} from 'react';
import {useSupabase} from '@/lib/auth-context';
export function useLiveTable(table:string,filter:string|undefined,onChange:()=>void,enabled=true){
 const {supabase:sb}=useSupabase(),callback=useRef(onChange);callback.current=onChange;
 const [status,setStatus]=useState('Connecting');
 useEffect(()=>{
  if(!enabled){setStatus('Not connected');return;}
  let active=true,live=false;let debounce:ReturnType<typeof setTimeout>|undefined;
  const refresh=()=>{if(debounce)clearTimeout(debounce);debounce=setTimeout(()=>{if(active)callback.current();},100);};
  const channel=sb.channel(`portal-${table}-${crypto.randomUUID()}`)
   .on('postgres_changes',{event:'INSERT',schema:'public',table,...(filter?{filter}:{})},refresh)
   .on('postgres_changes',{event:'UPDATE',schema:'public',table,...(filter?{filter}:{})},refresh)
   .subscribe(value=>{if(!active)return;live=value==='SUBSCRIBED';setStatus(live?'Live':'Reconnecting');if(live)refresh();});
  const timer=setInterval(()=>{if(!live)refresh();},20000);
  window.addEventListener('focus',refresh);window.addEventListener('online',refresh);
  return()=>{active=false;if(debounce)clearTimeout(debounce);clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('online',refresh);void sb.removeChannel(channel);};
 },[sb,table,filter,enabled]);
 return status;
}
export function useLiveAttendance(studentId:string,enabled:boolean,revision=0){
 const {supabase:sb}=useSupabase();
 const [rows,setRows]=useState<Array<{date:string;status:string;batch_id:string}>>([]),[error,setError]=useState('');
 const version=useRef(0),current=useRef(studentId);current.current=studentId;
 const reload=useCallback(async()=>{
  if(!studentId||!enabled)return;
  const ticket=++version.current;
  const {data,error:failure}=await sb.from('attendance').select('date,status,batch_id').eq('student_id',studentId).lte('date',new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'})).order('date',{ascending:false}).limit(500);
  if(ticket!==version.current||current.current!==studentId)return;
  if(failure)setError(failure.message);else{setRows(data||[]);setError('');}
 },[sb,studentId,enabled,revision]);
 useEffect(()=>{setRows([]);setError('');void reload();return()=>{version.current++;};},[reload]);
 const status=useLiveTable('attendance',studentId?`student_id=eq.${studentId}`:undefined,()=>void reload(),enabled&&!!studentId);
 return{rows,error,status};
}
