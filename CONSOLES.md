# Owner, parent, and student consoles

## Preview

The local development server runs at http://localhost:3000. Sign out to switch roles. Demo phone: `123456789`; OTP: `1234`.

- Owner: `/owner` for the academy overview; `/owner?view=management` for all management tools. The overview includes current-month collection, unpaid invoice follow-ups, recent payments, attendance, classes, students, and notices.
- Parent: `/parent` for a family overview. Select a linked child, then use the tabs for schedule, attendance, results, library, announcements, or fees. Fee details and receipts stay inside the parent console.
- Student: `/student` with schedule, attendance, results, library, and announcements. Student accounts cannot manage academy data or view fees.
- Owner library: `/owner/materials`. Owners and assigned teachers can share an HTTPS resource link with a batch; staff have the read access defined by the existing database policies.
- Student account links: `/owner/users`. An owner selects a learning profile for an existing student login and saves the link.

## Modules

`components/console` contains the shared navigation, class schedule, attendance/results records, resource and announcement panels, family fee view, owner management modules, resource form, and learner data hook. `lib/learner-console.ts` holds data types and display/filter logic. `lib/payment-checkout.ts` loads checkout only when a parent starts a payment. Responsive styling is in `app/education.css`.

## Live backend setup

Apply `supabase/migrations/20261113_04_student_console.sql` after the existing three migrations before using the new account-link screen or real student logins. This migration was verified in an isolated local PostgreSQL-compatible database; it has not been applied to a connected Supabase project.

The migration adds an owner-managed `users.student_id` relationship and read-only policies for the student's own learning records. The client reads this relationship instead of trusting editable user metadata. Existing student accounts must be linked in People & permissions by an owner. No metadata values are automatically trusted or migrated.

Real online checkout uses the existing Razorpay order endpoint and verified webhook; it requires the existing payment credentials and webhook configuration. Demo checkout is disabled, while sample invoice and receipt viewing remains available. No real payment was attempted during verification.

## Verification

- `npm run test:console`: role navigation, notice audiences, attendance calculations, safe resource URLs, read-only resource opening, demo fees, and owner management rendering.
- `npm run test:demo`: role demos, linked data, admissions, resource sharing, student account links, payments, and reversals.
- `npm run test:student-console`: actual SQL migration tests for owner links, student record isolation, denied writes, parent access, ended enrolments, and inactive logins.
- `npm run test:phase3`: existing admission, fee, payment, and parent role workflows with the new migration loaded.
- TypeScript: `node node_modules/typescript/bin/tsc --noEmit -p apps/web/tsconfig.json`.

This machine also has a workspace-local runtime at `.runtime/node.exe` if Node is not on PATH. Prefix the script paths above with that executable to run checks directly.

All main console routes were checked for HTTP 200 responses and successful compilation. Browser visual verification could not be completed because the browser connector was unavailable and native Chrome launch timed out.
