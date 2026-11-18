# API Documentation

Use `/api/v1` as the API prefix unless a documented project decision changes it.

## Conventions (implemented)

- JSON bodies (max 1 MB). Every response carries `X-Request-Id` and API responses carry `Cache-Control: no-store`.
- Every error response has this shape:
  ```json
  {
    "error": {
      "code": "VALIDATION_FAILED",
      "message": "Request validation failed",
      "details": [
        { "path": "email", "message": "Enter a valid email address", "code": "invalid_format" }
      ],
      "requestId": "…"
    }
  }
  ```
  | HTTP | code                                  | When                                              |
  | ---- | ------------------------------------- | ------------------------------------------------- |
  | 400  | BAD_REQUEST                           | Malformed JSON                                    |
  | 401  | UNAUTHENTICATED / INVALID_CREDENTIALS | No/invalid/expired session; wrong login           |
  | 403  | FORBIDDEN                             | Missing permission or foreign Origin              |
  | 404  | NOT_FOUND                             | Unknown route/resource                            |
  | 413  | PAYLOAD_TOO_LARGE                     | Body over limit                                   |
  | 422  | VALIDATION_FAILED                     | Schema validation failed (`details` lists fields) |
  | 423  | ACCOUNT_LOCKED                        | Too many failed sign-ins                          |
  | 429  | RATE_LIMITED                          | Login rate limit exceeded                         |
  | 500  | INTERNAL_ERROR                        | Unexpected failure (no internals exposed)         |
- Authentication uses the HttpOnly cookie `dlms_session` (configurable), with `SameSite=Strict` and `Path=/api`. It is `Secure` in production.

## Health (implemented)

| Method | Path            | Auth | Response                                                                                  |
| ------ | --------------- | ---- | ----------------------------------------------------------------------------------------- |
| GET    | `/health/live`  | none | `200 {"status":"ok"}`                                                                     |
| GET    | `/health/ready` | none | `200 {"status":"ok","database":"up"}` or `503 {"status":"unavailable","database":"down"}` |

## Authentication (implemented)

| Method | Path               | Auth               | Body                                                          | Success                                                          |
| ------ | ------------------ | ------------------ | ------------------------------------------------------------- | ---------------------------------------------------------------- |
| POST   | `/auth/login`      | none, rate-limited | `{ "email": string(email, ≤254), "password": string(1–128) }` | `200 { user }` + sets session cookie                             |
| POST   | `/auth/logout`     | optional           | –                                                             | `204`, clears cookie                                             |
| POST   | `/auth/logout-all` | session            | –                                                             | `204`, revokes **all** sessions of the user (bumps tokenVersion) |
| GET    | `/auth/me`         | session            | –                                                             | `200 { user }`                                                   |

`user` = `{ id, email, fullName, roles: string[], permissions: string[], lastLoginAt: ISO|null }`.

### Profile (implemented)

| Method | Path                    | Auth                  | Body / query                                                                       | Success                                                                            |
| ------ | ----------------------- | --------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| PATCH  | `/auth/me`              | session               | `{ "fullName": string(1–120) }`. Whitespace is collapsed; other fields are ignored | `200 { user }`                                                                     |
| POST   | `/auth/change-password` | session, rate-limited | `{ "currentPassword": string, "newPassword": string }`                             | `204`, plus a fresh session cookie                                                 |
| GET    | `/auth/me/activity`     | session               | `?page=1&pageSize=20` (pageSize ≤ 100)                                             | `200 { data: [{ id, action, entityType, entityId, ipAddress, createdAt }], meta }` |

How each endpoint behaves:

- **Email and roles can't be changed through `/auth/me`.** They belong to user administration (Phase 1.5).
- **Password change:**
  - A wrong current password returns `422`, with `details[0].path = "currentPassword"`.
  - A weak or reused new password returns `422` on `newPassword`.
  - On success, **every other session is revoked** (tokenVersion bump), and the current session gets a new cookie.
  - Both outcomes are audited.
- **Activity** lists only the caller's own audit entries, newest first.

## Dashboard (implemented)

Every endpoint requires a session and `dashboard.read`, which all three system roles hold. The definitions of each figure are in BUSINESS_RULES.md § Dashboard metrics.

