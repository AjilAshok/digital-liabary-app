# Development Roadmap

Complete one vertical slice at a time: database + backend API + Angular UI + tests + documentation.

## Phase 0 — Discovery and scaffold

- [x] Inspect machine and repository. _(Node 24.13.1, npm 9.8.1 global (broken on Node 24, so npm 11 is used via npx), Angular CLI 18 global (unused), PostgreSQL 18.2 service running, Docker installed but daemon stopped.)_
- [x] Confirm compatible Node/Angular/Prisma versions. _(Angular 21.2, TS 5.9.3, Prisma 7.10.1, Express 5.3. See SYSTEM_ARCHITECTURE.md and DECISIONS.md D-001.)_
- [x] Create frontend and backend projects.
- [x] Configure formatting, linting, TypeScript and `.gitignore`.
- [x] Add `.env.example`.
- [x] Verify PostgreSQL connection. _(Verified 2026-11-16 on a temporary PostgreSQL 18.2 cluster (port 5433) created with `scripts/create-database.sql`, using a non-superuser `library_app`. **Your own `backend/.env` still has placeholder credentials**; see README "Database setup".)_
- [x] Add README setup instructions.

## Phase 1 — Data model and authentication

**Acceptance status: incomplete (2026-11-17).** The isolated database and automated suites pass, but the configured application database is inaccessible and several live, device-dependent workflows remain unverified. Earlier completion notes below describe their historical test runs, not completion of the current full acceptance request.

### Phase 1 testing (2026-11-17)

**Retest, 2026-11-17:** 109 backend unit tests, 87 PostgreSQL integration tests and 82 frontend tests passed; backend and frontend builds, lint and formatting checks, plus backend typecheck passed. Integration tests reset only a newly created, explicitly approved isolated test database. Schema verification reported four migrations, 36 tables, 56 foreign keys and 23 checks. The Excel verification script passed against its separate verification database, including duplicate detection, correction, confirmation, history and idempotent retry. Authenticated dashboard, books, add book, copies, search, authors, locations, ISBN scanner, cover scanner, Excel upload and profile screens opened without visible alerts or JavaScript page errors; this was a screen-availability check, not a full interactive test. Dashboard widths of 1440, 768 and 390 pixels had no page-wide horizontal overflow. Open Library returned a result in a direct provider probe; Google Books returned HTTP 429. Physical-device camera, live OCR, complete UI workflows, provider results through the application and concurrent/large imports remain unverified. PostgreSQL integration emitted the existing `pg` concurrent-query deprecation warning; frontend tests emitted ZXing source-map and jsdom media warnings.

- [x] Apply all four migrations and verify the isolated PostgreSQL 18 schema: 36 tables, 56 foreign keys, 114 indexes and 23 CHECK constraints; `db:verify` passes. The integration suite covers duplicate accession/author numbers, relationships, multiple copies and transactional constraints. This does not constitute an exhaustive independent audit of every model and relationship.
- [x] Backend automated tests: 94 unit tests and 87 integration tests pass. The integration run uses a separately created PostgreSQL cluster and test fixtures, not the configured application database. Coverage includes authentication/roles, dashboard counts and charts, catalogue and authors, locations, search and scanner confirmation.
- [x] Frontend automated tests: 75 pass; production builds, lint, formatting checks and backend typecheck pass. The live sign-in screen was checked at 1440, 768 and 390 pixels without horizontal overflow, and required-field messages were verified.
- [x] Fixed PostgreSQL advisory lock calls that caused HTTP 500 responses during author/book creation and scanner metadata confirmation. Fixed search shelf responses to return the same `{ id, path }` object used by the catalogue and frontend.
- [ ] Restore access to the configured application database: read-only verification fails with PostgreSQL authentication error `28P01` for `library_app`. Start the configured backend and verify migrations, login and the real application data after credentials are corrected.
- [ ] Complete authenticated desktop/tablet/mobile browser testing of dashboard, forms, error/loading states, manual ISBN entry, permissions, camera-denied behavior and console errors. The unauthenticated page reports a failed API request while the backend is unavailable.
- [ ] Verify unknown ISBN and actual Google Books/Open Library results through the application. Direct provider probes returned HTTP 429 from Google Books and timed out for Open Library.
- [ ] Configure the server-side OCR provider and test real clear, old and unclear covers, missing-author cases, crop/retry and manual correction. The current OCR key is absent or a placeholder. Automated tests cover provider handling and OCR confirmation without physical-copy creation, not live image recognition.
- [ ] Complete an endpoint-by-endpoint API, authorization, error-handling and transaction review, plus the remaining real-data functional scenarios. Existing integration tests cover many workflows but do not prove every implemented endpoint or device scenario.
- [ ] Investigate the `pg` warning about concurrent queries on one client before upgrading to pg 9; frontend tests also report missing ZXing source maps.

