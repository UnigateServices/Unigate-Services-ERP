-- CreateEnum
CREATE TYPE "StockSourceType" AS ENUM ('MANUAL', 'SALES_ISSUE', 'SALES_RETURN');

-- CreateEnum
CREATE TYPE "SalesInvoiceStatus" AS ENUM ('DRAFT', 'POSTED', 'VOID');

-- CreateEnum
CREATE TYPE "SalesPaymentStatus" AS ENUM ('POSTED', 'REVERSED');

-- AlterTable
ALTER TABLE "stock_movements"
ADD COLUMN "source_type" "StockSourceType" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN "source_id" TEXT NOT NULL DEFAULT '',
ADD COLUMN "source_line_id" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "stock_movements_company_id_source_id_idx" ON "stock_movements"("company_id", "source_id");

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT 'tradivia',
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_invoices" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT 'tradivia',
    "number" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "transaction_date" DATE NOT NULL,
    "customer_id" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "warehouse_name" TEXT NOT NULL,
    "currency" "Currency" NOT NULL,
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

    CONSTRAINT "sales_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_invoice_lines" (
    "id" TEXT NOT NULL,
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

    CONSTRAINT "sales_invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_invoice_payments" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT 'tradivia',
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

-- CreateIndex
CREATE UNIQUE INDEX "customers_company_id_name_key" ON "customers"("company_id", "name");
CREATE INDEX "customers_company_id_status_idx" ON "customers"("company_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoices_company_id_number_key" ON "sales_invoices"("company_id", "number");
CREATE UNIQUE INDEX "sales_invoices_company_id_reference_key" ON "sales_invoices"("company_id", "reference");
CREATE INDEX "sales_invoices_company_id_status_transaction_date_idx" ON "sales_invoices"("company_id", "status", "transaction_date");
CREATE INDEX "sales_invoices_customer_id_idx" ON "sales_invoices"("customer_id");
CREATE INDEX "sales_invoices_warehouse_id_idx" ON "sales_invoices"("warehouse_id");
CREATE INDEX "sales_invoices_employee_id_idx" ON "sales_invoices"("employee_id");
CREATE INDEX "sales_invoices_location_id_idx" ON "sales_invoices"("location_id");

-- CreateIndex
CREATE INDEX "sales_invoice_lines_invoice_id_idx" ON "sales_invoice_lines"("invoice_id");
CREATE INDEX "sales_invoice_lines_product_id_idx" ON "sales_invoice_lines"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoice_payments_income_id_key" ON "sales_invoice_payments"("income_id");
CREATE INDEX "sales_invoice_payments_company_id_invoice_id_idx" ON "sales_invoice_payments"("company_id", "invoice_id");
CREATE INDEX "sales_invoice_payments_employee_id_idx" ON "sales_invoice_payments"("employee_id");

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_voided_by_id_fkey" FOREIGN KEY ("voided_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_lines" ADD CONSTRAINT "sales_invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "sales_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sales_invoice_lines" ADD CONSTRAINT "sales_invoice_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_payments" ADD CONSTRAINT "sales_invoice_payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "sales_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_invoice_payments" ADD CONSTRAINT "sales_invoice_payments_income_id_fkey" FOREIGN KEY ("income_id") REFERENCES "incomes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_invoice_payments" ADD CONSTRAINT "sales_invoice_payments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
