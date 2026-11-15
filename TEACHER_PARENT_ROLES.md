# Teacher and parent roles

Implemented against live Supabase on 15 November 2026. This extends the existing owner/student portal with subject-specific teaching access and a read-only parent assignment-progress view.

## Owner setup and editing

In **People & permissions** (`/owner/users`), creating a teacher requires selecting at least one batch and subject. The class dropdown filters active batches; subject checkboxes allow multiple classes/batches. The server validates those selections before creating the account. Profile creation is followed by a transactional teaching-scope RPC; failed setup triggers deletion of the newly created Auth account/profile.

Existing account rows have **Edit account**. Owners can update name, email, mobile and active/inactive status. Roles remain unchanged in this form. Passwords and the first-login requirement are preserved. Linked student/parent profile contacts are synchronized by a database function. Email changes update Supabase Auth too, with compensating restoration if the database update fails. Self-deactivation and deactivating the final active owner are blocked.

The **Teaching access & family links** section edits teacher batch/subject permissions and links parent accounts to one or more children. Saving no subjects revokes that teacher’s access to that batch. Saving no children removes that parent’s child access. Owner-only RPCs validate and persist these relationships.

## Subjects and teaching scope

`subjects` is a normalized subject catalog. `batch_subjects` connects batches to subjects, and `teacher_batch_subjects` connects a teacher to specific batch/subject pairs. Existing `batches.subjects` arrays remain for compatibility; a trigger synchronizes them into the normalized catalog when batches change. Existing active teachers in `batches.teacher_id` were initially granted that batch’s subjects during migration. Subsequent permissions are enforced through explicit teaching mappings rather than falling back to `teacher_id`.

The teacher portal at `/teacher` shows assigned active batches, allowed subjects and currently enrolled students. Its assignment section (`?view=assignments`) publishes work to an entire enrolled batch or selected students, reviews uploaded PDF/Word submissions and awards marks/feedback. Assignments carry a normalized `subject_id` and optional recipient UUID array. Database validation rejects students outside the active batch roster.

The paper studio (`/teacher?view=papers`) reads the owner’s question bank only for permitted class/subject combinations. Teachers generate, save, preview and edit their own permitted papers. They cannot read other teachers’ papers, upload question-bank sources, manage accounts, alter teaching permissions or change student enrollments. Tests/marks use an assigned-subject dropdown and restrictive RLS guards. Learning-library publishing remains owner-only; teachers may read library resources for assigned classes.

Permissions are checked in server routes and database policies/functions. Assignment marking, file access and question-bank/paper access recheck current scope, so revocation blocks subsequent requests even if the browser retains an old screen. Existing broad teacher announcement rules are intersected with batch/class restrictions. Previously published assignments without a subject were automatically assigned one only when the batch had exactly one subject; ambiguous legacy assignments remain owner-managed.

## Parent progress

Parent accounts must be linked to children through `parents` and `student_parent`. Existing parent attendance, test results, schedule, notices, learning library and fee views remain available. The parent navigation now includes **Assignments**, showing the selected child’s pending/submitted/graded status, marks, teacher feedback and a read-only private submission preview.

Parents cannot submit or replace work, grade assignments, create papers, read question-bank answers or view unlinked students. A multi-child selector lists only linked children. Removing a link blocks subsequent child-data and private-file requests through RLS.

## Mobile numbers

Visible account, login, admission and guardian fields use a ten-digit Indian mobile number without a `+91` label or prefix. Existing canonical database phone values remain normalized for reliable email/mobile login matching; this does not enable Phone Auth or SMS. The same account password is verified through Email Auth for either login identifier.

## Migrations and verification

Apply migrations in order:

- `20261115_11_teacher_parent_roles.sql`: normalized subjects, teaching scopes, family-link RPCs, assignment subjects/recipients and role RLS.
- `20261115_12_account_edit.sql`: account editing and transactional creation-time scope assignment.
- `20261115_13_role_scope_hardening.sql`: legacy teacher library/announcement restrictions and subject audit.
- `20261115_14_teacher_subject_relation.sql`: explicit subject foreign key for Supabase embedding.

Corresponding scripts are `apply-teacher-parent-schema.mjs`, `apply-account-edit-schema.mjs`, `apply-role-hardening-schema.mjs`, and `apply-teacher-subject-relation.mjs`. They use the existing verified-TLS/checksum deployment workflow and have been applied to the connected project.

`scripts/live-teacher-parent-test.mjs` uses disposable accounts and verifies creation-time scope, forced password change, normalized subjects, subject-limited question banks/papers, selected-student assignments, student isolation, teacher grading, parent read-only access, account editing and permission revocation. Set `BROWSER_TEST=1` for Chrome checks of the real teacher/parent screens and account forms. The isolated `.runtime/check-teacher-create-ui.mjs` additionally exercises the actual create/edit form and confirms persisted scope rows. Test records, source files and profiles are cleaned up.


## Batch library, digital checking and final submissions — 15 November 2026

See [DIGITAL_CHECKING.md](./DIGITAL_CHECKING.md) for the current implementation and limitations. Migrations 15–21 supersede older class-library selection, owner-only question-bank imports and replaceable answer submissions. Library uploads use batches; assigned teachers can import banks. Assignments have Publish/Review tabs. Assignments and tests support scanned PDF/DOCX checking with ticks, crosses, marks, pen, comments and private drafts; published checked PDFs and synchronized scores are visible to the student and linked parents. DOCX checking converts readable text, preserving the downloadable original rather than reproducing Word layout/images. Student uploads require confirmation and are final: APIs plus database triggers prevent replacement even before checking. Student subjects come from enrolled batches, pending tests show Awaiting result, and published test results refresh live. Recipient-scoped batch notifications persist across logins in Supabase, with unread badge, login toast, tab links and stored read state.
