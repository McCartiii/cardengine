-- Bring the migration history in line with schema.prisma. Production has been
-- kept in sync via `prisma db push`, so every statement is idempotent.

-- AlterTable: perceptual hashes for the scanner index
ALTER TABLE "CardVariant"
ADD COLUMN IF NOT EXISTS "d_hash" TEXT,
ADD COLUMN IF NOT EXISTS "p_hash" TEXT,
ADD COLUMN IF NOT EXISTS "foil_d_hash" TEXT,
ADD COLUMN IF NOT EXISTS "foil_p_hash" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PricePoint_variantId_at_idx" ON "PricePoint"("variantId", "at");

-- AlterForeignKey: deleting a variant unlinks deck cards instead of failing
ALTER TABLE "DeckCard" DROP CONSTRAINT IF EXISTS "DeckCard_variantId_fkey";
ALTER TABLE "DeckCard" ADD CONSTRAINT "DeckCard_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "CardVariant"("variantId") ON DELETE SET NULL ON UPDATE CASCADE;
