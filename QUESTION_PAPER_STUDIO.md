# Amita’s Classes: Question Paper Studio

Owner route: `/owner/question-papers`. Also linked from Tests & results and owner management tools. Staff, teachers, parents and students cannot read or manage the owner’s question bank or unpublished question papers.

## Import workflow

One file input accepts **TXT, XLSX, CSV, DOCX and PDF**. Limits: 5 MB and 500 questions per import; PDFs may have up to 50 pages and must contain selectable text. Scanned/image PDFs need OCR first. Word means `.docx`; legacy `.doc` and `.xls` are not accepted by the question-bank importer. The Learning Library has its own separate file rules.

Class and subject dropdowns come from active batches. Selecting a class filters the subject dropdown to that class’s batch subjects. All questions in an import are assigned to the selected class and subject. Questions remain available across future paper-building sessions.

TXT and Excel templates can be downloaded in the portal. Excel/CSV use one row per question with columns `question`, `marks`, `chapter`, `option_a` through `option_f`, and optional `answer`. Excel uses one worksheet. A subject column may exist, but the selected batch subject is authoritative.

TXT/Word/text-PDF can use labelled fields:

```text
Question: Solve 2x + 5 = 15.
Marks: 2
Chapter: Algebra
Answer: x = 5
---
Question: Which number solves x + 3 = 7?
Marks: 1
Option A: 2
Option B: 4
Answer: B
```

Alternatively, use numbered questions (`1.`, `2.`, or `Q1.`) with optional `[2 marks]`, lettered options and `Answer:` lines. Numbered questions without marks default to one mark. Complex diagrams, formula layout and OCR are not reconstructed; the import preview is required to check the extracted text before confirming.

Preview does not write anything. Confirmation validates the file again, uploads its original bytes to private Supabase Storage, and calls a transactional owner-only import RPC. Metadata and all questions commit together. Failed database imports trigger source-object cleanup. Source paths follow `classes/<class>/imports/<import-id>.<extension>` in private bucket `question-bank`.

## Build, save and preview

Choose a batch class and subject, then filter by chapter or use the question-bank search bar. Search is server-side and paginated. Select questions or drag them from the bank into a section.

Create and rename up to 20 sections. Choose the destination section for newly selected questions. Drag selected questions to another section or onto another question to change order. Section dropdowns and up/down buttons support touch and keyboard operation. Empty sections can be removed; move/remove their questions first to delete a populated section. Empty sections are not printed or retained in saved paper snapshots.

Set per-question marks, paper title, duration, optional exam date and general instructions. Section totals and the overall maximum are calculated automatically. The server verifies question IDs, class, subject, duplicates and marks, and creates snapshots from database question text rather than trusting client text. Answers stay in the owner’s question bank and never enter the generated paper snapshot/PDF.

A paper contains 1–100 questions, each worth 0.01–1000 marks, with up to 10,000 total marks. Saved papers support pagination, reopening, editing with a revision check, preview, download and deletion. Changing class/subject starts a new question selection. Deleting a paper preserves its source question bank.

The PDF uses an A4 examination layout with the original logo, academy heading and the actual paper title (for example, “Mid Term”) centred underneath. It includes class/subject, time, maximum marks, student name/roll fields, numbered general instructions, a horizontal separator before the questions, section headings, numbered questions, mark labels, automatic page breaks and page numbering. Enter one instruction per line; ordinary sentence-form instructions are also split into points. The title is printed once, replacing the generic “QUESTION PAPER” subtitle. It is generated from saved Supabase data on demand. It is a question paper, separate from the existing tests/marks register. Standard Latin/English text is supported by the current formal PDF font; complex-script typesetting and rich equation/diagram reconstruction are outside this implementation.

## PDF reader and loading

The shared Library/Assignments/Question Papers viewer renders PDF pages with locally served PDF.js 4.10.38, replacing the browser-plugin iframe. It shows the Amita’s Classes logo, circular progress indicator and loading message until a page finishes rendering; download percentages appear only when a real content length is available. It includes paging, zoom, authenticated fetching, cancellation on close, retry/error states and original download. Password-protected files receive an explanatory error. DOCX text preview also shows branded loading.

Reusable branded progress appears in question-bank/saved-paper loading, library updates, learner details, assignments and attendance rosters. Route/session changes use the existing full-screen academy loading screen.

PDF.js browser code, worker and Apache license are vendored under `apps/web/public/pdfjs`; runtime rendering uses no external CDN. Import text extraction uses the same pinned engine in Node. Source: [Mozilla PDF.js](https://mozilla.github.io/pdf.js/).

## Backend and verification

Migration: `supabase/migrations/20261115_10_question_papers.sql`; deployment helper: `scripts/apply-question-paper-schema.mjs`. Tables: `question_bank_imports`, `question_bank_questions`, `question_papers`. All have RLS and audit triggers. Restrictive Storage policies protect raw question-bank files even in the presence of older broad Storage policies. The source bucket is private and allows the five supported MIME types.

Tests: `.runtime/node.exe --test scripts/question-papers-test.mjs`. Real API/Storage acceptance: `.runtime/node.exe scripts/live-question-papers-test.mjs`; add `BROWSER_TEST=1` for Chrome checks when the isolated `.runtime/browser-tools` dependency is available. Temporary identities, batches, banks, source objects, papers and audit rows are cleaned up.

Live checks cover all five formats, preview-without-save, private Storage and student denial, marks/order and class validation, answer-free snapshots, stale-edit rejection, inline PDF generation, one uploader, actual nonblank canvas rendering, branded loading, retry after errors and mobile layout. Browser checks also exercise batch class/subject dropdowns, section creation, question search, actual pointer drag/drop across sections, reordering and the revised Mid Term PDF. Native bank-card dragging and mobile/keyboard section controls are also provided.


## Batch library, digital checking and final submissions — 15 November 2026

See [DIGITAL_CHECKING.md](./DIGITAL_CHECKING.md) for the current implementation and limitations. Migrations 15–21 supersede older class-library selection, owner-only question-bank imports and replaceable answer submissions. Library uploads use batches; assigned teachers can import banks. Assignments have Publish/Review tabs. Assignments and tests support scanned PDF/DOCX checking with ticks, crosses, marks, pen, comments and private drafts; published checked PDFs and synchronized scores are visible to the student and linked parents. DOCX checking converts readable text, preserving the downloadable original rather than reproducing Word layout/images. Student uploads require confirmation and are final: APIs plus database triggers prevent replacement even before checking. Student subjects come from enrolled batches, pending tests show Awaiting result, and published test results refresh live. Recipient-scoped batch notifications persist across logins in Supabase, with unread badge, login toast, tab links and stored read state.
