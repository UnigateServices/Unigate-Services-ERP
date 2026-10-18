-- CreateEnum
CREATE TYPE "CostCenterKind" AS ENUM ('PROJECT', 'LOCATION', 'MANUAL');

-- AlterTable
ALTER TABLE "journal_lines" ADD COLUMN     "cost_center_id" TEXT;

-- CreateTable
CREATE TABLE "cost_centers" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT 'tradivia',
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

-- CreateIndex
CREATE UNIQUE INDEX "cost_centers_project_id_key" ON "cost_centers"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "cost_centers_location_id_key" ON "cost_centers"("location_id");

-- CreateIndex
CREATE INDEX "cost_centers_company_id_status_idx" ON "cost_centers"("company_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "cost_centers_company_id_code_key" ON "cost_centers"("company_id", "code");

-- CreateIndex
CREATE INDEX "journal_lines_cost_center_id_idx" ON "journal_lines"("cost_center_id");

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
