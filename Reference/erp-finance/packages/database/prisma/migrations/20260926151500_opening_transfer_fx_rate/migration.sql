-- AlterTable
ALTER TABLE "transfers" ADD COLUMN "fx_rate" DECIMAL(18,6);

-- AlterTable
ALTER TABLE "opening_balances" ADD COLUMN "fx_rate" DECIMAL(18,6);
