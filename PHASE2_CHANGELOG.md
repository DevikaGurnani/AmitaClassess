# Phase 2 implementation changelog — 10 November 2026

Baseline: `TuitionApp_Phase0_Repaired.zip`. **Phase 2 development baseline, not a verified release.**

## Implemented in source

1. **Payments:** Razorpay order creation in an authenticated Next.js route, checkout UI, raw-body HMAC-verified `payment.captured` webhook, service-role-only database settlement RPC, unique gateway payment references, idempotency, fee-balance recalculation trigger, and receipt PDF downloads from verified payment rows. Server-side secrets and the service-role key are never passed to the client. Gateway test/live credentials are required.
2. **Tests and marks:** Supabase `tests` and `test_marks` tables, owner/staff/teacher marking UI, score validation, enrollment-scoped RLS, audit triggers; selected child's results and teacher remarks appear in the parent portal.
3. **Notices:** Role-constrained notice posting (owners/staff across audiences, teachers in assigned batches only); published in-app board. Parent portal now retrieves RLS-filtered announcements including batch notices.
4. **Reports:** Month selector, billed/collected/pending/attendance counts, fee due/attendance/payment/batch-strength/test-result exports to XLSX or PDF. Uses the existing xlsx/jsPDF dependencies; reports are only as accurate as the underlying Phase 1 data.
5. **Offline attendance:** Device-local queue of student marks keyed by UUID, manual sync on connection, idempotent server RPC, enrollment/holiday/date and teacher-assignment checks, database sync receipt keys. Browser-tab/offline caching limitations are documented below.
6. **Notifications:** RLS-controlled notification log, manual queueing UI, idempotent fee/absence in-app reminder generator, service-role worker claim with retry tracking, protected cron HTTP route. Optional HTTPS delivery adapter for SMS/WhatsApp/push; no provider is bundled or automatically configured.
7. **Navigation:** Teacher landing page, owner dashboard cards, parent portal messages/results/fee-payment link; existing visual style retained.
8. **Configuration:** `.env.example` lists server-only gateway and scheduler keys; no live credentials included.

## Remaining dependencies and known gaps

- **Phase 1 is not complete.** The supplied baseline has placeholder pages and incomplete workflows for student admission, materials, role management and other core records. Phase 2 depends on actual users, linked parents, student/batch enrollments and positive fee dues.
- npm dependency installation was attempted with `npm ci --offline` but the package cache lacked `@supabase/ssr`; no successful production build, typecheck, browser automation or actual Supabase migration execution can be claimed.
- No actual payment was charged, settled or refunded. Configure Razorpay test mode, a separate webhook secret, and a reachable HTTPS webhook. Test successful and duplicate webhooks, mismatched amounts, partial fees, failed webhooks, refunds, and concurrent payments before production use. Refund automation is not implemented.
- SMS/WhatsApp delivery is an **adapter integration point**, not a connected provider. Configure a provider, approved WhatsApp templates, consent and failure reporting. Currently automatic fee and absence reminders are queued for in-app delivery; worker schedule is external.
- Offline attendance is an **interim browser-local queue**. It needs a previously loaded authenticated page/roster; it does not yet include an installable PWA shell, persistent offline roster after a page reload, background sync or cross-device reconciliation. Device storage may be cleared.
- Report calculations are straightforward snapshots and do not yet cover every advanced business rule (e.g. pro-rated fees, multiple fee dues per period, refunds). PDF uses default fonts: Hindi Unicode export requires embedded fonts and font validation.
- Supabase policies and triggers must be validated with owner/staff/teacher/parent real users. Migration includes new tables and functions and should be reviewed in a **fresh development Supabase project** before applying to production.

## Tests executed

`node scripts/phase2-test.mjs`: **15/15 passed** (TS/TSX parser, gateway HMAC behavior, offline queue behavior and static security/functionality assertions). These are not integration/end-to-end tests. Zip integrity and secrets scan are run at packaging.
