-- AlterTable
ALTER TABLE "accounts" ADD COLUMN "statement_line" TEXT NOT NULL DEFAULT '';

UPDATE "accounts" SET "statement_line" = CASE "code"
  WHEN '1110' THEN 'CASH'
  WHEN '1120' THEN 'CASH'
  WHEN '1130' THEN 'CASH'
  WHEN '1200' THEN 'RECEIVABLES'
  WHEN '1300' THEN 'ADVANCES'
  WHEN '1400' THEN 'INVENTORY'
  WHEN '2100' THEN 'PAYABLES'
  WHEN '3100' THEN 'CAPITAL'
  WHEN '3200' THEN 'RETAINED'
  WHEN '4100' THEN 'SALES'
  WHEN '4200' THEN 'FX_GAIN'
  WHEN '4900' THEN 'OTHER_INCOME'
  WHEN '5100' THEN 'COGS'
  WHEN '5200' THEN 'OPEX'
  WHEN '5300' THEN 'FX_LOSS'
  ELSE "statement_line"
END;

UPDATE "accounts" SET "statement_line" = CASE "type"::text
  WHEN 'ASSET' THEN 'OTHER_ASSETS'
  WHEN 'LIABILITY' THEN 'OTHER_LIABILITIES'
  WHEN 'EQUITY' THEN 'OTHER_EQUITY'
  WHEN 'INCOME' THEN 'OTHER_INCOME'
  ELSE 'OTHER_EXPENSE'
END
WHERE "statement_line" = '';

-- CreateEnum
CREATE TYPE "PeriodStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "BudgetStatus" AS ENUM ('DRAFT', 'ACTIVE');

-- CreateTable
CREATE TABLE "fiscal_years" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT 'tradivia',
    "year" INTEGER NOT NULL,
    "status" "PeriodStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_periods" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT 'tradivia',
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
    "company_id" TEXT NOT NULL DEFAULT 'tradivia',
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
    "budget_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "budget_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fiscal_years_company_id_idx" ON "fiscal_years"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_years_company_id_year_key" ON "fiscal_years"("company_id", "year");

-- CreateIndex
CREATE INDEX "fiscal_periods_company_id_status_idx" ON "fiscal_periods"("company_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_periods_company_id_year_month_key" ON "fiscal_periods"("company_id", "year", "month");

-- CreateIndex
CREATE INDEX "budgets_company_id_year_idx" ON "budgets"("company_id", "year");

-- CreateIndex
CREATE UNIQUE INDEX "budgets_company_id_year_currency_name_key" ON "budgets"("company_id", "year", "currency", "name");

-- CreateIndex
CREATE INDEX "budget_lines_account_id_idx" ON "budget_lines"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "budget_lines_budget_id_account_id_month_key" ON "budget_lines"("budget_id", "account_id", "month");

-- AddForeignKey
ALTER TABLE "fiscal_periods" ADD CONSTRAINT "fiscal_periods_year_id_fkey" FOREIGN KEY ("year_id") REFERENCES "fiscal_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
