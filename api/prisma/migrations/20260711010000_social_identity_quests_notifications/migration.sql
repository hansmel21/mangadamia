-- Keep this migration additive: the legacy badge-title and direct post-series
-- columns remain available while older clients transition to the new models.

ALTER TABLE "ModerationAction" DROP CONSTRAINT "ModerationAction_moderatorId_fkey";
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_commentId_fkey";
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_postId_fkey";

ALTER TABLE "Comment" ADD COLUMN "isSpoiler" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ModerationAction"
  ADD COLUMN "afterSnapshot" JSONB,
  ADD COLUMN "beforeSnapshot" JSONB,
  ADD COLUMN "moderatorSnapshot" TEXT,
  ADD COLUMN "reasonCode" TEXT NOT NULL DEFAULT 'other',
  ADD COLUMN "reportId" TEXT,
  ADD COLUMN "requestId" TEXT,
  ALTER COLUMN "moderatorId" DROP NOT NULL;

UPDATE "ModerationAction" AS action
SET "moderatorSnapshot" = COALESCE(author."username", 'Deleted moderator')
FROM "User" AS author
WHERE action."moderatorId" = author."id";
UPDATE "ModerationAction" SET "moderatorSnapshot" = 'Deleted moderator'
WHERE "moderatorSnapshot" IS NULL;
ALTER TABLE "ModerationAction" ALTER COLUMN "moderatorSnapshot" SET NOT NULL;

ALTER TABLE "Notification"
  ADD COLUMN "actorId" TEXT,
  ADD COLUMN "dedupeKey" TEXT,
  ADD COLUMN "dismissedAt" TIMESTAMP(3),
  ADD COLUMN "expiresAt" TIMESTAMP(3),
  ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'reply',
  ADD COLUMN "metadata" JSONB,
  ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN "pushQueuedAt" TIMESTAMP(3),
  ADD COLUMN "safeBody" TEXT,
  ADD COLUMN "seenAt" TIMESTAMP(3),
  ADD COLUMN "targetUrl" TEXT,
  ADD COLUMN "title" TEXT;

ALTER TABLE "User"
  ADD COLUMN "ageConfirmedAt" TIMESTAMP(3),
  ADD COLUMN "bio" TEXT,
  ADD COLUMN "equippedAvatarId" TEXT,
  ADD COLUMN "equippedFrameId" TEXT,
  ADD COLUMN "equippedTitleId" TEXT,
  ADD COLUMN "profileVisibility" TEXT NOT NULL DEFAULT 'public',
  ADD COLUMN "showBadges" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "showFavorites" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "showFollows" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "showJoinDate" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "showLevel" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "showPosts" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "showReadingHistory" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "showStats" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "showTitle" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "usernameChangesLeft" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "TitleDefinition" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "rarity" TEXT NOT NULL DEFAULT 'common',
  "sourceType" TEXT NOT NULL DEFAULT 'quest',
  "availableFrom" TIMESTAMP(3),
  "availableUntil" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TitleDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserTitle" (
  "userId" TEXT NOT NULL,
  "titleId" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'quest',
  "grantedBy" TEXT,
  "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserTitle_pkey" PRIMARY KEY ("userId", "titleId")
);

CREATE TABLE "CosmeticDefinition" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "rarity" TEXT NOT NULL DEFAULT 'common',
  "assetKey" TEXT NOT NULL,
  "primaryColor" TEXT,
  "secondaryColor" TEXT,
  "availableFrom" TIMESTAMP(3),
  "availableUntil" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CosmeticDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserCosmetic" (
  "userId" TEXT NOT NULL,
  "cosmeticId" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'quest',
  "grantedBy" TEXT,
  "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserCosmetic_pkey" PRIMARY KEY ("userId", "cosmeticId")
);

CREATE TABLE "Follow" (
  "followerId" TEXT NOT NULL,
  "followingId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'accepted',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acceptedAt" TIMESTAMP(3),
  CONSTRAINT "Follow_pkey" PRIMARY KEY ("followerId", "followingId")
);

