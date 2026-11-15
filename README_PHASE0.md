# TuitionApp: Phase 0 setup

The repaired source is a Next.js 14 + Supabase project, with the original UI retained where feasible.

## Requirements

- Node.js 20+ and npm 10+
- A Supabase project, with phone authentication enabled and a configured SMS provider
- A fresh development database (or a carefully planned additive migration for a previously deployed DB)

## Install and test

```bash
npm install
node scripts/phase0-smoke.mjs
npm run build:web
npm run dev:web
```

The `npm install` step requires working access to the package registry. A clean build is **not confirmed** in the supplied environment because packages were not installed.

## Configure environment

Copy `apps/web/.env.example` to `apps/web/.env.local` and enter your Supabase URL and **public publishable/anon** key. Do not put service-role keys in `NEXT_PUBLIC_` variables. Keep `.env.local` untracked.

## Schema and first owner

1. On a **fresh development project**, apply `supabase/migrations/20261031_01_initial_schema.sql` via Supabase CLI or the SQL editor. The initial migration is edited for Phase 0, so existing deployments need a separately reviewed additive migration.
2. Create your first authorized user through Supabase Auth's admin interface; note the resulting `auth.users.id` and the associated phone in **E.164** format (for example, `+91...`).
3. Using a **privileged** SQL editor session (not the client anon key), provision the user profile. Replace the example values; never put real credentials into source control:

```sql
INSERT INTO public.users (id, name, phone, role, status)
VALUES ('REPLACE_WITH_AUTH_USER_UUID', 'Tuition Owner', '+91REPLACE_WITH_NUMBER', 'owner', 'active');
```

4. Create additional staff/teacher/parent Auth users and profiles through a *server-side administrative process*. Never allow the public browser or OTP endpoint to assign a role.
5. Verify that a parent can access only their own linked students (`parents.user_id` -> `student_parent.student_id`) and that teachers only access assigned batches. Repeat RLS checks with forged record IDs.
6. Make the `tuition-materials` bucket **private** in Supabase dashboard. The included `supabase/storage/config.json` is source configuration; it is **not** proof that your deployed bucket is private. Implement signed-URL access and object policies before storing private materials.

## Operational safeguards

- Never use the hard-coded demo code: it has been removed.
- OTP sending uses Supabase provider-side safeguards; configure SMS limits, test abuse protection and monitor costs before production.
- RLS protects data at the database; hidden client buttons are *not* security boundaries.
- Database payments cannot be updated or deleted after insertion; correct them via documented reversal workflows once payment accounting is implemented.
- Apply migrations to a staging database and back up production before any deployment.
- Ensure current `.env.local` secrets from the original ZIP are audited/rotated if any privileged key was exposed.

See `PHASE0_CHANGELOG.md` for exact changes and unverified work.
