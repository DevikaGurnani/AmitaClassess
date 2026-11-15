# Razorpay sandbox acceptance

The application uses Razorpay's real Test Mode checkout, not a fake paid button. Configure server-only `RAZORPAY_KEY_ID` starting `rzp_test_`, its matching `RAZORPAY_KEY_SECRET`, and an independent `RAZORPAY_WEBHOOK_SECRET`. Set them locally and in Vercel Production, then redeploy. Never expose the key secret/webhook secret through NEXT_PUBLIC variables.

In Razorpay Test Mode configure `https://amita-classess.vercel.app/api/payments/webhook` with event `payment.captured` and the same webhook secret. Test webhook delivery must reach the public endpoint without deployment-password protection. Ensure payment capture is enabled; an authorized-only payment does not settle a due.

Use a dedicated test student and generated due. Owner/staff or the linked parent opens Pay with Razorpay. Checkout receives the server-calculated remaining amount in paise and an API-created order; the browser cannot choose the due amount. Use Razorpay's documented test methods. Test Mode charges no real money, but successful captured payments update this project's actual fee records, so keep test fixtures separate from real accounts.

Verify success produces one receipt and the correct outstanding balance after Refresh payment status. Repeat the same signed webhook and confirm no duplicate receipt. Verify failed/cancelled checkout does not mark the due paid. A success popup alone does not settle payment: only the signature-verified captured webhook calls `settle_gateway_payment`.

The UI shows gateway Test/Live/unconfigured status without returning secrets. Checkout loading, cancellation and errors use a shared implementation on owner and parent screens. Payment actions, receipts and student directory actions now use labelled buttons.

Passing sandbox does not establish that a live account is activated. Going live requires activated Razorpay account capabilities, matching live keys and a separately configured Live Mode webhook; then perform an explicitly authorized live verification.

Official testing documentation: https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/test-integration/
