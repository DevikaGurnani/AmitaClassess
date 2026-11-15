import {createHmac,timingSafeEqual} from 'node:crypto';
/** Verify the exact raw Razorpay webhook body with a webhook-specific secret. */
export function verifyWebhookSignature(raw:string,received:string,secret:string):boolean {
 if(!secret || !/^[a-f0-9]{64}$/i.test(received))return false;
 const expected=createHmac('sha256',secret).update(raw).digest('hex');
 const actual=Buffer.from(received,'hex');
 const known=Buffer.from(expected,'hex');
 return actual.length===known.length && timingSafeEqual(actual,known);
}