CREATE TABLE "UsernameChange" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "previousUsername" TEXT NOT NULL,
  "newUsername" TEXT NOT NULL,
  "grantedByAdmin" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UsernameChange_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationPreference" (
  "userId" TEXT NOT NULL,
  "pushEnabled" BOOLEAN NOT NULL DEFAULT false,
  "replies" BOOLEAN NOT NULL DEFAULT true,
  "reactions" BOOLEAN NOT NULL DEFAULT true,
  "follows" BOOLEAN NOT NULL DEFAULT true,
  "quests" BOOLEAN NOT NULL DEFAULT true,
  "newChapters" BOOLEAN NOT NULL DEFAULT false,
  "announcements" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "PushDevice" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "expoToken" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "locale" TEXT,
  "deviceName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "PushDevice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PostSeriesTag" (
  "postId" TEXT NOT NULL,
  "canonicalId" TEXT NOT NULL,
  "chapterNumber" DOUBLE PRECISION,
  "position" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "PostSeriesTag_pkey" PRIMARY KEY ("postId", "canonicalId")
);

CREATE TABLE "ModerationNotice" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "moderationActionId" TEXT,
  "kind" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "requiresAcknowledgement" BOOLEAN NOT NULL DEFAULT true,
  "acknowledgedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ModerationNotice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Appeal" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "moderationActionId" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "response" TEXT,
  "reviewerId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  CONSTRAINT "Appeal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ActivityEvent" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "eventKey" TEXT,
  "canonicalId" TEXT,
  "chapterNumber" DOUBLE PRECISION,
  "value" INTEGER NOT NULL DEFAULT 1,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuestDefinition" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "cadence" TEXT NOT NULL DEFAULT 'permanent',
  "eventType" TEXT NOT NULL,
  "target" INTEGER NOT NULL,
  "xpReward" INTEGER NOT NULL DEFAULT 0,
  "badgeRewardId" TEXT,
  "titleRewardId" TEXT,
  "cosmeticRewardId" TEXT,
  "canonicalId" TEXT,
  "distinctEvents" BOOLEAN NOT NULL DEFAULT false,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuestDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserQuestProgress" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "questId" TEXT NOT NULL,
  "periodKey" TEXT NOT NULL,
  "progress" INTEGER NOT NULL DEFAULT 0,
  "completedAt" TIMESTAMP(3),
  "rewardedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserQuestProgress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "XpTransaction" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "delta" INTEGER NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "reversalOf" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "XpTransaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RewardGrant" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "rewardType" TEXT NOT NULL,
  "rewardId" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RewardGrant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserTitle_titleId_unlockedAt_idx" ON "UserTitle"("titleId", "unlockedAt");
CREATE INDEX "UserCosmetic_cosmeticId_unlockedAt_idx" ON "UserCosmetic"("cosmeticId", "unlockedAt");
CREATE INDEX "Follow_followingId_status_createdAt_idx" ON "Follow"("followingId", "status", "createdAt");
CREATE INDEX "Follow_followerId_status_createdAt_idx" ON "Follow"("followerId", "status", "createdAt");
CREATE INDEX "UsernameChange_userId_createdAt_idx" ON "UsernameChange"("userId", "createdAt");
CREATE UNIQUE INDEX "PushDevice_expoToken_key" ON "PushDevice"("expoToken");
CREATE INDEX "PushDevice_userId_revokedAt_idx" ON "PushDevice"("userId", "revokedAt");
CREATE INDEX "PostSeriesTag_canonicalId_position_idx" ON "PostSeriesTag"("canonicalId", "position");
CREATE INDEX "ModerationNotice_userId_acknowledgedAt_createdAt_idx" ON "ModerationNotice"("userId", "acknowledgedAt", "createdAt");
CREATE INDEX "Appeal_status_createdAt_idx" ON "Appeal"("status", "createdAt");
CREATE UNIQUE INDEX "Appeal_userId_moderationActionId_key" ON "Appeal"("userId", "moderationActionId");
CREATE INDEX "ActivityEvent_userId_type_createdAt_idx" ON "ActivityEvent"("userId", "type", "createdAt");
CREATE INDEX "ActivityEvent_userId_type_eventKey_createdAt_idx" ON "ActivityEvent"("userId", "type", "eventKey", "createdAt");
CREATE INDEX "QuestDefinition_eventType_isActive_idx" ON "QuestDefinition"("eventType", "isActive");
CREATE INDEX "UserQuestProgress_userId_completedAt_idx" ON "UserQuestProgress"("userId", "completedAt");
CREATE UNIQUE INDEX "UserQuestProgress_userId_questId_periodKey_key" ON "UserQuestProgress"("userId", "questId", "periodKey");
CREATE INDEX "XpTransaction_userId_createdAt_idx" ON "XpTransaction"("userId", "createdAt");
CREATE UNIQUE INDEX "XpTransaction_userId_sourceType_sourceId_key" ON "XpTransaction"("userId", "sourceType", "sourceId");
CREATE INDEX "RewardGrant_userId_createdAt_idx" ON "RewardGrant"("userId", "createdAt");
CREATE UNIQUE INDEX "RewardGrant_userId_rewardType_rewardId_sourceType_sourceId_key" ON "RewardGrant"("userId", "rewardType", "rewardId", "sourceType", "sourceId");
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
CREATE UNIQUE INDEX "Notification_userId_dedupeKey_key" ON "Notification"("userId", "dedupeKey");

