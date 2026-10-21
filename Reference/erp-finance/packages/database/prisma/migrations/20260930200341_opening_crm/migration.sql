-- CreateEnum
CREATE TYPE "OpenItemParty" AS ENUM ('CUSTOMER', 'SUPPLIER');

-- CreateEnum
CREATE TYPE "OpenItemKind" AS ENUM ('RECEIVABLE', 'PAYABLE', 'ADVANCE_IN', 'ADVANCE_OUT');

-- CreateEnum
CREATE TYPE "SettlementMode" AS ENUM ('CASH', 'GOODS');

-- CreateEnum
CREATE TYPE "OpenItemStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('OPEN', 'CONVERTED', 'LOST');

-- CreateEnum
CREATE TYPE "OpportunityStage" AS ENUM ('NEW', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('CALL', 'MEETING', 'TASK');

-- CreateEnum
CREATE TYPE "ActivityStatus" AS ENUM ('OPEN', 'DONE');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Currency" ADD VALUE 'EUR';
ALTER TYPE "Currency" ADD VALUE 'GBP';
ALTER TYPE "Currency" ADD VALUE 'TRY';
ALTER TYPE "Currency" ADD VALUE 'AED';
ALTER TYPE "Currency" ADD VALUE 'SAR';
ALTER TYPE "Currency" ADD VALUE 'JOD';
ALTER TYPE "Currency" ADD VALUE 'LBP';
ALTER TYPE "Currency" ADD VALUE 'IQD';
ALTER TYPE "Currency" ADD VALUE 'EGP';
ALTER TYPE "Currency" ADD VALUE 'QAR';
ALTER TYPE "Currency" ADD VALUE 'KWD';
ALTER TYPE "Currency" ADD VALUE 'CHF';
ALTER TYPE "Currency" ADD VALUE 'CAD';
ALTER TYPE "Currency" ADD VALUE 'CNY';

-- AlterEnum
ALTER TYPE "StockSourceType" ADD VALUE 'OPENING';

-- AlterTable
ALTER TABLE "accounting_policies" ADD COLUMN     "functional_locked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "inventory_locked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "opening_locked" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "company_currencies" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT 'tradivia',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_currencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_rates" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT 'tradivia',
    "code" TEXT NOT NULL,
    "rate_date" DATE NOT NULL,
    "rate" DECIMAL(18,6) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "open_items" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT 'tradivia',
    "party" "OpenItemParty" NOT NULL,
    "customer_id" TEXT,
    "supplier_id" TEXT,
    "party_name" TEXT NOT NULL,
    "kind" "OpenItemKind" NOT NULL,
    "document_date" DATE NOT NULL,
    "due_date" DATE,
    "currency" "Currency" NOT NULL,
    "fx_rate" DECIMAL(18,6),
    "original_amount" DECIMAL(18,4) NOT NULL,
    "remaining" DECIMAL(18,4) NOT NULL,
    "settlement_mode" "SettlementMode" NOT NULL DEFAULT 'CASH',
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL DEFAULT '',
    "reference" TEXT NOT NULL DEFAULT '',
    "memo" TEXT NOT NULL DEFAULT '',
    "status" "OpenItemStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "open_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "open_item_allocations" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT 'tradivia',
    "open_item_id" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL DEFAULT '',
    "memo" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "open_item_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opening_entries" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT 'tradivia',
    "balance_date" DATE NOT NULL,
    "entry_date" DATE NOT NULL,
    "allowance" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "reference" TEXT NOT NULL DEFAULT '',
    "employee_id" TEXT NOT NULL,
    "posted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opening_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opening_account_lines" (
    "id" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "currency" "Currency" NOT NULL,
    "debit" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "credit" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "memo" TEXT NOT NULL DEFAULT '',
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "opening_account_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opening_stock_lines" (
    "id" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit_cost" DECIMAL(18,4) NOT NULL DEFAULT 0,

    CONSTRAINT "opening_stock_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT 'tradivia',
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "status" "LeadStatus" NOT NULL DEFAULT 'OPEN',
    "owner_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "converted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunities" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT 'tradivia',
    "customer_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "stage" "OpportunityStage" NOT NULL DEFAULT 'NEW',
    "expected_amount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "probability" INTEGER NOT NULL DEFAULT 0,
    "currency" "Currency" NOT NULL DEFAULT 'USD',
    "owner_id" TEXT NOT NULL,
    "close_date" DATE,
    "loss_reason" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT 'tradivia',
    "type" "ActivityType" NOT NULL,
    "title" TEXT NOT NULL,
    "due_at" TIMESTAMP(3) NOT NULL,
    "status" "ActivityStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT NOT NULL DEFAULT '',
    "owner_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "lead_id" TEXT,
    "opportunity_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT 'tradivia',
    "number" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "parent_id" TEXT,
    "customer_id" TEXT NOT NULL,
    "opportunity_id" TEXT,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" "Currency" NOT NULL,
    "fx_rate" DECIMAL(18,6),
    "valid_until" DATE,
    "notes" TEXT NOT NULL DEFAULT '',
    "subtotal" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "discount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "employee_id" TEXT NOT NULL,
    "sales_invoice_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_lines" (
    "id" TEXT NOT NULL,
    "quote_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "sku" TEXT NOT NULL DEFAULT '',
    "unit" "ProductUnit" NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit_price" DECIMAL(18,4) NOT NULL,
    "discount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(18,4) NOT NULL,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "quote_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "company_currencies_company_id_active_idx" ON "company_currencies"("company_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "company_currencies_company_id_code_key" ON "company_currencies"("company_id", "code");

-- CreateIndex
CREATE INDEX "daily_rates_company_id_rate_date_idx" ON "daily_rates"("company_id", "rate_date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_rates_company_id_code_rate_date_key" ON "daily_rates"("company_id", "code", "rate_date");

-- CreateIndex
CREATE INDEX "open_items_company_id_party_status_idx" ON "open_items"("company_id", "party", "status");

-- CreateIndex
CREATE INDEX "open_items_company_id_kind_idx" ON "open_items"("company_id", "kind");

-- CreateIndex
CREATE INDEX "open_items_customer_id_idx" ON "open_items"("customer_id");

-- CreateIndex
CREATE INDEX "open_items_supplier_id_idx" ON "open_items"("supplier_id");

-- CreateIndex
CREATE INDEX "open_items_company_id_source_type_source_id_idx" ON "open_items"("company_id", "source_type", "source_id");

-- CreateIndex
CREATE INDEX "open_item_allocations_open_item_id_idx" ON "open_item_allocations"("open_item_id");

-- CreateIndex
CREATE INDEX "open_item_allocations_company_id_source_type_source_id_idx" ON "open_item_allocations"("company_id", "source_type", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "opening_entries_company_id_key" ON "opening_entries"("company_id");

-- CreateIndex
CREATE INDEX "opening_entries_employee_id_idx" ON "opening_entries"("employee_id");

-- CreateIndex
CREATE INDEX "opening_account_lines_entry_id_idx" ON "opening_account_lines"("entry_id");

-- CreateIndex
CREATE INDEX "opening_stock_lines_entry_id_idx" ON "opening_stock_lines"("entry_id");

-- CreateIndex
CREATE INDEX "opening_stock_lines_product_id_idx" ON "opening_stock_lines"("product_id");

-- CreateIndex
CREATE INDEX "leads_company_id_status_idx" ON "leads"("company_id", "status");

-- CreateIndex
CREATE INDEX "leads_owner_id_idx" ON "leads"("owner_id");

-- CreateIndex
CREATE INDEX "leads_customer_id_idx" ON "leads"("customer_id");

-- CreateIndex
CREATE INDEX "opportunities_company_id_stage_idx" ON "opportunities"("company_id", "stage");

-- CreateIndex
CREATE INDEX "opportunities_customer_id_idx" ON "opportunities"("customer_id");

-- CreateIndex
CREATE INDEX "opportunities_owner_id_idx" ON "opportunities"("owner_id");

-- CreateIndex
CREATE INDEX "activities_company_id_status_due_at_idx" ON "activities"("company_id", "status", "due_at");

-- CreateIndex
CREATE INDEX "activities_owner_id_idx" ON "activities"("owner_id");

-- CreateIndex
CREATE INDEX "activities_customer_id_idx" ON "activities"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_sales_invoice_id_key" ON "quotes"("sales_invoice_id");

-- CreateIndex
CREATE INDEX "quotes_company_id_status_idx" ON "quotes"("company_id", "status");

-- CreateIndex
CREATE INDEX "quotes_customer_id_idx" ON "quotes"("customer_id");

-- CreateIndex
CREATE INDEX "quotes_employee_id_idx" ON "quotes"("employee_id");

-- CreateIndex
CREATE INDEX "quotes_opportunity_id_idx" ON "quotes"("opportunity_id");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_company_id_number_version_key" ON "quotes"("company_id", "number", "version");

-- CreateIndex
CREATE INDEX "quote_lines_quote_id_idx" ON "quote_lines"("quote_id");

-- CreateIndex
CREATE INDEX "quote_lines_product_id_idx" ON "quote_lines"("product_id");

-- AddForeignKey
ALTER TABLE "open_items" ADD CONSTRAINT "open_items_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "open_items" ADD CONSTRAINT "open_items_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "open_item_allocations" ADD CONSTRAINT "open_item_allocations_open_item_id_fkey" FOREIGN KEY ("open_item_id") REFERENCES "open_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_entries" ADD CONSTRAINT "opening_entries_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_account_lines" ADD CONSTRAINT "opening_account_lines_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "opening_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_stock_lines" ADD CONSTRAINT "opening_stock_lines_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "opening_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_stock_lines" ADD CONSTRAINT "opening_stock_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_stock_lines" ADD CONSTRAINT "opening_stock_lines_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_sales_invoice_id_fkey" FOREIGN KEY ("sales_invoice_id") REFERENCES "sales_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
