-- CreateTable
CREATE TABLE "Series" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceSeriesId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "altTitles" TEXT[],
    "coverUrl" TEXT,
    "description" TEXT,
    "status" TEXT,
    "tags" TEXT[],
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chapter" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "sourceChapterId" TEXT NOT NULL,
    "number" DOUBLE PRECISION NOT NULL,
    "title" TEXT,
    "publishedAt" TIMESTAMP(3),
    "pagesFetchedAt" TIMESTAMP(3),

    CONSTRAINT "Chapter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Page" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "headers" JSONB,

    CONSTRAINT "Page_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Series_source_idx" ON "Series"("source");

-- CreateIndex
CREATE UNIQUE INDEX "Series_source_sourceSeriesId_key" ON "Series"("source", "sourceSeriesId");

-- CreateIndex
CREATE UNIQUE INDEX "Chapter_seriesId_sourceChapterId_key" ON "Chapter"("seriesId", "sourceChapterId");

-- CreateIndex
CREATE UNIQUE INDEX "Page_chapterId_index_key" ON "Page"("chapterId", "index");

-- AddForeignKey
ALTER TABLE "Chapter" ADD CONSTRAINT "Chapter_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
