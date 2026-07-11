ALTER TABLE "User"
  ADD COLUMN "role" TEXT NOT NULL DEFAULT 'user',
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN "suspendedUntil" TIMESTAMP(3),
  ADD COLUMN "acceptedTermsVersion" TEXT,
  ADD COLUMN "acceptedTermsAt" TIMESTAMP(3);

ALTER TABLE "Comment"
  ADD COLUMN "moderationStatus" TEXT NOT NULL DEFAULT 'visible',
  ADD COLUMN "moderationReason" TEXT,
  ADD COLUMN "moderatedAt" TIMESTAMP(3);

ALTER TABLE "Post"
  ADD COLUMN "moderationStatus" TEXT NOT NULL DEFAULT 'visible',
  ADD COLUMN "moderationReason" TEXT,
  ADD COLUMN "moderatedAt" TIMESTAMP(3);

ALTER TABLE "Report"
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN "resolution" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3);

CREATE TABLE "ModerationAction" (
  "id" TEXT NOT NULL,
  "moderatorId" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ModerationAction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Report_status_createdAt_idx" ON "Report"("status", "createdAt");
CREATE INDEX "ModerationAction_targetType_targetId_idx" ON "ModerationAction"("targetType", "targetId");
CREATE INDEX "ModerationAction_createdAt_idx" ON "ModerationAction"("createdAt");

ALTER TABLE "ModerationAction"
  ADD CONSTRAINT "ModerationAction_moderatorId_fkey"
  FOREIGN KEY ("moderatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
