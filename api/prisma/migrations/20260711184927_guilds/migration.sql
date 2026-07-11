-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "guildId" TEXT;

-- CreateTable
CREATE TABLE "Guild" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "emblemKey" TEXT NOT NULL DEFAULT 'crest',
    "primaryColor" TEXT NOT NULL DEFAULT '#7C5CFF',
    "secondaryColor" TEXT,
    "motto" TEXT,
    "description" TEXT,
    "joinPolicy" TEXT NOT NULL DEFAULT 'open',
    "xp" INTEGER NOT NULL DEFAULT 0,
    "guildmasterId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Guild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuildMember" (
    "userId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "contributionXp" INTEGER NOT NULL DEFAULT 0,
    "weeklyXp" INTEGER NOT NULL DEFAULT 0,
    "weekKey" TEXT NOT NULL DEFAULT '',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuildMember_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "GuildJoinRequest" (
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuildJoinRequest_pkey" PRIMARY KEY ("guildId","userId")
);

-- CreateTable
CREATE TABLE "GuildXpTransaction" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'activity',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuildXpTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Guild_name_key" ON "Guild"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Guild_tag_key" ON "Guild"("tag");

-- CreateIndex
CREATE INDEX "Guild_xp_idx" ON "Guild"("xp");

-- CreateIndex
CREATE INDEX "GuildMember_guildId_weeklyXp_idx" ON "GuildMember"("guildId", "weeklyXp");

-- CreateIndex
CREATE INDEX "GuildMember_guildId_role_idx" ON "GuildMember"("guildId", "role");

-- CreateIndex
CREATE INDEX "GuildXpTransaction_guildId_createdAt_idx" ON "GuildXpTransaction"("guildId", "createdAt");

-- CreateIndex
CREATE INDEX "Post_guildId_createdAt_idx" ON "Post"("guildId", "createdAt");

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuildMember" ADD CONSTRAINT "GuildMember_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuildMember" ADD CONSTRAINT "GuildMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuildJoinRequest" ADD CONSTRAINT "GuildJoinRequest_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuildJoinRequest" ADD CONSTRAINT "GuildJoinRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuildXpTransaction" ADD CONSTRAINT "GuildXpTransaction_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuildXpTransaction" ADD CONSTRAINT "GuildXpTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
