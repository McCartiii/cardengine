-- CreateTable
CREATE TABLE "MetaSnapshot" (
    "id" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "bracket" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "messages" JSONB NOT NULL,
    "context" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MetaSnapshot_format_bracket_key" ON "MetaSnapshot"("format", "bracket");

-- CreateIndex
CREATE INDEX "MetaSnapshot_format_fetchedAt_idx" ON "MetaSnapshot"("format", "fetchedAt");

-- CreateIndex
CREATE INDEX "AgentSession_userId_updatedAt_idx" ON "AgentSession"("userId", "updatedAt");