- [x] Review ER diagram and edition/copy model. _(DATABASE_DESIGN.md "Reviewed design")_
- [x] Implement Prisma schema and migrations. _(Revised after the relationship review on 2026-11-16, see below. Baseline `20261116000000_init`: 36 tables, 19 enums, 56 FKs, 3 partial unique indexes, 4 trigram indexes, 23 CHECKs. Applied and verified with `db:verify` on the temporary cluster.)_
- [x] Add seed roles and development admin. _(`npm run db:seed`, idempotent, admin credentials from env, no default password.)_
- [x] Implement login and backend authorization. _(cookie JWT, argon2id, lockout, rate limit, permission middleware, audit log, Angular login/shell/guards/roles page)_
- [x] Add tests. _(See "Authentication & layout" below for current counts.)_
- [x] Run migrations, seed and the integration suite against a real database. _(Temporary cluster: migrate deploy, seed, demo seed, `db:verify` and 48/48 integration tests pass. Repeat against your own database once `.env` is filled in.)_

### Database architecture (completed 2026-11-16)

- [x] Review every relationship before changing it. _(DATABASE_DESIGN.md "Relationship review" lists 9 findings and their fixes.)_
- [x] Normalised schema: works → editions → physical copies; authors and the book-author M:N with roles and order.
- [x] Author numbers (unique when present, not blank) and accession numbers (unique, not blank, sequence-backed).
- [x] Categories (tree) and publishers.
- [x] Building › floor › room › rack › shelf hierarchy with per-parent unique codes.
- [x] Members and member types (policy per type), suppliers, purchases and purchase items linked to received copies.
- [x] Circulation transactions: loans, renewals, reservations, fines, plus a new append-only `fine_payments` table.
- [x] Import batches/rows, stock audits, scan logs, copy history, audit logs.
- [x] Foreign keys on every reference (the only exception is the documented polymorphic `stock_audits.scopeId`, guarded by a CHECK).
- [x] Indexes: FK and B-tree search indexes, `pg_trgm` GIN for fuzzy title/author/publisher/member search.
- [x] Unique constraints, including partial ones for one active loan per copy, one open reservation per member and edition, and one hold per copy.
- [x] Enums for stock status (`CopyStatus`), book condition (`CopyCondition`) and `AcquisitionType`.
- [x] Prisma migration (regenerated baseline) and development seed data (`npm run db:seed:demo`).
- [x] Database verification tooling: `npm run db:verify` and `tests/integration/schema.int.test.ts`.
- [x] Apply the migration and run `db:verify` plus the integration tests. _(on the temporary cluster)_

### Authentication & layout (completed 2026-11-16)