ALTER TABLE "User" ADD CONSTRAINT "User_equippedTitleId_fkey" FOREIGN KEY ("equippedTitleId") REFERENCES "TitleDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_equippedAvatarId_fkey" FOREIGN KEY ("equippedAvatarId") REFERENCES "CosmeticDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_equippedFrameId_fkey" FOREIGN KEY ("equippedFrameId") REFERENCES "CosmeticDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UserTitle" ADD CONSTRAINT "UserTitle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserTitle" ADD CONSTRAINT "UserTitle_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "TitleDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserCosmetic" ADD CONSTRAINT "UserCosmetic_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserCosmetic" ADD CONSTRAINT "UserCosmetic_cosmeticId_fkey" FOREIGN KEY ("cosmeticId") REFERENCES "CosmeticDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UsernameChange" ADD CONSTRAINT "UsernameChange_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PushDevice" ADD CONSTRAINT "PushDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PostSeriesTag" ADD CONSTRAINT "PostSeriesTag_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PostSeriesTag" ADD CONSTRAINT "PostSeriesTag_canonicalId_fkey" FOREIGN KEY ("canonicalId") REFERENCES "CanonicalSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModerationAction" ADD CONSTRAINT "ModerationAction_moderatorId_fkey" FOREIGN KEY ("moderatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ModerationNotice" ADD CONSTRAINT "ModerationNotice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModerationNotice" ADD CONSTRAINT "ModerationNotice_moderationActionId_fkey" FOREIGN KEY ("moderationActionId") REFERENCES "ModerationAction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_moderationActionId_fkey" FOREIGN KEY ("moderationActionId") REFERENCES "ModerationAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestDefinition" ADD CONSTRAINT "QuestDefinition_titleRewardId_fkey" FOREIGN KEY ("titleRewardId") REFERENCES "TitleDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QuestDefinition" ADD CONSTRAINT "QuestDefinition_cosmeticRewardId_fkey" FOREIGN KEY ("cosmeticRewardId") REFERENCES "CosmeticDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UserQuestProgress" ADD CONSTRAINT "UserQuestProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserQuestProgress" ADD CONSTRAINT "UserQuestProgress_questId_fkey" FOREIGN KEY ("questId") REFERENCES "QuestDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "XpTransaction" ADD CONSTRAINT "XpTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RewardGrant" ADD CONSTRAINT "RewardGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed app-owned identity rewards and a small launch quest set. Seasonal
-- availability can be activated later without changing clients.
INSERT INTO "TitleDefinition" ("id", "name", "description", "rarity", "sourceType", "sortOrder") VALUES
  ('e-rank-hunter', 'E-Rank Hunter', 'Every legend starts at the lowest rank.', 'common', 'default', 0),
  ('awakened-reader', 'Awakened Reader', 'Finish your first chapter.', 'rare', 'quest', 10),
  ('wall-initiate', 'Wall Initiate', 'Make your first post on the community wall.', 'rare', 'quest', 20),
  ('party-member', 'Party Member', 'Build your first circle of fellow readers.', 'epic', 'quest', 30),
  ('founding-reader', 'Founding Reader', 'A launch-era reader who entered before the gates closed.', 'legendary', 'event', 100),
  ('system-overseer', 'System Overseer', 'Official staff recognition. Authority is still role-based.', 'mythic', 'staff', 200)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "CosmeticDefinition" ("id", "name", "description", "kind", "rarity", "assetKey", "primaryColor", "secondaryColor", "sortOrder") VALUES
  ('avatar-origin', 'Origin', 'The first reader avatar.', 'avatar', 'common', 'initial', '#7C5CFF', '#B8A8FF', 0),
  ('avatar-crimson', 'Crimson Gate', 'A crimson profile sigil earned through weekly reading.', 'avatar', 'rare', 'initial', '#C9365B', '#FF91A8', 10),
  ('frame-awakened', 'Awakened Halo', 'A subtle glow for readers who finish their first chapter.', 'frame', 'rare', 'halo', '#7C5CFF', '#E8E0FF', 20),
  ('frame-party', 'Party Crest', 'A crown-like frame for readers who build a party.', 'frame', 'epic', 'crown', '#F5B84C', '#FFF0A6', 30)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "QuestDefinition" ("id", "name", "description", "cadence", "eventType", "target", "xpReward", "titleRewardId", "cosmeticRewardId", "distinctEvents", "sortOrder") VALUES
  ('first-finish', 'First Clear', 'Finish one chapter.', 'permanent', 'chapter_completed', 1, 20, 'awakened-reader', 'frame-awakened', true, 0),
  ('social-debut', 'Enter the Wall', 'Create your first wall post.', 'permanent', 'post_created', 1, 25, 'wall-initiate', NULL, false, 10),
  ('form-a-party', 'Form a Party', 'Follow three readers.', 'permanent', 'follow_created', 3, 60, 'party-member', 'frame-party', true, 20),
  ('daily-three', 'Daily Reading', 'Finish three different chapters today.', 'daily', 'chapter_completed', 3, 30, NULL, NULL, true, 30),
  ('daily-voice', 'Join the Discussion', 'Leave a comment today.', 'daily', 'comment_created', 1, 10, NULL, NULL, false, 40),
  ('weekly-twenty', 'Weekly Gate Sweep', 'Finish twenty different chapters this UTC week.', 'weekly', 'chapter_completed', 20, 150, NULL, 'avatar-crimson', true, 50)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "UserTitle" ("userId", "titleId", "source")
