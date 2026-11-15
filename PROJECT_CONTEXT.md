# TuitionApp working context

Updated: 13 November 2026 (Asia/Kolkata).

## Latest development update

ASSIGNMENTS MODULE (latest): user requested owner/student assignments, deadlines, text/PDF/Word questions, maximum marks, student PDF/Word uploads and in-portal PDF review with Supabase Storage. Implemented owner /owner/assignments + student /student?view=assignments and navigation. Added AssignmentsPanel with create, question viewing, deadline/status, upload/replace, owner review/grading/feedback and student grade view. PDF iframe stays in portal; DOCX private raw-text preview via mammoth, original download; legacy DOC download only. File cap10MB, signature validation, bounded multipart reads, DOCX ZIP limits and actual inflated-size guards. No external Office viewer or public file URL.

Final assignments verification: production build passed all34 routes after expansion hardening; real upload/preview/grading/access checks repeated and passed. Owner/student page + CSS HTTP200 after build, assignment layout CSS present. No claim of full browser visual/device acceptance. See ASSIGNMENTS.md for current usage, setup and limits.

Added/applied seventh migration20261115_07_assignments.sql to live DB: assignments + assignment_submissions (public table count now22), deadline/enrollment/actor-checked submit RPC, optimistic owner grading RPC, scoped database/storage RLS and audit triggers. Private assignment-files bucket configured for10MB PDF/Word. apply-assignment-schema.mjs does verified-TLS project check, additive transaction/checksum ledger and Storage API bucket configuration; base core upgrade helper still manages its original20 tables/six migrations. No existing application rows were rewritten.

Live acceptance succeeded with disposable identities: owner question PDF/Word publication, student batch visibility, private inline PDF and DOCX text preview, anonymous/other-student denials, submission replacement, owner grading, feedback, deadline and invalid-file rejection. Temporary identities/records/objects cleaned up. Local assignments tests10, console7 and TypeScript pass. Initial production build with routes passed; final Word guard build/recheck recorded when done. New runtime dependency mammoth installed. See ASSIGNMENTS.md for rules/limitations. Module deliberately excludes parent/staff/teacher; late submissions closed, graded work cannot be replaced. OTP/owner-env work unchanged.

Latest user steering: defer OTP/template work; owner Auth password must come from env. ACADEMY_ACCOUNT_PASSWORD is present and >=6; don't print it. Added owner-password.mjs validation/safe synchronization helper, sync-owner-password.mjs explicit CLI and owner-password-test.mjs. Owner bootstrap no longer hardcodes123456: requires ACADEMY_ACCOUNT_PASSWORD, while other users keep their requested temporary default. Login remains Supabase-verified, no env-login bypass. Active owner lookup by current env email+normalizedphone returned none; secondary inspection also found zero active owners and no matching contacts. Created owner from current env successfully with its configured password and first-change flag. Existing matching sync avoids rehash/reset; changed credentials require explicit script, not automatic per-login reset. OTP/template application remains deferred per user.

Latest recovery issue: user receives real email but hosted default body only has a reset link returning to localhost. Changed local recovery.html to OTP-only (Token, no href/ConfirmationURL/TokenHash), removed resetPasswordForEmail redirectTo and link wording. Verification remains email/type recovery and then local navigation to update-password. Hosted template not yet changed: SUPABASE_ACCESS_TOKEN still missing. Asked user to set it locally; manual alternative paste local recovery.html into Supabase Reset Password template. Added configure-recovery-email.mjs to read/back up/patch only recovery subject/body via Management API and verify. No SMTP/provider/Site URL changes, no automatic test emails. Localhost is expected while app is only local; no production URL is known. User-reported delivery supersedes older delivery-unknown notes, but OTP delivery awaits hosted template deployment.

REAL-ONLY MODE (15 November, latest): user rejected continued demo operation after screenshot showed browser-only Deepak admission. Removed demo imports/client switching/mock identity handling from auth-context, demo options/code fields from login, and demo branches/notices from admission/account UI. useSupabase always returns actual Supabase client. `retire-demo.ts` removes only the old tuition-demo-session identity marker on auth initialization/login/logout; saved tuition-demo-data-v1 records are deliberately preserved, not silently uploaded or deleted. Historical demo-auth has demoLoginEnabled=false in every environment. Old fake identities cannot authenticate again. Existing browser-only Deepak records are not magically in Supabase; user must authenticate with the configured real owner and save a real admission. All runtime pages rely on Supabase Auth/public profiles and RLS. AppShell no longer displays a metadata-driven Demo badge.

