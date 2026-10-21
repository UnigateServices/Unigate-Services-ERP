-- Sales document fields: customer identity, invoice due date, and discount as amount or percent.

CREATE TYPE "DiscountMode" AS ENUM ('AMOUNT', 'PERCENT');

ALTER TABLE "customers"
  ADD COLUMN "email" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "city" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "tax_number" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "payment_term_days" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "sales_invoices"
  ADD COLUMN "due_date" DATE,
  ADD COLUMN "customer_reference" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "discount_mode" "DiscountMode" NOT NULL DEFAULT 'AMOUNT',
  ADD COLUMN "discount_rate" DECIMAL(18,4) NOT NULL DEFAULT 0;

UPDATE "sales_invoices" SET "due_date" = "transaction_date" WHERE "due_date" IS NULL;
UPDATE "sales_invoices" SET "discount_rate" = "discount";

ALTER TABLE "sales_invoice_lines"
  ADD COLUMN "discount_mode" "DiscountMode" NOT NULL DEFAULT 'AMOUNT',
  ADD COLUMN "discount_rate" DECIMAL(18,4) NOT NULL DEFAULT 0;

UPDATE "sales_invoice_lines" SET "discount_rate" = "discount";
