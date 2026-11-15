type CheckoutOptions = {
  key: string; order_id: string; amount: number; currency: string; name: string; description: string;
  handler: () => void; modal: { ondismiss: () => void };
};
type Checkout = { open: () => void; on: (event: string, callback: () => void) => void };
declare global { interface Window { Razorpay?: new (options: CheckoutOptions) => Checkout; } }
let loading: Promise<void> | null = null;
function loadCheckout() {
  if (window.Razorpay) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    const timeout = window.setTimeout(() => fail(), 20000);
    function fail() { window.clearTimeout(timeout); script.remove(); loading = null; reject(new Error('Payment checkout could not load. Please try again.')); }
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => { window.clearTimeout(timeout); if (window.Razorpay) resolve(); else fail(); };
    script.onerror = fail;
    document.body.appendChild(script);
  });
  return loading;
}
export async function openFeeCheckout(dueId: string): Promise<'submitted' | 'dismissed'> {
  const response = await fetch('/api/payments/create-order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dueId }) });
  const order = await response.json();
  if (!response.ok) throw new Error(order.error || 'Unable to prepare your payment.');
  await loadCheckout();
  return new Promise((resolve, reject) => {
    const checkout = new window.Razorpay!({ key: order.keyId, order_id: order.orderId, amount: order.amount, currency: 'INR', name: 'Amita’s Classes', description: order.mode==='test'?'TEST payment — no real money':'Tuition fee payment', handler: () => resolve('submitted'), modal: { ondismiss: () => resolve('dismissed') } });
    checkout.on('payment.failed', () => reject(new Error('Payment was not completed. You can try again.')));
    checkout.open();
  });
}
