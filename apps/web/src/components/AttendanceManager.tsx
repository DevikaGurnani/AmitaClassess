'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {CalendarDays,Download,RefreshCw} from 'lucide-react';
import {useAuth,useSupabase} from '@/lib/auth-context';
import {useLiveTable} from '@/lib/use-live-table';
import {indiaDate} from '@/lib/learner-console';
import {EmptyState} from '@/components/DashboardParts';
import BrandedProgress from '@/components/BrandedProgress';
type Row={id:string;name:string;class:string;status:string};
const statuses=['present','absent','late','leave'];
export default function AttendanceManager(){
 const {user}=useAuth(),{supabase:sb}=useSupabase();
 const [batches,setBatches]=useState<Array<{id:string;name:string;class:string}>>([]),[batch,setBatch]=useState(''),[date,setDate]=useState(indiaDate()),[rows,setRows]=useState<Row[]>([]);
 const [search,setSearch]=useState(''),[bulk,setBulk]=useState('present'),[loading,setLoading]=useState(false),[busy,setBusy]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState('');
 const generation=useRef(0),target=useRef(`${batch}:${date}`);target.current=`${batch}:${date}`;
 useEffect(()=>{if(!user)return;void sb.from('batches').select('id,name,class').eq('is_active',true).order('name').then(({data,error})=>{if(error)setError(error.message);else setBatches(data||[]);});},[sb,user?.id]);
 const load=useCallback(async()=>{
  if(!batch){setRows([]);return;}
  const ticket=++generation.current,key=`${batch}:${date}`;setLoading(true);
  try{
   const [enrollment,marks]=await Promise.all([sb.from('student_batch').select('student_id,start_date,end_date,students(id,name,class,status)').eq('batch_id',batch).lte('start_date',date).or(`end_date.is.null,end_date.gte.${date}`),sb.from('attendance').select('student_id,status').eq('batch_id',batch).eq('date',date)]);
   if(ticket!==generation.current||key!==target.current)return;
   if(enrollment.error||marks.error)throw enrollment.error||marks.error;
   const mapped=new Map((marks.data||[]).map(row=>[row.student_id,row.status]));
   setRows((enrollment.data||[]).filter((row:any)=>row.students?.status==='active').map((row:any)=>({id:row.student_id,name:row.students.name,class:row.students.class,status:mapped.get(row.student_id)||''})).sort((a,b)=>a.name.localeCompare(b.name)));
  }catch(cause){if(ticket===generation.current)setError((cause as Error).message);}finally{if(ticket===generation.current)setLoading(false);}
 },[sb,batch,date]);
 useEffect(()=>{setRows([]);setMessage('');setError('');void load();return()=>{generation.current++;};},[load]);
 const live=useLiveTable('attendance',batch?`batch_id=eq.${batch}`:undefined,()=>void load(),!!batch&&!!user);
 const visible=rows.filter(row=>`${row.name} ${row.class}`.toLowerCase().includes(search.toLowerCase()));
 async function mark(selected:Row[],status:string){
  if(!selected.length)return;setBusy(selected.length===1?selected[0].id:'bulk');setError('');setMessage('');
  try{
   const {error}=await sb.rpc('mark_batch_attendance',{p_request_id:crypto.randomUUID(),p_batch_id:batch,p_date:date,p_marks:selected.map(row=>({student_id:row.id,status}))});
   if(error)throw error;setMessage(`Saved ${selected.length} attendance record${selected.length===1?'':'s'}. Student portals update live.`);await load();
  }catch(cause){setError((cause as Error).message);}finally{setBusy('');}
 }
 async function exportSheet(){try{const XLSX=await import('xlsx');const sheet=XLSX.utils.json_to_sheet(visible.map(row=>({Student:row.name,Class:row.class,Batch:batches.find(item=>item.id===batch)?.name,Date:date,Status:row.status||'Not marked'})));const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,'Attendance');XLSX.writeFile(book,`attendance-${date}.xlsx`);}catch{setError('Unable to export attendance.');}}
 return <section className="attendance-manager"><div className="dashboard-panel attendance-controls"><label><CalendarDays size={16}/>Batch<select value={batch} disabled={!!busy} onChange={event=>setBatch(event.target.value)}><option value="">Choose a batch</option>{batches.map(row=><option value={row.id} key={row.id}>{row.name} · Class {row.class}</option>)}</select></label><label>Date<input type="date" value={date} max={indiaDate()} disabled={!!busy} onChange={event=>{if(event.target.value)setDate(event.target.value);}}/></label><span className={`live-status ${live==='Live'?'is-live':''}`}>{live==='Live'?'● Live':live}</span><button className="secondary-button" disabled={!batch||loading||!!busy} onClick={()=>void load()}><RefreshCw size={15}/>Refresh</button></div>
 {error&&<p role="alert" className="form-error">{error}</p>}{message&&<p role="status" className="console-info">{message}</p>}
 {batch&&<><div className="attendance-summary">{[['Students',rows.length],['Present',rows.filter(row=>row.status==='present').length],['Absent',rows.filter(row=>row.status==='absent').length],['Unmarked',rows.filter(row=>!row.status).length]].map(([label,value])=><div className="dashboard-panel" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><div className="dashboard-panel"><div className="attendance-toolbar"><label>Find a student<input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Name or class"/></label><label>Mark displayed students<select value={bulk} disabled={!!busy} onChange={event=>setBulk(event.target.value)}>{statuses.map(value=><option key={value} value={value}>{value[0].toUpperCase()+value.slice(1)}</option>)}</select></label><button className="primary-button" disabled={!visible.length||!!busy||loading} onClick={()=>void mark(visible,bulk)}>Apply to {visible.length} students</button><button className="secondary-button" disabled={!visible.length} onClick={()=>void exportSheet()}><Download size={15}/>Excel</button></div>{loading&&<BrandedProgress compact label="Updating your attendance roster…"/>}<div className="attendance-table-wrap"><table><thead><tr><th>Student</th><th>Class</th><th>Attendance</th><th>Save status</th></tr></thead><tbody>{visible.map(row=><tr key={row.id}><td>{row.name}</td><td>{row.class}</td><td><select aria-label={`Attendance for ${row.name}`} value={row.status} disabled={!!busy} onChange={event=>void mark([row],event.target.value)}><option value="" disabled>Not marked</option>{statuses.map(value=><option key={value} value={value}>{value[0].toUpperCase()+value.slice(1)}</option>)}</select></td><td>{busy===row.id||busy==='bulk'?'Saving…':row.status?'Saved':'Not marked'}</td></tr>)}</tbody></table></div>{!loading&&!visible.length&&<EmptyState>No active enrolled students match this batch/date and search.</EmptyState>}</div></>}
 {!batch&&<EmptyState>Select a batch to view its students and mark attendance.</EmptyState>}</section>;
}
