-- CreateTable
CREATE TABLE "fx_revaluations" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT 'tradivia',
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

-- CreateIndex
CREATE INDEX "fx_revaluations_company_id_idx" ON "fx_revaluations"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "fx_revaluations_company_id_as_of_key" ON "fx_revaluations"("company_id", "as_of");
