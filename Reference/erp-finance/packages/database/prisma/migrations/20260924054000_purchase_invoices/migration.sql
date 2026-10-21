-- AlterEnum
ALTER TYPE "StockSourceType" ADD VALUE 'PURCHASE_RECEIPT';
ALTER TYPE "StockSourceType" ADD VALUE 'PURCHASE_RETURN';

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT 'tradivia',
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
    "company_id" TEXT NOT NULL DEFAULT 'tradivia',
    "number" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "transaction_date" DATE NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "supplier_name" TEXT NOT NULL,
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

    CONSTRAINT "purchase_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_invoice_lines" (
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

    CONSTRAINT "purchase_invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_invoice_payments" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT 'tradivia',
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

CREATE UNIQUE INDEX "suppliers_company_id_name_key" ON "suppliers"("company_id", "name");
CREATE INDEX "suppliers_company_id_status_idx" ON "suppliers"("company_id", "status");

CREATE UNIQUE INDEX "purchase_invoices_company_id_number_key" ON "purchase_invoices"("company_id", "number");
CREATE UNIQUE INDEX "purchase_invoices_company_id_reference_key" ON "purchase_invoices"("company_id", "reference");
CREATE INDEX "purchase_invoices_company_id_status_transaction_date_idx" ON "purchase_invoices"("company_id", "status", "transaction_date");
CREATE INDEX "purchase_invoices_supplier_id_idx" ON "purchase_invoices"("supplier_id");
CREATE INDEX "purchase_invoices_warehouse_id_idx" ON "purchase_invoices"("warehouse_id");
CREATE INDEX "purchase_invoices_employee_id_idx" ON "purchase_invoices"("employee_id");
CREATE INDEX "purchase_invoices_location_id_idx" ON "purchase_invoices"("location_id");

CREATE INDEX "purchase_invoice_lines_invoice_id_idx" ON "purchase_invoice_lines"("invoice_id");
CREATE INDEX "purchase_invoice_lines_product_id_idx" ON "purchase_invoice_lines"("product_id");

CREATE UNIQUE INDEX "purchase_invoice_payments_outcome_id_key" ON "purchase_invoice_payments"("outcome_id");
CREATE INDEX "purchase_invoice_payments_company_id_invoice_id_idx" ON "purchase_invoice_payments"("company_id", "invoice_id");
CREATE INDEX "purchase_invoice_payments_employee_id_idx" ON "purchase_invoice_payments"("employee_id");

ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_voided_by_id_fkey" FOREIGN KEY ("voided_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "purchase_invoice_lines" ADD CONSTRAINT "purchase_invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "purchase_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_invoice_lines" ADD CONSTRAINT "purchase_invoice_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_invoice_payments" ADD CONSTRAINT "purchase_invoice_payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "purchase_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_invoice_payments" ADD CONSTRAINT "purchase_invoice_payments_outcome_id_fkey" FOREIGN KEY ("outcome_id") REFERENCES "outcomes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_invoice_payments" ADD CONSTRAINT "purchase_invoice_payments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
