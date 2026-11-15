'use client';
import {useEffect,useState} from 'react';
import {useAuth,useSupabase} from '@/lib/auth-context';
import Phase2Layout,{panelClass,buttonClass,inputClass} from '@/components/Phase2Layout';
import {exportXlsx,exportPdf} from '@/lib/phase2/export';
type Due={id:string;student_id:string;month:string;generated_amount:number;paid_amount:number;status:string;due_date:string;students:{name:string;class:string}|null};
type Attendance={student_id:string;batch_id:string;date:string;status:string};
type Payment={amount:number;mode:string;paid_at:string;receipt_no:string;is_reversal:boolean};
type Enrollment={student_id:string;batch_id:string;batches:{name:string}|null};
type Mark={student_id:string;marks:number;tests:{title:string;max_marks:number;test_date:string}|null};
export default function ReportsPage(){const {user}=useAuth();const {supabase:sb}=useSupabase();const [month,setMonth]=useState(new Date().toISOString().slice(0,7)),[dues,setDues]=useState<Due[]>([]),[attendance,setAttendance]=useState<Attendance[]>([]),[payments,setPayments]=useState<Payment[]>([]),[enrollments,setEnrollments]=useState<Enrollment[]>([]),[results,setResults]=useState<Mark[]>([]),[msg,setMsg]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{if(!user)return;let active=true;setBusy(true);setMsg('');const from=month+'-01';const next=new Date(`${from}T12:00:00Z`);next.setUTCMonth(next.getUTCMonth()+1);const to=next.toISOString().slice(0,10);
 void Promise.all([sb.from('fee_dues').select('id,student_id,month,generated_amount,paid_amount,status,due_date,students(name,class)').eq('month',from),sb.from('attendance').select('student_id,batch_id,date,status').gte('date',from).lt('date',to),sb.from('payments').select('amount,mode,paid_at,receipt_no,is_reversal').gte('paid_at',`${from}T00:00:00Z`).lt('paid_at',`${to}T00:00:00Z`),sb.from('student_batch').select('student_id,batch_id,batches(name)'),sb.from('test_marks').select('student_id,marks,tests!inner(title,max_marks,test_date)').gte('tests.test_date',from).lt('tests.test_date',to)]).then(([a,b,c,d,e])=>{if(!active)return;setDues((a.data||[]) as unknown as Due[]);setAttendance(b.data||[]);setPayments(c.data||[]);setEnrollments((d.data||[]) as unknown as Enrollment[]);setResults((e.data||[]) as unknown as Mark[]);if(a.error||b.error||c.error||d.error||e.error)setMsg([a.error?.message,b.error?.message,c.error?.message,d.error?.message,e.error?.message].filter(Boolean).join('; '));}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};
 },[sb,user,month]);
 const billed=dues.reduce((sum,d)=>sum+d.generated_amount,0),paid=dues.reduce((sum,d)=>sum+d.paid_amount,0);
 const feeHeaders=['Student','Class','Month','Billed INR','Paid INR','Pending INR','Status','Due date'];const feeRows=dues.map(d=>[d.students?.name||d.student_id,d.students?.class||'',d.month,d.generated_amount,d.paid_amount,Math.max(0,d.generated_amount-d.paid_amount),d.status,d.due_date]);
 const attHeaders=['Student ID','Batch ID','Date','Status'];const attRows=attendance.map(a=>[a.student_id,a.batch_id,a.date,a.status]);
 const batchStrength=Object.values(enrollments.reduce((acc:Record<string,{name:string;count:number}>,row)=>{const id=row.batch_id;acc[id] ||= {name:row.batches?.name||id,count:0};acc[id].count++;return acc;},{}));
 const strengthHeaders=['Batch','Enrolled students'];const strengthRows=batchStrength.map(v=>[v.name,v.count]);
 const marksHeaders=['Student ID','Test','Date','Marks','Maximum'];const marksRows=results.filter(r=>r.tests).map(r=>[r.student_id,r.tests!.title,r.tests!.test_date,r.marks,r.tests!.max_marks]);
 const paymentHeaders=['Receipt','Date','Mode','Amount INR'];const paymentRows=payments.map(p=>[p.receipt_no,p.paid_at,p.mode,p.is_reversal?-p.amount:p.amount]);
 return <Phase2Layout title="Reports and exports"><section className={panelClass}><label>Reporting month<input type="month" value={month} onChange={e=>setMonth(e.target.value)} className={inputClass}/></label>{busy&&<p>Loading reports…</p>}</section>
 <div className="grid gap-3 sm:grid-cols-4">{[['Billed',billed],['Collected against dues',paid],['Pending',billed-paid],['Attendance records',attendance.length]].map(([label,value])=><section className={panelClass} key={label}><p className="text-gray-400">{label}</p><p className="text-2xl font-bold">{value}</p></section>)}</div>
 {[[`Fee dues ${month}`,feeHeaders,feeRows],[`Attendance ${month}`,attHeaders,attRows],[`Collections ${month}`,paymentHeaders,paymentRows],[`Batch strength`,strengthHeaders,strengthRows],[`Test results ${month}`,marksHeaders,marksRows]].map(([title,headers,rows])=><section key={title as string} className={panelClass}><h2 className="text-xl mb-3">{title as string}</h2><p>{(rows as unknown[][]).length} rows</p><div className="flex flex-wrap gap-2 mt-3"><button className={buttonClass} onClick={()=>void exportXlsx(`${title}.xlsx`,headers as string[],rows as (string|number)[][])}>Export Excel (.xlsx)</button><button className={buttonClass} onClick={()=>void exportPdf(title as string,headers as string[],rows as (string|number)[][])}>Export PDF</button></div></section>)}
 {msg&&<p role="alert" className="text-yellow-300">{msg}</p>}
 </Phase2Layout>;
}
