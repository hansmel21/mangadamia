-- AlterTable
ALTER TABLE "Post" ADD COLUMN "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];