Added live-only-auth-test4 (retire identity without deleting saved admissions, always-real data client, disabled fixture identity, no mock UI imports); password/recovery8, console7 and TypeScript pass. Root test:live-only and historical test:demo now both run the new retirement regression, rather than old fixture behavior. Historical demo source/test files remain archival and are not runtime dependencies. Live/database and production build results are recorded when complete.

Real-only final verification: production build passed all31 routes. Fresh dev login HTML HTTP200 has unified identifier and no demo-login option. Disposable live acceptance again passed real SQL admission/fees (rolled back), app API student creation/linkage, student own-record isolation and email/mobile password sessions. Cleanup completed; one permanent active owner remains. No real user's password was changed during this iteration.

FINAL AUTH CLARIFICATION (15 November): user explicitly rejects Phone Auth/SMS. Only mobile-to-profile match for login; OTP/reset are email-only. Added `/api/auth/password`: origin/format checks, server service-role lookup of mobile→registered email, Supabase Email Auth password verification, mapped Auth identity match, active profile check, cookies and server-owned first-change redirect. Browser auth hook uses this route for both identifiers. No default-password comparison bypass exists. Removed real SMS send/verify from auth hook; demo only remains. Admin provisioning/bootstrap now creates email-only Auth identities, phone only in public profile.

Final production build passed with all31 routes, including new password endpoint and email-recovery flow. Dev login/CSS remain HTTP200 after the build. Owner login and recovery-code tests passed; real owner's password remains123456 with first-change required. Inbox delivery is not tested or configured by the DB runner. User should sign out of the browser demo before using env-configured real owner credentials. Local auth.sms.enable_signup=false reflects the no-SMS design, not a push of hosted Auth configuration.

User supplied ACADEMY_ACCOUNT_NAME/EMAIL/PHONE. Normalized bootstrap ten-digit Indian phone to +91 and successfully created permanent owner with temporary123456 + first-change flag. No public logs expose personal contact values. `check-owner-login.mjs` verified configured owner via both identifiers and real email recovery-code verification using an Admin-generated token (no email sent, password unchanged). `/api/auth/signin` is now recovery-email-code only, no legacy SMS. Home forgot screen supports reset link or email code. Added `supabase/templates/recovery.html` containing Token and TokenHash link for manual hosted template deployment; SMTP/template/actual inbox delivery still unverified. No SUPABASE_ACCESS_TOKEN provided. Phone provider should remain unused; do not ask user to enable it again.

Updated live acceptance passes both email/mobile password routes with session cookies, student create/link/login/isolation, first-change, financial/admission transaction checks and cleanup. Local password/recovery tests8, account tests15, demo9, Phase2 15 and TypeScript pass. Permanent owner remains; disposable verification accounts are removed. Normal login remains password-based, OTP is recovery (not mandatory MFA on every login). Build verification is recorded when complete.

Live setup success — 15 November: user supplied SUPABASE_DB_URL. Installed pg as root devDependency (package-lock updated) after NVM reshim and explicitly approved `nvm firewall trust module npm` repair; npm worked outside sandbox. PostgreSQL required Supabase CA; downloaded public Supabase Root 2021 CA into ignored .runtime/supabase-ca.crt, kept certificate+hostname verification enabled, and removed URI SSL flags that override pg's explicit CA configuration. apply runner uses this CA or SUPABASE_DB_CA_PATH. SQL project identity check passes. Catalog/application backups saved in .runtime/database-backups.

First live upgrade failed on legacy notices.class vs current class_id; outer transaction rolled back. Added conditional column rename to builder and repeatable preservation test; test passes. Corrected full upgrade then committed successfully. check-server-access now reports HTTP 200 for admin access, student email/phone, users.student_id and tests.

