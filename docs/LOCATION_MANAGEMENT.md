# Shelf and Location Management

Status: implemented 2026-11-16. The existing PostgreSQL hierarchy and copy-history tables are reused; no schema migration is required.

## Hierarchy

`Building > Floor > Room > Rack > Shelf`. Each child has one immutable parent, and codes are unique within their parent. Building codes are globally unique. Parent existence and level are checked by the API. Editing may change code/name and level-specific fields, but does not reparent a record.

## Screens

- `/locations`: nested location hierarchy and paginated shelf-wise report.
- `/locations/new?level=buildings`: create a building; child levels use the same route with `parentId`.
- `/locations/:level/:locationId/edit`: edit a location while preserving its parent.
- `/locations/move`: find a physical copy by accession number and move it to an active shelf or leave it unshelved.
- The report links to the catalogue copy list filtered to the selected shelf.

The hierarchy page displays shelf capacity and current holdings. The report supports shelf-code/name search and reports title/copy totals, available, issued, reserved, and old/new stock counts.

## Copy location rules

- Shelf assignment is per physical copy; a title or edition is never assigned directly to a shelf.
- Assigning or moving copies requires `locations.manage`; viewing hierarchy and reports requires `locations.read`.
- A configured shelf capacity is enforced while registering and moving copies, with a row lock preventing concurrent overfill. A shelf capacity cannot be reduced below its current active, non-discarded stock. Null capacity means unlimited.
- A copy cannot be moved while issued/reserved or after it is discarded. Every move stores from/to shelf, reason, actor and timestamp in `copy_history`, and writes an audit event.
- Shelf reports omit archived and discarded copies. Copy search/list remains available through `/api/v1/copies?shelfId=...`.

## API

The API paths, request shape and status codes are documented in [API_DOCUMENTATION.md](API_DOCUMENTATION.md) under “Locations and shelf reports”. All writes are authorized server-side; hiding controls in Angular is only a usability measure.
