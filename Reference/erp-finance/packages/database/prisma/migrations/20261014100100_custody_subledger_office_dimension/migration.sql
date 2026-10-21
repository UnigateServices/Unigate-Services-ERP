-- Phase 4 / step 2
--   A. Borrower custody leaves the fund concept. FundType becomes VAULT | SHAM_CASH | BANK.
--      Former "transfers to/from ADVANCES" become real custody vouchers (advances ISSUE / RETURN).
--   B. OpenItem grows a borrower party so custody lives in a sub-ledger under control account 1300.
--      The sub-ledger rows themselves are built by the TypeScript backfill (npm run db:backfill:custody)
--      because it has to post missing journals through the same builders the API uses.
--   C. Office becomes a mandatory analytic dimension on income/expense lines and the project becomes its own
--      dimension (journal_lines.project_id) instead of replacing the office.

-- 0. Refuse to continue if anything else still points at the ADVANCES fund.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM incomes WHERE fund = 'ADVANCES')
     OR EXISTS (SELECT 1 FROM outcomes WHERE fund = 'ADVANCES')
     OR EXISTS (SELECT 1 FROM exchanges WHERE fund = 'ADVANCES')
     OR EXISTS (SELECT 1 FROM opening_balances WHERE fund = 'ADVANCES')
     OR EXISTS (SELECT 1 FROM transfers WHERE from_fund = 'ADVANCES' AND to_fund = 'ADVANCES')
     OR EXISTS (SELECT 1 FROM transfers WHERE (from_fund = 'ADVANCES' OR to_fund = 'ADVANCES') AND borrower_id IS NULL)
  THEN
    RAISE EXCEPTION 'ADVANCES_FUND_IN_USE: resolve operations that still use the ADVANCES fund before migrating';
  END IF;
END $$;

-- 1. Columns
ALTER TABLE "advances" ADD COLUMN "fund" "FundType", ADD COLUMN "bank_id" TEXT;
ALTER TABLE "open_items"
  ADD COLUMN "borrower_id" TEXT,
  ADD COLUMN "location_id" TEXT,
  ADD COLUMN "employee_id" TEXT;
ALTER TABLE "journal_lines" ADD COLUMN "project_id" TEXT;

-- 2. Former borrower transfers become custody vouchers. The id is kept so journal links survive.
INSERT INTO "advances" (
  "id", "company_id", "operation_number", "transaction_date", "system_date", "borrower_id", "advance_type",
  "project_id", "description", "receiver", "currency", "quantity", "amount", "exchange_rate", "total",
  "from_currency", "to_currency", "fund", "bank_id", "attachments", "notes", "employee_id", "location_id",
  "status", "reference", "created_at", "updated_at", "deleted_at"
)
SELECT
  t."id", t."company_id", t."operation_number", t."transaction_date", t."system_date", t."borrower_id",
  CASE WHEN t."to_fund" = 'ADVANCES' THEN 'ISSUE'::"AdvanceType" ELSE 'RETURN'::"AdvanceType" END,
  NULL, '', '', t."currency", NULL, t."amount", t."fx_rate", t."amount",
  NULL, NULL,
  CASE WHEN t."to_fund" = 'ADVANCES' THEN t."from_fund" ELSE t."to_fund" END,
  CASE WHEN t."to_fund" = 'ADVANCES' THEN t."from_bank_id" ELSE t."to_bank_id" END,
  t."attachments", t."notes", t."employee_id", t."location_id",
  t."status", t."reference", t."created_at", t."updated_at", t."deleted_at"
FROM "transfers" t
WHERE t."from_fund" = 'ADVANCES' OR t."to_fund" = 'ADVANCES';

UPDATE "journal_entries" je
SET "source_type" = 'ADVANCE',
    "source_key" = CASE WHEN je."source_key" IS NULL THEN NULL ELSE 'ADVANCE:' || je."source_id" END
WHERE je."source_type" = 'TRANSFER'
  AND je."source_id" IN (SELECT a."id" FROM "advances" a WHERE a."fund" IS NOT NULL);

