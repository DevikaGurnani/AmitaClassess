# TuitionApp — Phase 2 developer setup

## Start from the repaired foundation

The original UI and Phase 0 source remain in place. Phase 2 adds source routes, pages, SQL migration, and tests. **Use a development Supabase project first.** Never upload genuine children/parent data to an untested instance.

1. Install Node.js >=20 and dependencies with `npm ci` from the repository root on a networked machine (existing lockfile requires verification after install).
2. Copy `apps/web/.env.example` to `apps/web/.env.local` and set your own public Supabase URL/anon key. Do not commit `.env.local`.
3. Create an isolated Supabase development project, apply the Phase 0 baseline schema and then `supabase/migrations/20261110_02_phase2.sql`; validate there are no failed statements. The migration uses `uuid-ossp`, RLS and database auth functions.
4. Seed **test-only** users with valid Supabase auth identities, active `users` profiles, parent-to-student relations, batches/enrollments, fee plans and fee dues. Ensure service-role grants apply only on server.
5. Run `npm run build:web`, `npx tsc --noEmit -p apps/web/tsconfig.json`, and `node scripts/phase2-test.mjs`. Start `npm run dev:web`. Check all five roles and cross-parent ID access.
6. Razorpay: create test API key and webhook secret; set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, and `SUPABASE_SERVICE_ROLE_KEY` on the server. Configure the gateway's `payment.captured` webhook to `https://YOUR_DOMAIN/api/payments/webhook`. Do not use a checkout callback to record payments. Verify actual receipt and status after gateway delivery.
7. Scheduler: set a strong `CRON_SECRET`; schedule authenticated **POST** requests to `/api/jobs/notifications` with `Authorization: Bearer <CRON_SECRET>` (e.g. every 10 minutes). This generates in-app reminders for fees/absences and processes pending queue jobs. For outbound channels set the optional notification-delivery adapter URL and token; the adapter must implement provider-specific delivery, WhatsApp templates and any required opt-in.
8. Review all remaining Phase 1 placeholders before starting a real pilot. Run integration tests for migrated SQL, RLS isolation, staff actions, teacher editing windows, fee reversals, gateway retries/refunds, cron restarts and physical-device offline conditions.

## Phase 2 routes

- `/owner/tests` — create batch tests and record marks (owner/staff/teacher)
- `/owner/notices` — create notices (owner/staff/assigned teacher)
- `/owner/reports` — financial, attendance, test and batch exports (owner/staff)
- `/owner/notifications` — queue and inspect messages (owner/staff)
- `/owner/offline-attendance` — device queue and sync (owner/staff/teacher)
- `/owner/payments` — authenticated online payment of visible outstanding dues (owner/staff/parent)
- `/api/payments/create-order` — creates Razorpay order for authenticated payer
- `/api/payments/webhook` — receives signed gateway event and commits settlement
- `/api/jobs/notifications` — authenticated server-only scheduled worker

## Required follow-up verification

Check `PHASE2_CHANGELOG.md` and `PHASE2_VALIDATION.md`. The presence of routes does not mean the application has passed production acceptance testing.
