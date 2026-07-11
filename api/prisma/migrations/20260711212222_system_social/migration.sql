-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'record',
ADD COLUMN     "rating" INTEGER;

-- AlterTable
ALTER TABLE "PostLike" ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'endorse';

-- CreateIndex
CREATE INDEX "Post_canonicalId_kind_idx" ON "Post"("canonicalId", "kind");

-- CreateIndex
CREATE INDEX "PostLike_postId_type_idx" ON "PostLike"("postId", "type");
