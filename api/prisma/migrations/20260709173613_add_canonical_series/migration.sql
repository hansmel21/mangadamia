-- AlterTable
ALTER TABLE "Series" ADD COLUMN     "canonicalId" TEXT;

-- CreateTable
CREATE TABLE "CanonicalSeries" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "coverUrl" TEXT,
    "normTitles" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CanonicalSeries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Series_canonicalId_idx" ON "Series"("canonicalId");

-- AddForeignKey
ALTER TABLE "Series" ADD CONSTRAINT "Series_canonicalId_fkey" FOREIGN KEY ("canonicalId") REFERENCES "CanonicalSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
