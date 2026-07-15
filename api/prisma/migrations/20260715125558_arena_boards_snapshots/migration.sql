-- CreateTable
CREATE TABLE "LeaderboardSnapshot" (
    "id" TEXT NOT NULL,
    "board" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "rows" JSONB NOT NULL,
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaderboardSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeaderboardSnapshot_board_finalizedAt_periodKey_idx" ON "LeaderboardSnapshot"("board", "finalizedAt", "periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "LeaderboardSnapshot_board_periodKey_key" ON "LeaderboardSnapshot"("board", "periodKey");

-- CreateIndex
CREATE INDEX "ReadChapter_canonicalId_readAt_idx" ON "ReadChapter"("canonicalId", "readAt");

-- CreateIndex
CREATE INDEX "UserQuestProgress_completedAt_idx" ON "UserQuestProgress"("completedAt");

-- Seed the weekly champion rewards + the first seasonal cosmetic set.
INSERT INTO "TitleDefinition" ("id", "name", "description", "rarity", "sourceType", "sortOrder") VALUES
  ('weekly-sovereign', 'Weekly Sovereign', 'Cleared more quests than any hunter in a single week.', 'epic', 'arena', 42)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "CosmeticDefinition" ("id", "name", "description", "kind", "rarity", "assetKey", "primaryColor", "secondaryColor", "sortOrder") VALUES
  ('frame-monarch', 'Monarch''s Regalia', 'Held the #1 spot on the weekly EXP board.', 'frame', 'legendary', 'crown', '#cda45e', '#6b5ecc', 42)
ON CONFLICT ("id") DO NOTHING;

-- Season I (first Arena season): time-windowed cosmetics granted to weekly
-- champions while the window is open (first real use of availableFrom/Until).
INSERT INTO "CosmeticDefinition" ("id", "name", "description", "kind", "rarity", "assetKey", "primaryColor", "secondaryColor", "sortOrder", "availableFrom", "availableUntil") VALUES
  ('frame-season1', 'Season I: Gate Breaker', 'Won a weekly board during Arena Season I.', 'frame', 'legendary', 'halo', '#54D6FF', '#0a0b10', 43, '2026-07-20T00:00:00Z', '2026-08-17T00:00:00Z'),
  ('avatar-season1', 'Season I: Ashen Sovereign', 'Crowned during Arena Season I.', 'avatar', 'legendary', 'initial', '#ce5153', '#cda45e', 44, '2026-07-20T00:00:00Z', '2026-08-17T00:00:00Z')
ON CONFLICT ("id") DO NOTHING;