DELETE FROM "transfers" WHERE "from_fund" = 'ADVANCES' OR "to_fund" = 'ADVANCES';
ALTER TABLE "transfers" DROP COLUMN "borrower_id";

-- 3. FundType without ADVANCES
ALTER TYPE "FundType" RENAME TO "FundType_old";
CREATE TYPE "FundType" AS ENUM ('VAULT', 'SHAM_CASH', 'BANK');
ALTER TABLE "incomes" ALTER COLUMN "fund" TYPE "FundType" USING "fund"::text::"FundType";
ALTER TABLE "outcomes" ALTER COLUMN "fund" TYPE "FundType" USING "fund"::text::"FundType";
ALTER TABLE "exchanges" ALTER COLUMN "fund" TYPE "FundType" USING "fund"::text::"FundType";
ALTER TABLE "opening_balances" ALTER COLUMN "fund" TYPE "FundType" USING "fund"::text::"FundType";
ALTER TABLE "transfers" ALTER COLUMN "from_fund" TYPE "FundType" USING "from_fund"::text::"FundType";
ALTER TABLE "transfers" ALTER COLUMN "to_fund" TYPE "FundType" USING "to_fund"::text::"FundType";
ALTER TABLE "advances" ALTER COLUMN "fund" TYPE "FundType" USING "fund"::text::"FundType";
DROP TYPE "FundType_old";

-- 4. Keys and indexes
ALTER TABLE "advances" ADD CONSTRAINT "advances_bank_id_fkey"
  FOREIGN KEY ("bank_id") REFERENCES "banks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "open_items" ADD CONSTRAINT "open_items_borrower_id_fkey"
  FOREIGN KEY ("borrower_id") REFERENCES "borrowers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "open_items" ADD CONSTRAINT "open_items_location_id_fkey"
  FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "open_items" ADD CONSTRAINT "open_items_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "open_items_borrower_id_currency_status_idx" ON "open_items"("borrower_id", "currency", "status");
CREATE INDEX "journal_lines_project_id_idx" ON "journal_lines"("project_id");

-- 5. Office dimension. Every location owns a center, plus one head-office center for company-level entries.
INSERT INTO "cost_centers" ("id", "company_id", "code", "name", "kind", "status", "location_id", "created_at", "updated_at")
SELECT 'cc_' || replace(gen_random_uuid()::text, '-', ''), l."company_id", 'L-' || l."id", l."name",
       'LOCATION'::"CostCenterKind", l."status", l."id", now(), now()
FROM "locations" l
WHERE NOT EXISTS (SELECT 1 FROM "cost_centers" c WHERE c."location_id" = l."id");

INSERT INTO "cost_centers" ("id", "company_id", "code", "name", "kind", "status", "created_at", "updated_at")
SELECT 'cc_hq_' || co."company_id", co."company_id", 'HQ', 'المركز الرئيسي', 'MANUAL'::"CostCenterKind", 'ACTIVE'::"RecordStatus", now(), now()
FROM (SELECT DISTINCT "company_id" FROM "accounts") co
ON CONFLICT ("company_id", "code") DO NOTHING;

-- Project centers move to the project dimension...
UPDATE "journal_lines" jl
SET "project_id" = cc."project_id"
FROM "cost_centers" cc
WHERE jl."cost_center_id" = cc."id" AND cc."project_id" IS NOT NULL;

-- ...and the office dimension is derived from the entry office (head office when the entry has none).
UPDATE "journal_lines" jl
SET "cost_center_id" = (
  SELECT COALESCE(
    (SELECT c."id" FROM "cost_centers" c WHERE c."location_id" = je."location_id"),
    CASE WHEN a."type" IN ('INCOME', 'EXPENSE')
      THEN (SELECT c."id" FROM "cost_centers" c WHERE c."company_id" = je."company_id" AND c."code" = 'HQ')
    END
  )
  FROM "journal_entries" je, "accounts" a
  WHERE je."id" = jl."entry_id" AND a."id" = jl."account_id"
)
WHERE jl."cost_center_id" IS NULL
   OR jl."cost_center_id" IN (SELECT "id" FROM "cost_centers" WHERE "kind" = 'PROJECT');

-- 6. The rule lives in the database, not only in the API.
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