SELECT "id", 'e-rank-hunter', 'default' FROM "User"
ON CONFLICT ("userId", "titleId") DO NOTHING;
INSERT INTO "UserCosmetic" ("userId", "cosmeticId", "source")
SELECT "id", 'avatar-origin', 'default' FROM "User"
ON CONFLICT ("userId", "cosmeticId") DO NOTHING;
UPDATE "User" SET
  "equippedTitleId" = COALESCE("equippedTitleId", 'e-rank-hunter'),
  "equippedAvatarId" = COALESCE("equippedAvatarId", 'avatar-origin'),
  "ageConfirmedAt" = COALESCE("ageConfirmedAt", "acceptedTermsAt");

INSERT INTO "PostSeriesTag" ("postId", "canonicalId", "chapterNumber", "position")
SELECT "id", "canonicalId", "chapterNumber", 0 FROM "Post" WHERE "canonicalId" IS NOT NULL
ON CONFLICT ("postId", "canonicalId") DO NOTHING;

UPDATE "Notification" AS notification SET
  "actorId" = COALESCE(comment."userId", post."userId"),
  "title" = 'New reply',
  "safeBody" = 'Someone replied to your discussion.'
FROM "Notification" AS original
LEFT JOIN "Comment" AS comment ON original."commentId" = comment."id"
LEFT JOIN "Post" AS post ON original."postId" = post."id"
WHERE notification."id" = original."id";