Added live-database-test.mjs: real disposable Auth/profile identities, email password123456, first-login RLS restriction, actual password change/refresh clears server flag, transactionally rolled-back admission/contact retry and fee generation/partial collection/reversal. Real running /api/admin/users returned 201 and linked student; real student email login/password change/own-profile RLS passed. First endpoint attempt 401 was due to sandboxed Next server network; stopped it and restarted Next with require_escalated outside sandbox (session 63561 at port3000), then checks passed. All temporary test identities and records cleaned up. Phone/password actual test returned phone_provider_disabled; permanent active owner account count after cleanup is 0.

Asked user via async to set ACADEMY_ACCOUNT_NAME, ACADEMY_ACCOUNT_EMAIL and ACADEMY_ACCOUNT_PHONE locally to bootstrap the intended owner; do not promote an unknown identity. Also requested enabling hosted Phone Auth or locally providing SUPABASE_ACCESS_TOKEN for managed configuration. DB credentials do not configure hosted Auth service. No email/SMS delivery was tested. Earlier missing-key/schema notes below are historical and superseded by this update. API/admin and DB core are now live-tested, but not all gateway/provider workflows.

Database setup request (15 November): user explicitly authorized database setup to make workflows function. Service-role key is now present and Auth admin access was verified HTTP 200; earlier "missing service key" notes below are superseded. Contact columns/login-link columns still return 400 and tests table 404. SQL credentials remain absent: SUPABASE_DB_URL/DATABASE_URL/SUPABASE_ACCESS_TOKEN not found. Asked user to supply SQL connection or Management API token locally; never in chat. No live migrations have been applied yet.

Prepared `scripts/database-upgrade.mjs`, generated `supabase/setup/complete-database-setup.sql`, `scripts/apply-database-setup.mjs` and setup README. Repair combines six sources atomically, recreates policies/triggers/selected constraints for repeatability, removes old permissive application policies, adds missing schema and guards existing row counts. Isolated test passes initial setup plus repeat setup preserving identities/student data and checking permissions/payment FKs. Runner requires explicit --apply plus SQL credentials, saves catalog/application-record backup under ignored .runtime/database-backups, checks project identity for DB URL, and does not print records/secrets. PostgreSQL URI mode additionally needs pg driver (not installed); PAT mode uses native fetch without a new dependency. Generated SQL is also reviewable for Supabase SQL Editor. SQL setup alone does not enable Phone Auth, SMTP/SMS delivery, owner credentials, gateway or scheduler; those still need configuration/acceptance. No claim of live success is justified until credentials arrive and hosted checks run.

15 November 2026: StudentEditor now requires independent student email/mobile and calls new `save_student_admission` RPC (migration `20261115_06_student_contacts.sql`, sixth migration). An owner can create the linked student login after saving admission via existing admin endpoint with student_id; endpoint validates against stored contacts, reuses matching linked accounts without password reset, rejects conflicts and rolls back only newly created Auth identity on profile failure. Admission-save and Auth creation are separate stages with explicit partial-success retry UI. Staff saves contacts only. Linked real login contacts cannot silently be edited via admissions. Demo accepts the new RPC and only stores contacts in its tab; no real login/email/SMS is claimed. The production build subsequently passed, including lint/type checks and all route generation.

Read-only live check 15 November: core tables reachable, tests table still PGRST205, external.email=true, external.phone=false. SUPABASE_SERVICE_ROLE_KEY still missing locally. SMTP config cannot be established from the public settings endpoint; real student recovery needs an actual provisioned Auth email plus hosted SMTP/redirect setup. Asked the user to set the service key locally, not paste it. No real reset/OTP messages sent or remote changes applied.

Screenshot layout diagnosis: apps/web/postcss.config.js lacked tailwindcss, so utility directives were not expanded. Restored plugin, set Tailwind content.relative=true, added scoped admission form grid/stacked labels and restarted dev server using workspace-local Node from apps/web. Admission route/CSS 200; generated CSS confirms grid/padding utilities and no remaining @tailwind directive. Account tests now 15, phase3 now 16 reported including new transactional contacts test; student SQL 8 and demo 9 pass, TypeScript passes. Production build verification is recorded separately when complete.

UI runtime repair: user reported broken appearance. Confirmed localhost:3000 HTML was 200 while its CSS and several JS chunks were 404 after production builds overwrote the running dev server's shared `.next` output. Stopped the old dev session, configured `next.config.js` to use `.next-dev` for development and `.next` for production, ignored `.next-dev`, and restarted port 3000. Next automatically added `.next-dev/types` to tsconfig includes. Fresh login HTML and linked CSS/JS assets now return 200. No visual redesign was made for this repair. Check static assets, not just HTML status, when verifying the running UI.

