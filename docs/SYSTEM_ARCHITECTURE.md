# System Architecture

## Components
- Angular SPA for desktop/tablet/mobile.
- Express REST API (TypeScript).
- PostgreSQL database.
- Prisma data access and migrations.
- Server-side metadata provider adapters (Google Books/Open Library).
- Scanner client module for ISBN barcode decoding.
- OCR provider adapter for image text extraction.
- File storage abstraction for covers, invoices, and import files.

## Architectural rules
- Angular must not connect directly to PostgreSQL.
- External API credentials stay on the server.
- Controllers handle HTTP concerns; services implement business logic.
- Validate requests at API boundaries.
- Use DTOs and explicit response contracts.
- Keep external metadata providers behind interfaces so providers can be changed.
- Keep file storage replaceable (local development storage initially; production storage configurable).
- Use transactions for multi-record business operations.

## Suggested backend layers
Routes -> Authentication/Authorization -> Validation -> Controllers -> Services -> Prisma.

## Suggested frontend modules
core, shared, layout, dashboard, search, catalogue, copies, scanner, authors, locations, imports, purchases, members, circulation, audits, reports, settings.

## Implemented architecture (Phase 0/1)

```
Browser (Angular SPA) ──/api/v1──▶ Express API ──Prisma (adapter-pg)──▶ PostgreSQL
     │   same origin: dev proxy (proxy.conf.json) / reverse proxy in production
     └── HttpOnly session cookie (JWT), SameSite=Strict, Path=/api
```

For the optional cloud test deployment, Express can serve the Angular production output when `FRONTEND_DIST_DIR` is set. This keeps the SPA and `/api/v1` on one HTTPS origin, so the existing relative API URLs and secure cookie session work without a separate frontend proxy. Local development leaves this variable unset and continues to use Angular's dev proxy. See [CLOUD_TEST_DEPLOYMENT.md](CLOUD_TEST_DEPLOYMENT.md) for the non-production free-tier limitations.

### Selected versions (verified 2026-11-16 against registry engines/peer ranges)
| Layer | Package | Version | Reason |
|---|---|---|---|
| Runtime | Node.js | 24.13.1 (installed) | Angular 22 needs ≥ 24.15, so Angular 21 LTS is used |
| Frontend | Angular / CLI / Material / CDK | 21.2.x | Supports Node ≥ 24.0; LTS |
| Frontend | TypeScript | 5.9.3 | Angular 21 requires `>=5.9 <6.0`; TS 7 not yet supported by Angular or typescript-eslint |
| Frontend tests | Vitest + jsdom (Angular `unit-test` builder) | 4.1.x | Angular 21 default |
| Lint | ESLint 9 + typescript-eslint 8.72 + angular-eslint 21.4 | | |
| Backend | Express | 5.3.0 | Native async error propagation |
| Backend | Zod | 4.6.x | Request + environment validation |
| ORM | Prisma / @prisma/client / @prisma/adapter-pg | 7.10.1 | Latest stable (8.0 is RC only) |
| Database | PostgreSQL | 18.2 (installed) | |
| Auth | argon2 (argon2id) 0.45, jsonwebtoken 9 | | |
| Security | helmet 8, express-rate-limit 8, cors, cookie-parser | | |
| Logging | pino 10 + pino-http (pino-pretty in dev) | | |
| Backend tests | Vitest 4.1 + Supertest 7 | | |

Upgrade path: after Node ≥ 24.15 is installed, Angular can move to 22 with `ng update`.

### Repository layout
```
backend/   Express + Prisma API
  prisma/  schema.prisma, migrations/, seed.ts
  src/     app.ts, server.ts, config/, db/, lib/, middleware/, security/, modules/<feature>/
  tests/   unit/ (no DB), integration/ (dedicated test DB), helpers/
frontend/  Angular SPA
  src/app/ core/ (api, auth), layout/ (shell), features/<feature>/
docs/      requirements, design, API, decisions, roadmap
```

### Backend request pipeline
`requestId → pino-http → helmet → cors → json(1 MB) → cookieParser → originCheck → router: [rateLimit] → authenticate → requirePermissions → validate (Zod) → controller → service → Prisma → errorHandler`

