import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export async function POST(req: Request) {
  try {
    const key = process.env.RAZORPAY_KEY_ID;
    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!key || !secret) return NextResponse.json({ error: 'Online payments are not configured' }, { status: 503 });
    const sb = createServerSupabaseClient();
    const { data: auth, error: authError } = await sb.auth.getUser();
    if (authError || !auth.user) return NextResponse.json({ error: 'Please sign in' }, { status: 401 });
    const { data: actor } = await sb.from('users').select('role,status').eq('id',auth.user.id).single();
    if (!actor || actor.status !== 'active' || !['owner','staff','parent'].includes(actor.role)) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }
    const body: unknown = await req.json();
    const dueId = typeof body === 'object' && body !== null && 'dueId' in body && typeof body.dueId === 'string' ? body.dueId : '';
    if (!/^[a-f0-9-]{36}$/i.test(dueId)) return NextResponse.json({error:'Invalid due ID'}, {status:400});
    // RLS on fee_dues restricts the actor to their own child's fees or staff/owner dues.
    const {data:due,error:dueError} = await sb.from('fee_dues').select('id,student_id,generated_amount,paid_amount').eq('id',dueId).single();
    if (dueError || !due) return NextResponse.json({error:'Fee due not found'}, {status:404});
    const remaining = due.generated_amount - due.paid_amount;
    if (!Number.isSafeInteger(remaining) || remaining <= 0 || remaining > 10000000) return NextResponse.json({error:'No payable balance'}, {status:400});
    const gateway = await fetch('https://api.razorpay.com/v1/orders', {
      method:'POST', headers:{Authorization:`Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`,'Content-Type':'application/json'},
      body:JSON.stringify({amount:remaining*100,currency:'INR',receipt:`due_${due.id.slice(0,18)}_${Date.now()}`,notes:{due_id:due.id}}),
      cache:'no-store'
    });
    if (!gateway.ok) return NextResponse.json({error:'Unable to create payment order'}, {status:502});
    const order = await gateway.json() as {id:string;amount:number;currency:string};
    if (order.amount !== remaining*100 || order.currency !== 'INR') return NextResponse.json({error:'Unexpected gateway response'}, {status:502});
    const {error:saveError} = await sb.from('payment_orders').insert({due_id:due.id,student_id:due.student_id,requested_by:auth.user.id,amount_inr:remaining,gateway_order_id:order.id});
    if (saveError) return NextResponse.json({error:'Unable to register payment order'}, {status:409});
    return NextResponse.json({keyId:key,orderId:order.id,amount:order.amount,currency:'INR'});
  } catch { return NextResponse.json({error:'Invalid payment request'}, {status:400}); }
}
