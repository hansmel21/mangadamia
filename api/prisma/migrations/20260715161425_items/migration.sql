-- AlterTable
ALTER TABLE "QuestDefinition" ADD COLUMN     "itemRewardId" TEXT;

-- CreateTable
CREATE TABLE "ItemDefinition" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "rarity" TEXT NOT NULL,
    "iconKey" TEXT NOT NULL,
    "effect" JSONB,
    "stackable" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserItem" (
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserItem_pkey" PRIMARY KEY ("userId","itemId")
);

-- AddForeignKey
ALTER TABLE "UserItem" ADD CONSTRAINT "UserItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserItem" ADD CONSTRAINT "UserItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ItemDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the launch item set. Effects live in code (items.ts); `effect` here is
-- display metadata for the inventory UI.
INSERT INTO "ItemDefinition" ("id", "name", "description", "kind", "rarity", "iconKey", "effect", "sortOrder") VALUES
  ('xp-elixir-s', 'XP Elixir (S)', 'Drink for an instant +100 XP.', 'consumable', 'rare', '🧪', '{"xp":100}', 0),
  ('streak-shield', 'Streak Shield', 'Consumed automatically the day your streak would break — keeps the fire burning.', 'consumable', 'epic', '🛡️', '{"passive":true}', 10),
  ('gate-key', 'Gate Key', 'Consumed automatically to open a gate below the level requirement.', 'consumable', 'epic', '🗝️', '{"passive":true}', 20),
  ('monarch-chest', 'Monarch''s Chest', 'Crack it open for a random cosmetic you don''t own yet.', 'consumable', 'legendary', '👑', '{"chest":true}', 30)
ON CONFLICT ("id") DO NOTHING;