- **Errors:** every error is JSON `{ error: { code, message, details?, requestId } }`. Unknown errors return a generic 500, and the stack trace is only logged on the server.
- **Authentication:** an HS256 JWT in an HttpOnly cookie. The claims are `sub` and `ver` (the user's `tokenVersion`), plus issuer and audience. Each request reloads the user, so deactivation, role changes and logout-all apply immediately.
- **Authorization:** permission codes (`src/security/permissions.ts`) are checked in middleware. No role name grants anything on its own; ADMIN passes because it holds every permission.
- **CSRF:** the cookie is SameSite=Strict, and an origin check rejects state-changing requests from foreign origins.
- **Audit:** `recordAudit()` writes inside the caller's transaction where there is one.

### Frontend structure
- Standalone components, signals, OnPush, lazy-loaded routes, Material 3 theme (light/dark follows the OS).
- `AuthService` holds the current user. The session is restored on startup by an app initializer.
- `authGuard` and `guestGuard` protect routes, and `permissionGuard` reads `route.data.permissions`. These checks only shape the UI; the backend re-checks every request.
- `sessionExpiryInterceptor` sends the user back to `/login` when an API call returns 401 mid-session.
- Navigation lists only the modules that are already implemented.

### Layout and shared UI (`frontend/src/app/`)
| Piece | Path | Purpose |
|---|---|---|
| Shell | `layout/shell/` | Sidebar (fixed on desktop, closable overlay on phones/tablets ≤ 959px), top bar, user menu (profile, sign out, sign out everywhere with confirmation), skip link |
| Breadcrumbs | `layout/breadcrumbs/` | Built from `route.data.breadcrumb` along the active route. `breadcrumbLink: false` marks grouping routes that have no page. Hidden on top-level pages |
| Page header | `shared/ui/page-header.ts` | Title, description, projected action buttons |
| Data table | `shared/ui/data-table/` | Generic server-driven table built on MatTable, MatSort and MatPaginator, with loading/empty/error states, `appCell` custom cell templates, keyboard-activatable rows, horizontal scroll and `hideOnMobile` columns. The parent loads data on `pageChange`/`sortChange` |
| Field error | `shared/forms/field-error.ts` | One consistent validation message per control (`required`, `email`, `minlength`, `server`, …) |
| Server errors | `shared/forms/server-errors.ts` | `applyServerErrors(form, apiError)` maps API 422 `details[]` onto form controls |
| Password field | `shared/forms/password-field.ts` | Password input with a show/hide toggle and error message |
| Form actions | `shared/forms/form-actions.ts` | Submit/cancel row; its busy state blocks double submits |
| Confirm dialog | `shared/ui/confirm-dialog.ts` | `ConfirmService.confirm({...})`, used for destructive or far-reaching actions |

### Charts (`frontend/src/app/shared/charts/`)
Plain Angular + HTML/SVG components with no chart library (see DECISIONS D-016). They follow the dataviz method: pick the form first, colour by job in a fixed validated order, thin marks, hairline furniture, hover and keyboard tooltips, and a table view for every chart.

| Component | Form | Used for |
|---|---|---|
| `StatTile` | Label, value and context line. A critical status adds an icon and text | KPI tiles |
| `Meter` | Same-ramp track, `role="meter"` | Digitization progress |
| `SegmentedBar` | Tall segmented bar for a part-to-whole split of ≤ 6 parts. Shares are printed only where they fit, with a legend and table toggle | Available vs issued, old vs new stock |
| `BarList` | Ranked horizontal bars in one hue, each printing its value | Category distribution |
| `ColumnChart` | Monthly columns (≤ 24px, 4px cap, square base), with the maximum labelled and a per-column tooltip | Monthly purchases |
| `LineChart` | Multi-series lines with a snapping crosshair (pointer and arrow keys), end labels only when they don't collide, and **one y-axis** | Monthly issues and returns |

- **Colours:** CSS tokens `--viz-1..4`, plus inks, track and grid, in `src/styles.scss`. They were validated with the dataviz palette validator against the actual card surfaces (`#faf9fd` light, `#121316` dark), and every hard check passes. Light slots 3–4 are below 3:1 contrast, so charts using them print values or offer the table view. Status red is used only together with an icon and text.
- **Layout:** SVG charts measure their real width (`observeWidth`, a ResizeObserver), so text never scales, and month labels thin out on narrow screens.

### Authorization helpers
- **Backend:**
  - `requirePermissions(...)` requires **all** of the given permissions; `requireAnyPermission(...)` requires **any**. Use these for feature access.
  - `requireRole(...)` requires any of the given roles. Use it only for actions inherently tied to a role.
- **Frontend:** `permissionGuard` (`route.data.permissions`), `*appHasPermission`, `AuthService.hasRole()`. These only shape the UI.

## Deployment
Document local development and production deployment separately. Camera access in browsers generally requires HTTPS except localhost. Include backup, restore, migrations, environment configuration, and reverse-proxy guidance.
