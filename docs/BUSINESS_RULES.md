# Business Rules and Decisions

## Identifiers
- Book ID: internal bibliographic identifier.
- Edition ID: internal edition identifier if editions are separate.
- ISBN: external edition identifier, optional for older books.
- Author number: library-defined author identifier.
- Accession number: unique identifier for each physical copy.
- Barcode: encodes the accession number, not ISBN, for circulation and stock audit.

## Stock
- A title/edition is not a physical stock unit.
- Each copy has exactly one current status.
- Each copy has its own location and condition.
- Old/new describes acquisition classification.
- Stock counts are derived from copies, not manually maintained counters.

## Search
- Search local catalogue first.
- Exact accession search resolves one copy.
- Author search resolves author profile and linked editions.
- External catalogue is a separate lookup action and does not count as local stock.

## Circulation
- Only eligible AVAILABLE copies can be issued.
- Prevent concurrent issue of the same copy.
- Return closes the active loan and updates copy status based on condition.
- Loan period, renewals, fines, grace period and borrowing limits are configurable.
- Preserve all historical transactions.

## Purchases
- Purchase records and received copies are separate but linked.
- Do not add copies before receipt/verification if the library process requires receiving.
- Preserve unit acquisition price per copy when possible.

## Configurable defaults (documented; change via environment or database)
These are **development defaults**, not library policy. Confirm them with the library before production.

| Setting | Default | Where |
|---|---|---|
| Session lifetime | 480 min (8 h) | `JWT_EXPIRES_IN_MINUTES` |
| Failed sign-ins before lockout | 5 | `AUTH_MAX_FAILED_LOGINS` |
| Lockout duration | 15 min | `AUTH_LOCKOUT_MINUTES` |
| Login attempts per IP | 20 per 15 min | `LOGIN_RATE_LIMIT_MAX` / `_WINDOW_MINUTES` |
| Password policy (when passwords are set) | ≥ 10 chars, 3 of 4 classes (lower/upper/digit/symbol), ≤ 128 | `backend/src/lib/password.ts` |
| Role → permission defaults | ADMIN = all; LIBRARIAN = all except users.manage, roles.manage, settings.manage, audit_logs.read; ASSISTANT = dashboard/catalogue/copies/locations read, scanner, members read, issue/return, renew, reservations | `backend/src/security/permissions.ts`; editable in DB, and re-seeding never removes permissions an admin granted |
| Loan period, renewals, grace, fine/day, borrowing limit, hold days | **No default.** Defined per `MemberType` when members are set up (Phase 7) | `member_types` |
| Accession number format | No universal default; an administrator configures the prefix, next number and padding using Book number settings | `number_sequences` |
| Author-number format | **Not yet defined.** Manual entry until the library chooses a scheme | Phase 2 setting |

## Dashboard metrics
These definitions are implemented in `backend/src/modules/dashboard/dashboard.calculations.ts`, where each one has unit tests, and checked against real PostgreSQL by `tests/integration/dashboard.int.test.ts`.

| Metric | Definition |
|---|---|
| Book titles | Works (`books`) not archived. Editions are reported alongside |
| **Holdings / physical copies** | Copies **not archived and not DISCARDED**. All copy figures below count holdings only |
| Discarded | Copies with status DISCARDED, archived or not. Shown separately, never in holdings or value |
| Available / issued / reserved / damaged / missing | Holdings by `status` |
| Not lendable | DAMAGED + MISSING + UNDER_REPAIR + PENDING_VERIFICATION |
| Old stock / new stock | Holdings with `acquisitionType` LEGACY_OLD_STOCK / PURCHASED_NEW. Donated, transferred and other are reported separately |
| Members | Members whose status is not ARCHIVED. "Active" counts status ACTIVE |
| Overdue books | Loans with status ACTIVE and `dueAt` before now. The grace period affects fines only, not overdue status |
| Inventory value | Exact sum of `acquisitionPrice` over holdings. Copies with no price are **counted and reported, never estimated**. Currency comes from the optional `library.currency` setting (ISO code); without it, values show as plain numbers |
| Digitization progress | Legacy copies digitized (every LEGACY_OLD_STOCK copy, including later-discarded ones) ÷ `digitization.registerTotal`, the number of items in the physical accession register, which an administrator enters. **Without a register total, no percentage is shown.** The value is capped at 100%, and any surplus is reported as "beyond the register total" for review |
| Category distribution | Holdings per book category (leaf category, not rolled up), with "Uncategorised" for books without one. Top 7 plus "Other categories" |
| Monthly purchases | Purchases with status RECEIVED or PARTIALLY_RECEIVED, by invoice month (falling back to received or created date), with their total amounts. Copies received are PURCHASED_NEW copies by acquisition month (falling back to registration date). Drafts and cancelled purchases are excluded |
| Monthly issues / returns | Loans by the month of `issuedAt`, and by the month of `returnedAt` |
| Month boundaries | Calendar months in the optional `library.timeZone` setting (IANA name). The default is **UTC**, and an invalid name falls back to UTC |

## Deletion and audit
- Prefer archive/soft delete for catalogue records.
- Do not hard-delete loan, purchase, import, audit or financial history.
- Log important changes with user, timestamp, entity, action and relevant before/after data.
