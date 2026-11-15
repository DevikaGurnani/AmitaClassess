import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const authOk=(authorization:string|null, secret:string)=>{
 const supplied=authorization?.startsWith('Bearer ')?authorization.slice(7):'';
 const a=Buffer.from(supplied),b=Buffer.from(secret);
 return !!supplied&&a.length===b.length&&timingSafeEqual(a,b);
};
export async function POST(req:Request){
 const secret=process.env.CRON_SECRET,url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!secret||!url||!key)return NextResponse.json({error:'Scheduler not configured'}, {status:503});
 if(!authOk(req.headers.get('authorization'),secret))return NextResponse.json({error:'Unauthorized'}, {status:401});
 const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {error:generateError}=await sb.rpc('generate_reminder_notifications');
 if(generateError)return NextResponse.json({error:'Reminder generation failed'}, {status:500});
 const {data:jobs,error:claimError}=await sb.rpc('claim_notification_jobs',{p_limit:30});
 if(claimError)return NextResponse.json({error:'Queue claim failed'}, {status:500});
 let sent=0,failed=0;
 for(const job of jobs||[]){
  try{
   let providerId:string|null=null;
   if(job.channel!=='in_app'){
    const endpoint=process.env.NOTIFICATION_DELIVERY_WEBHOOK_URL;
    const token=process.env.NOTIFICATION_DELIVERY_WEBHOOK_TOKEN;
    if(!endpoint||!token)throw new Error('External notification provider not configured');
    const {data:recipient,error:recipientError}=await sb.from('users').select('phone').eq('id',job.user_id).single();
    if(recipientError||!recipient?.phone)throw new Error('Recipient phone unavailable');
    const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({id:job.id,channel:job.channel,to:recipient.phone,message:job.message,templateKey:job.template_key}),signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw new Error(`Delivery adapter returned ${response.status}`);
    const result=await response.json() as {messageId?:string};providerId=result.messageId||null;
   }
   await sb.from('notifications').update({status:job.channel==='in_app'?'delivered':'sent',sent_at:new Date().toISOString(),delivered_at:job.channel==='in_app'?new Date().toISOString():null,provider_message_id:providerId,last_error:null}).eq('id',job.id);
   sent++;
  }catch(err){
   failed++;const retry=(job.attempts||0)<3;
   await sb.from('notifications').update({status:retry?'pending':'failed',last_error:String(err).slice(0,400),scheduled_for:new Date(Date.now()+60000*Math.min(30,2**job.attempts)).toISOString()}).eq('id',job.id);
  }
 }
 return NextResponse.json({processed:(jobs||[]).length,sent,failed});
}
