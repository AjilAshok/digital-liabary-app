# Project Requirements

## 1. Goal
Digitize an existing library and provide a reliable system for old and new stock, book discovery, physical copy tracking, and library operations.

## 2. User roles
- **Admin:** users, permissions, settings, all inventory and reports.
- **Librarian:** catalogue, scanning, migration, purchases, members, circulation, reports.
- **Assistant:** limited catalogue and circulation actions according to assigned permissions.

All permissions must be enforced by the backend.

## 3. Dashboard
Show database-backed metrics:
- Unique titles/editions.
- Total physical copies.
- Available, issued, reserved, damaged, missing, under-repair and discarded copies.
- Old and new stock counts.
- Members and overdue loans.
- Inventory value where acquisition prices are known.
- Digitization progress and records awaiting verification.

Include charts, recent activities, pending returns, recent additions, and quick actions.

## 4. Catalogue and copy inventory
Separate bibliographic records from physical copies.
Book metadata: title, subtitle, ISBN, edition, publisher, publication year, language, category, description, cover, metadata source.
Copy metadata: accession number, title/edition reference, acquisition type, acquisition date, price, supplier/purchase reference, condition, status, location, barcode, remarks.

Support multiple authors per title and multiple copies per edition.

## 5. Advanced search
Search by:
- Full and partial title.
- Author name and author number.
- ISBN-10/ISBN-13.
- Accession number.
- Publisher and category.
- Building/floor/room/rack/shelf.
- Copy status and old/new stock filters.

Search results should show title, authors, ISBN, edition, copy counts, availability and locations. Selecting a title opens its full details and copy list. Searching an accession number opens the exact copy record.

Use pagination, sorting, filters, debouncing, indexes and PostgreSQL trigram/full-text search where appropriate.

## 6. Scanning and metadata
Provide ISBN barcode scanning, cover OCR, manual entry, local duplicate detection, external metadata suggestions and scan history. Librarian confirmation is required before saving metadata and registering physical copies.

## 7. Old-stock migration
Support manual entry and Excel import. Import must include upload, template, preview, validation, staging, duplicate checks, correction, confirmation, import history, and error workbook. Reconcile register count, physically found count, digitized count, missing count and pending verification.

## 8. Purchases
Manage suppliers, invoices, purchase headers/items, quantities, unit price, taxes if needed, and received copies. A confirmed purchase creates individual copy records with unique accession numbers.

## 9. Members and circulation
Manage members and configurable member types. Support issue, return, renewal, reservation, overdue, configurable fines, and circulation history. Loan rules must be configurable.

## 10. Locations
Support Building > Floor > Room > Rack > Shelf. Location belongs to each copy. Support shelf-wise lookup and stock audit.

## 11. Reports
Stock register, old/new stock, author-wise, category-wise, publisher-wise, shelf-wise, available, issued, overdue, damaged, missing, purchase, valuation, member, transaction, digitization, and reconciliation reports. Export Excel/PDF.

## 12. Non-functional requirements
Responsive, secure, auditable, maintainable, accessible, performant for large collections, backed up, and tested.
