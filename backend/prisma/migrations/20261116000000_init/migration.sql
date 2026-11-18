-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateEnum
CREATE TYPE "CopyStatus" AS ENUM ('AVAILABLE', 'ISSUED', 'RESERVED', 'DAMAGED', 'MISSING', 'UNDER_REPAIR', 'DISCARDED', 'PENDING_VERIFICATION');

-- CreateEnum
CREATE TYPE "CopyCondition" AS ENUM ('NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED');

-- CreateEnum
CREATE TYPE "AcquisitionType" AS ENUM ('LEGACY_OLD_STOCK', 'PURCHASED_NEW', 'DONATED', 'TRANSFERRED', 'OTHER');

-- CreateEnum
CREATE TYPE "ContributorRole" AS ENUM ('AUTHOR', 'EDITOR', 'TRANSLATOR', 'ILLUSTRATOR', 'COMPILER');

-- CreateEnum
CREATE TYPE "MetadataSource" AS ENUM ('MANUAL', 'IMPORT', 'GOOGLE_BOOKS', 'OPEN_LIBRARY', 'OCR_ASSISTED');

-- CreateEnum
CREATE TYPE "CopyEventType" AS ENUM ('CREATED', 'STATUS_CHANGED', 'CONDITION_CHANGED', 'MOVED', 'DETAILS_UPDATED');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'EXPIRED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('ACTIVE', 'RETURNED', 'LOST');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'READY_FOR_PICKUP', 'FULFILLED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "FineStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'WAIVED');

-- CreateEnum
CREATE TYPE "FinePaymentKind" AS ENUM ('PAYMENT', 'WAIVER');

-- CreateEnum
CREATE TYPE "ScanMode" AS ENUM ('ISBN_BARCODE', 'ACCESSION_BARCODE', 'COVER_OCR', 'MANUAL');

-- CreateEnum
CREATE TYPE "ScanOutcome" AS ENUM ('LOCAL_MATCH', 'EXTERNAL_MATCH', 'NO_MATCH', 'INVALID_INPUT', 'ERROR');

