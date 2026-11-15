# Assignments: owner and student workflows

Implemented and applied to the connected Supabase project on 15 November 2026.

## Open the module

- Owner: `/owner/assignments`, also linked from sidebar and Management tools.
- Student: `/student?view=assignments`, also linked from student navigation/tabs.
- Parent, staff and teacher accounts are outside this module's current scope.

Owner publishes a title, active batch, question text and/or question document, future deadline and maximum marks. Students currently enrolled in that batch see the assignment, deadline (displayed in IST), questions and submission state. Deadlines are entered in the browser's local time and stored as UTC timestamps.

Students upload PDF/Word work. An ungraded submission may be replaced before the deadline. Deadline enforcement runs again in PostgreSQL at submission time, not only in the UI. After grading, replacement is rejected. Previously submitted personal work remains readable when enrollment ends, but new uploads require current enrollment.

Owner opens received documents inside the assignment card's submission list, records marks and feedback. Marks cannot exceed the assignment maximum. Stale grading forms are rejected if the submission changed. Students see their score and feedback. Publishing/editing/deleting assignment content after publication is not provided by this first version; owner can publish another assignment.

## Documents

- PDF: authenticated inline iframe inside the portal's document dialog, with a download action.
- DOCX: private text preview inside the dialog, plus the original download. The text view does not reproduce Word formatting/images.
- Legacy DOC: accepted upload/download; no browser preview. The dialog explains this limitation.
- Maximum file size: 10 MB per question/submission. Upload extensions and file signatures are checked; request bodies are bounded even without Content-Length. Word archive metadata and actual expanded sizes are checked before server preview; macro/encrypted/oversized DOCX content is rejected. This is not a malware-scanning service.

## Database and storage

Seventh migration: `supabase/migrations/20261115_07_assignments.sql`.

- `assignments`: batch, title, question text, deadline, maximum marks, private question object reference and publishing identity.
- `assignment_submissions`: one current submission per assignment/student, file reference, submission/revision timestamps, awarded marks, feedback and grader.
- RPCs: `submit_assignment`, `grade_assignment_submission`.
- Private bucket: `assignment-files`, 10 MB and PDF/DOC/DOCX MIME allowlist.
- Object paths: `questions/{assignment-id}/{uuid}.{ext}` and `submissions/{assignment-id}/{student-id}/{uuid}.{ext}`.

Owners publish; students read scoped assignments. Submission writes and grading happen through database functions with actor checks. Direct student changes to marks/submission rows are denied. Storage read policies scope each file and restrictive policies prevent broader existing bucket rules from exposing/overwriting these documents. Browser clients cannot directly write/delete assignment objects. Server uploads use the server-only service key only after verifying the real actor and role. Anonymous reads are denied.

`/api/assignments/file` checks the requested database record with the user's RLS session before reading Storage, and streams the file through the app with private/no-store headers. It never returns a public URL, sends a private file to an external Office service, or accepts a caller-supplied storage path. DOCX preview extracts raw text and renders it as text, not untrusted HTML.

The upload and database record are separate operations: failed database commits attempt to remove the new private object; successful replacement removes the old object. Failures in Storage cleanup can leave a private orphan requiring administrator cleanup, rather than exposing a public file.

## Setup and verification commands

The base repair helper still covers the six original core migrations/20 tables. Apply this additive module after core setup:

```powershell
.\.runtime\node.exe scripts/apply-assignment-schema.mjs
.\.runtime\node.exe scripts/assignments-test.mjs
```

The module setup uses verified PostgreSQL TLS, a project identity check, a transaction and a private migration-checksum record; it then creates/configures the bucket using the Storage API. It safely skips the identical already-recorded migration. A differing migration or unexpected untracked assignment tables stops for review. If applying SQL through Supabase CLI instead, configure the dedicated private bucket via the Storage dashboard/API after reviewing the deployed migration; the specialized runner does not silently adopt untracked tables.

Live acceptance (creates disposable data, then cleans up):

```powershell
.\.runtime\node.exe scripts/live-assignments-test.mjs
```

Recorded local checks: 10 assignment file/SQL checks passed; existing console regression suite and TypeScript passed. Final production build passed with all34 generated routes, including assignment endpoints. Live API/Storage acceptance passed owner publication, batch isolation, private inline PDF, DOCX text preview, denied anonymous/other-student access, PDF upload, Word replacement, owner assessment, student feedback, deadline rejection and invalid-file protection, including a repeat after Word expansion hardening. Temporary accounts, rows and bucket objects were removed. Owner/student page and CSS HTTP smoke checks also passed after the build.

Actual visual/device testing of every browser PDF renderer has not been performed. PDF embedding relies on the browser's PDF capability; the original remains downloadable. No reminder scheduler, automatic grading, plagiarism checking or assignment push/email notification is included in this module.
