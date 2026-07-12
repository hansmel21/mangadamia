-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "pinned" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "GuildWar" (
    "id" TEXT NOT NULL,
    "weekKey" TEXT NOT NULL,
    "guildAId" TEXT NOT NULL,
    "guildBId" TEXT NOT NULL,
    "scoreA" INTEGER NOT NULL DEFAULT 0,
    "scoreB" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuildWar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuildRaidProgress" (
    "guildId" TEXT NOT NULL,
    "weekKey" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "claimedAt" TIMESTAMP(3),

    CONSTRAINT "GuildRaidProgress_pkey" PRIMARY KEY ("guildId","weekKey")
);

-- CreateIndex
CREATE INDEX "GuildWar_guildAId_weekKey_idx" ON "GuildWar"("guildAId", "weekKey");

-- CreateIndex
CREATE INDEX "GuildWar_guildBId_weekKey_idx" ON "GuildWar"("guildBId", "weekKey");

-- CreateIndex
CREATE UNIQUE INDEX "GuildWar_weekKey_guildAId_key" ON "GuildWar"("weekKey", "guildAId");

-- CreateIndex
CREATE UNIQUE INDEX "GuildWar_weekKey_guildBId_key" ON "GuildWar"("weekKey", "guildBId");

-- AddForeignKey
ALTER TABLE "GuildWar" ADD CONSTRAINT "GuildWar_guildAId_fkey" FOREIGN KEY ("guildAId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuildWar" ADD CONSTRAINT "GuildWar_guildBId_fkey" FOREIGN KEY ("guildBId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuildRaidProgress" ADD CONSTRAINT "GuildRaidProgress_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
