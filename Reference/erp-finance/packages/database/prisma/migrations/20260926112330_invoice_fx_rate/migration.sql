-- AlterTable
ALTER TABLE "purchase_invoices" ADD COLUMN     "fx_rate" DECIMAL(18,6);

-- AlterTable
ALTER TABLE "sales_invoices" ADD COLUMN     "fx_rate" DECIMAL(18,6);
