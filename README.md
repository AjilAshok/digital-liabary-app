# Digital Library Management System

A web-based library administration system for digitising an existing physical collection and managing titles, editions, individual book copies, search, acquisitions, circulation and stock verification.

**Status:** Phase 0 (scaffold) and Phase 1 (data model + authentication) are implemented. See [docs/DEVELOPMENT_ROADMAP.md](docs/DEVELOPMENT_ROADMAP.md).

## Technology
| Layer | Stack |
|---|---|
| Frontend | Angular 21.2 · Angular Material 21 (M3) · TypeScript 5.9 · SCSS · Vitest |
| Backend | Node.js 24 · Express 5 · TypeScript 5.9 · Zod 4 · Pino · Vitest + Supertest |
| Database | PostgreSQL 18 · Prisma 7.10 (driver adapter `@prisma/adapter-pg`) |
| Security | Argon2id · JWT in HttpOnly cookie · Helmet · rate limiting · permission middleware · audit log |

Why these versions: [docs/DECISIONS.md](docs/DECISIONS.md) and [docs/SYSTEM_ARCHITECTURE.md](docs/SYSTEM_ARCHITECTURE.md).

```
backend/    Express API, Prisma schema/migrations/seed, tests
frontend/   Angular SPA
docs/       Requirements, architecture, database design, API, decisions, roadmap
```

## Prerequisites
- **Node.js ≥ 22.12** (developed on 24.13.1). Angular 22 will later need Node ≥ 24.15.
- **npm 11.** The npm 9 that came with older installs crashes on Node 24 (`edgesOut` error). Run `npm install -g npm@11`, or prefix commands with `npx npm@11`.
- **PostgreSQL 16+** (developed on 18.2).

## 1. Database setup (one time)
Create a dedicated, non-superuser application role and two databases: one for the app, one for integration tests.

```powershell
cd backend
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost `
  -v app_password="'Choose-A-Strong-Password'" -f scripts/create-database.sql
```

The script is idempotent. It creates role `library_app` (LOGIN, CREATEDB, so Prisma can make its shadow database) and the databases `digital_library` and `digital_library_test`.

## 2. Backend
```powershell
cd backend
npm install                    # also generates the Prisma client
copy .env.example .env         # skip if .env already exists
```
Edit `backend/.env`:
- In `DATABASE_URL` and `DATABASE_URL_TEST`, replace `CHANGE_ME` with the password from step 1.
- Set `JWT_SECRET` to a long random value: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.
- Set `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` for the first administrator. The password needs at least 10 characters and 3 of: lowercase, uppercase, digit, symbol.

```powershell
npx prisma migrate deploy      # apply migrations
npm run db:seed                # permissions, roles, first admin (safe to re-run)
npm run db:seed:demo           # optional: demo library for development (never in production)
npm run db:verify              # read-only check that the database matches the design
npm run dev                    # API on http://localhost:3000
```
Check: `http://localhost:3000/api/v1/health/ready` should return `{"status":"ok","database":"up"}`.

## 3. Frontend
```powershell
cd frontend
npm install
npm start                      # http://localhost:4200, proxies /api to :3000
```
If port 4200 is busy, use `npx ng serve --port 4300`. Sign in with the seeded admin account.

## Commands
| Where | Command | Purpose |
|---|---|---|
| backend | `npm run dev` | API with reload |
| backend | `npm run build` / `npm start` | Compile to `dist/` / run compiled build |
| backend | `npm run typecheck` · `npm run lint` · `npm run format:check` | Static checks |
| backend | `npm run test:unit` | Unit tests (no database) |
| backend | `npm run test:integration` | API + DB tests; **resets `DATABASE_URL_TEST`** |
| backend | `npm test` | Both suites |
| backend | `npm run db:seed:demo` | Load demo catalogue/circulation data (dev only; skipped if catalogue not empty) |
| backend | `npm run db:verify` | Check tables, FKs, unique/partial/trigram indexes, CHECKs, enums |
| backend | `npx prisma migrate dev --name <change>` | Create a migration during development (never edit applied migrations) |
| backend | `npx prisma studio` | Browse data |
| frontend | `npm start` · `npm run build` | Dev server / production build |
| frontend | `npm test` · `npm run lint` · `npm run format:check` | Tests / lint / format |

> **Windows note:** run tests through `npm test`, not `npx vitest` directly. The wrapper fixes a Vitest failure when the drive letter is lower-case (`d:\`). See DECISIONS.md D-009.

## Environment variables
All are documented in [backend/.env.example](backend/.env.example). Never commit `.env`; it is git-ignored. Business-policy defaults (lockout, session length, role permissions) are listed in [docs/BUSINESS_RULES.md](docs/BUSINESS_RULES.md#configurable-defaults-documented-change-via-environment-or-database).

## Backup and restore (development)
```powershell
& "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe" -U library_app -h localhost -Fc -f backup.dump digital_library
& "C:\Program Files\PostgreSQL\18\bin\pg_restore.exe" -U library_app -h localhost -d digital_library --clean --if-exists backup.dump
```
Production backup and restore, HTTPS and deployment guidance come in Phase 8.

## Documentation
- [User guide for librarians and staff](docs/USER_GUIDE.md)
- [Free cloud test deployment](docs/CLOUD_TEST_DEPLOYMENT.md)
- [CLAUDE.md](CLAUDE.md): permanent development rules
- [docs/PROJECT_REQUIREMENTS.md](docs/PROJECT_REQUIREMENTS.md) · [docs/BUSINESS_RULES.md](docs/BUSINESS_RULES.md)
- [docs/SYSTEM_ARCHITECTURE.md](docs/SYSTEM_ARCHITECTURE.md) · [docs/DATABASE_DESIGN.md](docs/DATABASE_DESIGN.md) (ER diagram)
- [docs/API_DOCUMENTATION.md](docs/API_DOCUMENTATION.md) · [docs/DECISIONS.md](docs/DECISIONS.md)
- [docs/DEVELOPMENT_ROADMAP.md](docs/DEVELOPMENT_ROADMAP.md)