Subsequent account requirement: use ONE identifier input accepting email OR mobile, plus password (no separate tabs). Implemented mandatory email/mobile/name/role in owner account creation (`/api/admin/users`), fixed temporary password `123456`, server-owned `must_change_password` app metadata, forced first-login password update, forgot-password email, PKCE callback and cross-device token-hash recovery endpoint. Added `20261113_05_account_passwords.sql`; no hosted migration was applied. New migration gates current_role/RLS until the Auth password hash changes and requires email on new profiles. Existing accounts are not reset. CLI bootstrap uses mandatory ACADEMY_ACCOUNT_EMAIL and temporary 123456, not ACADEMY_ACCOUNT_PASSWORD. Hosted Auth password policy must allow temporary length 6, and email provider/redirect settings still need setup. User-selected passwords require 8+ characters.

Production build passed with middleware and new routes. `npm run test:accounts` passed 13 checks (API authorization/rollback, identifier validation and actual SQL password gate); existing Phase 3 and student SQL suites passed with all five migrations loaded; demo/console/Phase 2 suites passed. Production HTTP smoke on port 3001: login/password pages 200, invalid callback/confirm redirect to expired-link page, anonymous account creation 401. No real emailed link or authenticated live account creation was exercised. See `LOCAL_BACKEND_SETUP.md` for hosted setup and email template.

The user subsequently requested real database-backed owner forms, readable button colours, and administrator-provisioned phone/password login instead of relying on SMS OTP for now. This supersedes the earlier context-only scope below.

- Real phone/password login now defaults on the login screen, verifies Supabase Auth plus active database profile, and clears demo state. Demo is explicit. Existing demo sessions require sign-out to switch.
- Owner action colours and attendance save feedback/roster/date/reload behavior were improved. See `LOCAL_BACKEND_SETUP.md` for details.
- Started Next development server on port 3000; login HTTP 200 and password field confirmed. Production build passed, including type/lint checks and all routes. Demo (9), console (7), Phase 2 (15) tests passed after changes. No visual browser acceptance was performed.
- Remote Supabase read-only probe succeeded outside the sandbox for core users/students/batches/attendance/fee_dues tables. `public.tests` returned HTTP 404 / PGRST205. The live schema is incomplete; do not claim all migrations were applied.
- Service-role key is absent locally. Supabase CLI, Docker and psql were not found on PATH. No live account/schema writes were made. Requested the user set the key locally and provide desired admin name/mobile; never ask them to paste secrets in chat.
- Added `scripts/check-backend.mjs` and `scripts/create-academy-account.mjs` plus setup instructions. Account script creates Supabase Auth and public profile, attempts auth rollback if profile insert fails, and does not overwrite existing accounts.
- Remaining prerequisite: inspect migration history, apply missing migrations through authorized database access, provision owner, then verify real CRUD and persistence after reload. Public anon-key reachability alone does not test authenticated writes.

## Current task and direction

The user asked to read the previous conversation and understand the local project before starting further development. This pass records context and runs existing checks; it does not implement new application features or change a live database.

Continue the existing project, preserve its UI and working functionality, and complete workflows incrementally. The user's conversational preference is informal Hindi/Hinglish. Do not treat historical assistant claims as evidence that an integration works.

## Requirements and history

The supplied conversation is also preserved in `complete-tuition-project.md` and PDF. It describes a tuition management website and eventual mobile app for owner, staff, teacher, parent and student roles:

- Admissions, guardian/sibling links, student lifecycle, multi-batch enrollment and imports.
- Scheduled attendance, holidays, percentages, offline marking and absence alerts.
- Fee plans, monthly billing, partial payments, immutable payment history, reversals, receipts and reminders.
- Parent and teacher learning portals, resources, notices, tests, marks and reports.
- Role restrictions, cross-family data isolation and auditing.
- Later scope: mobile apps, Hindi localization, homework and AI answer checking/performance insights.

