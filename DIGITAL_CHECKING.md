# Digital assessment checking and student updates

Current implementation: 15 November 2026. This supersedes earlier descriptions of replaceable submissions and owner-only question imports.

## Teaching workflow

Owners and teachers use separate **Publish assignment** and **Review assignments** tabs. Teachers are restricted to their assigned batch and subjects. They can import question banks in the same five formats as owners: TXT, XLSX, CSV, DOCX and text PDF.

Assignments and tests can request a normal PDF/DOCX answer sheet or require a scanned PDF. Students combine scanned pages into one PDF, up to 10 MB. Tests expose separate manual-marks and digital-checking workspaces, with optional upload deadlines. Parents have read-only access to their linked children.

Students confirm the filename and final-submission warning before upload. Cancel makes no upload request. Once submitted, neither assignments nor test answer sheets can be replaced. API checks reject repeat uploads and database triggers protect the original file metadata even through RPCs and concurrent requests. Marks, annotations and teacher feedback remain editable through the checking workflow.

## Checking tools

The portal renders PDF pages using locally hosted PDF.js. Owners/assigned teachers can place ticks, crosses, marks and comments, draw freehand, undo and delete annotations. Overall marks are entered separately from mark stamps. Draft annotations remain private to the teaching team. Publishing creates a flattened checked PDF containing the annotations and an academy feedback summary. Students and linked parents can open that PDF in the portal. Publishing synchronizes the actual assignment score or test marks; subsequent manual edits cannot contradict a published checked copy. Teachers can republish a revised checked PDF.

Original files remain intact. DOCX text is converted to PDF for checking; Word layout, embedded pictures and complex formatting are not reproduced. The original Word file remains downloadable. Image-only Word submissions should be uploaded as PDF. Legacy DOC is downloadable but not supported by digital checking. Scanned PDFs preserve their original visual pages; OCR is not required. PDF generation uses standard Latin fonts, with limits of 100 source pages and 1,500 annotations. Private checked PDFs are limited to 25 MB.

Private storage: original assignments in `assignment-files`, test originals and checked copies in `answer-sheets`. RLS protects source rows and published reviews; storage is fetched only after authorization. Drafts and other students' checked copies are inaccessible to students/parents. Source and review version checks reject stale saves.

## Batch library, results and notifications

Library selection/upload uses a batch, avoiding duplicate class labels such as `10` and `10th`. New Storage paths include the batch name and UUID. Only owners upload library files/links. Ambiguous legacy class resources remain owner-only until explicitly assigned to a batch; recovery preserves their existing storage objects.

Results subject choices include enrolled-batch subjects, not only subjects with marks. Upcoming/ungraded tests show **Awaiting result**. Published results retain subject, assessment, maximum marks and feedback. Test marks refresh through the live-table subscription with fallback polling.

`student_notifications` stores recipient-specific batch updates across logouts. Database triggers cover assignments, tests, library activity, batch changes, attendance, test results, checked assignments and notices. Targeted assignments notify only selected students. Attendance and results notify only the affected student. Login shows an unread-update toast and bell badge; the bell links to the relevant tab and supports marking delivered updates as read. Inbox RLS prevents reading another recipient's notifications; clients cannot fabricate notifications. Realtime and periodic/focus refresh receive later updates. This is an in-app inbox; no external email/SMS delivery is implied.

## Deployment and verification

Additive migrations 15–21 provide batch library access, teacher imports, digital checking, checked-marks integrity, final submissions and student inbox. Use the matching `scripts/apply-*.mjs` helpers; they validate the configured Supabase project, verify database TLS and track checksums. Do not change an already applied migration.

Unit checks: `scripts/digital-checking-test.mjs`. Live integration/browser checks: `scripts/live-digital-workflow-test.mjs`, `scripts/live-word-checking-test.mjs`, and `scripts/live-final-submissions-inbox-test.mjs`. These create temporary scoped identities, batches and storage objects and remove their fixtures afterward. Chrome checks require `.runtime/browser-tools` and the local Chrome installation. Development dependencies must include optional packages: jsPDF requires DOMPurify for its HTML-related module resolution. Do not install with `--omit=optional`.

Migration 21 explicitly publishes `tests` and `test_marks` to Supabase Realtime. RLS still restricts all reads. Both pending assessments and marks refresh in an open student/parent results screen.
