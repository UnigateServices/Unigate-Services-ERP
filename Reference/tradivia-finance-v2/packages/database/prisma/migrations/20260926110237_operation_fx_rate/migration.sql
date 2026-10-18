-- AlterTable
ALTER TABLE "incomes" ADD COLUMN     "fx_rate" DECIMAL(18,6);

-- AlterTable
ALTER TABLE "journal_lines" ADD COLUMN     "fx_rate" DECIMAL(18,6);

-- AlterTable
ALTER TABLE "outcomes" ADD COLUMN     "fx_rate" DECIMAL(18,6);
