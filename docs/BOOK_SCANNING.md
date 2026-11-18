# Book Scanning Specification

Status: ISBN barcode scanning and book-cover OCR implemented 2026-11-17.

## Modes

1. ISBN barcode scan.
2. Book-cover OCR.
3. Manual metadata entry.

## ISBN flow

- Request camera permission and show live preview.
- Decode supported EAN-13/ISBN barcode formats.
- Validate and normalize ISBN-10/ISBN-13.
- Search local editions first.
- If found, offer to register another physical copy.
- If not found, optionally query external metadata providers.
- Show source and candidate metadata.
- Librarian verifies and edits metadata.
- Register a physical copy separately with accession number, acquisition type, condition, and location.

Current Angular flow: `/scanner/isbn` uses ZXing to scan or accepts manual ISBN input. Local catalogue lookup happens before Google Books/Open Library. A staff member can edit and explicitly confirm an external title/edition suggestion; this creates only bibliographic metadata. The separate “Register a copy” action opens the existing registration form, where accession number, stock source/purchase price, condition/status, and shelf are entered. No lookup or metadata-confirm action creates physical stock.

While a librarian reviews an ISBN result, the camera preview remains active and barcode recognition is paused to prevent repeat lookups. **Scan another barcode** clears the current result and resumes recognition. Leaving the scanner for copy registration stops the camera; after successful registration, **Scan next book** returns to the chosen scanner and the camera must be started again. Camera access requires browser permission and HTTPS except on localhost.

The implemented APIs are `POST /api/v1/scanner/isbn-lookup`, `POST /api/v1/scanner/confirm-metadata`, and `GET /api/v1/scanner/logs`. Lookup calls external providers only on a local miss, uses bounded 5-second requests, and logs outcomes in `scan_logs`.

## OCR flow

- `/scanner/cover` accepts mobile camera capture or file upload (JPEG, PNG or WebP, maximum 8 MB). The backend checks the image signature, keeps the upload in memory, and does not retain the image.
- Adjust the crop rectangle before analysis. The browser sends the cropped image; the page previews the exact crop sent to OCR.
- The configurable `OcrProvider` adapter currently supports Google Cloud Vision. Set `OCR_PROVIDER=google-vision` and configure `GOOGLE_CLOUD_VISION_API_KEY` on the backend, or set `OCR_PROVIDER=disabled` to turn OCR off. The key must never be exposed to Angular.
- Extracted text is heuristically presented as title, author and publisher candidates. OCR confidence and raw recognized text remain visible for librarian review.
- Search the internal catalogue first. Google Books and Open Library text searches run only when no local title or author matches; each external suggestion identifies its provider and candidate confidence. Partial provider failures are reported without discarding successful results.
- Corrected metadata is saved only after explicit confirmation. Duplicate ISBN/title checks still apply. Confirmation creates a bibliographic title/edition and audit/scan history, never a physical copy.
- From the success state, staff with copy-registration permission can open the separate copy-registration workflow. Add Book and ISBN scanning also link to cover OCR.

## Fallbacks

- Camera unavailable/permission denied.
- Unsupported browser or insecure non-local origin.
- Provider/network failure or partial provider availability.
- Invalid ISBN check digit.
- ISBN absent or unreadable.
- OCR low confidence.
- No external match.
- Network unavailable.
  OCR errors can be retried with a different crop/image; corrected metadata can be entered manually after successful extraction. When OCR is disabled or not configured, enter metadata through Add Book.

## Duplicate rules

- ISBN match is a possible edition match, not proof of identical physical copy.
- Never create a copy automatically from a metadata lookup.
- Never create duplicate title/edition records without a confirmation/merge workflow.
- Every copy requires its own unique accession number.

## Privacy and security

- Explain image processing and storage.
- Do not retain cover images unnecessarily.
- Restrict image upload type and size.
- Keep external API credentials server-side.
- Camera use in deployed browsers requires a secure context (HTTPS).
