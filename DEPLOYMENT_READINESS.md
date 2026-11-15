# Deployment review — 15 November 2026

Public deployment is blocked pending dependency security remediation.

Production build completed successfully (exit 0), including lint/type checks and all 39 generated pages. Webpack reported cache snapshot warnings; these did not fail the build.

Production dependency audit returned 7 findings: 2 critical and 5 high. Affected packages: Next.js (critical), jsPDF (critical), DOMPurify, jsPDF AutoTable, PostCSS, XLSX and Zod. Raw local audit: `.runtime/deploy-audit.json`. XLSX has no automatic npm audit fix. Several suggested fixes are major upgrades and require compatibility work; do not apply `npm audit fix --force` blindly.

The regression run passed 90 checks with one obsolete account-creation test failing on a missing mock import. That test was updated to reflect scoped teacher creation; its full file then passed all 15 checks, including 7 provisioning subchecks. The other test files were unchanged. This does not replace a fresh deployed-browser acceptance check.

Before deployment:

1. Upgrade/replace affected dependencies, validate imported XLSX/PDF/DOCX processing and rerun audit, production build and relevant regressions.
2. Set hosting root to `apps/web` with workspace dependency installation from the repository. Use supported Node 22, the committed lockfile and optional dependencies. Build with `npm run build`; serve with `npm run start` for a Node host.
3. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and server-only `SUPABASE_SERVICE_ROLE_KEY` in hosting. Public variables must exist at build time. Do not upload `.env.local`, database URLs or owner bootstrap credentials to client code or the repository. Database administration credentials are not required for normal app runtime.
4. Configure Supabase Site URL and allowed recovery callback URLs for the final HTTPS domain. Verify recovery email/OTP delivery and password reset on that domain. Never leave localhost as the production recovery destination.
5. Existing configured Supabase migrations through 22 are applied. For a different project, apply the complete schema/migrations and private storage policies; do not assume changing the URL creates tables or buckets.
6. Confirm host request-body, execution-time and response limits support the portal's 10 MB uploads and document conversions. API routes receive multipart uploads before writing Storage. If the host rejects these sizes, use a compatible Node host or implement an authorized direct-upload flow before release.
7. Configure Razorpay keys/webhook only if online payments are enabled. Configure cron and notification adapter only if external reminders are enabled. These services were not exercised during this review.
8. Run deployed smoke checks for owner/teacher/student/parent login, first password change, admission, private resources, attendance, assignment/test upload confirmation, checked PDFs, results, inbox and pace poll deadlines/privacy. Verify cross-account denials too.

Live user passwords were not reset during this deployment review. No production release was performed.
