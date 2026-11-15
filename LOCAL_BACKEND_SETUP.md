# Real academy login and database setup

## Owner password from environment (latest)

The owner's provisioning password is now required from server-only `ACADEMY_ACCOUNT_PASSWORD` (minimum 6 characters, matching current hosted Auth minimum). No hardcoded owner-password fallback. `create-academy-account.mjs` uses it for owner creation; other user provisioning retains the requested temporary123456 policy. Login always verifies Supabase Auth, never directly compares an env secret or grants owner access from an env match.

The current configured contacts had no profile and zero active owners were found, so the owner was created from the supplied env name/email/mobile/password. First-login password change remains required. Use `node scripts/sync-owner-password.mjs` only when intentionally syncing a later env password to an existing matching active owner; it verifies the identity, leaves already-matching credentials untouched, and does not reset other roles/accounts. Editing env alone does not silently overwrite the user's Auth password on every login. After first-login change, Supabase's updated password is authoritative until an explicit sync.

## OTP-only recovery update (latest)

The user reported actual recovery email delivery, but only a link. The hosted template is separate from the local file. Updated `supabase/templates/recovery.html` to contain only `{{ .Token }}` and instructions (no link), and removed email-redirect options/link wording from the forgot screen. Flow: registered email → email recovery code → verified session → new password. Opening the app's password page after submitting the code is normal navigation, not an emailed localhost redirect.

To activate the new mail body, paste that HTML into hosted Supabase Authentication → Emails/Templates → Reset Password and save. Alternatively, set SUPABASE_ACCESS_TOKEN locally and run `node scripts/configure-recovery-email.mjs --apply`. The script backs up/updates only recovery subject/body and verifies the result, without changing SMTP, providers or Site URL. Existing emails do not change; request a fresh code after saving. Actual SMTP delivery is reported by the user; this update is not a new delivery test.

Localhost is the correct application address during local development; a deployed app needs its actual public Site URL. No deployment domain was supplied, so none was invented or configured. OTP-only recovery does not require clicking any emailed URL.

## Real-only operation (latest)

Demo login/data switching is removed. All application reads/writes use the actual Supabase client and require a real authorized session. On reload the app retires the old mock identity and sends unauthenticated protected pages to real login. Sign in with the owner email/mobile configured locally, using the current password (initially 123456, forced change on first login). No demo role selector or sample login remains.

Old tab-stored records are preserved for recovery but are not automatically imported into the real database. The Deepak admission shown in the user's demo screenshot remains browser-only unless explicitly saved through a real authenticated admission. Do not delete the session-storage data or silently upload the entire sample academy to Supabase.

`npm run test:live-only` verifies the retirement and real-client selection. The old `test:demo` command aliases that regression now; the historical sample-data script is no longer the current runtime acceptance suite.

## Current authentication rule and completed owner bootstrap

The user clarified: **do not use Phone Auth or SMS**. A mobile number is only an academy profile identifier. `/api/auth/password` resolves that number to the same profile's registered email on the server, verifies the password through Supabase Email Auth, checks the matching identity/active profile and sets session cookies. Email uses that same endpoint directly. Phone Auth can remain disabled. New provisioned Auth identities contain email only; mobile is stored in `public.users` and student contact records.

The permanent owner was created from locally configured ACADEMY_ACCOUNT_NAME/EMAIL/PHONE. A ten-digit Indian bootstrap mobile is normalized to +91 automatically. The configured owner's email and mobile logins were verified and both require first-login password change from `123456`. The user's actual password was not changed by tests.

SMS send/verify calls were removed from the real auth hook. Demo codes remain browser-only. `/api/auth/signin` now verifies **email recovery OTPs** (`type: recovery`) only and rejects old phone/SMS input. Normal login remains password-based; this recovery code is not an additional mandatory OTP on every password login and is not MFA.

