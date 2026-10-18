ALTER TABLE "journal_entries" ADD COLUMN "source_type" TEXT,
ADD COLUMN "source_id" TEXT,
ADD COLUMN "source_key" TEXT,
ADD COLUMN "exchange" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "journal_entries_source_key_key" ON "journal_entries"("source_key");