| Method | Path                             | Extra permission  | Response                                                         |
| ------ | -------------------------------- | ----------------- | ---------------------------------------------------------------- |
| GET    | `/dashboard/summary`             | –                 | Key figures (below)                                              |
| GET    | `/dashboard/charts?months=12`    | –                 | Chart series; `months` 1–36 (default 12)                         |
| GET    | `/dashboard/recent-activities`   | –                 | Activity feed, recent additions, due loans                       |
| PUT    | `/dashboard/digitization-target` | `settings.manage` | Body `{ "registerTotal": int ≥ 0 \| null }` → `{ digitization }` |

`summary`:

```json
{ "generatedAt": "…", "currency": null,
  "titles": { "works": 7, "editions": 8 },
  "copies": { "holdings": 12, "discarded": 1, "available": 5, "issued": 2, "damaged": 1, "missing": 1,
              "oldStock": 7, "newStock": 4, "byStatus": {…}, "byAcquisition": {…} },
  "members": { "total": 4, "active": 3 },
  "loans": { "active": 2, "overdue": 1 },
  "inventoryValue": { "amount": "62.00", "pricedCopies": 4, "unpricedCopies": 8 },
  "digitization": { "registerTotal": 20, "legacyDigitized": 8, "percent": 40, "exceedsRegisterBy": 0,
                    "remaining": 12, "pendingVerification": 1 } }
```

`charts`:

```json
{
  "timeZone": "UTC",
  "availability": { "available": 5, "issued": 2, "reserved": 1, "notLendable": 4 },
  "stockSource": { "oldStock": 7, "newStock": 4, "donated": 1, "other": 0 },
  "categories": [{ "categoryId": "…", "name": "Classic Literature", "copies": 8, "titles": 4 }],
  "monthlyPurchases": [
    { "month": "2026-10", "purchases": 1, "amount": "62.00", "copiesReceived": 4 }
  ],
  "monthlyCirculation": [{ "month": "2026-10", "issued": 1, "returned": 1 }]
}
```

- **Money** amounts are exact decimal strings.
- **Monthly series** always contain every month in the window, with zeros where there was no activity, oldest first.
- **Categories** list the top 7, plus "Other categories (n)" when there are more than 8.

`recent-activities`:

- `activity`: the latest 10 audit entries.
  - Routine `auth.login` and `auth.logout` never appear.
  - Without `audit_logs.read`, all `auth.*` and `user.*` events are hidden.
- `recentAdditions`: the latest 5 holdings.
- `dueLoans`: up to 8 active loans, soonest due first, each with `overdue` and `daysOverdue`.
  - `member` is `null` unless the caller has `members.read`.

## Pagination (convention)

List endpoints take `page` (≥ 1, default 1) and `pageSize` (1–100, default 20), and return:

```json
{ "data": [ … ], "meta": { "page": 1, "pageSize": 20, "total": 57, "totalPages": 3 } }
```

Invalid values return `422 VALIDATION_FAILED`.

How login behaves:

- An unknown email, a wrong password and a deactivated account all return the same `401 INVALID_CREDENTIALS`, and the timing is equalised.
- After `AUTH_MAX_FAILED_LOGINS` consecutive failures (default 5), the account is locked for `AUTH_LOCKOUT_MINUTES` (default 15) and login returns `423`.
- Successful logins, failures, lockouts, logouts and logout-all are written to `audit_logs`.

## Roles (implemented, read-only)

| Method | Path                 | Permission   | Response                                                                                      |
| ------ | -------------------- | ------------ | --------------------------------------------------------------------------------------------- |
| GET    | `/roles`             | `roles.read` | `200 { data: [{ id, code, name, description, isSystem, userCount, permissions: string[] }] }` |
| GET    | `/roles/permissions` | `roles.read` | `200 { data: [{ code, description, group }] }`                                                |

## Authentication (original plan)

- POST `/auth/login`
- POST `/auth/logout`
- GET `/auth/me`

## Dashboard

- GET `/dashboard/summary`
- GET `/dashboard/inventory-distribution`
- GET `/dashboard/recent-activities`
- GET `/dashboard/digitization-progress`

