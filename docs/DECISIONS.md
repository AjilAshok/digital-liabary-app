# Decision Log

Short records of architecture decisions. Newest first. Each one is reversible unless noted.

## D-017 · Dashboard figures are defined, not guessed (2026-11-16)
- **Holdings** exclude discarded and archived copies.
- **Inventory value** counts only recorded prices and reports how many copies are unpriced.
- **Digitization progress** needs a library-entered register total; until then no percentage is shown.
- **Monthly buckets** use the optional `library.timeZone` setting (default UTC).

The definitions are in BUSINESS_RULES.md § Dashboard metrics. All of them are pure functions with unit tests, and they are checked against PostgreSQL with a hand-computed fixture, including a time-zone month-boundary case.

## D-016 · Charts built in-house with plain SVG, not a chart library (2026-11-16)
The dashboard needs five small charts. Building them as Angular components:
- avoids a dependency whose Angular 21 compatibility would need tracking;
- keeps bundle size small, with charts lazy-loaded alongside the dashboard;
- lets us meet the dataviz method's accessibility rules exactly: keyboard tooltips, a table view for every chart, no dual axis, and colour never used alone.

Revisit this if later reports need zoomable time series or very large data sets.

## D-015 · Shared UI kit before feature modules (2026-11-16)
Phases 2–8 add many list and edit screens, so the table, form, page-header, breadcrumb and confirm components are built once in `shared/` and `layout/`. The data table is **server-driven**: the page owns loading and pagination, matching the `{ data, meta }` API convention. Client-side sorting or paging is never used for database data.

## D-014 · Integration tests need explicit consent when run by an AI agent (2026-11-16)
`prisma migrate reset` (used by the integration-test global setup) refuses to run under an AI agent without the user's explicit consent, passed through `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`. People running `npm run test:integration` themselves are not affected. The setup also refuses any database whose name lacks "test", or that matches `DATABASE_URL`.

## D-013a · Self-service profile; email and roles are administrator-managed (2026-11-16)
`PATCH /auth/me` changes only the display name. Changing the email would change the login identity, so it waits for user administration (Phase 1.5). Changing the password revokes every other session but keeps the current one signed in.

## D-013 · Baseline migration regenerated instead of adding a corrective migration (2026-11-16)
The relationship review changed several tables. The original `20261116000000_init` had never been applied to any database: every connection attempt failed authentication. So the baseline was regenerated rather than stacking a second migration that would only patch an empty history. **From now on, applied migrations are never edited.** Every change is a new migration created with `prisma migrate dev --name …`.

## D-012 · Append-only fine payments (2026-11-16)
`fine_payments` records each PAYMENT or WAIVER, with amount, method, reference and who recorded it. `fines.paidAmount` is a running total updated in the same transaction, and a CHECK keeps it ≤ `amount`. This keeps financial history intact, as BUSINESS_RULES.md requires.

## D-011 · Partial unique indexes for circulation invariants (2026-11-16)
These rules are enforced by partial unique indexes declared in `schema.prisma`, using Prisma 7.10's `partialIndexes` preview feature:
- one ACTIVE loan per copy
- one open reservation per member and edition
- one READY_FOR_PICKUP hold per copy

This replaces the earlier `loans.activeCopyId` mirror column. Because Prisma knows these indexes, `migrate dev` drift detection won't try to drop them. *Risk:* preview features can change between Prisma releases, so the integration tests cover each index, and the upgrade checklist should re-run them.

## D-010 · pg_trgm declared in the schema (2026-11-16)
`postgresqlExtensions` (preview) declares `pg_trgm`, and four GIN trigram indexes are added now, ahead of Phase 3 search. `pg_trgm` is a trusted extension, so the non-superuser owner `library_app` can create it, including in Prisma's shadow database.

## D-009 · Test runners wrapped to normalise the Windows drive letter (2026-11-16)
When the working directory has a lower-case drive letter (`d:\…`, which is how VS Code opened this workspace), Vitest loads two copies of itself and every suite fails with `Cannot read properties of undefined (reading 'config')`. `backend/scripts/vitest.mjs` and `frontend/scripts/ng-test.mjs` start the runner with an upper-cased cwd. Run tests through `npm test`, not `npx vitest` directly.

## D-008 · npm 11 via `npx npm@11` for installs (2026-11-16)
The global npm 9.8.1 crashes with `Cannot read properties of null (reading 'edgesOut')` on Node 24. Packages were installed with npm 11.21.2 (`packageManager` field). npm 11 blocks dependency install scripts by default. None are needed here: esbuild, argon2 and the Prisma engines ship prebuilt binaries, and everything was verified working. **Recommendation:** `npm install -g npm@11`.

## D-007 · Separate integration-test database (2026-11-16)
Integration tests run `prisma migrate reset --force` against `DATABASE_URL_TEST`. As a safety measure, they refuse to run if that database's name does not contain `test` or if it equals `DATABASE_URL`.

## D-006 · Session = JWT in HttpOnly cookie, revocable via tokenVersion (2026-11-16)
- Token never reaches JavaScript, which removes XSS token theft.
- `SameSite=Strict`, `Path=/api`, `Secure` in production, plus an Origin check give CSRF protection.
- Every request reloads the user, so deactivation, permission changes and `logout-all` (bumps `tokenVersion`) take effect immediately. The cost is one indexed query per request, which is acceptable for an admin application.
- No refresh tokens. Session length is configurable (default 8 h, one working day).

## D-005 · Argon2id password hashing (2026-11-16)
OWASP minimum parameters (m=19 MiB, t=2, p=1). Parameters are stored in each hash, so they can be raised later without breaking existing hashes. Failed logins for unknown accounts are verified against a dummy hash so timing does not reveal which emails exist.

## D-004 · Permission-based authorization (2026-11-16)
Routes check permission codes, never role names. Roles are bundles of permissions stored in the database. Defaults live in `backend/src/security/permissions.ts`. Re-seeding only adds permissions, so administrators' customisations survive.

## D-003 · Book → BookEdition → BookCopy (2026-11-16)
See [DATABASE_DESIGN.md](DATABASE_DESIGN.md#1-edition-modelling-book--bookedition--bookcopy). One-open-loan-per-copy was first enforced by a unique `activeCopyId` column; D-011 superseded this with a partial unique index.

## D-002 · Prisma 7 with driver adapter and generated client in `src/generated` (2026-11-16)
Prisma 7 reads the datasource URL from `prisma.config.ts`, not from the schema, and generates the client to `backend/src/generated/prisma`. That folder is git-ignored and regenerated on `npm install` by the postinstall hook. CHECK constraints and future trigram indexes go in reviewed SQL inside migrations.

## D-001 · Angular 21 (not 22) and TypeScript 5.9 (2026-11-16)
The installed Node 24.13.1 is below Angular 22's `^24.15.0` requirement. Angular 21.2 is the supported LTS line for this Node. TypeScript 7.0 is excluded by Angular (`<6.0`) and typescript-eslint (`<6.1`). Upgrade path: install Node ≥ 24.15, then run `ng update @angular/core@22 @angular/cli@22`.