Historical Phase 0 repaired foundation issues. Phase 2 added gateway, notifications, tests, reports, offline queue and notices, but its historical package had no verified production build or live backend integration. Local source now goes beyond that conversation: Phase 3 core workflows, a UI refresh and dedicated learner consoles exist. Phase labels are milestones, not completion guarantees.

## Stack and code map

- npm workspaces: `apps/web` (Next.js 14, React 18, TypeScript, Tailwind), `packages/shared` (types, constants and permissions).
- Supabase Auth/PostgreSQL/RLS; browser and server clients in `apps/web/src/lib/supabase`.
- Razorpay through HTTP APIs, jsPDF/XLSX exports, Recharts, localStorage offline attendance queue.
- `src/lib/auth-context.ts`: real phone OTP, active profile lookup, sign-out and demo client selection.
- `src/lib/demo-auth.ts`, `demo-data.ts`: development-only simulated users/data. Demo phone `123456789`, OTP `1234`; owner, parent and student. This creates no authenticated Supabase session. Demo records persist in browser session storage.
- `src/components/AppShell.tsx`, `Phase2Layout.tsx`, `DashboardParts.tsx`, `app/globals.css`, `app/education.css`: shared UI. Ivory/forest-green/coral theme; BrightPath Academy demo branding.
- `src/components/StudentEditor.tsx`: admission/profile editing.
- `src/components/LearnerPortal.tsx`, `components/console/*`, `lib/learner-console.ts`: owner modules and parent/student console views.
- `lib/payment-checkout.ts`, `lib/phase2/*`: checkout, signatures, exports and offline queue.
- `CONSOLES.md`, `PHASE3_CHANGELOG.md`: later implementation context. Older Phase 0/2 validation documents describe earlier snapshots and have stale verification counts/statuses.

Paths above beginning with `src/` are relative to `apps/web`.

## Implemented source and boundaries

| Area | Current local implementation | Boundary |
| --- | --- | --- |
| Login | Supabase send/verify SMS OTP, active profile checks; separate development demo | Actual OTP delivery and real sessions unverified this pass |
| Owner/staff | Owner overview, management navigation, operational screens | Full role/browser acceptance pending |
| Students | Add/edit profile, guardians, siblings, linked parent accounts, multiple batches, lifecycle/search/export | Import and new login provisioning pending |
| Batches | Create/edit, schedule days, deactivate, detail/enrollment history | Complete scheduling/holiday workflow pending |
| Attendance | Online marking/export and offline queue with sync RPC | Scheduling, roster correctness and real offline acceptance need work |
| Fees | Monthly aggregate generation, partial manual payment, receipt PDF, owner reversal | Fee plan UI, scheduler and gateway refunds pending |
| Gateway | Create order, signature-verified captured webhook, settlement RPC, parent checkout | Credentials, real webhook delivery and end-to-end test pending |
| Tests/reports/notices | Creation/marks, audience notices, financial/attendance/test exports | Browser acceptance and report correctness review pending |
| Notifications | Reminder generation, queue claiming, protected worker, optional delivery adapter | External provider/templates/scheduler unverified; older helper still has provider TODO |
| Materials | Batch-scoped HTTPS resource sharing and viewing | Actual private file upload/storage workflow pending |
| Parent | Child selection, schedule, attendance, results, library, notices, fees and receipts | Real account integration acceptance pending |
| Student | Own learning records and owner-managed account-to-student link | No academy writes or fees; isolated SQL checks pass |
| Teacher | Basic navigation to tests, notices and offline attendance | Dedicated full console incomplete |
| Users | Account directory and owner-managed student profile link | Full account provisioning, roles/status management pending |
| Mobile | Explicit not-implemented root scripts | No mobile workspace |

## Database and important business rules

Apply migrations in this order, on a development database after reviewing target state:

1. `20261031_01_initial_schema.sql`: core tables, actor helpers, RLS, payment/audit safeguards. Contains historical user policies that the third migration removes; do not assess security from an intermediate migration alone.
2. `20261110_02_phase2.sql`: tests/marks, offline idempotency, gateway orders/settlement, notices and notification jobs.
3. `20261111_03_core_workflows.sql`: transactional admission, stale-write/retry protection, monthly dues, manual payments and reversals; removes original permissive user policies.
4. `20261113_04_student_console.sql`: authoritative `users.student_id` linkage and student learning access policies. Editable auth metadata is not the authority for student access.

