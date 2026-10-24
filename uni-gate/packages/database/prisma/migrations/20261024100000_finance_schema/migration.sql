-- Phase F2: the finance tables join the foundation database.
--
-- Generated with `prisma migrate diff` from schema.prisma (finance section built by
-- tools/finance-schema/transform.py from Reference/erp-finance at 77ce653), then the
-- hand-written rules at the end, carried over from the finance migrations.
--
-- Only new types, tables, indexes, and foreign keys. No foundation table changes.
-- The 27 finance migrations are not replayed: the database starts clean (decision C).

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('USD', 'SYP', 'EUR', 'GBP', 'TRY', 'AED', 'SAR', 'JOD', 'LBP', 'IQD', 'EGP', 'QAR', 'KWD', 'CHF', 'CAD', 'CNY');

-- CreateEnum
CREATE TYPE "FundType" AS ENUM ('VAULT', 'SHAM_CASH', 'BANK');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('COMPLETED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'DELETED');

-- CreateEnum
CREATE TYPE "ExchangeType" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "AdvanceType" AS ENUM ('OUTCOME', 'EXCHANGE', 'ISSUE', 'RETURN');

-- CreateEnum
CREATE TYPE "AuditActionType" AS ENUM ('UPDATE', 'DELETE');

-- CreateEnum
CREATE TYPE "AuditRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'DIRECT');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('UNREAD', 'READ');

-- CreateEnum
CREATE TYPE "ProductUnit" AS ENUM ('PIECE', 'KG', 'METER', 'LITER', 'BOX', 'SET');

-- CreateEnum
CREATE TYPE "StockMoveType" AS ENUM ('IN', 'OUT', 'ADJUST');

-- CreateEnum
CREATE TYPE "StockSourceType" AS ENUM ('MANUAL', 'SALES_ISSUE', 'SALES_RETURN', 'PURCHASE_RECEIPT', 'PURCHASE_RETURN', 'OPENING');

-- CreateEnum
CREATE TYPE "SalesInvoiceStatus" AS ENUM ('DRAFT', 'POSTED', 'VOID');

-- CreateEnum
CREATE TYPE "DiscountMode" AS ENUM ('AMOUNT', 'PERCENT');

-- CreateEnum
CREATE TYPE "SalesPaymentStatus" AS ENUM ('POSTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "JournalStatus" AS ENUM ('DRAFT', 'POSTED');

-- CreateEnum
CREATE TYPE "PeriodStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "BudgetStatus" AS ENUM ('DRAFT', 'ACTIVE');

-- CreateEnum
CREATE TYPE "CostCenterKind" AS ENUM ('PROJECT', 'LOCATION', 'MANUAL');

-- CreateEnum
CREATE TYPE "OpenItemParty" AS ENUM ('CUSTOMER', 'SUPPLIER', 'BORROWER');

-- CreateEnum
CREATE TYPE "OpenItemKind" AS ENUM ('RECEIVABLE', 'PAYABLE', 'ADVANCE_IN', 'ADVANCE_OUT', 'CUSTODY');

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

-- CreateTable
CREATE TABLE "borrowers" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "borrowers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "show_in" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banks" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "banks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incomes" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "operation_number" INTEGER NOT NULL,
    "transaction_date" DATE NOT NULL,
    "system_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "project_id" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "fund" "FundType" NOT NULL,
    "bank_id" TEXT,
    "sender" TEXT NOT NULL DEFAULT '',
    "receiver" TEXT NOT NULL DEFAULT '',
    "currency" "Currency" NOT NULL,
    "quantity" DECIMAL(18,4),
    "amount" DECIMAL(18,4) NOT NULL,
    "total" DECIMAL(18,4) NOT NULL,
    "fx_rate" DECIMAL(18,6),
    "attachments" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "employee_id" TEXT NOT NULL,
    "location_id" TEXT,
    "status" "TransactionStatus" NOT NULL DEFAULT 'COMPLETED',
    "reference" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "incomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outcomes" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "operation_number" INTEGER NOT NULL,
    "transaction_date" DATE NOT NULL,
    "system_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "project_id" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "fund" "FundType" NOT NULL,
    "bank_id" TEXT,
    "deliverer" TEXT NOT NULL DEFAULT '',
    "receiver" TEXT NOT NULL DEFAULT '',
    "currency" "Currency" NOT NULL,
    "quantity" DECIMAL(18,4),
    "amount" DECIMAL(18,4) NOT NULL,
    "total" DECIMAL(18,4) NOT NULL,
    "fx_rate" DECIMAL(18,6),
    "attachments" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "employee_id" TEXT NOT NULL,
    "location_id" TEXT,
    "status" "TransactionStatus" NOT NULL DEFAULT 'COMPLETED',
    "reference" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchanges" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "operation_number" INTEGER NOT NULL,
    "transaction_date" DATE NOT NULL,
    "system_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fund" "FundType" NOT NULL,
    "bank_id" TEXT,
    "exchange_type" "ExchangeType" NOT NULL,
    "paid_currency" "Currency" NOT NULL,
    "received_currency" "Currency" NOT NULL,
    "exchange_amount" DECIMAL(18,4) NOT NULL,
    "amount_currency" "Currency" NOT NULL,
    "exchange_rate" DECIMAL(18,6) NOT NULL,
    "total" DECIMAL(18,4) NOT NULL,
    "attachments" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "employee_id" TEXT NOT NULL,
    "location_id" TEXT,
    "status" "TransactionStatus" NOT NULL DEFAULT 'COMPLETED',
    "reference" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "exchanges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfers" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "operation_number" INTEGER NOT NULL,
    "transaction_date" DATE NOT NULL,
    "system_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "from_fund" "FundType" NOT NULL,
    "to_fund" "FundType" NOT NULL,
    "from_bank_id" TEXT,
    "to_bank_id" TEXT,
    "currency" "Currency" NOT NULL,
    "fx_rate" DECIMAL(18,6),
    "amount" DECIMAL(18,4) NOT NULL,
    "attachments" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "employee_id" TEXT NOT NULL,
    "location_id" TEXT,
    "status" "TransactionStatus" NOT NULL DEFAULT 'COMPLETED',
    "reference" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "advances" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "operation_number" INTEGER NOT NULL,
    "transaction_date" DATE NOT NULL,
    "system_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "borrower_id" TEXT NOT NULL,
    "advance_type" "AdvanceType" NOT NULL,
    "project_id" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "receiver" TEXT NOT NULL DEFAULT '',
    "currency" "Currency" NOT NULL,
    "quantity" DECIMAL(18,4),
    "amount" DECIMAL(18,4) NOT NULL,
    "exchange_rate" DECIMAL(18,6),
    "total" DECIMAL(18,4) NOT NULL,
    "from_currency" "Currency",
    "to_currency" "Currency",
    "fund" "FundType",
    "bank_id" TEXT,
    "attachments" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "employee_id" TEXT NOT NULL,
    "location_id" TEXT,
    "status" "TransactionStatus" NOT NULL DEFAULT 'COMPLETED',
    "reference" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "advances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opening_balances" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "operation_number" INTEGER NOT NULL,
    "transaction_date" DATE NOT NULL,
    "system_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fund" "FundType" NOT NULL,
    "bank_id" TEXT,
    "currency" "Currency" NOT NULL,
    "fx_rate" DECIMAL(18,6),
    "amount" DECIMAL(18,4) NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "employee_id" TEXT NOT NULL,
    "location_id" TEXT,
    "status" "TransactionStatus" NOT NULL DEFAULT 'COMPLETED',
    "reference" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "opening_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_trail" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "original_reference" TEXT NOT NULL,
    "requester_id" TEXT NOT NULL,
    "action_type" "AuditActionType" NOT NULL,
    "old_details" JSONB NOT NULL,
    "new_details" JSONB NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "request_status" "AuditRequestStatus" NOT NULL DEFAULT 'PENDING',
    "supervisor_id" TEXT,
    "supervisor_decision" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL DEFAULT '',
    "location_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_trail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "NotificationStatus" NOT NULL DEFAULT 'UNREAD',
    "section" TEXT NOT NULL DEFAULT '',
    "request_id" TEXT NOT NULL DEFAULT '',
    "action_type" TEXT NOT NULL DEFAULT '',
    "reference" TEXT NOT NULL DEFAULT '',
    "requester_id" TEXT,
    "location_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "barcode" TEXT NOT NULL DEFAULT '',
    "unit" "ProductUnit" NOT NULL DEFAULT 'PIECE',
    "cost_price" DECIMAL(18,4),
    "sale_price" DECIMAL(18,4),
    "unit_nrv" DECIMAL(18,4),
    "nrv_currency" "Currency",
    "inventory_allowance" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "min_quantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "image_path" TEXT NOT NULL DEFAULT '',
    "image_mime" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "move_type" "StockMoveType" NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "source_type" "StockSourceType" NOT NULL DEFAULT 'MANUAL',
    "source_id" TEXT NOT NULL DEFAULT '',
    "source_line_id" TEXT NOT NULL DEFAULT '',
    "employee_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "tax_number" TEXT NOT NULL DEFAULT '',
    "payment_term_days" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_invoices" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "transaction_date" DATE NOT NULL,
    "customer_id" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "warehouse_name" TEXT NOT NULL,
    "currency" "Currency" NOT NULL,
    "fx_rate" DECIMAL(18,6),
    "due_date" DATE,
    "customer_reference" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "discount_mode" "DiscountMode" NOT NULL DEFAULT 'AMOUNT',
    "discount_rate" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "discount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "status" "SalesInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "employee_id" TEXT NOT NULL,
    "location_id" TEXT,
    "posted_at" TIMESTAMP(3),
    "voided_at" TIMESTAMP(3),
    "void_reason" TEXT NOT NULL DEFAULT '',
    "voided_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_invoice_lines" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "sku" TEXT NOT NULL DEFAULT '',
    "unit" "ProductUnit" NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit_price" DECIMAL(18,4) NOT NULL,
    "discount_mode" "DiscountMode" NOT NULL DEFAULT 'AMOUNT',
    "discount_rate" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "discount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(18,4) NOT NULL,
    "nrv_release" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "sales_invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_assessments" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "transaction_date" DATE NOT NULL,
    "currency" "Currency" NOT NULL,
    "fx_rate" DECIMAL(18,6),
    "notes" TEXT NOT NULL DEFAULT '',
    "employee_id" TEXT NOT NULL,
    "location_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_assessment_lines" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "assessment_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit_cost" DECIMAL(18,4) NOT NULL,
    "unit_nrv" DECIMAL(18,4) NOT NULL,
    "allowance_before" DECIMAL(18,4) NOT NULL,
    "allowance_after" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "inventory_assessment_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_invoice_payments" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "income_id" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "status" "SalesPaymentStatus" NOT NULL DEFAULT 'POSTED',
    "reason" TEXT NOT NULL DEFAULT '',
    "employee_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_invoice_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_invoices" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "transaction_date" DATE NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "supplier_name" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "warehouse_name" TEXT NOT NULL,
    "currency" "Currency" NOT NULL,
    "fx_rate" DECIMAL(18,6),
    "notes" TEXT NOT NULL DEFAULT '',
    "discount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "status" "SalesInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "employee_id" TEXT NOT NULL,
    "location_id" TEXT,
    "posted_at" TIMESTAMP(3),
    "voided_at" TIMESTAMP(3),
    "void_reason" TEXT NOT NULL DEFAULT '',
    "voided_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_invoice_lines" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "sku" TEXT NOT NULL DEFAULT '',
    "unit" "ProductUnit" NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit_price" DECIMAL(18,4) NOT NULL,
    "discount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(18,4) NOT NULL,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "purchase_invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "system" BOOLEAN NOT NULL DEFAULT false,
    "statement_line" TEXT NOT NULL DEFAULT '',
    "parent_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "transaction_date" DATE NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "JournalStatus" NOT NULL DEFAULT 'DRAFT',
    "employee_id" TEXT NOT NULL,
    "location_id" TEXT,
    "reversal_of_id" TEXT,
    "source_type" TEXT,
    "source_id" TEXT,
    "source_key" TEXT,
    "exchange" BOOLEAN NOT NULL DEFAULT false,
    "posted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_lines" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "currency" "Currency" NOT NULL,
    "debit" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "credit" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "memo" TEXT NOT NULL DEFAULT '',
    "sort_order" INTEGER NOT NULL,
    "cost_center_id" TEXT,
    "project_id" TEXT,
    "fx_rate" DECIMAL(18,6),

    CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_centers" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "CostCenterKind" NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "project_id" TEXT,
    "location_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cost_centers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_invoice_payments" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "outcome_id" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "status" "SalesPaymentStatus" NOT NULL DEFAULT 'POSTED',
    "reason" TEXT NOT NULL DEFAULT '',
    "employee_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_invoice_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_policies" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "functional_currency" "Currency" NOT NULL DEFAULT 'USD',
    "inventory_method" TEXT NOT NULL DEFAULT 'WAC',
    "functional_locked" BOOLEAN NOT NULL DEFAULT false,
    "opening_locked" BOOLEAN NOT NULL DEFAULT false,
    "inventory_locked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fx_revaluations" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "as_of" DATE NOT NULL,
    "rate" DECIMAL(18,6) NOT NULL,
    "functional" "Currency" NOT NULL,
    "foreign_qty" DECIMAL(18,4) NOT NULL,
    "carrying" DECIMAL(18,4) NOT NULL,
    "closing_value" DECIMAL(18,4) NOT NULL,
    "gain" DECIMAL(18,4) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fx_revaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_years" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "status" "PeriodStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_periods" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "year_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "status" "PeriodStatus" NOT NULL DEFAULT 'OPEN',
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budgets" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "currency" "Currency" NOT NULL,
    "status" "BudgetStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_lines" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "budget_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "budget_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_currencies" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
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
    "company_id" TEXT NOT NULL,
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
    "company_id" TEXT NOT NULL,
    "party" "OpenItemParty" NOT NULL,
    "customer_id" TEXT,
    "supplier_id" TEXT,
    "borrower_id" TEXT,
    "location_id" TEXT,
    "employee_id" TEXT,
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
    "company_id" TEXT NOT NULL,
    "open_item_id" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "settlement_fx_rate" DECIMAL(18,6),
    "fx_difference" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL DEFAULT '',
    "memo" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "open_item_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opening_entries" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
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
    "company_id" TEXT NOT NULL,
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
    "company_id" TEXT NOT NULL,
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
    "company_id" TEXT NOT NULL,
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
    "company_id" TEXT NOT NULL,
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
    "company_id" TEXT NOT NULL,
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
    "company_id" TEXT NOT NULL,
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
    "company_id" TEXT NOT NULL,
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
CREATE INDEX "borrowers_company_id_idx" ON "borrowers"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "borrowers_company_id_name_key" ON "borrowers"("company_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "borrowers_company_id_id_key" ON "borrowers"("company_id", "id");

-- CreateIndex
CREATE INDEX "projects_company_id_idx" ON "projects"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "projects_company_id_name_key" ON "projects"("company_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "projects_company_id_id_key" ON "projects"("company_id", "id");

-- CreateIndex
CREATE INDEX "banks_company_id_idx" ON "banks"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "banks_company_id_name_key" ON "banks"("company_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "banks_company_id_id_key" ON "banks"("company_id", "id");

-- CreateIndex
CREATE INDEX "incomes_company_id_transaction_date_idx" ON "incomes"("company_id", "transaction_date");

-- CreateIndex
CREATE INDEX "incomes_company_id_status_idx" ON "incomes"("company_id", "status");

-- CreateIndex
CREATE INDEX "incomes_employee_id_idx" ON "incomes"("employee_id");

-- CreateIndex
CREATE INDEX "incomes_project_id_idx" ON "incomes"("project_id");

-- CreateIndex
CREATE INDEX "incomes_location_id_idx" ON "incomes"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "incomes_company_id_reference_key" ON "incomes"("company_id", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "incomes_company_id_id_key" ON "incomes"("company_id", "id");

-- CreateIndex
CREATE INDEX "outcomes_company_id_transaction_date_idx" ON "outcomes"("company_id", "transaction_date");

-- CreateIndex
CREATE INDEX "outcomes_company_id_status_idx" ON "outcomes"("company_id", "status");

-- CreateIndex
CREATE INDEX "outcomes_employee_id_idx" ON "outcomes"("employee_id");

-- CreateIndex
CREATE INDEX "outcomes_project_id_idx" ON "outcomes"("project_id");

-- CreateIndex
CREATE INDEX "outcomes_location_id_idx" ON "outcomes"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "outcomes_company_id_reference_key" ON "outcomes"("company_id", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "outcomes_company_id_id_key" ON "outcomes"("company_id", "id");

-- CreateIndex
CREATE INDEX "exchanges_company_id_transaction_date_idx" ON "exchanges"("company_id", "transaction_date");

-- CreateIndex
CREATE INDEX "exchanges_company_id_status_idx" ON "exchanges"("company_id", "status");

-- CreateIndex
CREATE INDEX "exchanges_employee_id_idx" ON "exchanges"("employee_id");

-- CreateIndex
CREATE INDEX "exchanges_location_id_idx" ON "exchanges"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "exchanges_company_id_reference_key" ON "exchanges"("company_id", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "exchanges_company_id_id_key" ON "exchanges"("company_id", "id");

-- CreateIndex
CREATE INDEX "transfers_company_id_transaction_date_idx" ON "transfers"("company_id", "transaction_date");

-- CreateIndex
CREATE INDEX "transfers_company_id_status_idx" ON "transfers"("company_id", "status");

-- CreateIndex
CREATE INDEX "transfers_employee_id_idx" ON "transfers"("employee_id");

-- CreateIndex
CREATE INDEX "transfers_location_id_idx" ON "transfers"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "transfers_company_id_reference_key" ON "transfers"("company_id", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "transfers_company_id_id_key" ON "transfers"("company_id", "id");

-- CreateIndex
CREATE INDEX "advances_company_id_transaction_date_idx" ON "advances"("company_id", "transaction_date");

-- CreateIndex
CREATE INDEX "advances_company_id_status_idx" ON "advances"("company_id", "status");

-- CreateIndex
CREATE INDEX "advances_employee_id_idx" ON "advances"("employee_id");

-- CreateIndex
CREATE INDEX "advances_borrower_id_idx" ON "advances"("borrower_id");

-- CreateIndex
CREATE INDEX "advances_location_id_idx" ON "advances"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "advances_company_id_reference_key" ON "advances"("company_id", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "advances_company_id_id_key" ON "advances"("company_id", "id");

-- CreateIndex
CREATE INDEX "opening_balances_company_id_fund_currency_idx" ON "opening_balances"("company_id", "fund", "currency");

-- CreateIndex
CREATE INDEX "opening_balances_employee_id_idx" ON "opening_balances"("employee_id");

-- CreateIndex
CREATE INDEX "opening_balances_location_id_idx" ON "opening_balances"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "opening_balances_company_id_reference_key" ON "opening_balances"("company_id", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "opening_balances_company_id_id_key" ON "opening_balances"("company_id", "id");

-- CreateIndex
CREATE INDEX "audit_trail_company_id_request_status_idx" ON "audit_trail"("company_id", "request_status");

-- CreateIndex
CREATE INDEX "audit_trail_original_reference_idx" ON "audit_trail"("original_reference");

-- CreateIndex
CREATE INDEX "audit_trail_requester_id_idx" ON "audit_trail"("requester_id");

-- CreateIndex
CREATE INDEX "audit_trail_location_id_idx" ON "audit_trail"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "audit_trail_company_id_id_key" ON "audit_trail"("company_id", "id");

-- CreateIndex
CREATE INDEX "notifications_company_id_employee_id_status_idx" ON "notifications"("company_id", "employee_id", "status");

-- CreateIndex
CREATE INDEX "notifications_reference_idx" ON "notifications"("reference");

-- CreateIndex
CREATE INDEX "notifications_location_id_idx" ON "notifications"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_company_id_id_key" ON "notifications"("company_id", "id");

-- CreateIndex
CREATE INDEX "warehouses_company_id_idx" ON "warehouses"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_company_id_name_key" ON "warehouses"("company_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_company_id_id_key" ON "warehouses"("company_id", "id");

-- CreateIndex
CREATE INDEX "products_company_id_idx" ON "products"("company_id");

-- CreateIndex
CREATE INDEX "products_company_id_status_idx" ON "products"("company_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "products_company_id_name_key" ON "products"("company_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "products_company_id_sku_key" ON "products"("company_id", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "products_company_id_id_key" ON "products"("company_id", "id");

-- CreateIndex
CREATE INDEX "stock_movements_company_id_warehouse_id_product_id_idx" ON "stock_movements"("company_id", "warehouse_id", "product_id");

-- CreateIndex
CREATE INDEX "stock_movements_product_id_idx" ON "stock_movements"("product_id");

-- CreateIndex
CREATE INDEX "stock_movements_employee_id_idx" ON "stock_movements"("employee_id");

-- CreateIndex
CREATE INDEX "stock_movements_created_at_idx" ON "stock_movements"("created_at");

-- CreateIndex
CREATE INDEX "stock_movements_company_id_source_id_idx" ON "stock_movements"("company_id", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_company_id_reference_key" ON "stock_movements"("company_id", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_company_id_id_key" ON "stock_movements"("company_id", "id");

-- CreateIndex
CREATE INDEX "customers_company_id_status_idx" ON "customers"("company_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "customers_company_id_name_key" ON "customers"("company_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "customers_company_id_id_key" ON "customers"("company_id", "id");

-- CreateIndex
CREATE INDEX "sales_invoices_company_id_status_transaction_date_idx" ON "sales_invoices"("company_id", "status", "transaction_date");

-- CreateIndex
CREATE INDEX "sales_invoices_customer_id_idx" ON "sales_invoices"("customer_id");

-- CreateIndex
CREATE INDEX "sales_invoices_warehouse_id_idx" ON "sales_invoices"("warehouse_id");

-- CreateIndex
CREATE INDEX "sales_invoices_employee_id_idx" ON "sales_invoices"("employee_id");

-- CreateIndex
CREATE INDEX "sales_invoices_location_id_idx" ON "sales_invoices"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoices_company_id_number_key" ON "sales_invoices"("company_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoices_company_id_reference_key" ON "sales_invoices"("company_id", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoices_company_id_id_key" ON "sales_invoices"("company_id", "id");

-- CreateIndex
CREATE INDEX "sales_invoice_lines_invoice_id_idx" ON "sales_invoice_lines"("invoice_id");

-- CreateIndex
CREATE INDEX "sales_invoice_lines_product_id_idx" ON "sales_invoice_lines"("product_id");

-- CreateIndex
CREATE INDEX "sales_invoice_lines_company_id_idx" ON "sales_invoice_lines"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoice_lines_company_id_id_key" ON "sales_invoice_lines"("company_id", "id");

-- CreateIndex
CREATE INDEX "inventory_assessments_company_id_transaction_date_idx" ON "inventory_assessments"("company_id", "transaction_date");

-- CreateIndex
CREATE INDEX "inventory_assessments_employee_id_idx" ON "inventory_assessments"("employee_id");

-- CreateIndex
CREATE INDEX "inventory_assessments_location_id_idx" ON "inventory_assessments"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_assessments_company_id_reference_key" ON "inventory_assessments"("company_id", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_assessments_company_id_id_key" ON "inventory_assessments"("company_id", "id");

-- CreateIndex
CREATE INDEX "inventory_assessment_lines_assessment_id_idx" ON "inventory_assessment_lines"("assessment_id");

-- CreateIndex
CREATE INDEX "inventory_assessment_lines_product_id_idx" ON "inventory_assessment_lines"("product_id");

-- CreateIndex
CREATE INDEX "inventory_assessment_lines_company_id_idx" ON "inventory_assessment_lines"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_assessment_lines_company_id_id_key" ON "inventory_assessment_lines"("company_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoice_payments_income_id_key" ON "sales_invoice_payments"("income_id");

-- CreateIndex
CREATE INDEX "sales_invoice_payments_company_id_invoice_id_idx" ON "sales_invoice_payments"("company_id", "invoice_id");

-- CreateIndex
CREATE INDEX "sales_invoice_payments_employee_id_idx" ON "sales_invoice_payments"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoice_payments_company_id_id_key" ON "sales_invoice_payments"("company_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoice_payments_company_id_income_id_key" ON "sales_invoice_payments"("company_id", "income_id");

-- CreateIndex
CREATE INDEX "suppliers_company_id_status_idx" ON "suppliers"("company_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_company_id_name_key" ON "suppliers"("company_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_company_id_id_key" ON "suppliers"("company_id", "id");

-- CreateIndex
CREATE INDEX "purchase_invoices_company_id_status_transaction_date_idx" ON "purchase_invoices"("company_id", "status", "transaction_date");

-- CreateIndex
CREATE INDEX "purchase_invoices_supplier_id_idx" ON "purchase_invoices"("supplier_id");

-- CreateIndex
CREATE INDEX "purchase_invoices_warehouse_id_idx" ON "purchase_invoices"("warehouse_id");

-- CreateIndex
CREATE INDEX "purchase_invoices_employee_id_idx" ON "purchase_invoices"("employee_id");

-- CreateIndex
CREATE INDEX "purchase_invoices_location_id_idx" ON "purchase_invoices"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_invoices_company_id_number_key" ON "purchase_invoices"("company_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_invoices_company_id_reference_key" ON "purchase_invoices"("company_id", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_invoices_company_id_id_key" ON "purchase_invoices"("company_id", "id");

-- CreateIndex
CREATE INDEX "purchase_invoice_lines_invoice_id_idx" ON "purchase_invoice_lines"("invoice_id");

-- CreateIndex
CREATE INDEX "purchase_invoice_lines_product_id_idx" ON "purchase_invoice_lines"("product_id");

-- CreateIndex
CREATE INDEX "purchase_invoice_lines_company_id_idx" ON "purchase_invoice_lines"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_invoice_lines_company_id_id_key" ON "purchase_invoice_lines"("company_id", "id");

-- CreateIndex
CREATE INDEX "accounts_company_id_type_idx" ON "accounts"("company_id", "type");

-- CreateIndex
CREATE INDEX "accounts_parent_id_idx" ON "accounts"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_company_id_code_key" ON "accounts"("company_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_company_id_name_key" ON "accounts"("company_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_company_id_id_key" ON "accounts"("company_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_reversal_of_id_key" ON "journal_entries"("reversal_of_id");

-- CreateIndex
CREATE INDEX "journal_entries_company_id_status_transaction_date_idx" ON "journal_entries"("company_id", "status", "transaction_date");

-- CreateIndex
CREATE INDEX "journal_entries_employee_id_idx" ON "journal_entries"("employee_id");

-- CreateIndex
CREATE INDEX "journal_entries_location_id_idx" ON "journal_entries"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_company_id_number_key" ON "journal_entries"("company_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_company_id_id_key" ON "journal_entries"("company_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_company_id_source_key_key" ON "journal_entries"("company_id", "source_key");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_company_id_reversal_of_id_key" ON "journal_entries"("company_id", "reversal_of_id");

-- CreateIndex
CREATE INDEX "journal_lines_entry_id_idx" ON "journal_lines"("entry_id");

-- CreateIndex
CREATE INDEX "journal_lines_account_id_idx" ON "journal_lines"("account_id");

-- CreateIndex
CREATE INDEX "journal_lines_cost_center_id_idx" ON "journal_lines"("cost_center_id");

-- CreateIndex
CREATE INDEX "journal_lines_project_id_idx" ON "journal_lines"("project_id");

-- CreateIndex
CREATE INDEX "journal_lines_company_id_idx" ON "journal_lines"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "journal_lines_company_id_id_key" ON "journal_lines"("company_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "cost_centers_project_id_key" ON "cost_centers"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "cost_centers_location_id_key" ON "cost_centers"("location_id");

-- CreateIndex
CREATE INDEX "cost_centers_company_id_status_idx" ON "cost_centers"("company_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "cost_centers_company_id_code_key" ON "cost_centers"("company_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "cost_centers_company_id_id_key" ON "cost_centers"("company_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "cost_centers_company_id_project_id_key" ON "cost_centers"("company_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "cost_centers_company_id_location_id_key" ON "cost_centers"("company_id", "location_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_invoice_payments_outcome_id_key" ON "purchase_invoice_payments"("outcome_id");

-- CreateIndex
CREATE INDEX "purchase_invoice_payments_company_id_invoice_id_idx" ON "purchase_invoice_payments"("company_id", "invoice_id");

-- CreateIndex
CREATE INDEX "purchase_invoice_payments_employee_id_idx" ON "purchase_invoice_payments"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_invoice_payments_company_id_id_key" ON "purchase_invoice_payments"("company_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_invoice_payments_company_id_outcome_id_key" ON "purchase_invoice_payments"("company_id", "outcome_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_policies_company_id_key" ON "accounting_policies"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_policies_company_id_id_key" ON "accounting_policies"("company_id", "id");

-- CreateIndex
CREATE INDEX "fx_revaluations_company_id_idx" ON "fx_revaluations"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "fx_revaluations_company_id_as_of_key" ON "fx_revaluations"("company_id", "as_of");

-- CreateIndex
CREATE UNIQUE INDEX "fx_revaluations_company_id_id_key" ON "fx_revaluations"("company_id", "id");

-- CreateIndex
CREATE INDEX "fiscal_years_company_id_idx" ON "fiscal_years"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_years_company_id_year_key" ON "fiscal_years"("company_id", "year");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_years_company_id_id_key" ON "fiscal_years"("company_id", "id");

-- CreateIndex
CREATE INDEX "fiscal_periods_company_id_status_idx" ON "fiscal_periods"("company_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_periods_company_id_year_month_key" ON "fiscal_periods"("company_id", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_periods_company_id_id_key" ON "fiscal_periods"("company_id", "id");

-- CreateIndex
CREATE INDEX "budgets_company_id_year_idx" ON "budgets"("company_id", "year");

-- CreateIndex
CREATE UNIQUE INDEX "budgets_company_id_year_currency_name_key" ON "budgets"("company_id", "year", "currency", "name");

-- CreateIndex
CREATE UNIQUE INDEX "budgets_company_id_id_key" ON "budgets"("company_id", "id");

-- CreateIndex
CREATE INDEX "budget_lines_account_id_idx" ON "budget_lines"("account_id");

-- CreateIndex
CREATE INDEX "budget_lines_company_id_idx" ON "budget_lines"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "budget_lines_budget_id_account_id_month_key" ON "budget_lines"("budget_id", "account_id", "month");

-- CreateIndex
CREATE UNIQUE INDEX "budget_lines_company_id_id_key" ON "budget_lines"("company_id", "id");

-- CreateIndex
CREATE INDEX "company_currencies_company_id_active_idx" ON "company_currencies"("company_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "company_currencies_company_id_code_key" ON "company_currencies"("company_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "company_currencies_company_id_id_key" ON "company_currencies"("company_id", "id");

-- CreateIndex
CREATE INDEX "daily_rates_company_id_rate_date_idx" ON "daily_rates"("company_id", "rate_date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_rates_company_id_code_rate_date_key" ON "daily_rates"("company_id", "code", "rate_date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_rates_company_id_id_key" ON "daily_rates"("company_id", "id");

-- CreateIndex
CREATE INDEX "open_items_company_id_party_status_idx" ON "open_items"("company_id", "party", "status");

-- CreateIndex
CREATE INDEX "open_items_company_id_kind_idx" ON "open_items"("company_id", "kind");

-- CreateIndex
CREATE INDEX "open_items_customer_id_idx" ON "open_items"("customer_id");

-- CreateIndex
CREATE INDEX "open_items_supplier_id_idx" ON "open_items"("supplier_id");

-- CreateIndex
CREATE INDEX "open_items_borrower_id_currency_status_idx" ON "open_items"("borrower_id", "currency", "status");

-- CreateIndex
CREATE INDEX "open_items_company_id_source_type_source_id_idx" ON "open_items"("company_id", "source_type", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "open_items_company_id_id_key" ON "open_items"("company_id", "id");

-- CreateIndex
CREATE INDEX "open_item_allocations_open_item_id_idx" ON "open_item_allocations"("open_item_id");

-- CreateIndex
CREATE INDEX "open_item_allocations_company_id_source_type_source_id_idx" ON "open_item_allocations"("company_id", "source_type", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "open_item_allocations_company_id_id_key" ON "open_item_allocations"("company_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "opening_entries_company_id_key" ON "opening_entries"("company_id");

-- CreateIndex
CREATE INDEX "opening_entries_employee_id_idx" ON "opening_entries"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "opening_entries_company_id_id_key" ON "opening_entries"("company_id", "id");

-- CreateIndex
CREATE INDEX "opening_account_lines_entry_id_idx" ON "opening_account_lines"("entry_id");

-- CreateIndex
CREATE INDEX "opening_account_lines_company_id_idx" ON "opening_account_lines"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "opening_account_lines_company_id_id_key" ON "opening_account_lines"("company_id", "id");

-- CreateIndex
CREATE INDEX "opening_stock_lines_entry_id_idx" ON "opening_stock_lines"("entry_id");

-- CreateIndex
CREATE INDEX "opening_stock_lines_product_id_idx" ON "opening_stock_lines"("product_id");

-- CreateIndex
CREATE INDEX "opening_stock_lines_company_id_idx" ON "opening_stock_lines"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "opening_stock_lines_company_id_id_key" ON "opening_stock_lines"("company_id", "id");

-- CreateIndex
CREATE INDEX "leads_company_id_status_idx" ON "leads"("company_id", "status");

-- CreateIndex
CREATE INDEX "leads_owner_id_idx" ON "leads"("owner_id");

-- CreateIndex
CREATE INDEX "leads_customer_id_idx" ON "leads"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "leads_company_id_id_key" ON "leads"("company_id", "id");

-- CreateIndex
CREATE INDEX "opportunities_company_id_stage_idx" ON "opportunities"("company_id", "stage");

-- CreateIndex
CREATE INDEX "opportunities_customer_id_idx" ON "opportunities"("customer_id");

-- CreateIndex
CREATE INDEX "opportunities_owner_id_idx" ON "opportunities"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "opportunities_company_id_id_key" ON "opportunities"("company_id", "id");

-- CreateIndex
CREATE INDEX "activities_company_id_status_due_at_idx" ON "activities"("company_id", "status", "due_at");

-- CreateIndex
CREATE INDEX "activities_owner_id_idx" ON "activities"("owner_id");

-- CreateIndex
CREATE INDEX "activities_customer_id_idx" ON "activities"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "activities_company_id_id_key" ON "activities"("company_id", "id");

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
CREATE UNIQUE INDEX "quotes_company_id_id_key" ON "quotes"("company_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_company_id_sales_invoice_id_key" ON "quotes"("company_id", "sales_invoice_id");

-- CreateIndex
CREATE INDEX "quote_lines_quote_id_idx" ON "quote_lines"("quote_id");

-- CreateIndex
CREATE INDEX "quote_lines_product_id_idx" ON "quote_lines"("product_id");

-- CreateIndex
CREATE INDEX "quote_lines_company_id_idx" ON "quote_lines"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "quote_lines_company_id_id_key" ON "quote_lines"("company_id", "id");

-- AddForeignKey
ALTER TABLE "borrowers" ADD CONSTRAINT "borrowers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "banks" ADD CONSTRAINT "banks_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_company_id_project_id_fkey" FOREIGN KEY ("company_id", "project_id") REFERENCES "projects"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_company_id_bank_id_fkey" FOREIGN KEY ("company_id", "bank_id") REFERENCES "banks"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_company_id_employee_id_fkey" FOREIGN KEY ("company_id", "employee_id") REFERENCES "memberships"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_company_id_location_id_fkey" FOREIGN KEY ("company_id", "location_id") REFERENCES "locations"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_company_id_project_id_fkey" FOREIGN KEY ("company_id", "project_id") REFERENCES "projects"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_company_id_bank_id_fkey" FOREIGN KEY ("company_id", "bank_id") REFERENCES "banks"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_company_id_employee_id_fkey" FOREIGN KEY ("company_id", "employee_id") REFERENCES "memberships"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_company_id_location_id_fkey" FOREIGN KEY ("company_id", "location_id") REFERENCES "locations"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchanges" ADD CONSTRAINT "exchanges_company_id_bank_id_fkey" FOREIGN KEY ("company_id", "bank_id") REFERENCES "banks"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchanges" ADD CONSTRAINT "exchanges_company_id_employee_id_fkey" FOREIGN KEY ("company_id", "employee_id") REFERENCES "memberships"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchanges" ADD CONSTRAINT "exchanges_company_id_location_id_fkey" FOREIGN KEY ("company_id", "location_id") REFERENCES "locations"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchanges" ADD CONSTRAINT "exchanges_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_company_id_from_bank_id_fkey" FOREIGN KEY ("company_id", "from_bank_id") REFERENCES "banks"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_company_id_to_bank_id_fkey" FOREIGN KEY ("company_id", "to_bank_id") REFERENCES "banks"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_company_id_employee_id_fkey" FOREIGN KEY ("company_id", "employee_id") REFERENCES "memberships"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_company_id_location_id_fkey" FOREIGN KEY ("company_id", "location_id") REFERENCES "locations"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advances" ADD CONSTRAINT "advances_company_id_bank_id_fkey" FOREIGN KEY ("company_id", "bank_id") REFERENCES "banks"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advances" ADD CONSTRAINT "advances_company_id_borrower_id_fkey" FOREIGN KEY ("company_id", "borrower_id") REFERENCES "borrowers"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advances" ADD CONSTRAINT "advances_company_id_project_id_fkey" FOREIGN KEY ("company_id", "project_id") REFERENCES "projects"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advances" ADD CONSTRAINT "advances_company_id_employee_id_fkey" FOREIGN KEY ("company_id", "employee_id") REFERENCES "memberships"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advances" ADD CONSTRAINT "advances_company_id_location_id_fkey" FOREIGN KEY ("company_id", "location_id") REFERENCES "locations"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advances" ADD CONSTRAINT "advances_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_balances" ADD CONSTRAINT "opening_balances_company_id_bank_id_fkey" FOREIGN KEY ("company_id", "bank_id") REFERENCES "banks"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_balances" ADD CONSTRAINT "opening_balances_company_id_employee_id_fkey" FOREIGN KEY ("company_id", "employee_id") REFERENCES "memberships"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_balances" ADD CONSTRAINT "opening_balances_company_id_location_id_fkey" FOREIGN KEY ("company_id", "location_id") REFERENCES "locations"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_balances" ADD CONSTRAINT "opening_balances_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_trail" ADD CONSTRAINT "audit_trail_company_id_requester_id_fkey" FOREIGN KEY ("company_id", "requester_id") REFERENCES "memberships"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_trail" ADD CONSTRAINT "audit_trail_company_id_supervisor_id_fkey" FOREIGN KEY ("company_id", "supervisor_id") REFERENCES "memberships"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_trail" ADD CONSTRAINT "audit_trail_company_id_location_id_fkey" FOREIGN KEY ("company_id", "location_id") REFERENCES "locations"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_trail" ADD CONSTRAINT "audit_trail_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_company_id_employee_id_fkey" FOREIGN KEY ("company_id", "employee_id") REFERENCES "memberships"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_company_id_requester_id_fkey" FOREIGN KEY ("company_id", "requester_id") REFERENCES "memberships"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_company_id_location_id_fkey" FOREIGN KEY ("company_id", "location_id") REFERENCES "locations"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_company_id_product_id_fkey" FOREIGN KEY ("company_id", "product_id") REFERENCES "products"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_company_id_warehouse_id_fkey" FOREIGN KEY ("company_id", "warehouse_id") REFERENCES "warehouses"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_company_id_employee_id_fkey" FOREIGN KEY ("company_id", "employee_id") REFERENCES "memberships"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_company_id_customer_id_fkey" FOREIGN KEY ("company_id", "customer_id") REFERENCES "customers"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_company_id_warehouse_id_fkey" FOREIGN KEY ("company_id", "warehouse_id") REFERENCES "warehouses"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_company_id_employee_id_fkey" FOREIGN KEY ("company_id", "employee_id") REFERENCES "memberships"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_company_id_location_id_fkey" FOREIGN KEY ("company_id", "location_id") REFERENCES "locations"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_company_id_voided_by_id_fkey" FOREIGN KEY ("company_id", "voided_by_id") REFERENCES "memberships"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_lines" ADD CONSTRAINT "sales_invoice_lines_company_id_invoice_id_fkey" FOREIGN KEY ("company_id", "invoice_id") REFERENCES "sales_invoices"("company_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_lines" ADD CONSTRAINT "sales_invoice_lines_company_id_product_id_fkey" FOREIGN KEY ("company_id", "product_id") REFERENCES "products"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_lines" ADD CONSTRAINT "sales_invoice_lines_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_assessments" ADD CONSTRAINT "inventory_assessments_company_id_employee_id_fkey" FOREIGN KEY ("company_id", "employee_id") REFERENCES "memberships"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_assessments" ADD CONSTRAINT "inventory_assessments_company_id_location_id_fkey" FOREIGN KEY ("company_id", "location_id") REFERENCES "locations"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_assessments" ADD CONSTRAINT "inventory_assessments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_assessment_lines" ADD CONSTRAINT "inventory_assessment_lines_company_id_assessment_id_fkey" FOREIGN KEY ("company_id", "assessment_id") REFERENCES "inventory_assessments"("company_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_assessment_lines" ADD CONSTRAINT "inventory_assessment_lines_company_id_product_id_fkey" FOREIGN KEY ("company_id", "product_id") REFERENCES "products"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_assessment_lines" ADD CONSTRAINT "inventory_assessment_lines_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_payments" ADD CONSTRAINT "sales_invoice_payments_company_id_invoice_id_fkey" FOREIGN KEY ("company_id", "invoice_id") REFERENCES "sales_invoices"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_payments" ADD CONSTRAINT "sales_invoice_payments_company_id_income_id_fkey" FOREIGN KEY ("company_id", "income_id") REFERENCES "incomes"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_payments" ADD CONSTRAINT "sales_invoice_payments_company_id_employee_id_fkey" FOREIGN KEY ("company_id", "employee_id") REFERENCES "memberships"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_payments" ADD CONSTRAINT "sales_invoice_payments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_company_id_supplier_id_fkey" FOREIGN KEY ("company_id", "supplier_id") REFERENCES "suppliers"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_company_id_warehouse_id_fkey" FOREIGN KEY ("company_id", "warehouse_id") REFERENCES "warehouses"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_company_id_employee_id_fkey" FOREIGN KEY ("company_id", "employee_id") REFERENCES "memberships"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_company_id_location_id_fkey" FOREIGN KEY ("company_id", "location_id") REFERENCES "locations"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_company_id_voided_by_id_fkey" FOREIGN KEY ("company_id", "voided_by_id") REFERENCES "memberships"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_lines" ADD CONSTRAINT "purchase_invoice_lines_company_id_invoice_id_fkey" FOREIGN KEY ("company_id", "invoice_id") REFERENCES "purchase_invoices"("company_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_lines" ADD CONSTRAINT "purchase_invoice_lines_company_id_product_id_fkey" FOREIGN KEY ("company_id", "product_id") REFERENCES "products"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_lines" ADD CONSTRAINT "purchase_invoice_lines_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_company_id_parent_id_fkey" FOREIGN KEY ("company_id", "parent_id") REFERENCES "accounts"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_company_id_employee_id_fkey" FOREIGN KEY ("company_id", "employee_id") REFERENCES "memberships"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_company_id_location_id_fkey" FOREIGN KEY ("company_id", "location_id") REFERENCES "locations"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_company_id_reversal_of_id_fkey" FOREIGN KEY ("company_id", "reversal_of_id") REFERENCES "journal_entries"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_company_id_entry_id_fkey" FOREIGN KEY ("company_id", "entry_id") REFERENCES "journal_entries"("company_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_company_id_account_id_fkey" FOREIGN KEY ("company_id", "account_id") REFERENCES "accounts"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_company_id_cost_center_id_fkey" FOREIGN KEY ("company_id", "cost_center_id") REFERENCES "cost_centers"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_company_id_project_id_fkey" FOREIGN KEY ("company_id", "project_id") REFERENCES "projects"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_company_id_project_id_fkey" FOREIGN KEY ("company_id", "project_id") REFERENCES "projects"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_company_id_location_id_fkey" FOREIGN KEY ("company_id", "location_id") REFERENCES "locations"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_payments" ADD CONSTRAINT "purchase_invoice_payments_company_id_invoice_id_fkey" FOREIGN KEY ("company_id", "invoice_id") REFERENCES "purchase_invoices"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_payments" ADD CONSTRAINT "purchase_invoice_payments_company_id_outcome_id_fkey" FOREIGN KEY ("company_id", "outcome_id") REFERENCES "outcomes"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_payments" ADD CONSTRAINT "purchase_invoice_payments_company_id_employee_id_fkey" FOREIGN KEY ("company_id", "employee_id") REFERENCES "memberships"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_payments" ADD CONSTRAINT "purchase_invoice_payments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_policies" ADD CONSTRAINT "accounting_policies_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fx_revaluations" ADD CONSTRAINT "fx_revaluations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_years" ADD CONSTRAINT "fiscal_years_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_periods" ADD CONSTRAINT "fiscal_periods_company_id_year_id_fkey" FOREIGN KEY ("company_id", "year_id") REFERENCES "fiscal_years"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_periods" ADD CONSTRAINT "fiscal_periods_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_company_id_budget_id_fkey" FOREIGN KEY ("company_id", "budget_id") REFERENCES "budgets"("company_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_company_id_account_id_fkey" FOREIGN KEY ("company_id", "account_id") REFERENCES "accounts"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_currencies" ADD CONSTRAINT "company_currencies_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_rates" ADD CONSTRAINT "daily_rates_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "open_items" ADD CONSTRAINT "open_items_company_id_customer_id_fkey" FOREIGN KEY ("company_id", "customer_id") REFERENCES "customers"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "open_items" ADD CONSTRAINT "open_items_company_id_supplier_id_fkey" FOREIGN KEY ("company_id", "supplier_id") REFERENCES "suppliers"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "open_items" ADD CONSTRAINT "open_items_company_id_borrower_id_fkey" FOREIGN KEY ("company_id", "borrower_id") REFERENCES "borrowers"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "open_items" ADD CONSTRAINT "open_items_company_id_location_id_fkey" FOREIGN KEY ("company_id", "location_id") REFERENCES "locations"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "open_items" ADD CONSTRAINT "open_items_company_id_employee_id_fkey" FOREIGN KEY ("company_id", "employee_id") REFERENCES "memberships"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "open_items" ADD CONSTRAINT "open_items_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "open_item_allocations" ADD CONSTRAINT "open_item_allocations_company_id_open_item_id_fkey" FOREIGN KEY ("company_id", "open_item_id") REFERENCES "open_items"("company_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "open_item_allocations" ADD CONSTRAINT "open_item_allocations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_entries" ADD CONSTRAINT "opening_entries_company_id_employee_id_fkey" FOREIGN KEY ("company_id", "employee_id") REFERENCES "memberships"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_entries" ADD CONSTRAINT "opening_entries_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_account_lines" ADD CONSTRAINT "opening_account_lines_company_id_entry_id_fkey" FOREIGN KEY ("company_id", "entry_id") REFERENCES "opening_entries"("company_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_account_lines" ADD CONSTRAINT "opening_account_lines_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_stock_lines" ADD CONSTRAINT "opening_stock_lines_company_id_entry_id_fkey" FOREIGN KEY ("company_id", "entry_id") REFERENCES "opening_entries"("company_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_stock_lines" ADD CONSTRAINT "opening_stock_lines_company_id_product_id_fkey" FOREIGN KEY ("company_id", "product_id") REFERENCES "products"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_stock_lines" ADD CONSTRAINT "opening_stock_lines_company_id_warehouse_id_fkey" FOREIGN KEY ("company_id", "warehouse_id") REFERENCES "warehouses"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_stock_lines" ADD CONSTRAINT "opening_stock_lines_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_company_id_owner_id_fkey" FOREIGN KEY ("company_id", "owner_id") REFERENCES "memberships"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_company_id_customer_id_fkey" FOREIGN KEY ("company_id", "customer_id") REFERENCES "customers"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_company_id_customer_id_fkey" FOREIGN KEY ("company_id", "customer_id") REFERENCES "customers"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_company_id_owner_id_fkey" FOREIGN KEY ("company_id", "owner_id") REFERENCES "memberships"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_company_id_owner_id_fkey" FOREIGN KEY ("company_id", "owner_id") REFERENCES "memberships"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_company_id_customer_id_fkey" FOREIGN KEY ("company_id", "customer_id") REFERENCES "customers"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_company_id_lead_id_fkey" FOREIGN KEY ("company_id", "lead_id") REFERENCES "leads"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_company_id_opportunity_id_fkey" FOREIGN KEY ("company_id", "opportunity_id") REFERENCES "opportunities"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_company_id_parent_id_fkey" FOREIGN KEY ("company_id", "parent_id") REFERENCES "quotes"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_company_id_customer_id_fkey" FOREIGN KEY ("company_id", "customer_id") REFERENCES "customers"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_company_id_opportunity_id_fkey" FOREIGN KEY ("company_id", "opportunity_id") REFERENCES "opportunities"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_company_id_employee_id_fkey" FOREIGN KEY ("company_id", "employee_id") REFERENCES "memberships"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_company_id_sales_invoice_id_fkey" FOREIGN KEY ("company_id", "sales_invoice_id") REFERENCES "sales_invoices"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_company_id_quote_id_fkey" FOREIGN KEY ("company_id", "quote_id") REFERENCES "quotes"("company_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_company_id_product_id_fkey" FOREIGN KEY ("company_id", "product_id") REFERENCES "products"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- ===== Hand-written rules carried over from the finance migrations (Prisma does not model them) =====

-- From 20260924033000_warehouse: a barcode is unique per company when it is set.
CREATE UNIQUE INDEX "products_company_barcode_key" ON "products"("company_id", "barcode") WHERE "barcode" <> '';

-- From 20261014100100_custody_subledger_office_dimension: income and expense lines need an office
-- cost center. The rule lives in the database, not only in the API.
CREATE OR REPLACE FUNCTION journal_lines_center_guard() RETURNS trigger AS $$
BEGIN
  IF NEW."cost_center_id" IS NULL AND EXISTS (
    SELECT 1 FROM "accounts" a WHERE a."id" = NEW."account_id" AND a."type" IN ('INCOME', 'EXPENSE')
  ) THEN
    RAISE EXCEPTION 'COST_CENTER_REQUIRED: income and expense lines need an office cost center';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER journal_lines_center_guard
BEFORE INSERT OR UPDATE OF "cost_center_id", "account_id" ON "journal_lines"
FOR EACH ROW EXECUTE FUNCTION journal_lines_center_guard();
