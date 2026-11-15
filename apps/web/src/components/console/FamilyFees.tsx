"use client";
import Link from 'next/link';
import PaymentMode from '@/components/PaymentMode';
import { useState } from 'react';
import { ArrowUpRight, Download, FileText, RefreshCw, ShieldCheck } from 'lucide-react';
import { EmptyState, money, SectionHeading } from '@/components/DashboardParts';
import { amountRemaining, displayDate, indiaDate, type LearnerDue, type LearnerPayment } from '@/lib/learner-console';
import { openFeeCheckout } from '@/lib/payment-checkout';
import { exportPdf } from '@/lib/phase2/export';

export default function FamilyFees({ dues, studentName, isDemo, refresh, compact = false }: { dues: LearnerDue[]; studentName: string; isDemo: boolean; refresh: () => void; compact?: boolean }) {
  const [busy, setBusy] = useState('');
  const [month, setMonth] = useState('all');
  const [message, setMessage] = useState('');
  const balance = dues.reduce((sum, due) => sum + amountRemaining(due), 0);
  const visible = dues.filter(due => month === 'all' || due.month.slice(0, 7) === month);
  const receipts = visible.flatMap(due => due.payments ?? []).sort((a, b) => b.paid_at.localeCompare(a.paid_at));
  async function pay(due: LearnerDue) {
    if (isDemo) return;
    setBusy(due.id); setMessage('');
    try { if (await openFeeCheckout(due.id) === 'submitted') setMessage('Payment submitted. Use Refresh payment status to check for your confirmed receipt.'); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Unable to start payment.'); }
    finally { setBusy(''); }
  }
  async function receipt(payment: LearnerPayment) {
    setBusy(payment.id); setMessage('');
    try { await exportPdf(`Receipt_${payment.receipt_no}`, ['Field', 'Value'], [['Receipt', payment.receipt_no], ['Student', studentName], ['Amount INR', payment.is_reversal ? -payment.amount : payment.amount], ['Type', payment.is_reversal ? 'Reversal' : 'Payment'], ['Mode', payment.mode], ['Date', displayDate(payment.paid_at)]]); }
    catch { setMessage('Unable to download this receipt. Please try again.'); }
    finally { setBusy(''); }
  }
  return <section className={`dashboard-panel family-fees ${compact ? '' : 'console-wide'}`}><SectionHeading title="Fees & receipts">{compact ? <Link href="/parent?view=fees">View details <ArrowUpRight size={16} /></Link> : <button className="secondary-button" onClick={refresh} disabled={!!busy}><RefreshCw size={15} />Refresh payment status</button>}</SectionHeading><div className="fee-summary-total"><div><p>Outstanding balance</p><strong>{money(balance)}</strong></div><span className={`status-tag ${balance > 0 ? 'status-pending' : ''}`}><i />{balance > 0 ? 'Payment pending' : 'All caught up'}</span></div>
    {compact ? <p className="section-description">{dues.length ? `Fees and receipts for ${studentName}. View details for the full breakdown.` : 'Fee details will appear when the academy creates an invoice.'}</p> : <>
      {isDemo && <p className="console-info"><ShieldCheck size={18} />This is a demo. You can explore invoices and download sample receipts. Online checkout is available with a connected academy account.</p>}
      <PaymentMode/><div className="console-filters"><label>Billing month<select value={month} onChange={event => setMonth(event.target.value)}><option value="all">All months</option>{[...new Set(dues.map(due => due.month.slice(0, 7)))].map(value => <option key={value}>{value}</option>)}</select></label></div>
      <div className="invoice-list">{visible.map(due => { const remaining = amountRemaining(due); return <article key={due.id}><span className="invoice-icon"><FileText size={22} /></span><div><h3>Tuition fees - {due.month.slice(0, 7)}</h3><p>Due {displayDate(due.due_date)}{remaining > 0 && due.due_date < indiaDate() ? ' | Overdue' : ''}</p><p>Billed {money(due.generated_amount)} | Paid {money(due.paid_amount)}</p></div><div className="invoice-amount"><strong>{money(remaining)}</strong>{remaining > 0 ? <button className="primary-button" disabled={!!busy || isDemo} onClick={() => void pay(due)}>{busy === due.id ? 'Opening checkout...' : 'Pay with Razorpay'}</button> : <span className="status-tag">Paid</span>}</div></article>; })}</div>
      {!visible.length && <EmptyState>No fee invoices for this selection.</EmptyState>}
      <h3 className="console-subheading">Payment history</h3><div className="receipt-list">{receipts.map(payment => <div key={payment.id}><span><FileText size={17} /><span><strong>{payment.receipt_no}</strong><small>{displayDate(payment.paid_at)} | {payment.mode}{payment.is_reversal ? ' | Reversal' : ''}</small></span></span><span>{money(payment.is_reversal ? -payment.amount : payment.amount)}</span><button className="secondary-button" disabled={!!busy} onClick={() => void receipt(payment)} aria-label={`Download receipt ${payment.receipt_no}`}><Download size={15} />Receipt</button></div>)}</div>
      {!receipts.length && <p className="section-description">Confirmed receipts will appear after a payment is recorded.</p>}
    </>}
    {message && <p role="status" className="console-info">{message}</p>}
  </section>;
}