- [x] Backend: login, logout, logout-all, profile (`GET`/`PATCH /auth/me`), change password, my activity (paginated), argon2id hashing, authentication middleware.
- [x] Role-based authorization: ADMIN, LIBRARIAN and ASSISTANT system roles; `requirePermissions`/`requireAnyPermission`/`requireRole` middleware.
- [x] Angular: login page, responsive shell (sidebar, header, user menu), breadcrumbs, protected routes (`authGuard`, `guestGuard`, `permissionGuard`), profile page.
- [x] Reusable components: data table, page header, field error, server-error mapping, password field, form actions, confirm dialog.
- [x] Tests: backend 47 unit + 48 integration (auth 15, profile 9, schema 24); frontend 40. All pass.
- [x] End-to-end check through the Angular dev proxy on the temporary database, covering all three roles: 401 without a session, invalid credentials, HttpOnly cookie, profile update, activity, 403 for the Assistant on admin APIs, cross-origin rejection, logout followed by 401.
- [ ] Browser-automation E2E tests (Playwright). _(Planned for Phase 8; today's end-to-end check was scripted at the HTTP level.)_

### Library dashboard (completed 2026-11-16)

- [x] Key figures from PostgreSQL: titles, physical copies, available, issued, old stock, new stock, damaged, missing, members, overdue, inventory value, digitization progress (with an admin-set register total).
- [x] Charts: available vs issued, old vs new stock, category distribution, monthly purchases, monthly issues and returns, each with a table view and keyboard-accessible tooltips.
- [x] Recent activity, recent additions, due and overdue returns, permission-aware quick actions.
- [x] APIs: `GET /dashboard/summary`, `/charts`, `/recent-activities`; `PUT /dashboard/digitization-target`.
- [x] Tests: 16 calculation unit tests; 25 dashboard integration tests against PostgreSQL with hand-computed expected values (including time-zone month bucketing); 18 chart and dashboard UI tests. Totals: backend 63 unit + 73 integration, frontend 58. All pass.
- [x] Rendered with real data in headless Chrome at 1440px (light and dark) and 390px. No horizontal overflow; layout issues found in review were fixed (tooltip placement, two-column tiles on phones, routine sign-ins removed from the activity feed).
- [ ] Quick actions for scanning, issue/return and imports. _(added as those modules are delivered)_

**Next:** user management (create/edit/deactivate users, assign roles, admin password reset). Only the seeded admin exists on a fresh database. This is Phase 1.5 below.

## Phase 1.5 — User administration (added)

- [ ] User list/create/edit/deactivate API + UI (`users.read`, `users.manage`).
- [ ] Assign roles; edit role permissions (`roles.manage`).
- [x] Change own password. _(done in Authentication & layout)_
- [ ] Admin password reset.

## Phase 2 — Catalogue foundations

- [x] Authors and author numbers: paginated search, create/edit/profile, duplicate review, multi-author book links and title/copy totals.
- [ ] Categories and publishers (lookup and assignment are implemented; dedicated management screens remain).
- [x] Books/editions: create, edit, duplicate detection, details and cover management.
- [x] Individual copies and accession numbers: unique manual or server-sequence allocation, validation and copy history.
- [x] Location hierarchy CRUD, validated parent relationships, capacity-aware copy assignment/movement and shelf-wise stock reports.
- [x] Catalogue and copy CRUD UI/API workflows with permission gates.

## Phase 3 — Advanced search and details

- [x] Search by title, author, author number, ISBN, accession, publisher, category, shelf and rack.
- [x] PostgreSQL full-text and pg_trgm partial/fuzzy search with relevance ranking.
- [x] Debounced Angular search with stock/status/category/publisher/shelf/rack filters, sorting and pagination.
- [x] Book details and physical-copy history with shelf, purchase and circulation details.
- [x] Author profile and linked books.
- [x] Search accuracy and indexed-query performance integration coverage (execution requires valid `DATABASE_URL_TEST` credentials).

## Phase 4 — Scanning

- [x] Mobile camera permissions and live preview, camera switching and manual fallback.
- [x] ISBN barcode decoding with check-digit validation.
- [x] Local ISBN lookup and existing-edition copy-registration path.
- [x] Google Books/Open Library suggestions on local miss, with confidence/source and timeout handling.
- [x] OCR adapter and cover capture. _(Google Vision adapter is configurable server-side; mobile upload/crop, local-first search, labeled external suggestions, manual correction and explicit confirmation are implemented.)_
- [x] Human-reviewed metadata confirmation and separate copy registration; no stock is created by lookup.
- [x] Scan history and manual ISBN fallback.
- [x] Cover OCR adapter and capture.
- [ ] One-step reviewed metadata and physical-copy registration, including author number and category/cover confirmation. Current scanning creates verified metadata and physical copies in separate explicit steps.
- [ ] Physical-device camera and live Google Books/Open Library/OCR acceptance tests; provider availability and OCR configuration remain environment-dependent.

## Phase 5 — Old stock digitization

- [x] Excel template.
- [x] Upload and preview (single `.xlsx`, up to 500 rows).
- [x] Validation and staging.
- [x] Duplicate book-number detection and conservative catalogue matching.
- [x] Row correction and explicit confirmation (up to 100 ready rows per confirmation).
- [ ] Import history screen and row exclusion. Error-report download is implemented; staged import history is retained in the database.
- [ ] Add publisher/category import support and test concurrent imports and large batches.
- [ ] Reconciliation dashboard.

The simplified home screen and copy inventory use existing APIs. The requested combined one-step book-and-copy form, save-and-add-another flow, and archive action are not yet implemented; existing title creation, separate copy registration and details remain available.

## Phase 6 — Purchases

- [ ] Suppliers.
- [ ] Purchase and purchase items.
- [ ] Receive stock.
- [ ] Generate copy records and accession numbers.
- [ ] Invoice attachments and reports.

## Phase 7 — Members and circulation

- [ ] Members.
- [ ] Issue and return.
- [ ] Renewal and reservation.
- [ ] Configurable loan policies and fines.
- [ ] Overdue reports.
- [ ] Concurrency tests.

## Phase 8 — Audit, reports and deployment

- [ ] Barcode label generation.
- [ ] Physical stock audit.
- [ ] Reports and exports.
- [ ] Audit logs.
- [ ] Backup/restore documentation.
- [ ] Production configuration and HTTPS.
- [ ] End-to-end tests and deployment guide.

## Definition of done for each phase

- Database migration works.
- APIs validate inputs and enforce permissions.
- Angular screens use real APIs.
- Loading, empty, success and error states exist.
- Relevant tests pass.
- No new TypeScript/build/lint errors.
- Documentation and this checklist are updated.
