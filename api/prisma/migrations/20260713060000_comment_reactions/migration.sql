-- AlterTable
ALTER TABLE "CommentLike" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'like';

-- CreateIndex
CREATE INDEX "CommentLike_commentId_type_idx" ON "CommentLike"("commentId", "type");
