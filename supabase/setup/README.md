# Complete database repair

Assignments are a separate additive module: after the six core migrations below, run `scripts/apply-assignment-schema.mjs` to apply `20261115_07_assignments.sql` and configure its private Storage bucket. It is already applied on the current connected project. See `ASSIGNMENTS.md`. The base repair SQL below remains scoped to its original20 tables; do not assume it creates the new assignment bucket.

`complete-database-setup.sql` is generated from all six source migrations by:

```powershell
.\.runtime\node.exe scripts/database-upgrade.mjs
```

This is for this application's database owner. It creates missing schema, replaces the access-policy layer on the 20 application tables, reinstalls the application triggers/functions, adds missing student contacts/account linkage, and makes the named payment foreign keys restrictive. It does not delete application rows, Auth identities or reset passwords. One transaction and before/after row-count checks prevent committing a partial repair or unexpected row removal. Incompatible legacy data/columns will cause failure, requiring review rather than deletion.

The isolated PGlite check `scripts/database-upgrade-test.mjs` verifies initial installation, repeat installation with stored users/student records, removal of an unsafe legacy read policy, first-password policies and payment FK protections. This is not proof that an unseen hosted schema has no additional compatibility issues.

## Apply through the connected project

Set **one** of these locally in `apps/web/.env.local` (never share values in chat):

- `SUPABASE_ACCESS_TOKEN`: Supabase account personal/fine-grained token with permission to query the target project's database. This supports SQL application and later inspection of hosted Auth settings.
- `SUPABASE_DB_URL`: the PostgreSQL connection URI from the project's Connect dialog, with database password. The Node `pg` driver must be installed for this route. Use the correct direct/session-pooler hostname and TLS settings supplied for the project. Do not reuse the anon or service-role key as the database password.

The `pg` development dependency is now installed. URI connections verify both certificate and hostname using `.runtime/supabase-ca.crt` by default, or `SUPABASE_DB_CA_PATH` if supplied. Obtain Supabase's public CA through its database SSL settings; the certificate was fetched from the Supabase certificate download host for the recorded setup. TLS validation is not disabled. See [SSL enforcement/CA configuration](https://supabase.com/docs/guides/platform/ssl-enforcement).

Then run:

```powershell
.\.runtime\node.exe scripts/apply-database-setup.mjs --apply
.\.runtime\node.exe scripts/check-server-access.mjs
```

The runner first exports catalog details and application records into ignored `.runtime/database-backups`, without printing records/credentials. Auth password hashes and tokens are not backed up by this script. Protect the local backup as private student information. It then applies the complete SQL transaction. The runner does not automatically change hosted Auth provider settings, send messages, or create real accounts.

Alternatively, the generated SQL can be reviewed/run in the Supabase SQL Editor as the database owner after taking the appropriate backup. This bypasses the local runner's catalog/data export, so take your own backup first. Avoid running individual initial migrations repeatedly against an existing partial database.

This repair does not invent or overwrite Supabase CLI migration-history entries. If later adopting CLI `db push`, reconcile the deployed repair with migration history before pushing the six original files again.

## What database setup does not configure

**Current clarification:** Phone Auth is intentionally unused. `/api/auth/password` matches mobile to `public.users.email` and verifies through Email Auth; live mobile/password login now passes with Phone Auth disabled. Owner bootstrap is complete using the user's configured identity. Recovery codes/reset links are email-only. `supabase/templates/recovery.html` is ready for the hosted Reset Password template. No actual email delivery was tested. Older phone-provider/zero-owner observations below describe the preceding diagnostic, not the final application behavior.

- Hosted Phone Auth is currently observed disabled; enable it for phone/password authentication. Actual SMS OTP also needs an SMS provider.
- Email recovery requires a real Auth identity containing the student email, correct Site URL/recovery redirects, and suitable email delivery/SMTP settings.
- An owner login needs a genuine Auth identity and active `public.users` owner profile. Do not promote an arbitrary existing account or replace its password without checking its intended identity.
- Razorpay and notification credentials/webhook/scheduler acceptance are separate from creating tables.

References: [Supabase SQL Management API](https://supabase.com/docs/reference/api/v1-run-a-query), [SMTP delivery](https://supabase.com/docs/guides/auth/auth-smtp).

## Verified live result — 15 November 2026

The upgrade was applied to the connected project over verified PostgreSQL TLS. A legacy `notices.class` column required a data-preserving rename to `class_id`; the first failed transaction rolled back before a corrected retry succeeded. Application-record/catalog backups are under ignored `.runtime/database-backups`. The admin API and contact/login-link/assessment table probes now return HTTP 200.

`scripts/live-database-test.mjs` passed real email/password login, initial-password data restriction, actual password-change flag clearing, admission/contact retry, due generation, partial collection/reversal and application endpoint creation/linking of a student. The student signed in and read only its own profile. Financial/admission business checks were rolled back; temporary Auth/profile/student test records were removed afterward.

Actual phone/password login returned `phone_provider_disabled`. Permanent active owner count after cleanup was zero. Finish hosted Phone Auth enablement and bootstrap the intended owner before regular use. No live email/SMS delivery test was performed. The local dev server must have outbound Supabase access; when started in the network-restricted sandbox it rejected the live API session, and restarting outside that sandbox resolved the request (HTTP 201).
