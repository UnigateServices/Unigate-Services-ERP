-- Phase 4 / step 1: new enum labels must be committed before the next migration uses them.
ALTER TYPE "AdvanceType" ADD VALUE IF NOT EXISTS 'ISSUE';
ALTER TYPE "AdvanceType" ADD VALUE IF NOT EXISTS 'RETURN';
ALTER TYPE "OpenItemParty" ADD VALUE IF NOT EXISTS 'BORROWER';
ALTER TYPE "OpenItemKind" ADD VALUE IF NOT EXISTS 'CUSTODY';
