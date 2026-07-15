import type { Prisma, QuestDefinition } from "@prisma/client";
import { bumpWeeklyXp } from "./arena.js";
import { getBadge, levelForXp } from "./badges.js";
import { prisma } from "./db/client.js";
import { currentWeekKey } from "./guilds.js";
import { grantItem } from "./items.js";

interface ActivityInput {
  type: string;
  eventKey?: string;
  canonicalId?: string;
  chapterNumber?: number;
  value?: number;
  metadata?: Prisma.InputJsonValue;
}

export interface QuestRewardInfo {
  type: "xp" | "badge" | "title" | "cosmetic" | "item";
  id?: string;
  name: string;
  amount?: number;
  rarity?: string;
}

export interface QuestCompletionInfo {
  id: string;
  name: string;
  rewards: QuestRewardInfo[];
}

export interface ActivityResult {
  completedQuests: QuestCompletionInfo[];
  levelUp: number | null;
}

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function periodFor(quest: QuestDefinition, now: Date) {
  if (quest.cadence === "daily") {
    const start = startOfUtcDay(now);
    const end = new Date(start.getTime() + 86_400_000);
    return { key: start.toISOString().slice(0, 10), start, end };
  }
  if (quest.cadence === "weekly") {
    const day = startOfUtcDay(now);
    const isoDay = day.getUTCDay() || 7;
    const start = new Date(day.getTime() - (isoDay - 1) * 86_400_000);
    const end = new Date(start.getTime() + 7 * 86_400_000);
    return { key: start.toISOString().slice(0, 10), start, end };
  }
  if (quest.cadence === "seasonal") {
    return {
      key: quest.startsAt?.toISOString() ?? quest.id,
      start: quest.startsAt ?? new Date(0),
      end: quest.endsAt ?? new Date("9999-12-31T23:59:59.999Z"),
    };
  }
  return { key: "all", start: new Date(0), end: new Date("9999-12-31T23:59:59.999Z") };
}

