# Book Catalogue and Physical Inventory

Status: implemented 2026-11-16.

## Record boundaries

- A book is a bibliographic title/work.
- An edition owns ISBN, edition statement, publisher, publication year, language, page count, format and cover image.
- A physical copy belongs to an edition and owns its accession number, acquisition source/date/price, condition, status, shelf and remarks.
- Registering one or more copies always targets an existing edition. It does not create a title or edition.
- ISBN lookup and server-side duplicate checks direct staff to an existing edition when they need to register more copies. A same-title match requires explicit confirmation before creating a distinct work.
- Accession numbers are either retained from manual legacy entry or allocated from the configured sequence inside the copy-creation transaction. PostgreSQL uniqueness remains the final integrity constraint.

## Available screens

- `/catalogue/books`: searchable, paginated title list with author, category, ISBN, edition and holding summaries.
- `/catalogue/books/new`: create a title and its first edition.
- `/catalogue/books/:bookId/edit`: edit title metadata and author/category assignments.
- `/catalogue/books/:bookId`: view title, contributors, editions, copy counts and cover images.
- `/catalogue/books/:bookId/editions/new`: add another edition to a title.
- `/catalogue/editions/:editionId/edit?bookId=:bookId`: edit edition metadata and upload/remove a cover.
- `/catalogue/copies`: searchable, paginated physical-copy list with status and old/new stock filters; accepts `bookId` or `editionId` query filters.
- `/catalogue/editions/:editionId/copies/new?bookId=:bookId`: register copies using generated or manual accession numbers.
- `/catalogue/copies/:copyId`: view and update a copy; history is retained and displayed.
- `/search?q=...`: debounced advanced search across titles, contributors, identifiers, publishers, categories, shelves and racks, with stock/status filters.
- Book details include a paginated copy ledger with per-copy shelf, purchase/invoice, loan/renewal and history details.

All pages call `/api/v1` endpoints. They show loading, empty and request-error states; forms display validation and conflict messages returned by the API. UI permission checks are advisory; backend middleware is authoritative.

## Lookup scope

Authors have dedicated directory, create/edit and profile screens at `/authors`, `/authors/new`, `/authors/:authorId/edit` and `/authors/:authorId`. Search matches author name or author number; profiles show all linked titles, contributor roles, editions, and physical-copy totals. Book records retain multiple authors through the existing ordered many-to-many relationship. A same-name author requires confirmation, while author numbers remain globally unique when supplied. Description uses the existing biography database column; nationality and date of birth are stored in the `authors` table by migration `20261116010000_author_profile_fields`.

Publishers and categories can be searched/listed and assigned in catalogue forms; their dedicated management screens are not part of this delivery. Shelf options come from active locations and preserve the full building/floor/room/rack/shelf path.

## Important policies

- Initial registration allows AVAILABLE, PENDING_VERIFICATION, DAMAGED and UNDER_REPAIR. Issued and reserved states belong to circulation workflows.
- Editing status uses the controlled transition rules; moving into or out of restricted states requires `copies.change_status`.
- Old/New is represented by acquisition type (`LEGACY_OLD_STOCK` / `PURCHASED_NEW`), not by separate title records.
- Covers accept JPEG, PNG or WebP up to 2 MB; image content is detected and stored outside the web root.
- Acquisition dates cannot be future-dated; accession number format and starting sequence remain configurable library settings, not hardcoded policy.

## Verification

Frontend verification is `npm --prefix frontend run build`, `npm --prefix frontend run lint`, and `npm --prefix frontend test`. Backend routes and services predate this UI slice; their database integration tests require configured `backend/.env` credentials and a dedicated test database.