Important RPCs: `save_student_profile`, `generate_student_due`, `record_manual_payment`, `reverse_manual_payment`, `sync_attendance`, `settle_gateway_payment`, `generate_reminder_notifications`, `claim_notification_jobs`.

Current billing rules: whole INR; one aggregate student due per month; enrolled batch/custom enrollment fees; overlapping enrollment contributes a full month; new dues payable on the 10th with five grace days; retries preserve existing balances. Enrollment removal ends history rows. Manual reversals require owner; original payments remain immutable. Revisit business rules with the user when changing billing behavior.

## Confirmed follow-up findings

From current source inspection (not exhaustive):

- `owner/attendance/page.tsx`: Reset All has an empty handler; roster query does not filter enrollment dates; initial display defaults an unmarked learner to present; date handling uses UTC ISO slicing. Revisit before claiming attendance is complete.
- `owner/tests/page.tsx` also loads batch enrollments without date filtering; verify historical/current roster semantics and state reset when switching tests/batches.
- `owner/reports/page.tsx`: batch strength counts all enrollment rows; fees query only uses first-of-month format despite legacy YYYY-MM support elsewhere; reversal signs need review against signed payment records.
- Private file upload, contact-change approvals, imports, fee-plan management, scheduled billing and full user provisioning remain unfinished.
- A `FeaturePending` component remains in source but no usage was found in the inspected source search; its existence alone does not identify an unfinished route.
- No live Supabase, Razorpay, provider or scheduler changes were made or verified during this context pass.

## Verification performed on 13 November 2026

Dependencies already exist. Node `v24.11.1`, npm `11.6.2` are on PATH; `.runtime` also exists. Git is not on PATH, so no git diff/status was available.

| Command | Result this pass |
| --- | --- |
| `node node_modules/typescript/bin/tsc --noEmit -p apps/web/tsconfig.json` | PASS |
| `node scripts/phase2-test.mjs` | PASS: 15 tests |
| `node scripts/demo-ui-test.mjs` | PASS: 9 tests |
| `node scripts/console-test.mjs` | PASS: 7 tests |
| `node scripts/phase3-test.mjs` | PASS: 14 scenarios plus enclosing test (15 reported) |
| `node scripts/student-console-db-test.mjs` | PASS: 7 scenarios plus enclosing test (8 reported) |
| `node scripts/phase0-smoke.mjs` | FAIL: asserts `apps/web/.env.local` must not exist; this local setup has that file. Stopped at that assertion. Do not delete local configuration to satisfy an archive packaging check. |

Database suites apply all four migrations to isolated PGlite with test Supabase auth roles/functions and substituted UUID extension setup. They test real SQL behavior but do not prove hosted Supabase auth/storage/network behavior or multi-connection concurrency. Demo/console checks include static and simulated checks, not full browser end-to-end coverage.

A production build was not rerun in this pass. Prior changelog records both a successful build at an earlier milestone and a later stalled build after the UI refresh; current build status needs fresh verification. No current running server or visual acceptance is claimed.

## Environment and commands

`apps/web/.env.local` exists and is ignored by `.gitignore`; values were not displayed or audited. Existence does not mean configured services work. `apps/web/.env.example` lists public Supabase URL/anon key, server-only service role, Razorpay keys/webhook secret, cron token and optional notification adapter settings.

- Run locally: `npm run dev:web` (port 3000).
- Build: `npm run build:web`.
- Primary pages: `/`, `/auth/login`, `/dashboard`, `/owner`, `/owner?view=management`, `/parent`, `/student`, `/teacher` and `/owner/{students,batches,attendance,fees,materials,tests,notices,reports,notifications,offline-attendance,payments,users}`.
- APIs: `/api/auth/signin`, `/api/payments/create-order`, `/api/payments/webhook`, `/api/jobs/notifications`.
- Generic `npm test` invokes workspace Jest scripts; verification here used the explicit existing scripts, not a verified generic test command.

## Recommended continuation

First establish current production build and development backend/migration state. Then repair attendance scheduling, enrollment-date handling, date semantics and user-visible save errors with meaningful SQL/workflow checks. Review reports and test roster correctness alongside those fixes. Complete account provisioning and role acceptance before external integrations; then fee-plan scheduling, imports/contact approvals/private uploads, gateway/provider end-to-end tests and finally deployment/mobile/AI scope.

