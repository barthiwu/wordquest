-- AlterTable
ALTER TABLE "analytics_events" ADD COLUMN     "sessionId" TEXT,
ADD COLUMN     "clientEventId" TEXT,
ADD COLUMN     "platform" TEXT,
ADD COLUMN     "appVersion" TEXT,
ADD COLUMN     "screen" TEXT,
ADD COLUMN     "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE UNIQUE INDEX "analytics_events_clientEventId_key" ON "analytics_events"("clientEventId");

-- CreateIndex
CREATE INDEX "analytics_events_sessionId_idx" ON "analytics_events"("sessionId");
