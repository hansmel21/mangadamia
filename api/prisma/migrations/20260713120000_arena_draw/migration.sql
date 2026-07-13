-- CreateTable
CREATE TABLE "ArenaVote" (
    "eventId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArenaVote_pkey" PRIMARY KEY ("eventId","voterId")
);

-- CreateIndex
CREATE INDEX "ArenaVote_entryId_idx" ON "ArenaVote"("entryId");

-- AddForeignKey
ALTER TABLE "ArenaVote" ADD CONSTRAINT "ArenaVote_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ArenaEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArenaVote" ADD CONSTRAINT "ArenaVote_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "ArenaEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArenaVote" ADD CONSTRAINT "ArenaVote_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the draw-competition winner title.
INSERT INTO "TitleDefinition" ("id", "name", "description", "rarity", "sourceType", "sortOrder") VALUES
  ('gate-artisan', 'Gate Artisan', 'Won an Arena draw competition.', 'epic', 'arena', 45)
ON CONFLICT ("id") DO NOTHING;
