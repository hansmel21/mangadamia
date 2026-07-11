-- CreateTable
CREATE TABLE "LibraryEntry" (
    "userId" TEXT NOT NULL,
    "canonicalId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceSeriesId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryEntry_pkey" PRIMARY KEY ("userId","canonicalId")
);

-- CreateTable
CREATE TABLE "Progress" (
    "userId" TEXT NOT NULL,
    "canonicalId" TEXT NOT NULL,
    "chapterNumber" DOUBLE PRECISION NOT NULL,
    "pageIndex" INTEGER NOT NULL DEFAULT 0,
    "pageCount" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Progress_pkey" PRIMARY KEY ("userId","canonicalId")
);

-- AddForeignKey
ALTER TABLE "LibraryEntry" ADD CONSTRAINT "LibraryEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryEntry" ADD CONSTRAINT "LibraryEntry_canonicalId_fkey" FOREIGN KEY ("canonicalId") REFERENCES "CanonicalSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Progress" ADD CONSTRAINT "Progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Progress" ADD CONSTRAINT "Progress_canonicalId_fkey" FOREIGN KEY ("canonicalId") REFERENCES "CanonicalSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
