-- CreateEnum
CREATE TYPE "Role" AS ENUM ('GENERAL_MANAGER', 'SUPERVISOR', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('USD', 'SYP');

-- CreateEnum
CREATE TYPE "FundType" AS ENUM ('VAULT', 'SHAM_CASH', 'ADVANCES', 'BANK');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('COMPLETED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'DELETED');

-- CreateEnum
CREATE TYPE "ExchangeType" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "AdvanceType" AS ENUM ('GRANT', 'REPAY');

-- CreateEnum
CREATE TYPE "AuditActionType" AS ENUM ('UPDATE', 'DELETE');

-- CreateEnum
CREATE TYPE "AuditRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('UNREAD', 'READ');

-- CreateTable
CREATE TABLE "locations" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT 'tradivia',
    "name" TEXT NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT 'tradivia',
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "location_id" TEXT,
    "account_status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "borrowers" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT 'tradivia',
    "name" TEXT NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "borrowers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT 'tradivia',
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
    "company_id" TEXT NOT NULL DEFAULT 'tradivia',
    "name" TEXT NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "banks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incomes" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT 'tradivia',
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
    "company_id" TEXT NOT NULL DEFAULT 'tradivia',
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
    "company_id" TEXT NOT NULL DEFAULT 'tradivia',
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
    "company_id" TEXT NOT NULL DEFAULT 'tradivia',
    "operation_number" INTEGER NOT NULL,
    "transaction_date" DATE NOT NULL,
    "system_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "from_fund" "FundType" NOT NULL,
    "to_fund" "FundType" NOT NULL,
    "from_bank_id" TEXT,
    "to_bank_id" TEXT,
    "currency" "Currency" NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "borrower_id" TEXT,
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
    "company_id" TEXT NOT NULL DEFAULT 'tradivia',
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
    "company_id" TEXT NOT NULL DEFAULT 'tradivia',
    "operation_number" INTEGER NOT NULL,
    "transaction_date" DATE NOT NULL,
    "system_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fund" "FundType" NOT NULL,
    "bank_id" TEXT,
    "currency" "Currency" NOT NULL,
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
    "company_id" TEXT NOT NULL DEFAULT 'tradivia',
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
    "company_id" TEXT NOT NULL DEFAULT 'tradivia',
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

-- CreateIndex
CREATE INDEX "locations_company_id_idx" ON "locations"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "locations_company_id_name_key" ON "locations"("company_id", "name");

-- CreateIndex
CREATE INDEX "employees_company_id_idx" ON "employees"("company_id");

-- CreateIndex
CREATE INDEX "employees_role_idx" ON "employees"("role");

-- CreateIndex
CREATE INDEX "employees_location_id_idx" ON "employees"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "employees_company_id_name_key" ON "employees"("company_id", "name");

-- CreateIndex
CREATE INDEX "borrowers_company_id_idx" ON "borrowers"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "borrowers_company_id_name_key" ON "borrowers"("company_id", "name");

-- CreateIndex
CREATE INDEX "projects_company_id_idx" ON "projects"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "projects_company_id_name_key" ON "projects"("company_id", "name");

-- CreateIndex
CREATE INDEX "banks_company_id_idx" ON "banks"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "banks_company_id_name_key" ON "banks"("company_id", "name");

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
CREATE INDEX "opening_balances_company_id_fund_currency_idx" ON "opening_balances"("company_id", "fund", "currency");

-- CreateIndex
CREATE INDEX "opening_balances_employee_id_idx" ON "opening_balances"("employee_id");

-- CreateIndex
CREATE INDEX "opening_balances_location_id_idx" ON "opening_balances"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "opening_balances_company_id_reference_key" ON "opening_balances"("company_id", "reference");

-- CreateIndex
CREATE INDEX "audit_trail_company_id_request_status_idx" ON "audit_trail"("company_id", "request_status");

-- CreateIndex
CREATE INDEX "audit_trail_original_reference_idx" ON "audit_trail"("original_reference");

-- CreateIndex
CREATE INDEX "audit_trail_requester_id_idx" ON "audit_trail"("requester_id");

-- CreateIndex
CREATE INDEX "audit_trail_location_id_idx" ON "audit_trail"("location_id");

-- CreateIndex
CREATE INDEX "notifications_company_id_employee_id_status_idx" ON "notifications"("company_id", "employee_id", "status");

-- CreateIndex
CREATE INDEX "notifications_reference_idx" ON "notifications"("reference");

-- CreateIndex
CREATE INDEX "notifications_location_id_idx" ON "notifications"("location_id");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_bank_id_fkey" FOREIGN KEY ("bank_id") REFERENCES "banks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_bank_id_fkey" FOREIGN KEY ("bank_id") REFERENCES "banks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchanges" ADD CONSTRAINT "exchanges_bank_id_fkey" FOREIGN KEY ("bank_id") REFERENCES "banks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchanges" ADD CONSTRAINT "exchanges_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchanges" ADD CONSTRAINT "exchanges_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_from_bank_id_fkey" FOREIGN KEY ("from_bank_id") REFERENCES "banks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_to_bank_id_fkey" FOREIGN KEY ("to_bank_id") REFERENCES "banks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_borrower_id_fkey" FOREIGN KEY ("borrower_id") REFERENCES "borrowers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advances" ADD CONSTRAINT "advances_borrower_id_fkey" FOREIGN KEY ("borrower_id") REFERENCES "borrowers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advances" ADD CONSTRAINT "advances_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advances" ADD CONSTRAINT "advances_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advances" ADD CONSTRAINT "advances_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_balances" ADD CONSTRAINT "opening_balances_bank_id_fkey" FOREIGN KEY ("bank_id") REFERENCES "banks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_balances" ADD CONSTRAINT "opening_balances_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_balances" ADD CONSTRAINT "opening_balances_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_trail" ADD CONSTRAINT "audit_trail_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_trail" ADD CONSTRAINT "audit_trail_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_trail" ADD CONSTRAINT "audit_trail_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
