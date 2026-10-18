CREATE TABLE "accounting_policies" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT 'tradivia',
    "functional_currency" "Currency" NOT NULL DEFAULT 'SYP',
    "inventory_method" TEXT NOT NULL DEFAULT 'WAC',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_policies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "accounting_policies_company_id_key" ON "accounting_policies"("company_id");
