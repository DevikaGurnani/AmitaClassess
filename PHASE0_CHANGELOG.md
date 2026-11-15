# TuitionApp — Phase 0 Foundation Repair

Date: 2026-11-09

## Repair summary

This is an in-place repair of the uploaded demo source. Existing owner, student, batch, attendance, fee and parent screens have been retained where practical. This **does not** constitute a completed tuition-management MVP or a production security certification.

### Authentication and API

- Replaced the hard-coded `1234567890` demo user and fabricated Supabase session with real Supabase phone OTP send and `verifyOtp({ type: 'sms' })`.
- OTP requests use `shouldCreateUser: false`: only provisioned users may sign in; the public API does **not** mint user profiles or elevated roles.
- Added a phone + OTP form on `/` and `/auth/login` using international E.164 phone numbers.
- Added profile/status lookup, role-aware dashboard routing and a real sign-out path.
- Corrected the legacy `/api/auth/signin` endpoint to verify rather than send OTP and reject unknown/inactive profiles.
- Split browser and server Supabase clients, using `@supabase/ssr` rather than the nonexistent `@supabase/ssr-browser` import.

### React, TypeScript and navigation

- Added client-component directives and separated authorization/loading guards from React hook-bearing content to avoid conditional hook ordering.
- Corrected `PERMISSION_MATRIX` import and exports; removed the invalid relative shared-package import.
- Replaced dashboard references to undefined components with a role-aware route landing view.
- Fixed undefined icon usage and improved dashboard card navigation; corrected invalid JSX option attributes and other JSX parsing problems.
- Corrected missing XLSX imports and the invalid notification channel `welcome`.
- Changed unimplemented external notifications to `pending` records instead of falsely marking them delivered.
- Improved batch create/edit form submission, student batch filtering, attendance roster default mapping and some fee-due calculations.
- Removed invalid attendance code that overwrote students' enrolment status (`active`, `left`) with attendance status (`absent`, `late`).
- Disallowed destructive fee-due deletion in the UI and converted student/batch removal to status updates.
- Removed references to Tailwind plugins not declared as dependencies.

### Database and privacy

- Replaced invalid and overbroad RLS policies with authenticated-actor role checks and parent/teacher scoping functions using the actual `student_parent` / `student_batch` links.
- Added policy definitions for the previously unprotected relationship and holiday tables.
- Removed the required `pgvector` extension (future AI work can enable `vector` separately); enabled `uuid-ossp` to support `uuid_generate_v4()`.
- Corrected `updated_at` triggers from `AFTER UPDATE` to `BEFORE UPDATE`.
- Denied student/fee-due/payment hard deletion at the client permission layer; added an immutable-payment trigger and reversal integrity validation.
- Added audit triggers for users, attendance, payments and fee dues, and owner-only read access to their audit records.
- Set the study-material storage configuration to **private** instead of public. Storage access policies and signed-URL handling must still be implemented before the material upload/view flow is launched.
- Deleted bundled `.env.local` files and local assistant settings from the distributable source. Never reuse or expose privileged secrets; rotate any leaked keys.

## Validation performed

- `node scripts/phase0-smoke.mjs`: **10 / 10 passed** (configuration and static security invariants).
- TypeScript compiler `transpileModule` applied to all application TS/TSX files: **0 syntax diagnostics**.
- JSON parse check for all JSON files: passed.
- `tsc --noEmit -p apps/web/tsconfig.json`: **not passed** because this environment has no installed Next.js/React/Supabase dependency packages and cannot reach the npm registry. TypeScript reported missing imports and ambient declarations. No verified typecheck or Next.js production build has occurred.
- No local PostgreSQL/Supabase server/CLI was available: SQL migration execution, real OTP, RLS multiuser integration tests and browser E2E tests **not performed**.

## Open / deliberately deferred work

1. Integrate and test the full app in a dependency-enabled environment; fix any remaining semantic type errors or framework runtime issues.
2. Apply/test the revised **initial** migration on a **fresh development database**. If the original migration was applied anywhere, **do not overwrite live schema history**; produce an additive migration and rehearse with a backup instead.
3. Provision the first owner via the Supabase administrative dashboard (see `README_PHASE0.md`); inactive/unknown users must not receive access. Ensure OTP rate limits, SMS provider, delivery and domain settings are configured.
4. Write automated RLS tests that impersonate owner/staff/teacher/parent users in a live database, including cross-child URL probing.
5. Build missing teacher/student portals and owner subroutes; material storage RLS and signed URLs; private notices, payment allocation, reversals, receipts, scheduled fee generation, contact verification and audit reporting.
6. Fix remaining UI/business flows (including batch schedule enforcement, fee-plan selection, parent notices, date filters and soft-deletion consistency) in Phase 1 before operational use.
7. Run dependency auditing and full unit, integration, accessibility, performance, and production backup/restore tests.

**Deployment status: Not production-ready.** Treat all real student/parent/fee data as sensitive. Do not upload live records until authorization and end-to-end tests have been completed.
