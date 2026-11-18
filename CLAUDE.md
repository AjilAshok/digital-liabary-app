# Claude Code Project Instructions — Digital Library Management System

## Project mission
Build a complete, production-minded Digital Library Management System from scratch. The system digitizes an existing physical library, manages old and newly purchased books, tracks every physical copy, supports book and author search, mobile ISBN scanning, cover OCR, stock migration, members, circulation, reports, and stock audits.

## Mandatory working rules
1. Start by reading this file and all relevant files in `docs/`.
2. Before coding, inspect the repository and report its current state. Do not assume files or infrastructure exist.
3. Build incrementally in the phases in `docs/DEVELOPMENT_ROADMAP.md`.
4. Do not stop after writing a plan, scaffolding, or mock UI. Implement working frontend-to-backend-to-database flows.
5. Do not use hardcoded arrays as production data. Seed data is allowed only for development/demo.
6. Keep documentation updated when architecture, APIs, schema, or decisions change.
7. Before finishing a task, run relevant formatting, linting, type checks, migrations, and tests. Fix errors introduced by the work.
8. Do not silently invent business policies such as loan periods, fines, membership limits, or accession-number formats. Make them configurable and document defaults.
9. Ask a concise question only when a decision genuinely blocks implementation. Otherwise choose a safe, reversible default and document it.
10. Never expose secrets. Use `.env.example`; never commit real `.env` files or API keys.

## Technology direction
- Frontend: Angular + TypeScript + Angular Material + SCSS.
- Backend: Node.js + Express + TypeScript.
- Database: PostgreSQL.
- ORM/migrations: Prisma.
- Validation: a shared, consistent schema-validation approach on the backend.
- Excel: ExcelJS.
- Barcode scanning: ZXing-compatible browser camera scanning.
- OCR: an interchangeable OCR service/provider behind a backend interface.
- External book metadata: Google Books API and Open Library, with manual fallback.
- Authentication: secure password hashing and JWT/session strategy appropriate to deployment.
- Testing: unit and integration tests for critical business rules.

Use currently supported, mutually compatible package versions. Check installed versions and official documentation before selecting major versions. Do not assume "latest" packages are compatible.

## Core data rules — never violate
- A **book title/edition** is a bibliographic record; a **book copy** is one physical item.
- ISBN identifies an edition, not a physical copy.
- Every physical copy has its own unique accession number.
- Every author has a unique author number, if the library uses author numbers.
- A book can have multiple authors; an author can have multiple books.
- A title can have many copies; each copy has its own condition, status, shelf location, and acquisition details.
- Old/new is an acquisition/source classification for a copy, not a separate duplicate title.
- External catalogue results are metadata suggestions only. They must never create physical stock automatically.
- A scanned ISBN that already exists should offer to register another copy of the existing edition, not duplicate the title.
- Preserve issue/return, stock adjustment, import, and audit history. Do not hard-delete transactional history.
- A copy cannot be issued if it is not eligible and available. Prevent concurrent double-issue using database transactions/locking or equivalent safe constraints.
- Missing, damaged, under-repair, discarded, reserved, issued, and available statuses must be explicit and controlled.
- Do not assume one shelf location for a title: location belongs to each physical copy.

## Required modules
1. Authentication, users, roles, permissions.
2. Dashboard and activity feed.
3. Advanced internal search: title, author, author number, ISBN, accession number, publisher, category, shelf/rack.
4. Book title/edition catalogue.
5. Individual physical copy inventory.
6. Author management and book-author relationships.
7. Publisher and category management.
8. Building/floor/room/rack/shelf location management.
9. Mobile ISBN barcode scanning.
10. Book-cover OCR and manual verification.
11. External metadata lookup.
12. Old-stock Excel migration with preview, validation, staging, duplicate checks, error report, and import history.
13. New purchases, suppliers, invoices, and copy creation.
14. Members.
15. Issue, return, renewal, reservation, overdue and configurable fines.
16. Barcode label generation/printing.
17. Physical stock verification and reconciliation.
18. Reports and Excel/PDF exports.
19. Settings and audit logs.

## UI expectations
- Professional, accessible, responsive admin interface.
- Desktop sidebar and top bar; mobile-friendly navigation.
- Search should be easily reachable from the main header.
- Tables need pagination, sorting, filters, empty/loading/error states.
- Forms need validation and clear success/failure feedback.
- Camera scanning must be designed for mobile HTTPS contexts and handle denied permissions, unsupported devices, camera switching, poor lighting, and manual fallback.
- Never claim OCR or external metadata is certain; show match confidence/source where available and require librarian verification.

## Security and reliability
- Validate all API input server-side.
- Enforce authorization in backend middleware, not only in Angular.
- Hash passwords securely.
- Apply upload size/type limits and validate Excel/image files.
- Use parameterized database access through Prisma.
- Use transactions for purchases, imports, issue/return and stock adjustments.
- Add audit records for sensitive inventory and circulation actions.
- Provide database backup/restore guidance.
- Keep API keys server-side.
- Use rate limits and safe error responses where appropriate.

## Required delivery discipline
For each phase:
1. Read relevant docs.
2. State the phase goal and acceptance criteria.
3. Implement a vertical slice (database + API + UI + tests).
4. Run checks and tests.
5. Update docs and roadmap checkboxes.
6. Summarize files changed, commands run, results, and known gaps.

## First task
Do not start by generating all modules at once. First:
1. Inspect the current directory.
2. Read all project docs.
3. Check Node, npm, Angular CLI, and PostgreSQL availability.
4. Propose the initial architecture and exact compatible versions.
5. Create the project scaffold, `.gitignore`, `.env.example`, and README.
6. Implement Phase 1 only after the scaffold is verified.