export async function recordActivity(userId: string, input: ActivityInput): Promise<ActivityResult> {
  const now = new Date();
  const value = Math.max(1, Math.min(10_000, Math.floor(input.value ?? 1)));
  // Item drops run AFTER the transaction (grantItem manages its own ledger
  // idempotence); collected inside the tx loop.
  const pendingItemGrants: { itemId: string; sourceType: string; sourceId: string }[] = [];
  const result = await prisma.$transaction(async (tx) => {
    const before = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { xp: true } });
    const event = await tx.activityEvent.create({
      data: {
        userId,
        type: input.type,
        eventKey: input.eventKey,
        canonicalId: input.canonicalId,
        chapterNumber: input.chapterNumber,
        value,
        metadata: input.metadata,
      },
    });
    const quests = await tx.questDefinition.findMany({
      where: {
        eventType: input.type,
        isActive: true,
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
      },
      include: { titleReward: true, cosmeticReward: true },
      orderBy: { sortOrder: "asc" },
    });

    const completedQuests: QuestCompletionInfo[] = [];
    for (const quest of quests) {
      if (quest.canonicalId && quest.canonicalId !== input.canonicalId) continue;
      const period = periodFor(quest, now);
      if (quest.distinctEvents && input.eventKey) {
        const occurrences = await tx.activityEvent.count({
          where: {
            userId,
            type: input.type,
            eventKey: input.eventKey,
            reversedAt: null,
            createdAt: { gte: period.start, lt: period.end },
          },
        });
        if (occurrences > 1) continue;
      }

      const progress = await tx.userQuestProgress.upsert({
        where: { userId_questId_periodKey: { userId, questId: quest.id, periodKey: period.key } },
        create: {
          userId,
          questId: quest.id,
          periodKey: period.key,
          progress: Math.min(quest.target, value),
        },
        update: { progress: { increment: value } },
      });
      if (progress.completedAt || progress.progress < quest.target) continue;

      const completed = await tx.userQuestProgress.update({
        where: { id: progress.id },
        data: { progress: quest.target, completedAt: now, rewardedAt: now },
      });
      const rewards: QuestRewardInfo[] = [];

      if (quest.xpReward > 0) {
        const xpTx = await tx.xpTransaction.create({
          data: {
            userId,
            delta: quest.xpReward,
            sourceType: "quest",
            sourceId: `${completed.id}:${event.id}`,
          },
        });
        await tx.user.update({ where: { id: userId }, data: { xp: { increment: xpTx.delta } } });
        await bumpWeeklyXp(tx, userId, xpTx.delta);
        rewards.push({ type: "xp", name: `${quest.xpReward} XP`, amount: quest.xpReward });
      }
      if (quest.badgeRewardId) {
        await tx.userBadge.upsert({
          where: { userId_badgeId: { userId, badgeId: quest.badgeRewardId } },
          create: { userId, badgeId: quest.badgeRewardId },
          update: {},
        });
        await tx.rewardGrant.upsert({
          where: {
            userId_rewardType_rewardId_sourceType_sourceId: {
              userId,
              rewardType: "badge",
              rewardId: quest.badgeRewardId,
              sourceType: "quest",
              sourceId: completed.id,
            },
          },
          create: {
            userId,
            rewardType: "badge",
            rewardId: quest.badgeRewardId,
            sourceType: "quest",
            sourceId: completed.id,
          },
          update: { revokedAt: null },
        });
        const badge = getBadge(quest.badgeRewardId);
        rewards.push({ type: "badge", id: quest.badgeRewardId, name: badge?.name ?? "Badge" });
      }
      if (quest.titleReward) {
        await tx.userTitle.upsert({
          where: { userId_titleId: { userId, titleId: quest.titleReward.id } },
          create: { userId, titleId: quest.titleReward.id, source: "quest" },
          update: {},
        });
        await tx.rewardGrant.upsert({
          where: {
            userId_rewardType_rewardId_sourceType_sourceId: {
              userId,
              rewardType: "title",
              rewardId: quest.titleReward.id,
              sourceType: "quest",
              sourceId: completed.id,
            },
          },
          create: {
            userId,
            rewardType: "title",
            rewardId: quest.titleReward.id,
            sourceType: "quest",
            sourceId: completed.id,
          },
          update: { revokedAt: null },
        });
        rewards.push({
          type: "title",
          id: quest.titleReward.id,
          name: quest.titleReward.name,
          rarity: quest.titleReward.rarity,
        });
      }
      if (quest.itemRewardId) {
        const item = await tx.itemDefinition.findUnique({ where: { id: quest.itemRewardId } });
        if (item?.isActive) {
          pendingItemGrants.push({
            itemId: item.id,
            sourceType: "quest",
            sourceId: completed.id,
          });
          rewards.push({ type: "item", id: item.id, name: item.name, rarity: item.rarity });
        }
      }
      if (quest.cosmeticReward) {
        await tx.userCosmetic.upsert({
          where: { userId_cosmeticId: { userId, cosmeticId: quest.cosmeticReward.id } },
          create: { userId, cosmeticId: quest.cosmeticReward.id, source: "quest" },
          update: {},
        });
        await tx.rewardGrant.upsert({
          where: {
            userId_rewardType_rewardId_sourceType_sourceId: {
              userId,
              rewardType: "cosmetic",
              rewardId: quest.cosmeticReward.id,
              sourceType: "quest",
              sourceId: completed.id,
            },
          },
          create: {
            userId,
            rewardType: "cosmetic",
            rewardId: quest.cosmeticReward.id,
            sourceType: "quest",
            sourceId: completed.id,
          },
          update: { revokedAt: null },
        });
        rewards.push({
          type: "cosmetic",
          id: quest.cosmeticReward.id,
          name: quest.cosmeticReward.name,
          rarity: quest.cosmeticReward.rarity,
        });
      }

      const notificationBody =
        rewards.length > 0
          ? `Rewards unlocked: ${rewards.map((r) => r.name).join(", ")}`
          : "Quest complete.";
      await tx.notification.upsert({
        where: { userId_dedupeKey: { userId, dedupeKey: `quest:${completed.id}` } },
        create: {
          userId,
          kind: "quest_complete",
          title: `Quest complete: ${quest.name}`,
          safeBody: notificationBody,
          targetUrl: "/quests",
          metadata: { questId: quest.id },
          dedupeKey: `quest:${completed.id}`,
        },
        update: {
          title: `Quest complete: ${quest.name}`,
          safeBody: notificationBody,
          dismissedAt: null,
          readAt: null,
          seenAt: null,
          pushQueuedAt: null,
          createdAt: now,
        },
      });
      completedQuests.push({ id: quest.id, name: quest.name, rewards });
    }

    // Chain bonus: clearing EVERY active daily quest pays +100 XP, once per
    // UTC day (the xpTransaction unique key is the idempotence guard).
    if (completedQuests.length > 0) {
      const dayKey = startOfUtcDay(now).toISOString().slice(0, 10);
      const dailies = await tx.questDefinition.findMany({
        where: {
          cadence: "daily",
          isActive: true,
          OR: [{ startsAt: null }, { startsAt: { lte: now } }],
          AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
        },
        select: { id: true },
      });
      if (dailies.length > 0) {
        const done = await tx.userQuestProgress.count({
          where: {
            userId,
            periodKey: dayKey,
            questId: { in: dailies.map((q) => q.id) },
            completedAt: { not: null },
          },
        });
        const alreadyPaid = await tx.xpTransaction.findUnique({
          where: {
            userId_sourceType_sourceId: { userId, sourceType: "quest_chain", sourceId: dayKey },
          },
        });
        if (done === dailies.length && !alreadyPaid) {
          const CHAIN_BONUS = 100;
          await tx.xpTransaction.create({
            data: { userId, delta: CHAIN_BONUS, sourceType: "quest_chain", sourceId: dayKey },
          });
          await tx.user.update({ where: { id: userId }, data: { xp: { increment: CHAIN_BONUS } } });
          await bumpWeeklyXp(tx, userId, CHAIN_BONUS);
          // Once per week, the first chain of the week also drops an elixir
          // (grantItem's ledger key on the weekKey is the guard).
          pendingItemGrants.push({
            itemId: "xp-elixir-s",
            sourceType: "quest_chain",
            sourceId: currentWeekKey(now),
          });
          await tx.notification.upsert({
            where: { userId_dedupeKey: { userId, dedupeKey: `quest-chain:${dayKey}` } },
            create: {
              userId,
              kind: "quest_complete",
              title: "Daily directives cleared!",
              safeBody: `Every daily quest done — chain bonus +${CHAIN_BONUS} XP.`,
              targetUrl: "/quests",
              dedupeKey: `quest-chain:${dayKey}`,
            },
            update: {},
          });
          completedQuests.push({
            id: "daily-chain",
            name: "Daily Directive Chain",
            rewards: [{ type: "xp", name: `${CHAIN_BONUS} XP`, amount: CHAIN_BONUS }],
          });
        }
      }
    }

    const after = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { xp: true } });
    const beforeLevel = levelForXp(before.xp);
    const afterLevel = levelForXp(after.xp);
    return { completedQuests, levelUp: afterLevel > beforeLevel ? afterLevel : null };
  });
  // Item drops after the tx — each is once-only via the RewardGrant ledger.
  for (const grant of pendingItemGrants) {
    await grantItem(userId, grant.itemId, 1, grant.sourceType, grant.sourceId);
  }
  return result;
}

