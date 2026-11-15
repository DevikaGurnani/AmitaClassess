# Phase 3 core workflows

11 November 2026

## Scope

This first Phase 3 milestone completes admissions, guardian links, enrollment,
batch details, and manual fee collection in the existing web application.

## Changes

- Added admission and editable student profile forms with required birth and
  admission dates, status, school, board, address, and guardian details.
- Added existing-guardian selection for siblings and optional links to existing
  active parent login accounts. Parent account provisioning remains pending.
- Added multiple-batch selection and batch enrollment history pages.
- Added transactional student saves with retry protection, stale-edit detection,
  and audit records. Removing a batch ends its enrollment row.
- Corrected student batch filtering, batch labels and exports, and the action to
  mark a student as left. Added admission and batch creation buttons.
- Connected batch deactivation and scheduled-day selection.
- Replaced fee generation with an idempotent RPC that retains existing amounts
  and paid balances, including dues stored under legacy YYYY-MM month values.
- Added fee details, partial manual payments, PDF receipts, and owner-authorized
  reversals. Payment retries use stable IDs and due locks.
- Removed four original permissive user policies. Actor-based policies now govern
  user access after the Phase 3 migration is applied.
- Added an isolated PostgreSQL regression suite using the PGlite development
  dependency. Run `npm run test:phase3`.

## Database setup

Apply `supabase/migrations/20261111_03_core_workflows.sql` after the existing
Phase 0 and Phase 2 migrations in your development Supabase project.

The application calls the new database functions for student saves, monthly dues,
manual payments, and reversals. These workflows require an authenticated owner or
staff account. Reversals require the owner role. The temporary browser demo login
opens the interface and supplies no authenticated Supabase session.

## Billing rules used for this milestone

- Amounts use whole INR.
- A student has one aggregate due per month.
- Monthly totals use active enrolled batch fees, including custom enrollment fees.
- Enrollment overlapping the billing month contributes a full monthly fee.
- New dues are payable on the 10th with five grace days.
- Reopening generation returns the stored due with its existing balance.
- Owners can reverse manual payments. Gateway refund integration remains pending.

## Validation boundaries

- `npm run build:web` passed, including lint/type checks and route generation.
- `node scripts/phase2-test.mjs` passed all 15 existing checks.
- `npm run test:phase3` passed 14 database scenarios plus the enclosing suite.
- The development server is running on port 3000. Admission and fee-details
  routes returned HTTP 200 after clearing a stale generated Next.js cache.

The regression harness runs all three migrations against an isolated PostgreSQL
engine. It supplies test equivalents for Supabase auth roles, `auth.uid()`, and
UUID generation. Tests cover rollback, siblings, enrollment, stale writes, billing
retries, payment retries, overpayment, reversals, immutability, and parent isolation.

Live Supabase migration execution, browser form acceptance, OTP delivery, gateway
payments, notification delivery, and concurrent multi-connection testing remain
pending. PGlite uses a single database connection.

## Remaining Phase 3 work

CSV/Excel admission imports, custom fee-plan management and scheduled billing,
material uploads, user provisioning and role management, contact approvals,
attendance scheduling and holiday workflows, and complete portal acceptance tests.

## UI and demo refresh

The interface now uses ivory, forest-green, and coral, with a shared sidebar,
illustrated login, owner metrics and charts, and parent/student learning dashboards.
BrightPath Academy is the demo institute. Choose Owner, Parent, or Student on login.
Each role uses phone 123456789 and OTP 1234. Demo records persist in browser session
storage. Six students, three batches, attendance, assessments, resources, and receipts
are included. Run npm run test:demo for the six demo regression checks.

Generated artwork uses the built-in image-generation tool. The saved asset is
apps/web/public/images/learning-still-life.png. The final prompt described a premium
tactile 3D still life of cream notebook, forest-green and sage books, orange pencil,
terracotta arch, floating orange sphere, pale mint background, matte paper and clay
textures, soft studio shadows, and negative space on the left, with no text or logos.

TypeScript and the six demo tests passed. The existing 15 Phase 2 tests passed.
The production build stalled during compilation and was stopped. Visual desktop and
browser review could not complete because the automation runtimes timed out.