Forgot password requests a recovery email. The user may use its reset link or enter its email recovery code if the template includes one. To include both, paste `supabase/templates/recovery.html` into hosted Supabase **Authentication → Emails/Templates → Reset Password**. Configure Site URL to the app origin and permit `/auth/callback`; token-hash recovery links use `/auth/confirm`. If ordinary student recipients cannot receive mail, configure hosted SMTP and inspect Auth/provider logs. Local `.env.local` service/DB credentials do not configure those hosted email settings.

Live checks passed the new endpoint for both email/mobile with cookies, plus a real email recovery code generated through Admin API and consumed by `/api/auth/signin`. This test sent no email and did not change the real owner's password. **Inbox delivery and deploying the hosted email template remain unverified** because no Management API token/email provider configuration was supplied. Do not claim emails were delivered.

## Live database setup completed — 15 November 2026

This section supersedes older missing-key/migration observations below. The user supplied the server key and PostgreSQL connection string. Installed `pg`, configured certificate/hostname-verified TLS with Supabase's CA, backed up catalog/application records in ignored `.runtime/database-backups`, and applied the full six-migration repair. A legacy `notices.class` column was renamed to `class_id`, preserving its values. All contact/link/test-table probes now return 200.

Live acceptance passed: email/password login, temporary-password RLS restriction, Auth password-hash trigger clearing the flag, admission contacts/retry, monthly dues, partial payment, owner reversal, real app API creation/linkage of a student, student login and own-profile isolation. Temporary accounts/records were cleaned; financial/admission scenario writes were rolled back. The Next dev server was restarted with outbound network access after a sandboxed server produced a false 401 when it could not reach Supabase.

Remaining: **zero permanent owner accounts**; supply ACADEMY_ACCOUNT_NAME/EMAIL/PHONE locally for bootstrap. Real phone/password sign-in returned **phone_provider_disabled**; enable the hosted Phone provider (or supply Management API token locally for configuration). Actual email recovery/SMS delivery remains unverified and needs hosted provider/redirect configuration plus an intended recipient. PostgreSQL access does not itself update the hosted Auth provider configuration.

## Student admission and delivery update — 15 November 2026

