-- AlterTable
ALTER TABLE "products" ADD COLUMN "unit_nrv" DECIMAL(18,4),
ADD COLUMN "nrv_currency" "Currency",
ADD COLUMN "inventory_allowance" DECIMAL(18,4) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "sales_invoice_lines" ADD COLUMN "nrv_release" DECIMAL(18,4) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "inventory_assessments" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT 'tradivia',
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
    "assessment_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit_cost" DECIMAL(18,4) NOT NULL,
    "unit_nrv" DECIMAL(18,4) NOT NULL,
    "allowance_before" DECIMAL(18,4) NOT NULL,
    "allowance_after" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "inventory_assessment_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_assessments_company_id_reference_key" ON "inventory_assessments"("company_id", "reference");

-- CreateIndex
CREATE INDEX "inventory_assessments_company_id_transaction_date_idx" ON "inventory_assessments"("company_id", "transaction_date");

-- CreateIndex
CREATE INDEX "inventory_assessments_employee_id_idx" ON "inventory_assessments"("employee_id");

-- CreateIndex
CREATE INDEX "inventory_assessments_location_id_idx" ON "inventory_assessments"("location_id");

-- CreateIndex
CREATE INDEX "inventory_assessment_lines_assessment_id_idx" ON "inventory_assessment_lines"("assessment_id");

-- CreateIndex
CREATE INDEX "inventory_assessment_lines_product_id_idx" ON "inventory_assessment_lines"("product_id");

-- AddForeignKey
ALTER TABLE "inventory_assessments" ADD CONSTRAINT "inventory_assessments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_assessments" ADD CONSTRAINT "inventory_assessments_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_assessment_lines" ADD CONSTRAINT "inventory_assessment_lines_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "inventory_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_assessment_lines" ADD CONSTRAINT "inventory_assessment_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