## Search

- GET `/search/books`
- GET `/search/authors`
- GET `/search/copies/:accessionNumber`
- GET `/search/locations`
- GET `/catalogue/online` (explicit external lookup)

## Catalogue

- CRUD `/books`
- GET `/books/:id`
- GET `/books/:id/copies`
- CRUD `/authors`
- GET `/authors/:id/books`
- CRUD `/categories`
- CRUD `/publishers`

## Copies and locations

- CRUD `/copies`
- CRUD `/buildings`, `/floors`, `/rooms`, `/racks`, `/shelves`
- POST `/copies/:id/move`

## Scanner

- POST `/scanner/isbn-lookup` (`scanner.use`; validates and logs ISBN, searches PostgreSQL first, queries external providers only when there is no local edition)
- POST `/scanner/ocr`
- POST `/scanner/confirm-metadata` (`scanner.use` + `catalogue.write`; saves only a reviewed title/edition and logs the scan, never a copy)
- GET `/scanner/logs` (`scanner.use`; caller's own paginated scans)

## Imports

Implemented under `/api/v1/imports` with authenticated, permission-checked requests:

- GET `/template` downloads the XLSX template (`imports.read`).
- POST `/upload` accepts multipart field `file` and stages a batch (`imports.manage`).
- GET `/:id` returns a staged batch and rows (`imports.read`).
- PATCH `/:id/rows/:rowId` corrects and revalidates a row (`imports.manage`).
- GET `/:id/errors.xlsx` downloads validation errors (`imports.read`).
- POST `/:id/confirm` takes `{ "rowIds": ["..."] }`, at most 100 valid rows, and requires `imports.manage`, `catalogue.write`, `copies.write` and `locations.manage`. Confirmation is transactional and retries do not duplicate already-imported rows.

See STOCK_MIGRATION.md for template fields, limits and matching rules.

## Purchases

- CRUD `/suppliers`
- CRUD `/purchases`
- POST `/purchases/:id/receive`

## Members and circulation

- CRUD `/members`
- POST `/loans/issue`
- POST `/loans/:id/return`
- POST `/loans/:id/renew`
- GET `/loans/overdue`
- CRUD `/reservations`

## Audits and reports

- POST `/stock-audits`
- POST `/stock-audits/:id/scans`
- POST `/stock-audits/:id/complete`
- GET `/reports/:reportType`
- GET `/reports/:reportType/export`

All endpoints require documented request/response schemas, authorization, validation, pagination where relevant, and consistent errors. Never expose internal stack traces to clients.

## Catalogue and physical inventory (implemented 2026-11-16)

All paths below are under `/api/v1`. `catalogue.read`/`catalogue.write`, `copies.read`/`copies.write`, `copies.change_status`, and `locations.read` are enforced by the API. Location writes and shelf assignment/movement require `locations.manage`. List endpoints use the standard `page`, `pageSize`, `{ data, meta }` pagination shape.

| Method     | Path                                                                                            | Purpose                                                                                        |
| ---------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| GET        | `/books?search=&categoryId=&authorId=&publisherId=&sort=&page=&pageSize=`                       | Search and page title/work records; includes edition identifiers and copy totals               |
| POST       | `/books`                                                                                        | Create a title with its first edition; duplicate ISBN/title conflicts include existing matches |
| GET        | `/books/:id`                                                                                    | Title details, authors, editions and derived copy counts                                       |
| PUT        | `/books/:id`                                                                                    | Update title metadata and author/category assignments                                          |
| POST       | `/books/:id/editions`                                                                           | Add an edition to an existing title                                                            |
| PUT        | `/editions/:id`                                                                                 | Update edition metadata                                                                        |
| GET        | `/editions/lookup?isbn=`                                                                        | Find local edition matches for an ISBN before adding records                                   |
| POST       | `/editions/:id/cover`                                                                           | Upload one JPEG, PNG or WebP cover (≤ 2 MB, multipart field `cover`)                           |
| GET/DELETE | `/editions/:id/cover`                                                                           | Read or remove the edition cover                                                               |
| POST       | `/editions/:id/copies`                                                                          | Register 1–100 copies under an existing edition                                                |
| GET        | `/copies?search=&bookId=&editionId=&status=&condition=&stock=&shelfId=&page=&pageSize=`         | Search/filter physical copies                                                                  |
| GET        | `/copies/:id`                                                                                   | Copy detail and retained history                                                               |
| PATCH      | `/copies/:id`                                                                                   | Update copy condition/status/source/date/price/shelf/remarks                                   |
| GET        | `/authors?search=&page=&pageSize=`                                                              | Search by normalized name or author number; returns title and copy totals                      |
| POST       | `/authors`                                                                                      | Create author profile; same-name matches require explicit `confirmDuplicateName` confirmation  |
| GET        | `/authors/:id`                                                                                  | Author profile, associated titles/editions and physical-copy totals                            |
| PUT        | `/authors/:id`                                                                                  | Update author number, name, description, nationality and date of birth                         |
| GET/POST   | `/publishers`                                                                                   | Paginated publisher lookup/create                                                              |
| GET/POST   | `/categories`                                                                                   | List or create categories                                                                      |
| GET        | `/locations/shelves`                                                                            | Active shelf options with full location paths                                                  |
| GET        | `/locations/tree`                                                                               | Nested building/floor/room/rack/shelf hierarchy and active copy counts                         |
| POST       | `/locations/:level`                                                                             | Create a building, floor, room, rack or shelf under the required parent                        |
| PATCH      | `/locations/:level/:id`                                                                         | Edit code/name and level-specific fields; parent relationship is immutable                     |
| GET        | `/locations/reports/shelves?search=&page=&pageSize=`                                            | Paginated shelf stock totals by titles, status and old/new stock source                        |
| POST       | `/locations/copies/:id/move`                                                                    | Move or unshelve a physical copy; requires a reason and writes copy history/audit              |
| GET        | `/search?q=&page=&pageSize=&sort=&categoryId=&publisherId=&stockType=&status=&shelfId=&rackId=` | Ranked database search across titles, authors, identifiers, publishers and locations           |
| GET        | `/books/:id/stock?page=&pageSize=`                                                              | Paginated copy-level purchase, shelf, circulation and history details                          |

Copy registration body:

```json
{
  "quantity": 2,
  "accessionMode": "auto",
  "acquisitionType": "LEGACY_OLD_STOCK",
  "acquisitionDate": null,
  "acquisitionPrice": null,
  "condition": "GOOD",
  "status": "AVAILABLE",
  "shelfId": null,
  "remarks": null
}
```

Use `accessionMode: "manual"` with exactly `quantity` unique `accessionNumbers` to preserve existing register numbers. Auto allocation is sequence-backed and transactional. Manual numbers are globally unique; conflicts return `409 DUPLICATE_ACCESSION`. A duplicate ISBN returns `409 DUPLICATE_ISBN` with matching edition IDs so the client can direct the user to register copies, not duplicate the title. A possible title match returns `409 POSSIBLE_DUPLICATE_TITLE`; `confirmNewTitle: true` is accepted only when the librarian confirms a distinct work.

The Angular catalogue screens are documented in [CATALOGUE_AND_INVENTORY.md](CATALOGUE_AND_INVENTORY.md). Author management has dedicated directory, profile and edit screens; publishers and categories currently have lookup/assignment screens and API creation only.

### Author profiles

Author requests accept `authorNumber` (optional, globally unique when supplied), `name` (required), `description` (stored in the existing biography column), optional `nationality`, and optional date-only `dateOfBirth` (`YYYY-MM-DD`, not in the future). The author profile response includes `titles`, `copies`, and `books`; each linked book includes its contributor role, editions and per-edition holding/available counts. Copies exclude archived and discarded stock.

Creating or renaming an author to a normalized name already in use returns `409 POSSIBLE_DUPLICATE_AUTHOR` and candidate IDs/numbers. The UI requires explicit confirmation for a genuinely different person with the same name. Duplicate author numbers return `409 DUPLICATE_AUTHOR_NUMBER`. Both checks run in a transaction; same-name creation is serialized with a PostgreSQL advisory lock. Inline author names supplied while creating a book use the same duplicate-name protection; selecting an existing author ID is preferred.

### Locations and shelf reports

Valid location levels are `buildings`, `floors`, `rooms`, `racks`, and `shelves`. Every non-building creation requires a parent ID from the immediately preceding level; the server checks that parent and database constraints enforce unique codes within each parent. Edit requests do not change parent IDs. Floor `level`, building `address`, and shelf `capacity` are accepted only at their matching level.

Shelf capacity is optional (`null` means unlimited). Capacity is checked transactionally when registering or moving copies; a capacity edit below current active, non-discarded holdings returns `409 SHELF_CAPACITY_TOO_SMALL`. Moving an issued/reserved or discarded copy is rejected. Movement bodies use `{ "shelfId": "<uuid>" | null, "reason": "..." }`; null means unshelved. Shelf reports exclude archived and discarded copies and include titles, available/issued/reserved, and old/new stock counts. Search matches shelf code or name.

The Angular location hierarchy and shelf report are at `/locations`; create/edit forms are `/locations/new?level=...&parentId=...` and `/locations/:level/:id/edit`. Copy movement is at `/locations/move`. The feature uses the existing schema and does not require a migration.

### Advanced library search

`GET /search` requires `catalogue.read` and `copies.read`. `q` searches title/subtitle/description, author name/number, ISBN-10/13, accession, publisher, category, shelf and rack. Search text is case-insensitive; book title and author name use PostgreSQL `websearch_to_tsquery`, `ts_rank_cd` and `pg_trgm` similarity/GIN indexes. Canonical 10- and 13-digit ISBN inputs use equality against indexed ISBN columns; numeric fragments are also supported.

Filters are applied against the same physical copy where relevant: `stockType=old|new`, `status`, `shelfId`, and `rackId`; `categoryId` and `publisherId` filter the bibliographic work/edition. `sort` accepts `relevance` (default), `title`, `-title`, or `newest`. Results return paginated book matches with matching editions and up to 25 copy previews per edition, author profiles with all associated titles, and `exactCopy` when the query exactly matches an accession. `copyCount` and `copiesTruncated` indicate whether additional matching copies are available.

Book details request `/books/:id/stock` for paginated copies including shelf path, acquisition/source and purchase invoice/supplier, the latest 20 loan transactions and renewals, and latest copy-history events. It requires both `catalogue.read` and `copies.read`.

The forward migration `20261116020000_advanced_search_fulltext` adds GIN full-text indexes for book title/subtitle/description, author names and publisher names. Existing GIN trigram indexes cover normalized book titles, author names and publisher names. Search accuracy/performance coverage is in `backend/tests/integration/search.int.test.ts`; its EXPLAIN ANALYZE smoke test expects a text/trigram index and under 5 seconds for the fixture query.

## ISBN camera scanner (implemented 2026-11-17)

`POST /scanner/isbn-lookup` accepts `{ "isbn": "..." }`. Invalid check digits return `{ valid: false }` and create an `INVALID_INPUT` scan log. A valid ISBN is normalized to ISBN-13 and searched against active local editions first; a local hit returns edition/title/authors/holding counts and does not call external providers. Only a local miss triggers parallel Google Books and Open Library lookups with 5-second timeouts. Results include provider and confidence; failed providers are reported without suppressing a successful result from the other provider.

`POST /scanner/confirm-metadata` accepts a provider result plus librarian-corrected title/edition fields. The operation rejects an existing ISBN (`409 DUPLICATE_ISBN`) or possible duplicate title (`409 POSSIBLE_DUPLICATE_TITLE`), stores metadata source/external ID and verification audit, and creates **no physical copy**. On success it returns `bookId`/`editionId`; copy registration remains a separate explicit action through `/editions/:id/copies` (UI link opens the existing accession/price/condition/shelf form).

The mobile Angular scanner is `/scanner/isbn`, protected by `scanner.use`; metadata confirmation additionally requires `catalogue.write`. It uses ZXing browser APIs, requests camera access only after a user action, prefers the rear camera, supports device switching, stops streams on teardown, and offers manual ISBN input when camera access is denied/unsupported or lighting/decoding is poor. Camera scanning requires a secure browser context (HTTPS in deployment; localhost is accepted). No camera frames are sent to the server.
