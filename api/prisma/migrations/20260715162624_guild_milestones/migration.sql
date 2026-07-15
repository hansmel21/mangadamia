-- CreateTable
CREATE TABLE "GuildMilestone" (
    "guildId" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "claimedAt" TIMESTAMP(3),

    CONSTRAINT "GuildMilestone_pkey" PRIMARY KEY ("guildId","milestoneId")
);

-- AddForeignKey
ALTER TABLE "GuildMilestone" ADD CONSTRAINT "GuildMilestone_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Roster-wide title for the biggest war milestone.
INSERT INTO "TitleDefinition" ("id", "name", "description", "rarity", "sourceType", "sortOrder") VALUES
  ('warborn', 'Warborn', 'Member of a guild that won ten wars.', 'legendary', 'guild_milestone', 60)
ON CONFLICT ("id") DO NOTHING;
