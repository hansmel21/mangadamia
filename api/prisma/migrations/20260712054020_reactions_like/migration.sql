-- AlterTable
ALTER TABLE "PostLike" ALTER COLUMN "type" SET DEFAULT 'like';

-- Backfill: the old primary "endorse" reaction becomes "like".
UPDATE "PostLike" SET "type" = 'like' WHERE "type" = 'endorse';