export async function questListForUser(userId: string) {
  const now = new Date();
  const quests = await prisma.questDefinition.findMany({
    where: {
      isActive: true,
      OR: [{ startsAt: null }, { startsAt: { lte: now } }],
      AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
    },
    include: { titleReward: true, cosmeticReward: true },
    orderBy: { sortOrder: "asc" },
  });
  const result = [];
  for (const quest of quests) {
    const period = periodFor(quest, now);
    const progress = await prisma.userQuestProgress.findUnique({
      where: { userId_questId_periodKey: { userId, questId: quest.id, periodKey: period.key } },
    });
    if (quest.cadence === "hidden" && !progress) continue;
    result.push({
      id: quest.id,
      name: quest.name,
      description: quest.description,
      cadence: quest.cadence,
      progress: Math.min(quest.target, progress?.progress ?? 0),
      target: quest.target,
      completedAt: progress?.completedAt ?? null,
      deepLink: quest.deepLink,
      resetsAt: quest.cadence === "daily" || quest.cadence === "weekly" ? period.end : quest.endsAt,
      rewards: [
        ...(quest.xpReward > 0
          ? [{ type: "xp" as const, name: `${quest.xpReward} XP`, amount: quest.xpReward }]
          : []),
        ...(quest.badgeRewardId
          ? [{ type: "badge" as const, id: quest.badgeRewardId, name: getBadge(quest.badgeRewardId)?.name ?? "Badge" }]
          : []),
        ...(quest.titleReward
          ? [{ type: "title" as const, id: quest.titleReward.id, name: quest.titleReward.name, rarity: quest.titleReward.rarity }]
          : []),
        ...(quest.cosmeticReward
          ? [{ type: "cosmetic" as const, id: quest.cosmeticReward.id, name: quest.cosmeticReward.name, rarity: quest.cosmeticReward.rarity }]
          : []),
      ],
    });
  }
  return result;
}

