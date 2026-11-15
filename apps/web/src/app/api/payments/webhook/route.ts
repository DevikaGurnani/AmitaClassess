import { verifyWebhookSignature } from '@/lib/phase2/gateway';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export async function POST(req: Request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({error:'Not configured'}, {status:503});
  const raw = await req.text();
  if (raw.length > 200_000) return NextResponse.json({error:'Payload too large'}, {status:413});
  const sent = req.headers.get('x-razorpay-signature') || '';
  if (!verifyWebhookSignature(raw,sent,secret)) {
    return NextResponse.json({error:'Invalid signature'}, {status:401});
  }
  let event: any;
  try { event=JSON.parse(raw); } catch { return NextResponse.json({error:'Malformed body'}, {status:400}); }
  if (event?.event !== 'payment.captured') return NextResponse.json({ok:true,ignored:true});
  const payment=event?.payload?.payment?.entity;
  if (!payment || typeof payment.order_id!=='string' || typeof payment.id!=='string' ||
     payment.status!=='captured' || payment.currency!=='INR' || !Number.isSafeInteger(payment.amount)) {
    return NextResponse.json({error:'Invalid captured payment'}, {status:400});
  }
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL, service=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) return NextResponse.json({error:'Service configuration missing'}, {status:503});
  const sb=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const {error} = await sb.rpc('settle_gateway_payment',{
    p_order:payment.order_id,p_payment:payment.id,p_amount_paise:payment.amount
  });
  if (error) {
    console.error('Gateway settlement failed',error.code,error.message);
    // Retryable: Gateway retries non-2xx webhooks; investigate recurring failures.
    return NextResponse.json({error:'Settlement failed'}, {status:500});
  }
  return NextResponse.json({ok:true});
}
