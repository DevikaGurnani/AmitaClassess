'use client';
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Bell,CheckCircle2,AlertCircle,Info,X} from 'lucide-react';
import {useAuth,useSupabase} from '@/lib/auth-context';
import {notify,type AppNotification} from '@/lib/notifications';
type Activity={id:string;actor_id:string|null;action:string;resource_kind:string;title:string;class_name:string;batch_name?:string;created_at:string};
export default function NotificationCenter(){
 const {user,role}=useAuth(),{supabase:sb}=useSupabase();
 const [open,setOpen]=useState(false),[items,setItems]=useState<AppNotification[]>([]),[toasts,setToasts]=useState<AppNotification[]>([]),[unread,setUnread]=useState(0),[mounted,setMounted]=useState(false);
 const [inboxError,setInboxError]=useState('');const inboxIds=useRef<string[]>([]);
 const openRef=useRef(open),timers=useRef<ReturnType<typeof setTimeout>[]>([]),anchor=useRef<HTMLDivElement>(null);openRef.current=open;
 useEffect(()=>{setMounted(true);return()=>{timers.current.forEach(clearTimeout);};},[]);
 useEffect(()=>{
  if(!user)return;
  setItems([]);setToasts([]);setUnread(0);
  let active=true;const seen=new Set<string>();
  function add(item:AppNotification,toast=true){if(!active||seen.has(item.id))return;seen.add(item.id);setItems(rows=>[item,...rows].sort((a,b)=>b.time-a.time).slice(0,40));if(toast){setToasts(rows=>[...rows,item].slice(-4));if(!openRef.current&&role!=='student')setUnread(value=>value+1);timers.current.push(setTimeout(()=>setToasts(rows=>rows.filter(row=>row.id!==item.id)),item.kind==='error'?9000:5500));}}
  function activity(row:Activity):AppNotification{return{id:row.id,title:`${row.resource_kind==='folder'?'Folder':row.resource_kind==='link'?'Link':'Document'} ${row.action==='deleted'?'deleted':'added'}`,detail:`${row.title} · ${row.batch_name||'Previous uploads'}`,kind:'info',time:new Date(row.created_at).getTime()};}
  const receive=(event:Event)=>add((event as CustomEvent<AppNotification>).detail);
  window.addEventListener('tuition-notification',receive);
  if(role!=='student')void sb.from('library_activity').select('*').order('created_at',{ascending:false}).limit(30).then(({data})=>{if(active)for(const row of data||[])add(activity(row),false);});
  const channel=sb.channel(`library-notifications-${user.id}-${crypto.randomUUID()}`).on('postgres_changes',{event:'INSERT',schema:'public',table:'library_activity'},payload=>{const row=payload.new as Activity;if(role!=='student'&&row.actor_id!==user.id)add(activity(row));}).subscribe();
  let welcomeShown=false;const delivered=new Set<string>();
  async function inbox(){if(role!=='student')return;const result=await sb.from('student_notifications').select('*').eq('user_id',user!.id).order('read_at',{ascending:true,nullsFirst:true}).order('created_at',{ascending:false}).limit(30);if(!active)return;if(result.error){setInboxError('Unable to load batch updates. Reopen or refresh to retry.');return;}setInboxError('');inboxIds.current=(result.data||[]).filter(row=>!row.read_at).map(row=>row.id);setUnread(inboxIds.current.length);for(const row of result.data||[]){const item:AppNotification={id:row.id,title:row.title,detail:row.detail,kind:'info',time:new Date(row.created_at).getTime(),view:row.view,persisted:true,read:!!row.read_at};add(item,welcomeShown&&!row.read_at&&!delivered.has(row.id));delivered.add(row.id);}setItems(rows=>[...rows.filter(row=>!row.persisted),...(result.data||[]).map(row=>({id:row.id,title:row.title,detail:row.detail,kind:'info' as const,time:new Date(row.created_at).getTime(),view:row.view,persisted:true,read:!!row.read_at}))].sort((a,b)=>Number(!!b.persisted&&!b.read)-Number(!!a.persisted&&!a.read)||b.time-a.time).slice(0,40));setUnread(inboxIds.current.length);if(!welcomeShown&&inboxIds.current.length){add({id:'welcome-'+user!.id,title:'New updates for your batches',detail:inboxIds.current.length+' unread updates. Open the notification bell to view them.',kind:'info',time:Date.now()});setUnread(inboxIds.current.length);}welcomeShown=true;}
  void inbox();const inboxChannel=role==='student'?sb.channel('student-inbox-'+user.id+'-'+crypto.randomUUID()).on('postgres_changes',{event:'INSERT',schema:'public',table:'student_notifications',filter:'user_id=eq.'+user.id},()=>void inbox()).subscribe():null;
  const retryInbox=()=>void inbox();window.addEventListener('focus',retryInbox);window.addEventListener('online',retryInbox);const poll=setInterval(retryInbox,30000);
  // One observer covers API and direct database mutations for every workspace role.
  const previous=window.fetch;
  const observed:typeof fetch=async(input,init)=>{
   const method=(init?.method||(input instanceof Request?input.method:'GET')).toUpperCase();
   const url=new URL(input instanceof Request?input.url:String(input),location.origin);
   const local=url.origin===location.origin&&url.pathname.startsWith('/api/')&&!url.pathname.startsWith('/api/auth/');
   const database=url.origin===new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin&&url.pathname.startsWith('/rest/v1/');
   const mutation=['POST','PUT','PATCH','DELETE'].includes(method)&&(local||database)&&!(init?.body instanceof FormData&&init.body.get('preview')==='true');
   try{const response=await previous(input,init);if(active&&mutation){
    const path=url.pathname;
    if(response.ok){let title=method==='DELETE'?'Deleted successfully':method==='PATCH'||method==='PUT'?'Changes saved':'Saved successfully';
     if(path==='/api/library/folders')title='Folder created';else if(path==='/api/library')title=method==='DELETE'?'Resource deleted':'Resource saved';else if(path==='/api/assignments/submit')title='Assignment submitted';else if(path==='/api/assignments/grade')title='Marks and feedback saved';else if(path==='/api/assignments')title='Assignment published';else if(path.endsWith('/mark_batch_attendance')||path.endsWith('/sync_attendance'))title='Attendance saved';
     if(path==='/api/library'&&method==='POST'&&init?.body instanceof FormData)title=init.body.get('file') instanceof File?'Document uploaded':'Resource link saved';
     if(path==='/api/question-bank')title='Question bank imported';
     if(path==='/api/question-papers')title=method==='DELETE'?'Question paper deleted':'Question paper saved';
     let warning:string|undefined;if(local&&path==='/api/library'){try{warning=(await response.clone().json()).warning;}catch{}}
     notify(title,warning?'info':'success',warning);
    }else{let message='Please try again.';try{const result=await response.clone().json();message=result.error||result.message||message;}catch{}notify('Action could not be completed','error',message);}
   }return response;}catch(error){if(active&&mutation)notify('Connection interrupted','error','Your changes could not be confirmed. Please retry.');throw error;}
  };
  window.fetch=observed;
  return()=>{active=false;window.removeEventListener('tuition-notification',receive);clearInterval(poll);window.removeEventListener('focus',retryInbox);window.removeEventListener('online',retryInbox);if(inboxChannel)void sb.removeChannel(inboxChannel);if(window.fetch===observed)window.fetch=previous;void sb.removeChannel(channel);timers.current.forEach(clearTimeout);timers.current=[];};
 },[sb,user?.id,role]);
 useEffect(()=>{if(!open)return;const dismiss=(event:MouseEvent)=>{if(!anchor.current?.contains(event.target as Node))setOpen(false);};const keyboard=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false);};document.addEventListener('mousedown',dismiss);document.addEventListener('keydown',keyboard);return()=>{document.removeEventListener('mousedown',dismiss);document.removeEventListener('keydown',keyboard);};},[open]);
 async function markRead(){const ids=[...inboxIds.current];if(!ids.length)return;const {error}=await sb.rpc('read_student_notifications',{p_ids:ids});if(error){setInboxError('Could not mark updates as read. Please retry.');return;}inboxIds.current=inboxIds.current.filter(id=>!ids.includes(id));setUnread(inboxIds.current.length);setItems(rows=>rows.map(row=>ids.includes(row.id)?{...row,read:true}:row));setInboxError('');}
 return <><div className="popover-anchor" ref={anchor}><button className="icon-button notification-button labelled-action-button" aria-label={`Notifications${unread?`, ${unread} unread`:''}`} aria-expanded={open} onClick={()=>{setOpen(!open);if(role!=='student')setUnread(0);}}><Bell size={20}/><span className="action-button-label">Notifications</span>{unread>0&&<b className="notification-count">{unread>9?'9+':unread}</b>}</button>{open&&<section className="notification-history" aria-label="Recent notifications"><header><strong>Notifications</strong><button className="icon-button labelled-action-button" aria-label="Close notifications" onClick={()=>setOpen(false)}><X size={17}/><span className="action-button-label">Close notifications</span></button></header><p className="notification-history-description">Your batch updates and recent actions</p>{inboxError&&<p role="alert" className="form-error">{inboxError}</p>}{role==='student'&&unread>0&&<button className="text-button" onClick={()=>void markRead()}>Mark updates as read</button>}{items.length?<div className="notification-history-list">{items.map(item=><article key={item.id} className={item.persisted&&!item.read?'notification-unread':undefined}><span className={`notification-symbol ${item.kind}`}>{item.kind==='error'?<AlertCircle size={17}/>:item.kind==='success'?<CheckCircle2 size={17}/>:<Info size={17}/>}</span><div><strong>{item.title}</strong>{item.detail&&<p>{item.detail}</p>}{item.view&&<a href={'/student?view='+item.view}>View update</a>}<small>{new Date(item.time).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</small></div></article>)}</div>:<p className="notification-history-empty">You’re all caught up. New activity will appear here.</p>}</section>}</div>{mounted&&createPortal(<div className="app-toast-stack" aria-label="Action notifications" aria-live="polite" aria-relevant="additions">{toasts.map(item=><div className={`app-toast ${item.kind}`} key={item.id} role={item.kind==='error'?'alert':'status'}><span className="notification-symbol">{item.kind==='error'?<AlertCircle size={21}/>:item.kind==='success'?<CheckCircle2 size={21}/>:<Info size={21}/>}</span><div><strong>{item.title}</strong>{item.detail&&<p>{item.detail}</p>}</div><button aria-label="Dismiss notification" onClick={()=>setToasts(rows=>rows.filter(row=>row.id!==item.id))} className="labelled-action-button"><X size={16}/><span className="action-button-label">Dismiss notification</span></button></div>)}</div>,document.body)}</>;
}
