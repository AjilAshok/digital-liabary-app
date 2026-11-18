# Old Stock Digitization and Migration

## Current Excel workflow

- Open **Upload Excel**, download the template and upload a single `.xlsx` worksheet (up to 5 MiB and 500 data rows). The template header must remain unchanged.
- Columns are `title`, `authorName`, `authorNumber`, `isbn`, `accessionNumber`, `shelfRack`, `price`, `oldNew`, and `condition`. Title, book number, old/new and condition are required; identifiers must be entered as text to preserve leading zeroes. Enter `OLD` or `NEW`, and `NEW`, `GOOD`, `FAIR`, `POOR` or `DAMAGED` for condition.
- A shelf must identify one existing active shelf. If its code is ambiguous, use the complete `building / floor / room / rack / shelf` path. Do not invent locations. Missing optional fields may be left blank.
- Each upload is staged as an import batch. Duplicate book numbers, invalid values and ambiguous catalogue matches are shown before confirmation; correct rows in the review screen or download an error workbook. Existing records are never silently overwritten.
- Only ready rows are imported, at most 100 per confirmation. Imported copies start in `PENDING_VERIFICATION` and have individual copy-history and audit records. Confirm again to import the next group when more than 100 rows are ready.
- Upload and preview require `imports.manage` and `imports.read`; confirmation also requires catalogue write, copy write and location management permissions. Batch records remain in the database, but a batch-history screen is not yet available.
- Import matching is conservative: an existing edition is reused only for an unambiguous ISBN match with consistent details. Ambiguous titles, authors or shelves require catalogue review rather than automatic merging. Publisher and category columns are not yet supported.
- Verified against a separately created PostgreSQL database using `backend/scripts/verify-import.ts`; concurrent imports and large-batch performance still require further integration testing.

## Goals
Digitize existing register data and reconcile digital records against physical books.

## Input channels
- Excel template import.
- Manual entry.
- ISBN barcode scanning.
- Cover OCR.

## Suggested Excel columns
AccessionNumber, Title, AuthorNumber, AuthorName, ISBN, Publisher, Edition, Category, Language, PurchaseDate, PurchasePrice, AcquisitionType, Building, Floor, Room, Rack, Shelf, Condition, Status, Remarks.

Legacy records may have missing or inconsistent fields. Define which fields are mandatory for a given import profile and allow controlled pending-verification records.

## Import pipeline
1. Upload and validate file type/size.
2. Read workbook safely.
3. Preview rows and column mapping.
4. Validate formats and required fields.
5. Detect duplicate accession numbers.
6. Identify likely duplicate titles/editions for human review.
7. Validate author and location references.
8. Stage rows in ImportBatch/ImportRow.
9. Allow correction or row exclusion.
10. Confirm import in safe batches/transactions.
11. Record results and downloadable errors.
12. Never silently overwrite existing records.

## Reconciliation
Track:
- Register total.
- Physically found total.
- Digitized total.
- Pending verification.
- Missing.
- Unexpected/unregistered physical copies.

Missing status should require review/approval; absence from one scanning session must not automatically mark a copy missing.
