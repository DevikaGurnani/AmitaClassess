# Isolated Gemini checking preview

Open `/owner/ai-checking-preview` as owner or teacher. It is intentionally not linked into normal checking/navigation. Existing assignments, test checking, question banks, marks and parent/student views are unchanged.

Set server-only `GEMINI_API_KEY` locally and in Vercel to enable actual generation. Never use a NEXT_PUBLIC key. Uses `gemini-2.5-flash`; availability and free quotas depend on the Google project. There is no paid-model fallback, automatic retry or promise of unlimited free requests.

Teacher can select an existing assignment and one of its submissions. The preview server checks the same owner/subject-scoped teacher permissions as manual checking, fetches the saved question text/attached paper and student answer sheet, and sends separately labelled question/answer documents to Gemini. No re-upload is required. Existing DOCX documents use the manual checker’s text-to-PDF conversion; legacy DOC remains unsupported. Combined PDFs are limited to 10 MB. Rubric totals must match the stored assignment maximum. An assignment is initially one assessment block; teachers can split the rubric into questions. No saved answer key exists for assignments, so marking guidance is still required. Standalone tests are not automatically matched to generated papers: that relationship has not been implemented.

Manual samples still accept question/expected-answer rubric rows and pasted answers or a PDF. This multipart request is limited to 3.2 MB for Vercel. Up to 30 rubric questions. Neither mode writes to existing assessment data.

Only an explicit consent checkbox and Generate action sends the sample to Google. Google free-tier data handling may include product improvement; use synthetic/anonymised samples and remove identifiers from scanned pages. The app does not save uploaded documents, responses or grades to Supabase. This does not imply Google deletes data immediately. Suggestions are rendered as plain text and never execute HTML. Documents are treated as untrusted input in the model instructions.

Output includes suggested per-question score, evidence and feedback, plus a needs-review indicator. Server validates question numbering, unique coverage and marks within each maximum, and recomputes totals. Missing/invalid results, unavailable model, timeouts or quota failures return an error. All outputs require teacher verification, including entries without a needs-review flag. No auto-grading or publication occurs.

Verification: TypeScript check and `scripts/ai-checking-preview-test.mjs` mocked API tests. Actual handwriting accuracy, latency and live Gemini integration require a configured key and sample evaluation; those are not established by mocked tests. For later integration add explicit teacher acceptance, version checks, audit trail and the existing grading authorization before any persistence.

Sources: https://ai.google.dev/gemini-api/docs/pricing and https://ai.google.dev/gemini-api/docs/document-processing
