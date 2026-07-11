-- Reddit-style nested post threads. Each reply now points at its top-level
-- post via "rootId" so the whole conversation loads in one query.

-- AlterTable
ALTER TABLE "Post" ADD COLUMN "rootId" TEXT;

-- Backfill: existing replies were flattened one level deep (parent == root),
-- so the current parent is the thread root.
UPDATE "Post" SET "rootId" = "parentId" WHERE "parentId" IS NOT NULL;

-- CreateIndex
CREATE INDEX "Post_rootId_idx" ON "Post"("rootId");

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_rootId_fkey" FOREIGN KEY ("rootId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
