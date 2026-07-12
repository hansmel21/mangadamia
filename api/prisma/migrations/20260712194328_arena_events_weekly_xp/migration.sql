-- AlterTable
ALTER TABLE "User" ADD COLUMN     "weekKey" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "weeklyXp" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ArenaEvent" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "canonicalId" TEXT,
    "config" JSONB NOT NULL,
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArenaEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArenaEntry" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "score" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArenaEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ArenaEvent_endsAt_idx" ON "ArenaEvent"("endsAt");

-- CreateIndex
CREATE INDEX "ArenaEntry_eventId_score_idx" ON "ArenaEntry"("eventId", "score");

-- CreateIndex
CREATE UNIQUE INDEX "ArenaEntry_eventId_userId_key" ON "ArenaEntry"("eventId", "userId");

-- AddForeignKey
ALTER TABLE "ArenaEntry" ADD CONSTRAINT "ArenaEntry_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ArenaEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArenaEntry" ADD CONSTRAINT "ArenaEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