export async function reverseActivityForContent(
  userId: string,
  eventKey: string,
  reason: string,
): Promise<void> {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const events = await tx.activityEvent.findMany({
      where: {
        userId,
        eventKey,
        reversedAt: null,
        type: { in: ["post_created", "post_reply_created", "comment_created"] },
      },
    });
    for (const event of events) {
      await tx.activityEvent.update({
        where: { id: event.id },
        data: { reversedAt: now, reversalReason: reason },
      });
      const quests = await tx.questDefinition.findMany({ where: { eventType: event.type } });
      for (const quest of quests) {
        const period = periodFor(quest, event.createdAt);
        const progress = await tx.userQuestProgress.findUnique({
          where: { userId_questId_periodKey: { userId, questId: quest.id, periodKey: period.key } },
        });
        if (!progress) continue;
        const nextProgress = Math.max(0, progress.progress - event.value);
        const losesCompletion = !!progress.completedAt && nextProgress < quest.target;
        if (losesCompletion) {
          const xpRows = await tx.xpTransaction.findMany({
            where: {
              userId,
              sourceType: "quest",
              sourceId: { startsWith: `${progress.id}:` },
              delta: { gt: 0 },
            },
          });
          for (const xp of xpRows) {
            const alreadyReversed = await tx.xpTransaction.findFirst({
              where: { userId, reversalOf: xp.id },
            });
            if (alreadyReversed) continue;
            const current = await tx.user.findUniqueOrThrow({
              where: { id: userId },
              select: { xp: true },
            });
            const delta = -Math.min(current.xp, xp.delta);
            await tx.xpTransaction.upsert({
              where: {
                userId_sourceType_sourceId: {
                  userId,
                  sourceType: "moderation_reversal",
                  sourceId: xp.id,
                },
              },
              create: {
                userId,
                delta,
                sourceType: "moderation_reversal",
                sourceId: xp.id,
                reversalOf: xp.id,
              },
              update: {},
            });
            await tx.user.update({ where: { id: userId }, data: { xp: { increment: delta } } });
            await bumpWeeklyXp(tx, userId, delta);
          }
          const grants = await tx.rewardGrant.findMany({
            where: { userId, sourceType: "quest", sourceId: progress.id, revokedAt: null },
          });
          for (const grant of grants) {
            await tx.rewardGrant.update({ where: { id: grant.id }, data: { revokedAt: now } });
            const otherGrant = await tx.rewardGrant.findFirst({
              where: {
                userId,
                rewardType: grant.rewardType,
                rewardId: grant.rewardId,
                revokedAt: null,
                id: { not: grant.id },
              },
            });
            if (otherGrant) continue;
            if (grant.rewardType === "title") {
              const owned = await tx.userTitle.findUnique({
                where: { userId_titleId: { userId, titleId: grant.rewardId } },
              });
              if (owned?.source === "quest") {
                await tx.user.updateMany({
                  where: { id: userId, equippedTitleId: grant.rewardId },
                  data: { equippedTitleId: null },
                });
                await tx.userTitle.deleteMany({ where: { userId, titleId: grant.rewardId } });
              }
            } else if (grant.rewardType === "cosmetic") {
              const owned = await tx.userCosmetic.findUnique({
                where: { userId_cosmeticId: { userId, cosmeticId: grant.rewardId } },
              });
              if (owned?.source === "quest") {
                const definition = await tx.cosmeticDefinition.findUnique({
                  where: { id: grant.rewardId },
                  select: { kind: true },
                });
                await tx.user.updateMany({
                  where:
                    definition?.kind === "avatar"
                      ? { id: userId, equippedAvatarId: grant.rewardId }
                      : { id: userId, equippedFrameId: grant.rewardId },
                  data:
                    definition?.kind === "avatar"
                      ? { equippedAvatarId: null }
                      : { equippedFrameId: null },
                });
                await tx.userCosmetic.deleteMany({ where: { userId, cosmeticId: grant.rewardId } });
              }
            } else if (grant.rewardType === "badge") {
              await tx.userBadge.deleteMany({ where: { userId, badgeId: grant.rewardId } });
            }
          }
          await tx.notification.updateMany({
            where: { userId, dedupeKey: `quest:${progress.id}` },
            data: { dismissedAt: now },
          });
        }
        await tx.userQuestProgress.update({
          where: { id: progress.id },
          data: {
            progress: nextProgress,
            ...(losesCompletion ? { completedAt: null, rewardedAt: null } : {}),
          },
        });
      }
    }
  });
}

