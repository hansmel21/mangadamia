-- CreateTable
CREATE TABLE "GuildEvent" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "weekKey" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "target" INTEGER NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "bonusXp" INTEGER NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuildEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuildEventContribution" (
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GuildEventContribution_pkey" PRIMARY KEY ("eventId","userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "GuildEvent_guildId_weekKey_key" ON "GuildEvent"("guildId", "weekKey");

-- AddForeignKey
ALTER TABLE "GuildEvent" ADD CONSTRAINT "GuildEvent_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuildEventContribution" ADD CONSTRAINT "GuildEventContribution_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "GuildEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
