-- AlterTable
ALTER TABLE "User" ADD COLUMN     "xp" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "UserBadge" (
    "userId" TEXT NOT NULL,
    "badgeId" TEXT NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBadge_pkey" PRIMARY KEY ("userId","badgeId")
);

-- CreateTable
CREATE TABLE "ReadChapter" (
    "userId" TEXT NOT NULL,
    "canonicalId" TEXT NOT NULL,
    "chapterNumber" DOUBLE PRECISION NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReadChapter_pkey" PRIMARY KEY ("userId","canonicalId","chapterNumber")
);

-- AddForeignKey
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadChapter" ADD CONSTRAINT "ReadChapter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadChapter" ADD CONSTRAINT "ReadChapter_canonicalId_fkey" FOREIGN KEY ("canonicalId") REFERENCES "CanonicalSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
