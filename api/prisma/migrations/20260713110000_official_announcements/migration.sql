-- AlterTable
ALTER TABLE "Post" ADD COLUMN "isOfficial" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Post_isOfficial_pinned_createdAt_idx" ON "Post"("isOfficial", "pinned", "createdAt");
