-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "minorSafe" BOOLEAN NOT NULL DEFAULT true,
    "date_of_birth" TIMESTAMP(3),
    "display_name" TEXT,
    "avatar_url" TEXT,
    "banned" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardVariant" (
    "variantId" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "printingId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "setId" TEXT,
    "collectorNumber" TEXT,
    "oracle_text" TEXT,
    "type_line" TEXT,
    "colors" JSONB,
    "color_identity" JSONB,
    "cmc" DOUBLE PRECISION,
    "mana_cost" TEXT,
    "rarity" TEXT,
    "image_uri" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardVariant_pkey" PRIMARY KEY ("variantId")
);

-- CreateTable
CREATE TABLE "CollectionEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "CollectionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricePoint" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "market" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "variantId" TEXT NOT NULL,

    CONSTRAINT "PricePoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceCache" (
    "id" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "variantId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatchlistEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "thresholdAmount" DOUBLE PRECISION NOT NULL,
    "direction" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WatchlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "country" TEXT NOT NULL DEFAULT 'US',
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "phone" TEXT,
    "website" TEXT,
    "hours" TEXT,
    "category" TEXT NOT NULL DEFAULT 'card_shop',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Checkin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Checkin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBlock" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EdhrecCache" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EdhrecCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScannerMismatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "ocrNameRaw" TEXT NOT NULL,
    "ocrCnRaw" TEXT,
    "ocrSetRaw" TEXT,
    "ocrConfidence" INTEGER NOT NULL,
    "candidateId" TEXT,
    "confirmedId" TEXT,
    "wasAutoConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScannerMismatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RulesDisagreement" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "formatId" TEXT NOT NULL,
    "game" TEXT NOT NULL DEFAULT 'mtg',
    "deckHash" TEXT,
    "violationCode" TEXT NOT NULL,
    "userDisputed" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RulesDisagreement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CardVariant_game_name_idx" ON "CardVariant"("game", "name");

-- CreateIndex
CREATE INDEX "CardVariant_game_setId_collectorNumber_idx" ON "CardVariant"("game", "setId", "collectorNumber");

-- CreateIndex
CREATE INDEX "CollectionEvent_userId_at_idx" ON "CollectionEvent"("userId", "at");

-- CreateIndex
CREATE INDEX "CollectionEvent_variantId_at_idx" ON "CollectionEvent"("variantId", "at");

-- CreateIndex
CREATE INDEX "PricePoint_market_variantId_at_idx" ON "PricePoint"("market", "variantId", "at");

-- CreateIndex
CREATE INDEX "PriceCache_variantId_idx" ON "PriceCache"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceCache_market_variantId_kind_currency_key" ON "PriceCache"("market", "variantId", "kind", "currency");

-- CreateIndex
CREATE INDEX "WatchlistEntry_userId_enabled_idx" ON "WatchlistEntry"("userId", "enabled");

-- CreateIndex
CREATE INDEX "Notification_userId_read_createdAt_idx" ON "Notification"("userId", "read", "createdAt");

-- CreateIndex
CREATE INDEX "Shop_city_state_idx" ON "Shop"("city", "state");

-- CreateIndex
CREATE INDEX "Shop_lat_lng_idx" ON "Shop"("lat", "lng");

-- CreateIndex
CREATE INDEX "Checkin_shopId_at_idx" ON "Checkin"("shopId", "at");

-- CreateIndex
CREATE INDEX "Checkin_userId_at_idx" ON "Checkin"("userId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "UserBlock_userId_blockedId_key" ON "UserBlock"("userId", "blockedId");

-- CreateIndex
CREATE INDEX "Report_resolved_createdAt_idx" ON "Report"("resolved", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Report_reporterId_targetType_targetId_key" ON "Report"("reporterId", "targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "EdhrecCache_key_key" ON "EdhrecCache"("key");

-- CreateIndex
CREATE INDEX "EdhrecCache_key_idx" ON "EdhrecCache"("key");

-- CreateIndex
CREATE INDEX "ScannerMismatch_createdAt_idx" ON "ScannerMismatch"("createdAt");

-- CreateIndex
CREATE INDEX "ScannerMismatch_ocrConfidence_idx" ON "ScannerMismatch"("ocrConfidence");

-- CreateIndex
CREATE INDEX "RulesDisagreement_formatId_createdAt_idx" ON "RulesDisagreement"("formatId", "createdAt");

-- CreateIndex
CREATE INDEX "RulesDisagreement_violationCode_idx" ON "RulesDisagreement"("violationCode");

-- AddForeignKey
ALTER TABLE "CollectionEvent" ADD CONSTRAINT "CollectionEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionEvent" ADD CONSTRAINT "CollectionEvent_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "CardVariant"("variantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricePoint" ADD CONSTRAINT "PricePoint_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "CardVariant"("variantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchlistEntry" ADD CONSTRAINT "WatchlistEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checkin" ADD CONSTRAINT "Checkin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checkin" ADD CONSTRAINT "Checkin_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