-- CreateEnum
CREATE TYPE "ImportBatchStatus" AS ENUM ('UPLOADED', 'VALIDATED', 'CONFIRMING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ImportRowStatus" AS ENUM ('PENDING', 'VALID', 'INVALID', 'DUPLICATE', 'EXCLUDED', 'IMPORTED', 'FAILED');

-- CreateEnum
CREATE TYPE "StockAuditScope" AS ENUM ('LIBRARY', 'BUILDING', 'FLOOR', 'ROOM', 'RACK', 'SHELF');

-- CreateEnum
CREATE TYPE "StockAuditStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StockAuditResult" AS ENUM ('FOUND', 'MISPLACED', 'UNEXPECTED', 'UNKNOWN_BARCODE');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "group" TEXT NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "roleId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" UUID,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "number_sequences" (
    "key" TEXT NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT '',
    "nextValue" INTEGER NOT NULL DEFAULT 1,
    "padding" INTEGER NOT NULL DEFAULT 6,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "number_sequences_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "authors" (
    "id" UUID NOT NULL,
    "authorNumber" TEXT,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "sortName" TEXT,
    "biography" TEXT,
    "birthYear" INTEGER,
    "deathYear" INTEGER,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "authors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publishers" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "place" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "publishers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "code" TEXT,
    "parentId" UUID,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "books" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "normalizedTitle" TEXT NOT NULL,
    "description" TEXT,
    "originalLanguage" TEXT,
    "categoryId" UUID,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "books_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_authors" (
    "bookId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "role" "ContributorRole" NOT NULL DEFAULT 'AUTHOR',
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "book_authors_pkey" PRIMARY KEY ("bookId","authorId","role")
);

-- CreateTable
CREATE TABLE "book_editions" (
    "id" UUID NOT NULL,
    "bookId" UUID NOT NULL,
    "isbn13" TEXT,
    "isbn10" TEXT,
    "editionStatement" TEXT,
    "publisherId" UUID,
    "publicationYear" INTEGER,
    "language" TEXT,
    "pageCount" INTEGER,
    "format" TEXT,
    "coverImageKey" TEXT,
    "metadataSource" "MetadataSource" NOT NULL DEFAULT 'MANUAL',
    "externalSourceId" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" UUID,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "book_editions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buildings" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "buildings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "floors" (
    "id" UUID NOT NULL,
    "buildingId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "floors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" UUID NOT NULL,
    "floorId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "racks" (
    "id" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "racks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shelves" (
    "id" UUID NOT NULL,
    "rackId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT,
    "capacity" INTEGER,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shelves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_copies" (
    "id" UUID NOT NULL,
    "accessionNumber" TEXT NOT NULL,
    "barcode" TEXT,
    "editionId" UUID NOT NULL,
    "acquisitionType" "AcquisitionType" NOT NULL,
    "acquisitionDate" DATE,
    "acquisitionPrice" DECIMAL(12,2),
    "supplierId" UUID,
    "purchaseItemId" UUID,
    "condition" "CopyCondition" NOT NULL DEFAULT 'GOOD',
    "status" "CopyStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "shelfId" UUID,
    "remarks" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "book_copies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "copy_history" (
    "id" UUID NOT NULL,
    "copyId" UUID NOT NULL,
    "eventType" "CopyEventType" NOT NULL,
    "fromStatus" "CopyStatus",
    "toStatus" "CopyStatus",
    "fromCondition" "CopyCondition",
    "toCondition" "CopyCondition",
    "fromShelfId" UUID,
    "toShelfId" UUID,
    "reason" TEXT,
    "changedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "copy_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "taxId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchases" (
    "id" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "invoiceNumber" TEXT,
    "invoiceDate" DATE,
    "orderDate" DATE,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'DRAFT',
    "subtotal" DECIMAL(12,2),
    "taxTotal" DECIMAL(12,2),
    "totalAmount" DECIMAL(12,2),
    "invoiceFileKey" TEXT,
    "notes" TEXT,
    "createdById" UUID NOT NULL,
    "receivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_items" (
    "id" UUID NOT NULL,
    "purchaseId" UUID NOT NULL,
    "editionId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "receivedQuantity" INTEGER NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "taxRate" DECIMAL(5,2),
    "discountAmount" DECIMAL(12,2),
    "lineTotal" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_types" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "maxActiveLoans" INTEGER NOT NULL,
    "loanPeriodDays" INTEGER NOT NULL,
    "maxRenewals" INTEGER NOT NULL,
    "gracePeriodDays" INTEGER NOT NULL DEFAULT 0,
    "finePerDay" DECIMAL(12,2) NOT NULL,
    "maxUnpaidFines" DECIMAL(12,2),
    "reservationHoldDays" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "members" (
    "id" UUID NOT NULL,
    "membershipNumber" TEXT NOT NULL,
    "memberTypeId" UUID NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "status" "MemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loans" (
    "id" UUID NOT NULL,
    "copyId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "status" "LoanStatus" NOT NULL DEFAULT 'ACTIVE',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "returnedAt" TIMESTAMP(3),
    "renewalCount" INTEGER NOT NULL DEFAULT 0,
    "returnCondition" "CopyCondition",
    "issuedById" UUID NOT NULL,
    "returnedById" UUID,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_renewals" (
    "id" UUID NOT NULL,
    "loanId" UUID NOT NULL,
    "previousDueAt" TIMESTAMP(3) NOT NULL,
    "newDueAt" TIMESTAMP(3) NOT NULL,
    "renewedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loan_renewals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" UUID NOT NULL,
    "editionId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'PENDING',
    "assignedCopyId" UUID,
    "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readyAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "fulfilledAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fines" (
    "id" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "loanId" UUID,
    "amount" DECIMAL(12,2) NOT NULL,
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "status" "FineStatus" NOT NULL DEFAULT 'UNPAID',
    "assessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fine_payments" (
    "id" UUID NOT NULL,
    "fineId" UUID NOT NULL,
    "kind" "FinePaymentKind" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "recordedById" UUID NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fine_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_logs" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "mode" "ScanMode" NOT NULL,
    "rawValue" TEXT,
    "normalizedIsbn" TEXT,
    "outcome" "ScanOutcome" NOT NULL,
    "editionId" UUID,
    "provider" TEXT,
    "confidence" DOUBLE PRECISION,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scan_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" UUID NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "fileSha256" TEXT NOT NULL,
    "profile" TEXT NOT NULL,
    "status" "ImportBatchStatus" NOT NULL DEFAULT 'UPLOADED',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "validRows" INTEGER NOT NULL DEFAULT 0,
    "invalidRows" INTEGER NOT NULL DEFAULT 0,
    "duplicateRows" INTEGER NOT NULL DEFAULT 0,
    "importedRows" INTEGER NOT NULL DEFAULT 0,
    "createdById" UUID NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "summary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_rows" (
    "id" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "rawData" JSONB NOT NULL,
    "normalizedData" JSONB,
    "status" "ImportRowStatus" NOT NULL DEFAULT 'PENDING',
    "errors" JSONB,
    "warnings" JSONB,
    "duplicateOfCopyId" UUID,
    "createdCopyId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_audits" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "scopeType" "StockAuditScope" NOT NULL,
    "scopeId" UUID,
    "status" "StockAuditStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedById" UUID NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedById" UUID,
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "summary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_audit_items" (
    "id" UUID NOT NULL,
    "auditId" UUID NOT NULL,
    "copyId" UUID,
    "scannedValue" TEXT NOT NULL,
    "result" "StockAuditResult" NOT NULL,
    "expectedShelfId" UUID,
    "foundShelfId" UUID,
    "scannedById" UUID NOT NULL,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "stock_audit_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "user_roles_roleId_idx" ON "user_roles"("roleId");

-- CreateIndex
CREATE INDEX "role_permissions_permissionId_idx" ON "role_permissions"("permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "authors_authorNumber_key" ON "authors"("authorNumber");

-- CreateIndex
CREATE INDEX "authors_normalizedName_idx" ON "authors"("normalizedName");

-- CreateIndex
CREATE INDEX "authors_normalizedName_trgm_idx" ON "authors" USING GIN ("normalizedName" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "publishers_normalizedName_key" ON "publishers"("normalizedName");

-- CreateIndex
CREATE INDEX "publishers_normalizedName_trgm_idx" ON "publishers" USING GIN ("normalizedName" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "categories_normalizedName_key" ON "categories"("normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "categories_code_key" ON "categories"("code");

-- CreateIndex
CREATE INDEX "categories_parentId_idx" ON "categories"("parentId");

-- CreateIndex
CREATE INDEX "books_normalizedTitle_idx" ON "books"("normalizedTitle");

-- CreateIndex
CREATE INDEX "books_normalizedTitle_trgm_idx" ON "books" USING GIN ("normalizedTitle" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "books_categoryId_idx" ON "books"("categoryId");

-- CreateIndex
CREATE INDEX "book_authors_authorId_idx" ON "book_authors"("authorId");

-- CreateIndex
CREATE INDEX "book_editions_bookId_idx" ON "book_editions"("bookId");

-- CreateIndex
CREATE INDEX "book_editions_isbn13_idx" ON "book_editions"("isbn13");

-- CreateIndex
CREATE INDEX "book_editions_isbn10_idx" ON "book_editions"("isbn10");

-- CreateIndex
CREATE INDEX "book_editions_publisherId_idx" ON "book_editions"("publisherId");

-- CreateIndex
CREATE UNIQUE INDEX "buildings_code_key" ON "buildings"("code");

-- CreateIndex
CREATE UNIQUE INDEX "floors_buildingId_code_key" ON "floors"("buildingId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_floorId_code_key" ON "rooms"("floorId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "racks_roomId_code_key" ON "racks"("roomId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "shelves_rackId_code_key" ON "shelves"("rackId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "book_copies_accessionNumber_key" ON "book_copies"("accessionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "book_copies_barcode_key" ON "book_copies"("barcode");

-- CreateIndex
CREATE INDEX "book_copies_editionId_status_idx" ON "book_copies"("editionId", "status");

-- CreateIndex
CREATE INDEX "book_copies_status_idx" ON "book_copies"("status");

-- CreateIndex
CREATE INDEX "book_copies_shelfId_idx" ON "book_copies"("shelfId");

-- CreateIndex
CREATE INDEX "book_copies_acquisitionType_idx" ON "book_copies"("acquisitionType");

-- CreateIndex
CREATE INDEX "book_copies_purchaseItemId_idx" ON "book_copies"("purchaseItemId");

-- CreateIndex
CREATE INDEX "copy_history_copyId_createdAt_idx" ON "copy_history"("copyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_normalizedName_key" ON "suppliers"("normalizedName");

-- CreateIndex
CREATE INDEX "purchases_status_idx" ON "purchases"("status");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_supplierId_invoiceNumber_key" ON "purchases"("supplierId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "purchase_items_purchaseId_idx" ON "purchase_items"("purchaseId");

-- CreateIndex
CREATE INDEX "purchase_items_editionId_idx" ON "purchase_items"("editionId");

-- CreateIndex
CREATE UNIQUE INDEX "member_types_code_key" ON "member_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "members_membershipNumber_key" ON "members"("membershipNumber");

-- CreateIndex
CREATE INDEX "members_fullName_idx" ON "members"("fullName");

-- CreateIndex
CREATE INDEX "members_fullName_trgm_idx" ON "members" USING GIN ("fullName" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "members_email_idx" ON "members"("email");

-- CreateIndex
CREATE INDEX "members_phone_idx" ON "members"("phone");

-- CreateIndex
CREATE INDEX "members_status_idx" ON "members"("status");

-- CreateIndex
CREATE INDEX "loans_copyId_idx" ON "loans"("copyId");

-- CreateIndex
CREATE INDEX "loans_memberId_status_idx" ON "loans"("memberId", "status");

-- CreateIndex
CREATE INDEX "loans_status_dueAt_idx" ON "loans"("status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "loans_one_active_per_copy_key" ON "loans"("copyId") WHERE (status = 'ACTIVE');

-- CreateIndex
CREATE INDEX "loan_renewals_loanId_idx" ON "loan_renewals"("loanId");

-- CreateIndex
CREATE INDEX "reservations_editionId_status_reservedAt_idx" ON "reservations"("editionId", "status", "reservedAt");

-- CreateIndex
CREATE INDEX "reservations_memberId_status_idx" ON "reservations"("memberId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_one_open_per_member_edition_key" ON "reservations"("memberId", "editionId") WHERE (status IN ('PENDING', 'READY_FOR_PICKUP'));

-- CreateIndex
CREATE UNIQUE INDEX "reservations_one_hold_per_copy_key" ON "reservations"("assignedCopyId") WHERE (status = 'READY_FOR_PICKUP');

-- CreateIndex
CREATE INDEX "fines_memberId_status_idx" ON "fines"("memberId", "status");

-- CreateIndex
CREATE INDEX "fines_loanId_idx" ON "fines"("loanId");

-- CreateIndex
CREATE INDEX "fine_payments_fineId_idx" ON "fine_payments"("fineId");

-- CreateIndex
CREATE INDEX "fine_payments_recordedAt_idx" ON "fine_payments"("recordedAt");

-- CreateIndex
CREATE INDEX "scan_logs_userId_createdAt_idx" ON "scan_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "scan_logs_normalizedIsbn_idx" ON "scan_logs"("normalizedIsbn");

-- CreateIndex
CREATE INDEX "import_batches_createdAt_idx" ON "import_batches"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "import_rows_createdCopyId_key" ON "import_rows"("createdCopyId");

-- CreateIndex
CREATE INDEX "import_rows_batchId_status_idx" ON "import_rows"("batchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "import_rows_batchId_rowNumber_key" ON "import_rows"("batchId", "rowNumber");

-- CreateIndex
CREATE INDEX "stock_audits_status_idx" ON "stock_audits"("status");

-- CreateIndex
CREATE INDEX "stock_audit_items_auditId_result_idx" ON "stock_audit_items"("auditId", "result");

-- CreateIndex
CREATE UNIQUE INDEX "stock_audit_items_auditId_copyId_key" ON "stock_audit_items"("auditId", "copyId");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_createdAt_idx" ON "audit_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings" ADD CONSTRAINT "settings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "books" ADD CONSTRAINT "books_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_authors" ADD CONSTRAINT "book_authors_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_authors" ADD CONSTRAINT "book_authors_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "authors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_editions" ADD CONSTRAINT "book_editions_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_editions" ADD CONSTRAINT "book_editions_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "publishers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_editions" ADD CONSTRAINT "book_editions_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "floors" ADD CONSTRAINT "floors_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "floors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "racks" ADD CONSTRAINT "racks_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shelves" ADD CONSTRAINT "shelves_rackId_fkey" FOREIGN KEY ("rackId") REFERENCES "racks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_copies" ADD CONSTRAINT "book_copies_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "book_editions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_copies" ADD CONSTRAINT "book_copies_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_copies" ADD CONSTRAINT "book_copies_purchaseItemId_fkey" FOREIGN KEY ("purchaseItemId") REFERENCES "purchase_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_copies" ADD CONSTRAINT "book_copies_shelfId_fkey" FOREIGN KEY ("shelfId") REFERENCES "shelves"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "copy_history" ADD CONSTRAINT "copy_history_copyId_fkey" FOREIGN KEY ("copyId") REFERENCES "book_copies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "copy_history" ADD CONSTRAINT "copy_history_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "copy_history" ADD CONSTRAINT "copy_history_fromShelfId_fkey" FOREIGN KEY ("fromShelfId") REFERENCES "shelves"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "copy_history" ADD CONSTRAINT "copy_history_toShelfId_fkey" FOREIGN KEY ("toShelfId") REFERENCES "shelves"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "book_editions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_memberTypeId_fkey" FOREIGN KEY ("memberTypeId") REFERENCES "member_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_copyId_fkey" FOREIGN KEY ("copyId") REFERENCES "book_copies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_returnedById_fkey" FOREIGN KEY ("returnedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_renewals" ADD CONSTRAINT "loan_renewals_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "loans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_renewals" ADD CONSTRAINT "loan_renewals_renewedById_fkey" FOREIGN KEY ("renewedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "book_editions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_assignedCopyId_fkey" FOREIGN KEY ("assignedCopyId") REFERENCES "book_copies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fines" ADD CONSTRAINT "fines_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fines" ADD CONSTRAINT "fines_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "loans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fine_payments" ADD CONSTRAINT "fine_payments_fineId_fkey" FOREIGN KEY ("fineId") REFERENCES "fines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fine_payments" ADD CONSTRAINT "fine_payments_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_logs" ADD CONSTRAINT "scan_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_logs" ADD CONSTRAINT "scan_logs_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "book_editions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "import_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_createdCopyId_fkey" FOREIGN KEY ("createdCopyId") REFERENCES "book_copies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_duplicateOfCopyId_fkey" FOREIGN KEY ("duplicateOfCopyId") REFERENCES "book_copies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_audits" ADD CONSTRAINT "stock_audits_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_audits" ADD CONSTRAINT "stock_audits_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_audit_items" ADD CONSTRAINT "stock_audit_items_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "stock_audits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_audit_items" ADD CONSTRAINT "stock_audit_items_copyId_fkey" FOREIGN KEY ("copyId") REFERENCES "book_copies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_audit_items" ADD CONSTRAINT "stock_audit_items_scannedById_fkey" FOREIGN KEY ("scannedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_audit_items" ADD CONSTRAINT "stock_audit_items_expectedShelfId_fkey" FOREIGN KEY ("expectedShelfId") REFERENCES "shelves"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_audit_items" ADD CONSTRAINT "stock_audit_items_foundShelfId_fkey" FOREIGN KEY ("foundShelfId") REFERENCES "shelves"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =============================================================================
-- Reviewed integrity rules the Prisma schema language cannot express.
-- Prisma does not manage CHECK constraints, so later migrations leave them intact.
-- =============================================================================

-- Identifiers must not be blank.
ALTER TABLE "book_copies" ADD CONSTRAINT "book_copies_identifiers_chk"
  CHECK (btrim("accessionNumber") <> '' AND ("barcode" IS NULL OR btrim("barcode") <> ''));
ALTER TABLE "authors" ADD CONSTRAINT "authors_author_number_chk"
  CHECK ("authorNumber" IS NULL OR btrim("authorNumber") <> '');
ALTER TABLE "members" ADD CONSTRAINT "members_number_chk"
  CHECK (btrim("membershipNumber") <> '');

-- ISBNs are stored normalised: 13 digits starting 978/979; ISBN-10 as 9 digits + digit or X.
ALTER TABLE "book_editions" ADD CONSTRAINT "book_editions_isbn_format_chk"
  CHECK (("isbn13" IS NULL OR "isbn13" ~ '^97[89][0-9]{10}$')
     AND ("isbn10" IS NULL OR "isbn10" ~ '^[0-9]{9}[0-9X]$'));
ALTER TABLE "book_editions" ADD CONSTRAINT "book_editions_numbers_chk"
  CHECK (("pageCount" IS NULL OR "pageCount" > 0)
     AND ("publicationYear" IS NULL OR "publicationYear" BETWEEN 1000 AND 2999));
ALTER TABLE "authors" ADD CONSTRAINT "authors_years_chk"
  CHECK ("birthYear" IS NULL OR "deathYear" IS NULL OR "deathYear" >= "birthYear");
ALTER TABLE "book_authors" ADD CONSTRAINT "book_authors_position_chk" CHECK ("position" >= 0);
ALTER TABLE "shelves" ADD CONSTRAINT "shelves_capacity_chk" CHECK ("capacity" IS NULL OR "capacity" >= 0);

-- Money and quantities.
ALTER TABLE "book_copies" ADD CONSTRAINT "book_copies_price_chk"
  CHECK ("acquisitionPrice" IS NULL OR "acquisitionPrice" >= 0);
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_amounts_chk"
  CHECK ("quantity" > 0 AND "receivedQuantity" >= 0 AND "receivedQuantity" <= "quantity"
     AND "unitPrice" >= 0 AND "lineTotal" >= 0
     AND ("taxRate" IS NULL OR "taxRate" >= 0)
     AND ("discountAmount" IS NULL OR "discountAmount" >= 0));
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_amounts_chk"
  CHECK (("subtotal" IS NULL OR "subtotal" >= 0) AND ("taxTotal" IS NULL OR "taxTotal" >= 0)
     AND ("totalAmount" IS NULL OR "totalAmount" >= 0));
ALTER TABLE "fines" ADD CONSTRAINT "fines_amounts_chk"
  CHECK ("amount" >= 0 AND "paidAmount" >= 0 AND "paidAmount" <= "amount");
ALTER TABLE "fine_payments" ADD CONSTRAINT "fine_payments_amount_chk" CHECK ("amount" > 0);

-- Circulation policy values (per member type) must be sane; no values are assumed.
ALTER TABLE "member_types" ADD CONSTRAINT "member_types_policy_chk"
  CHECK ("maxActiveLoans" >= 0 AND "loanPeriodDays" > 0 AND "maxRenewals" >= 0
     AND "gracePeriodDays" >= 0 AND "finePerDay" >= 0 AND "reservationHoldDays" >= 0
     AND ("maxUnpaidFines" IS NULL OR "maxUnpaidFines" >= 0));
ALTER TABLE "members" ADD CONSTRAINT "members_dates_chk"
  CHECK ("expiresAt" IS NULL OR "expiresAt" >= "joinedAt");

-- Loans: status and return timestamp must agree; dates must be ordered.
ALTER TABLE "loans" ADD CONSTRAINT "loans_status_chk"
  CHECK (("status" = 'ACTIVE' AND "returnedAt" IS NULL)
      OR ("status" = 'RETURNED' AND "returnedAt" IS NOT NULL)
      OR ("status" = 'LOST'));
ALTER TABLE "loans" ADD CONSTRAINT "loans_dates_chk"
  CHECK ("dueAt" > "issuedAt" AND "renewalCount" >= 0
     AND ("returnedAt" IS NULL OR "returnedAt" >= "issuedAt"));
ALTER TABLE "loan_renewals" ADD CONSTRAINT "loan_renewals_dates_chk"
  CHECK ("newDueAt" > "previousDueAt");

-- A held reservation must name the copy being held.
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_hold_chk"
  CHECK ("status" <> 'READY_FOR_PICKUP' OR "assignedCopyId" IS NOT NULL);

-- Stock audit scope: LIBRARY has no scope id; every other scope must have one.
ALTER TABLE "stock_audits" ADD CONSTRAINT "stock_audits_scope_chk"
  CHECK (("scopeType" = 'LIBRARY') = ("scopeId" IS NULL));

-- Imports and sequences.
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_number_chk" CHECK ("rowNumber" >= 1);
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_counts_chk"
  CHECK ("fileSizeBytes" >= 0 AND "totalRows" >= 0 AND "validRows" >= 0 AND "invalidRows" >= 0
     AND "duplicateRows" >= 0 AND "importedRows" >= 0);
ALTER TABLE "number_sequences" ADD CONSTRAINT "number_sequences_chk"
  CHECK ("nextValue" >= 1 AND "padding" BETWEEN 0 AND 20);
