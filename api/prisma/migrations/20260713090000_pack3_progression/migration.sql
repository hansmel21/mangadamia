-- AlterTable
ALTER TABLE "User" ADD COLUMN "streakDays" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "streakDayKey" TEXT;

-- AlterTable
ALTER TABLE "QuestDefinition" ADD COLUMN "deepLink" TEXT;

-- AlterTable
ALTER TABLE "GuildWar" ADD COLUMN "finalizedAt" TIMESTAMP(3);

-- Seed the arena winner title and the raid completion frame.
INSERT INTO "TitleDefinition" ("id", "name", "description", "rarity", "sourceType", "sortOrder") VALUES
  ('gate-scholar', 'Gate Scholar', 'Took first place in an Arena gate quiz.', 'epic', 'arena', 40)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "CosmeticDefinition" ("id", "name", "description", "kind", "rarity", "assetKey", "primaryColor", "secondaryColor", "sortOrder") VALUES
  ('frame-ember', 'Ember Wreath', 'Forged in a cleared guild raid.', 'frame', 'epic', 'halo', '#E5484D', '#F5B84C', 40)
ON CONFLICT ("id") DO NOTHING;

-- Deep links for the launch quest set.
UPDATE "QuestDefinition" SET "deepLink" = '/library' WHERE "id" IN ('first-finish', 'daily-three', 'weekly-twenty', 'daily-voice');
UPDATE "QuestDefinition" SET "deepLink" = '/feed' WHERE "id" IN ('social-debut', 'form-a-party');