- Admission now requires the student's own email/mobile, separately from guardian contacts. The sixth migration, `20261115_06_student_contacts.sql`, adds `students.email`, `students.phone` and `save_student_admission`. Apply it after the previous five migrations. It saves contacts with the admission transaction and prevents silently changing contacts away from a linked login.
- Real owners can create/link the student login directly after saving admission. It uses the student's saved name/email/mobile, default password `123456` and existing first-password-change rule. The account is immediately linked through `users.student_id`. Matching account retries do not reset passwords; conflicting/inactive accounts are not overwritten. Guardian information does not create a student login.
- Admission and Supabase Auth provisioning are two stages. If provisioning fails, the admission remains saved, the error explicitly states the login was not created, and the form offers retry/finish. Staff can save contacts but only the owner can provision logins.
- Demo saves contacts in browser session storage only. It never sends reset emails or SMS and does not create a real Auth identity. Demo login code `1234` is simulated.
- Live read-only check on 15 November: core tables reachable, `tests` still missing (PGRST205), Email Auth enabled, **Phone Auth disabled**, service-role key missing locally. Email provider enablement does not prove SMTP delivery. No real reset email/SMS was sent during these checks.
- Enable Phone Auth in the hosted Supabase Authentication provider settings to support phone/password login and any later SMS flow. Phone/password itself does not require sending an SMS when the administrator has provisioned the confirmed phone identity. Real SMS OTP requires a configured Supabase-supported SMS provider. Setting unrelated application SMS variables does not configure hosted Supabase Auth.
- Configure custom SMTP under Supabase Auth email settings for sending recovery messages to ordinary student addresses. The built-in email service is limited to project organization/team addresses. Check Auth logs and provider logs for delivery failures; check spam folders too. Reference: [SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [phone authentication](https://supabase.com/docs/guides/auth/phone-login).
- For localhost set the hosted Site URL to `http://localhost:3000` and permit `http://localhost:3000/auth/callback`. Keep the recovery token template below if cross-device reset is needed. Ensure the student email exists on its real Auth identity, not just in a demo/guardian/admission record.
- Tailwind's missing PostCSS plugin was restored, and content paths now resolve relative to its config. Admission labels use a responsive grid with stacked fields. Dev server was restarted; compiled CSS contains grid and padding utilities.

Local verification: TypeScript, demo, account provisioning/link tests and admission/student SQL checks pass. Hosted migrations/provisioning, actual email/SMS delivery and visual browser acceptance remain unverified.

The normal login has one **Email or mobile number** field and one password field using Supabase Auth. There are no separate email/phone tabs. Ten-digit Indian mobile numbers are normalized to +91. The role comes from the active `public.users` profile. Demo is a separate development-only option; sign out of an existing demo session to use real login.

## Observed backend state (13 November 2026)

Read-only checks of the configured remote Supabase found users, students, batches, attendance and fee_dues reachable. The tests table returned PGRST205 / HTTP 404. This indicates incomplete schema availability; migrations and RPCs require review before claiming the owner workflows are live. Anonymous checks cannot verify authenticated writes or RLS correctness.

There is no service-role key configured locally, and no Supabase CLI, Docker or psql was found on PATH. No remote schema changes or accounts were created.

## Complete backend setup

1. Review the target database migration history in Supabase. Back up existing data and determine which migrations have run. Do not blindly rerun the initial schema: it contains policy creation statements and is not an idempotent upgrade script.
2. Apply the missing migrations in order: initial schema, Phase 2, core workflows, student console, then `20261113_05_account_passwords.sql`. All five are required. The latest migration installs a password-hash-change trigger on `auth.users`, a server-owned first-login gate and mandatory email checks for new profiles. It must be applied with a database role permitted to create that trigger (Supabase SQL Editor/postgres). Existing null emails remain unchanged; new profiles require email.
3. Add `SUPABASE_SERVICE_ROLE_KEY` locally in `apps/web/.env.local` (server only, never NEXT_PUBLIC). Do not send it in chat.
4. Add `ACADEMY_ACCOUNT_PHONE` (+country code), `ACADEMY_ACCOUNT_EMAIL`, `ACADEMY_ACCOUNT_NAME` and `ACADEMY_ACCOUNT_ROLE=owner` locally in that same file. Run `node scripts/create-academy-account.mjs` to bootstrap the first owner. The temporary password is `123456`, and the first-login change flag is server-owned. It does not overwrite existing accounts. Thereafter owners use **People & permissions → Create academy account** with mandatory name, email, mobile and role. Creation requires the server service-role key; demo creation is disabled.
5. Sign in with email or phone and `123456`. Set a new password (at least 8 characters), then create a batch and admission, reload the app and verify the records in Supabase. Test all roles, first-login restrictions and forgot-password delivery on a development project. Local SQL tests do not replace hosted Auth and email acceptance tests.

## Supabase Auth settings for this requested flow

- Enable Email and Phone password sign-in. Set the hosted project's minimum password length to **6** to allow the requested temporary `123456`; local configuration was adjusted to 6 as well. A hosted password policy that rejects this password must be adjusted or creation will return a visible error. The app requires 8+ characters when users choose their own password.
- Configure Site URL (localhost during development, your HTTPS origin in production) and allow `/auth/callback` as a redirect URL. Forgot password uses `resetPasswordForEmail`, then PKCE code exchange at `/auth/callback`, followed by `/auth/update-password`.
- For reset links that also work when opened on a different device/browser, use this Supabase **Reset Password** email-template link: `<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">Reset password</a>`. `/auth/confirm` only accepts recovery tokens and always redirects to the fixed password page.
- Configure email delivery/SMTP in the hosted project; actual delivery has not been tested here. Invalid/expired links show a recovery message. Reset request success text does not disclose whether the email exists.
- Admin-created email/phone identities are confirmed as administrator-provided contact details; the create form does not send a welcome email. Share the temporary credentials with the intended user. Email reset is sent only when requested.
- Mandatory first-login restrictions apply to newly provisioned accounts. Existing accounts are not silently reset to `123456`.
- First-login account restrictions are enforced by middleware and database policies. The flag clears only after the Auth password hash changes, not from client-editable user metadata. Password recovery uses the signed-in user's `updateUser`, never an arbitrary user ID or public service-role endpoint.

Reference: [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords).

`node scripts/check-backend.mjs` checks table reachability without logging keys or records. It does not apply migrations.

## Changes in this iteration

- Real phone/password login is the default; sample demo is explicit and labelled.
- Real login requires an active database profile and clears the previous demo session after success.
- Demo client selection initializes from the actual demo session, avoiding an initial real query before switching to demo.
- Explicit green backgrounds/white labels for primary owner actions and readable secondary/disabled/focus states.
- Attendance errors and save feedback are visible; unmarked records no longer display Present; enrollment dates filter the roster; dates use Asia/Kolkata; the previously empty Reset All action now reloads saved marks.

Live write verification and visual browser verification remain pending. The app was started and the login returned HTTP 200 with the password field present.


## Attendance and class library update — 15 November 2026

Live batch attendance and the owner-only class learning library are implemented and deployed to Supabase. See [ATTENDANCE_LIBRARY.md](./ATTENDANCE_LIBRARY.md) for schema, permissions, storage paths, UI routes, limitations and live acceptance evidence. Migration 20261115_08 adds library_folders/library_files, the private learning-library bucket policies, transactional batch attendance marking and Realtime publication entries. Only owners publish PDF/Word files or HTTPS links; students read resources for their own class. Earlier descriptions of teacher resource publishing are superseded by this requirement.


## Owner Question Paper Studio and branded PDF reader — 15 November 2026

A real Supabase-backed owner-only Question Bank/Paper Builder is available at /owner/question-papers. One uploader accepts TXT, XLSX, CSV, DOCX and text PDF. Class and subject dropdowns are derived from active batches. Owners preview/confirm imports, search/filter questions, create named sections, drag/reorder questions between sections, assign marks, and save/reopen branded A4 examination PDFs. Answers stay private in the question bank. Migration 20261115_10_question_papers.sql is applied; original import files are private Storage objects in question-bank. The shared PDF viewer now uses locally served PDF.js with actual canvas rendering, academy-branded loading, paging/zoom, errors and retry instead of an iframe. See QUESTION_PAPER_STUDIO.md for formats, limits, permissions, deployment and tests.


## Teacher/parent roles, account editing and mobile display — 15 November 2026

Teacher and parent permissions are implemented with live Supabase RLS. Normalized subjects, batch_subjects and teacher_batch_subjects supplement the existing batch subject arrays. Owner teacher creation now assigns class/batch/subjects; the account directory supports editing name/email/mobile/status, and role tools manage teaching scopes and parent-child links. Teachers can use only permitted subject banks/papers, target assignments to selected enrolled students, and review/grade submissions. Parent assignment progress is read-only and child-scoped. Mobile fields/displays show ten digits without +91 while backend normalization preserves login compatibility. Migrations 11–14 are applied. TEACHER_PARENT_ROLES.md contains the current implementation and supersedes earlier descriptions of the teacher portal as a placeholder or assignments/papers as exclusively owner-managed.


## Batch library, digital checking and final submissions — 15 November 2026

See [DIGITAL_CHECKING.md](./DIGITAL_CHECKING.md) for the current implementation and limitations. Migrations 15–21 supersede older class-library selection, owner-only question-bank imports and replaceable answer submissions. Library uploads use batches; assigned teachers can import banks. Assignments have Publish/Review tabs. Assignments and tests support scanned PDF/DOCX checking with ticks, crosses, marks, pen, comments and private drafts; published checked PDFs and synchronized scores are visible to the student and linked parents. DOCX checking converts readable text, preserving the downloadable original rather than reproducing Word layout/images. Student uploads require confirmation and are final: APIs plus database triggers prevent replacement even before checking. Student subjects come from enrolled batches, pending tests show Awaiting result, and published test results refresh live. Recipient-scoped batch notifications persist across logins in Supabase, with unread badge, login toast, tab links and stored read state.
