-- Match GAS advances: صادر / تصريف (not GRANT / REPAY).
ALTER TYPE "AdvanceType" RENAME TO "AdvanceType_old";
CREATE TYPE "AdvanceType" AS ENUM ('OUTCOME', 'EXCHANGE');

ALTER TABLE "advances"
  ALTER COLUMN "advance_type" TYPE "AdvanceType"
  USING (
    CASE "advance_type"::text
      WHEN 'GRANT' THEN 'OUTCOME'::"AdvanceType"
      WHEN 'REPAY' THEN 'EXCHANGE'::"AdvanceType"
      ELSE 'OUTCOME'::"AdvanceType"
    END
  );

DROP TYPE "AdvanceType_old";
