-- Phase 5: Realized FX tracking on OpenItemAllocation and FX_GAIN_LOSS account
ALTER TABLE "open_item_allocations"
  ADD COLUMN IF NOT EXISTS "settlement_fx_rate" DECIMAL(18, 6),
  ADD COLUMN IF NOT EXISTS "fx_difference" DECIMAL(18, 4) NOT NULL DEFAULT 0;
