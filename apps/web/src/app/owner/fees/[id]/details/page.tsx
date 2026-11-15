'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Phase2Layout, { buttonClass, inputClass, panelClass } from '@/components/Phase2Layout';
import { useAuth, useSupabase } from '@/lib/auth-context';
import { exportPdf } from '@/lib/phase2/export';

type Due = { id: string; student_id: string; month: string; generated_amount: number; paid_amount: number; due_date: string; students: { name: string } | null };
type Payment = { id: string; receipt_no: string; amount: number; mode: string; reference: string | null; paid_at: string; is_reversal: boolean; reversal_of: string | null; reversal_reason: string | null };

export default function FeeDetails({ params }: { params: { id: string } }) {
  const { user, role } = useAuth();
  const { supabase: sb } = useSupabase();
  const [due, setDue] = useState<Due | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState('cash');
  const [reference, setReference] = useState('');
  const [requestId, setRequestId] = useState('');
  const [reversing, setReversing] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const [dues, receipts] = await Promise.all([
      sb.from('fee_dues').select('id,student_id,month,generated_amount,paid_amount,due_date,students(name)').eq('id', params.id).single(),
      sb.from('payments').select('id,receipt_no,amount,mode,reference,paid_at,is_reversal,reversal_of,reversal_reason').eq('due_id', params.id).order('paid_at', { ascending: false }),
    ]);
    if (dues.error || receipts.error) throw dues.error || receipts.error;
    setDue(dues.data as unknown as Due); setPayments(receipts.data ?? []);
  }, [sb, params.id]);

  useEffect(() => {
    if (!user || !role || !['owner', 'staff'].includes(role)) return;
    setRequestId(crypto.randomUUID());
    void load().catch(cause => setError(cause.message)).finally(() => setLoading(false));
  }, [load, user, role]);

  async function record(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const { error: paymentError } = await sb.rpc('record_manual_payment', { p_id: requestId, p_due_id: params.id, p_amount: Number(amount), p_mode: mode, p_reference: reference || null });
      if (paymentError) throw paymentError;
      setRequestId(crypto.randomUUID()); setAmount(''); setReference('');
      setMessage('Payment recorded.');
      await load();
    } catch (cause) { setError((cause as { message?: string })?.message ?? 'Unable to record payment'); }
    finally { setBusy(false); }
  }

  async function reverse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const { error: reversalError } = await sb.rpc('reverse_manual_payment', { p_id: crypto.randomUUID(), p_payment_id: reversing, p_reason: reason });
      if (reversalError) throw reversalError;
      setReversing(''); setReason(''); setMessage('Payment reversed.'); await load();
    } catch (cause) { setError((cause as { message?: string })?.message ?? 'Unable to reverse payment'); }
    finally { setBusy(false); }
  }

  const balance = due ? due.generated_amount - due.paid_amount : 0;
  return <Phase2Layout title="Fee details and receipts">
    <Link href="/owner/fees" className="text-tuition-accent underline">Fee dues</Link>
    {error && <p role="alert" className="text-red-300">{error}</p>}
    {message && <p role="status" className="text-green-300">{message}</p>}
    {loading && <p>Loading fee record…</p>}
    {due && <>
      <section className={`${panelClass} space-y-2`}><h2 className="text-xl">{due.students?.name ?? due.student_id}</h2><p>Billing month {due.month} · Due {due.due_date}</p><p>Billed ₹{due.generated_amount} · Paid ₹{due.paid_amount} · Balance ₹{balance}</p></section>
      {balance > 0 && <form onSubmit={event => void record(event)} className={`${panelClass} grid gap-4 sm:grid-cols-2`}>
        <h2 className="text-xl sm:col-span-2">Record payment</h2>
        <label>Amount (INR)<input required type="number" min="1" max={balance} step="1" className={inputClass} value={amount} onChange={event => setAmount(event.target.value)} /></label>
        <label>Mode<select className={inputClass} value={mode} onChange={event => setMode(event.target.value)}>{['cash', 'upi', 'bank_transfer', 'cheque'].map(value => <option key={value} value={value}>{value.replace('_', ' ')}</option>)}</select></label>
        <label>Reference<input className={inputClass} value={reference} onChange={event => setReference(event.target.value)} /></label>
        <button disabled={busy || !requestId} className={buttonClass}>{busy ? 'Saving…' : 'Record payment'}</button>
      </form>}
      <section className={`${panelClass} space-y-4`}><h2 className="text-xl">Payment history</h2>
        {!payments.length && <p>No payments recorded.</p>}
        {payments.map(payment => <article key={payment.id} className="border-t border-gray-700 pt-4 space-y-2">
          <p>{payment.receipt_no} · {payment.is_reversal ? '−' : ''}₹{payment.amount} · {payment.mode}</p>
          <p className="text-sm text-gray-400">{new Date(payment.paid_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}{payment.reference ? ` · ${payment.reference}` : ''}</p>
          {payment.reversal_reason && <p>Reversal reason — {payment.reversal_reason}</p>}
          <div className="flex flex-wrap gap-3"><button className={buttonClass} onClick={() => void exportPdf(payment.receipt_no, ['Field', 'Value'], [
            ['Receipt', payment.receipt_no], ['Student', due.students?.name ?? due.student_id], ['Billing month', due.month], ['Amount (INR)', payment.is_reversal ? -payment.amount : payment.amount], ['Mode', payment.mode], ['Paid at', payment.paid_at], ['Reference', payment.reference ?? ''], ['Reversal reason', payment.reversal_reason ?? ''],
          ])}>Download PDF</button>
          {role === 'owner' && !payment.is_reversal && payment.mode !== 'online' && !payments.some(row => row.reversal_of === payment.id) && <button disabled={busy} className="underline" onClick={() => { setReversing(payment.id); setReason(''); }}>Reverse payment</button>}</div>
        </article>)}
      </section>
      {reversing && <form onSubmit={event => void reverse(event)} className={`${panelClass} space-y-3`}><h2 className="text-xl">Reverse selected payment</h2><label>Reason<textarea required className={inputClass} value={reason} onChange={event => setReason(event.target.value)} /></label><div className="flex gap-3"><button disabled={busy} className={buttonClass}>Confirm reversal</button><button type="button" disabled={busy} onClick={() => setReversing('')}>Cancel</button></div></form>}
    </>}
  </Phase2Layout>;
}
