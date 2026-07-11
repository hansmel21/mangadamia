ALTER TABLE "ActivityEvent"
ADD COLUMN "reversedAt" TIMESTAMP(3),
ADD COLUMN "reversalReason" TEXT;

CREATE INDEX "ActivityEvent_userId_reversedAt_idx" ON "ActivityEvent"("userId", "reversedAt");
