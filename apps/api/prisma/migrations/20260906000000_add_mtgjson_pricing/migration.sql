-- AlterTable
ALTER TABLE "CardVariant"
ADD COLUMN IF NOT EXISTS "mtgjson_uuid" TEXT;

-- AlterTable
ALTER TABLE "PricePoint"
ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'scryfall';

-- AlterTable
ALTER TABLE "PriceCache"
ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'scryfall';

-- CreateTable
CREATE TABLE IF NOT EXISTS "JobLease" (
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobLease_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PriceStage" (
    "runId" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "sourceDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceStage_pkey" PRIMARY KEY ("runId", "market", "variantId", "kind", "currency")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CardVariant_mtgjson_uuid_idx" ON "CardVariant"("mtgjson_uuid");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PriceStage_runId_idx" ON "PriceStage"("runId");