export async function reverseDirectContentXp(
  userId: string,
  sourceId: string,
  amount: number,
): Promise<void> {
  if (amount <= 0) return;
  await prisma.$transaction(async (tx) => {
    const existing = await tx.xpTransaction.findUnique({
      where: {
        userId_sourceType_sourceId: { userId, sourceType: "content_reversal", sourceId },
      },
    });
    if (existing) return;
    const current = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { xp: true } });
    const delta = -Math.min(current.xp, amount);
    await tx.xpTransaction.create({
      data: { userId, delta, sourceType: "content_reversal", sourceId },
    });
    await tx.user.update({ where: { id: userId }, data: { xp: { increment: delta } } });
    await bumpWeeklyXp(tx, userId, delta);
  });
}

export async function restoreActivityForContent(userId: string, eventKey: string): Promise<void> {
  const reversed = await prisma.activityEvent.findMany({
    where: {
      userId,
      eventKey,
      reversedAt: { not: null },
      type: { in: ["post_created", "post_reply_created", "comment_created"] },
    },
  });
  for (const event of reversed) {
    await recordActivity(userId, {
      type: event.type,
      eventKey,
      canonicalId: event.canonicalId ?? undefined,
      chapterNumber: event.chapterNumber ?? undefined,
      value: event.value,
      metadata: { restoredFrom: event.id },
    });
  }
}

export async function restoreDirectContentXp(
  userId: string,
  sourceId: string,
  amount: number,
): Promise<void> {
  if (amount <= 0) return;
  await prisma.$transaction(async (tx) => {
    const existing = await tx.xpTransaction.findUnique({
      where: { userId_sourceType_sourceId: { userId, sourceType: "content_restore", sourceId } },
    });
    if (existing) return;
    await tx.xpTransaction.create({
      data: { userId, delta: amount, sourceType: "content_restore", sourceId },
    });
    await tx.user.update({ where: { id: userId }, data: { xp: { increment: amount } } });
    await bumpWeeklyXp(tx, userId, amount);
  });
}