This is a suggested order, not an additional user-approved development request. The current request is understanding and preserving context before further development.


## Attendance and class library update — 15 November 2026

Live batch attendance and the owner-only class learning library are implemented and deployed to Supabase. See [ATTENDANCE_LIBRARY.md](./ATTENDANCE_LIBRARY.md) for schema, permissions, storage paths, UI routes, limitations and live acceptance evidence. Migration 20261115_08 adds library_folders/library_files, the private learning-library bucket policies, transactional batch attendance marking and Realtime publication entries. Only owners publish PDF/Word files or HTTPS links; students read resources for their own class. Earlier descriptions of teacher resource publishing are superseded by this requirement.


## Library UX, notifications and academy branding — 15 November 2026

The final academy name is Amita’s Classes; the original logo is served from /images/academy-logo.png. A balanced muted red/blue theme and branded loading screen replace the earlier green theme and obsolete dashboard fallback. The library now has an explicit chapter sidebar, selected-folder heading, contextual upload forms, owner-only delete and class-scoped persistent Realtime activity (migration 20261115_09_library_activity.sql). All workspace roles have right-side action toasts and a notification bell. See ATTENDANCE_LIBRARY.md for behavior, security and verification details.


## Owner Question Paper Studio and branded PDF reader — 15 November 2026

A real Supabase-backed owner-only Question Bank/Paper Builder is available at /owner/question-papers. One uploader accepts TXT, XLSX, CSV, DOCX and text PDF. Class and subject dropdowns are derived from active batches. Owners preview/confirm imports, search/filter questions, create named sections, drag/reorder questions between sections, assign marks, and save/reopen branded A4 examination PDFs. Answers stay private in the question bank. Migration 20261115_10_question_papers.sql is applied; original import files are private Storage objects in question-bank. The shared PDF viewer now uses locally served PDF.js with actual canvas rendering, academy-branded loading, paging/zoom, errors and retry instead of an iframe. See QUESTION_PAPER_STUDIO.md for formats, limits, permissions, deployment and tests.

Question paper refinements: named sections support desktop/touch pointer dragging, question search and batch-derived class/subject dropdowns. Generated PDFs print the actual title beneath the academy name, numbered instructions and a separator before questions. Batches now show labelled View details, Edit batch and Activate/Deactivate buttons with matching icons; the existing status-change behavior is preserved.


## Teacher/parent roles, account editing and mobile display — 15 November 2026

Teacher and parent permissions are implemented with live Supabase RLS. Normalized subjects, batch_subjects and teacher_batch_subjects supplement the existing batch subject arrays. Owner teacher creation now assigns class/batch/subjects; the account directory supports editing name/email/mobile/status, and role tools manage teaching scopes and parent-child links. Teachers can use only permitted subject banks/papers, target assignments to selected enrolled students, and review/grade submissions. Parent assignment progress is read-only and child-scoped. Mobile fields/displays show ten digits without +91 while backend normalization preserves login compatibility. Migrations 11–14 are applied. TEACHER_PARENT_ROLES.md contains the current implementation and supersedes earlier descriptions of the teacher portal as a placeholder or assignments/papers as exclusively owner-managed.


## Batch library, digital checking and final submissions — 15 November 2026

See [DIGITAL_CHECKING.md](./DIGITAL_CHECKING.md) for the current implementation and limitations. Migrations 15–21 supersede older class-library selection, owner-only question-bank imports and replaceable answer submissions. Library uploads use batches; assigned teachers can import banks. Assignments have Publish/Review tabs. Assignments and tests support scanned PDF/DOCX checking with ticks, crosses, marks, pen, comments and private drafts; published checked PDFs and synchronized scores are visible to the student and linked parents. DOCX checking converts readable text, preserving the downloadable original rather than reproducing Word layout/images. Student uploads require confirmation and are final: APIs plus database triggers prevent replacement even before checking. Student subjects come from enrolled batches, pending tests show Awaiting result, and published test results refresh live. Recipient-scoped batch notifications persist across logins in Supabase, with unread badge, login toast, tab links and stored read state.
