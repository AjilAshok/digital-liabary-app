# Digital Library User Guide

This guide is for librarians and library staff. It explains the screens currently available in the Digital Library application. Some buttons are visible only to staff who have permission to use them.

## 1. Open and sign in

1. Open the library application's address in your browser. Ask your administrator for the address and your account details.
2. Enter your email address and password, then choose **Sign in**.
3. On a phone, use the menu button at the top left to open the navigation.
4. To sign out, open your account menu at the top right and choose **Sign out**.

The current local test address is [http://127.0.0.1:4202](http://127.0.0.1:4202). It works only on the computer running the application and only while its services are running. Ask your administrator for a suitable secure address when using another device.

**Important:** The current local setup uses a separate temporary test database. Books entered there are test records, not automatically part of your library's permanent database. Ask your administrator to configure a permanent database and backups before entering important records.

## 2. Understand books and copies

- A **book** is the title, author and other shared details.
- An **edition** describes a particular version of the book, including its ISBN when available.
- A **copy** is one physical book on a shelf. Each copy needs its own unique **book number**, also called an **accession number**.
- Each copy can have a different shelf, condition and status. Adding a book's details does not automatically add a physical copy.

## 3. Find a book and its shelf

1. Choose **Search library** from the menu, or **Search books** on the home screen.
2. Enter a full or partial title, author name, author number, ISBN, book number, shelf or rack.
3. Select a result to see the book's details and its copies. The copy information shows its shelf and status when recorded.
4. Use the available filters and page controls to narrow a long list.

You can also choose **Books** to browse titles or **Book copies** to browse individual physical books. A shelf shown as **Unshelved** has not yet been assigned.

## 4. Add a book and its copies

1. Choose **Add a book** on the home screen, or open **Books** and choose **Add book**.
2. Enter the title and any known details. Select an existing author, publisher and category when available. An ISBN is optional for books without one.
3. Choose **Save**. If the application finds the ISBN or title already in the library, review the matching record before continuing. For another copy of the same edition, use the existing record instead of creating a duplicate.
4. On the book details page, find the appropriate edition and choose **Register copies**.
5. Enter the number of copies. Choose **Generate next numbers** or **Enter existing numbers**. If entering numbers manually, provide a different number for each copy.
6. Select the stock source, condition and status. Add a price and shelf when known and permitted.
7. Choose **Register copies**. Check the confirmation and the displayed copy numbers.

Automatic numbering depends on the library's numbering settings. If it is unavailable or reports a conflict, contact your administrator or enter approved existing numbers manually. Never reuse a number already assigned to another copy.

An administrator can open **Administration > Book number settings**, enter a prefix, the next number and the number of digits, then choose **Save settings** and confirm. For example, prefix `lib`, next number `1` and six digits produce `lib000001`. Existing copy numbers are not changed. The displayed example may be skipped if that number is already in use. These settings apply only to the currently connected library database.

## 5. Manage authors

1. Choose **Authors** to search by author name or author number.
2. To add someone, choose **Add author**, enter their name and any known author number, then choose **Save author**.
3. If a similar name appears, check whether it is the same person before choosing to create another record. An author number must not belong to another author.
4. Select an author to see their profile and related books. Select **Edit** on the profile to change available details.

To assign an author to a book, add the author first if needed, then select the author on the book form. A book may have more than one author.

## 6. Manage shelves and move a copy

1. Choose **Shelves & locations**. Locations are arranged as building, floor, room, rack and shelf.
2. If you have permission to manage locations, choose **Add building**, then use the add buttons beside each level to add floors, rooms, racks and shelves.
3. To move a physical book, choose **Move a copy**, find its book number, choose the new shelf and enter the requested reason. Confirm the move.
4. To see the books on a shelf, use the shelf report on the locations page or search the library by shelf or rack.

A shelf must already exist before it can be selected. Some copies, such as issued or discarded books, may not be eligible to move; follow the message on screen.

## 7. Scan an ISBN barcode

1. Choose **Scan a barcode**.
2. Choose **Start camera** and allow camera access. Hold the barcode steady in a well-lit area. On a phone, a secure HTTPS address is generally required; ask your administrator for the correct address.
3. If the camera cannot read the barcode, type the ISBN under **Manual ISBN entry** and choose **Look up ISBN**.
4. If the book is already in the library, review the match and choose **Add another copy** when appropriate.
5. If suggestions from Google Books or Open Library appear, choose **Review and correct**, check the details and confirm. Suggestions are not guaranteed to be correct.
6. Register the physical copy separately, as described in section 4. A lookup or metadata confirmation alone does not add a physical copy.
7. After registering a copy, choose **Scan next book** to return to the scanner. You will need to start the camera again after leaving the scanner page. While staying on the scanner page, **Scan another barcode** resumes reading after a result is reviewed.

If no match appears or a provider is unavailable, choose **Enter book manually** when offered, or use **Books** > **Add book**.

## 8. Read a cover for an older book

1. Choose **Read book cover** from the menu or scanner page.
2. Choose **Take photo** or **Upload**. Use a JPEG, PNG or WebP image up to 8 MB.
3. Adjust the crop if needed, then choose **Extract text and search**.
4. Review the recognized text and any matching books or suggestions. Correct the title, author and other details before confirming.
5. If an existing edition matches, use it for another copy. Otherwise, confirm the reviewed title and edition, then register its physical copy separately.

Cover reading requires an OCR service configured by your administrator. If it is unavailable, the photo is unclear or no result is found, enter the details manually. Do not rely on the suggested text without checking the book.

## 9. Upload books from Excel

1. Choose **Upload Excel**, then **Download template**.
2. Open the template in Excel. Keep the column headings unchanged and use one worksheet. Enter up to 500 rows in an `.xlsx` file no larger than 5 MB.
3. Fill in the required title, book number, old/new type and condition. Enter book numbers, author numbers and ISBNs as text so leading zeroes are kept.
4. Choose the file, then **Upload and review**. Nothing has been added to the library yet.
5. Review the results. Use **Edit** to correct a row, or **Download errors** to save an error report. Resolve duplicate book numbers rather than overwriting existing records.
6. Choose **Import ready books**. Up to 100 ready rows are imported each time; repeat the action for remaining ready rows. Rows needing changes are not imported.
7. Imported copies start as **Pending verification**. Review the actual books and update their status as appropriate through the copy details screen.

| Template heading  | What to enter                                                                       |
| ----------------- | ----------------------------------------------------------------------------------- |
| `title`           | Book name; required                                                                 |
| `authorName`      | Author name, when known                                                             |
| `authorNumber`    | Author number, when known; provide the author name too                              |
| `isbn`            | ISBN, when known                                                                    |
| `accessionNumber` | Unique book number; required                                                        |
| `shelfRack`       | Existing shelf code or full `building / floor / room / rack / shelf` path; optional |
| `price`           | Non-negative price, when known                                                      |
| `oldNew`          | `OLD` or `NEW`; required                                                            |
| `condition`       | `NEW`, `GOOD`, `FAIR`, `POOR` or `DAMAGED`; required                                |

The current template does not import publisher or category. If a title, author or shelf match is ambiguous, review the existing records before importing. Importing and managing shelves require the appropriate staff permissions.

## 10. Common problems

| Problem                      | What to do                                                                                                            |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Cannot sign in               | Check your email and password. If the account is locked or you need a reset, contact your administrator.              |
| A button is missing          | Your account may not have permission for that action. Contact your administrator.                                     |
| Book number already exists   | Find the existing copy and check the number. Use a different approved number for a different copy.                    |
| Camera permission denied     | Allow camera access in your browser settings, or enter the ISBN manually.                                             |
| Book or cover not recognized | Try better lighting or another photo, or enter the details manually.                                                  |
| Excel row needs changes      | Select **Edit**, correct the values and save. Download the error report for a copy of the problems.                   |
| Page cannot load or save     | Check your connection, choose **Try again** where available, and contact your administrator if the problem continues. |

Never send passwords or service keys in messages or support screenshots. For account, database, backup or OCR configuration, ask the person responsible for the system.
