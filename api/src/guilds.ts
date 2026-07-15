// Guild mechanics: leveling, membership caps, weekly contribution windows, and
// the XP contribution hook. Guild level is driven by contribution flow — XP
// members earn while joined, which never decreases — while "power" (sum of
// member levels) is computed on read as a flashy aggregate rating.
import type { GuildEvent } from "@prisma/client";
import { levelForXp } from "./badges.js";
import { prisma } from "./db/client.js";
import { createNotification } from "./notifications.js";

// Curated, app-owned emblem shapes, rendered client-side as SVG. No uploads,
// so no image-moderation surface (consistent with avatars/frames).
export const GUILD_EMBLEMS = [
  "crest",
  "fang",
  "flame",
  "eye",
  "tower",
  "blade",
  "moon",
  "wing",
] as const;
export type GuildEmblem = (typeof GUILD_EMBLEMS)[number];
export function isGuildEmblem(key: string): boolean {
  return (GUILD_EMBLEMS as readonly string[]).includes(key);
}

// Curated, level-gated hall decorations (cosmetic — a progression sink).
// Rendered client-side as styled treatments on the hall banner; no uploads.
export const GUILD_DECORATIONS = [
  { key: "halo", name: "Arcane Halo", minLevel: 2 },
  { key: "verdant", name: "Verdant Wreath", minLevel: 2 },
  { key: "stormveil", name: "Storm Veil", minLevel: 4 },
  { key: "gilded", name: "Gilded Frame", minLevel: 4 },
  { key: "bloodmoon", name: "Blood Moon", minLevel: 6 },
  { key: "eclipse", name: "Eclipse Crown", minLevel: 8 },
] as const;

export function decorationMinLevel(key: string): number | null {
  return GUILD_DECORATIONS.find((d) => d.key === key)?.minLevel ?? null;
}

// The perk track shown in the Hall: what this level already grants and what
// the next investment unlocks. Purely derived — no storage.
export function guildPerks(level: number): {
  key: string;
  level: number;
  label: string;
  unlocked: boolean;
}[] {
  return [
    {
      key: "base",
      level: 1,
      label: "Guild board, weekly raid, war & event",
      unlocked: true,
    },
    {
      key: "cap",
      level: 1,
      label: `Member cap grows every level (now ${guildMemberCap(level)})`,
      unlocked: true,
    },
    { key: "deco2", level: 2, label: "Hall decorations I (Halo, Wreath)", unlocked: level >= 2 },
    { key: "deco4", level: 4, label: "Hall decorations II (Veil, Gilded)", unlocked: level >= 4 },
    {
      key: "boost",
      level: 5,
      label: "+10% guild XP on every member contribution",
      unlocked: level >= 5,
    },
    { key: "deco6", level: 6, label: "Hall decorations III (Blood Moon)", unlocked: level >= 6 },
    { key: "deco8", level: 8, label: "Hall decorations IV (Eclipse)", unlocked: level >= 8 },
  ];
}

// Steeper than the personal curve in badges.ts — a guild is fed by many members.
export const guildLevelForXp = (xp: number): number =>
  Math.floor(Math.sqrt(Math.max(0, xp) / 400)) + 1;
export const guildXpForLevel = (level: number): number => (level - 1) ** 2 * 400;
// Member cap grows with investment but stays intimate early.
export const guildMemberCap = (level: number): number => Math.min(50, 8 + level * 2);

// Guild "power" = sum of member levels (the aggregate rating readers first pictured).
export const guildPower = (memberXps: number[]): number =>
  memberXps.reduce((sum, xp) => sum + levelForXp(xp), 0);

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// Monday-anchored UTC week key, matching the quest engine's weekly boundaries.
export function currentWeekKey(now = new Date()): string {
  const day = startOfUtcDay(now);
  const isoDay = day.getUTCDay() || 7;
  const start = new Date(day.getTime() - (isoDay - 1) * 86_400_000);
  return start.toISOString().slice(0, 10);
}

// End of a weekKey's week: 00:00 UTC the following Monday.
export function weekEndsAt(weekKey: string): Date {
  return new Date(new Date(`${weekKey}T00:00:00Z`).getTime() + 7 * 86_400_000);
}

// ISO week number for display ("GUILD WAR · WEEK 31").
export function weekNumber(weekKey: string): number {
  const monday = new Date(`${weekKey}T00:00:00Z`);
  const thursday = new Date(monday.getTime() + 3 * 86_400_000);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  return Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

// Weekly raid target: chapters the guild must clear together. Scales with the
// roster so small guilds aren't handed a 50-member quota, rounded to a clean
// number so the card reads like a quest ("Clear 120 chapters together").
export function raidTargetForGuild(memberCount: number): number {
  return Math.max(40, Math.ceil((memberCount * 8) / 10) * 10);
}

// Completion bonus paid into guild XP when the weekly raid target is met.
export const RAID_BONUS_XP = 250;

// Tick the reader's guild raid for one completed chapter. Awards the one-time
// completion bonus when the target is crossed. Best-effort — a raid failure
// must never break the read itself.
export async function bumpGuildRaid(userId: string): Promise<void> {
  try {
    const membership = await prisma.guildMember.findUnique({ where: { userId } });
    if (!membership) return;
    const weekKey = currentWeekKey();
    const row = await prisma.guildRaidProgress.upsert({
      where: { guildId_weekKey: { guildId: membership.guildId, weekKey } },
      create: { guildId: membership.guildId, weekKey, progress: 1 },
      update: { progress: { increment: 1 } },
    });
    if (row.claimedAt) return;
    const memberCount = await prisma.guildMember.count({ where: { guildId: membership.guildId } });
    if (row.progress >= raidTargetForGuild(memberCount)) {
      // Claim atomically: only the update that flips claimedAt pays the bonus.
      const claimed = await prisma.guildRaidProgress.updateMany({
        where: { guildId: membership.guildId, weekKey, claimedAt: null },
        data: { claimedAt: new Date() },
      });
      if (claimed.count > 0) {
        await prisma.guild.update({
          where: { id: membership.guildId },
          data: { xp: { increment: RAID_BONUS_XP } },
        });
        await grantRaidFrames(membership.guildId, weekKey);
      }
    }
  } catch {
    // best-effort; ignore
  }
}

// Raid clear cosmetic: every member who contributed at least one chapter this
// week earns the Ember Wreath frame (idempotent — upserts keyed per member).
const RAID_FRAME_ID = "frame-ember";
async function grantRaidFrames(guildId: string, weekKey: string): Promise<void> {
  try {
    const members = await prisma.guildMember.findMany({
      where: { guildId },
      select: { userId: true },
    });
    const contributions = await prisma.activityEvent.groupBy({
      by: ["userId"],
      where: {
        userId: { in: members.map((m) => m.userId) },
        type: "chapter_completed",
        reversedAt: null,
        createdAt: { gte: new Date(`${weekKey}T00:00:00Z`), lt: weekEndsAt(weekKey) },
      },
      _count: true,
    });
    for (const c of contributions) {
      const fresh = await prisma.userCosmetic.upsert({
        where: { userId_cosmeticId: { userId: c.userId, cosmeticId: RAID_FRAME_ID } },
        create: { userId: c.userId, cosmeticId: RAID_FRAME_ID, source: "guild_raid" },
        update: {},
      });
      await prisma.rewardGrant.upsert({
        where: {
          userId_rewardType_rewardId_sourceType_sourceId: {
            userId: c.userId,
            rewardType: "cosmetic",
            rewardId: RAID_FRAME_ID,
            sourceType: "guild_raid",
            sourceId: `${guildId}:${weekKey}`,
          },
        },
        create: {
          userId: c.userId,
          rewardType: "cosmetic",
          rewardId: RAID_FRAME_ID,
          sourceType: "guild_raid",
          sourceId: `${guildId}:${weekKey}`,
        },
        update: {},
      });
      // Only announce a first-time unlock.
      if (Date.now() - fresh.unlockedAt.getTime() < 60_000) {
        await createNotification({
          userId: c.userId,
          kind: "reward_granted",
          title: "Raid cleared — frame unlocked!",
          safeBody: "The Ember Wreath frame is yours. Equip it from your Status screen.",
          targetUrl: "/account/appearance",
          dedupeKey: `raid-frame:${c.userId}`,
        });
      }
      // Raid loot: one Monarch's Chest per contributor per cleared raid week
      // (grantItem's ledger key is the guard). Lazy import avoids a cycle.
      const { grantItem } = await import("./items.js");
      await grantItem(c.userId, "monarch-chest", 1, "guild_raid", `${guildId}:${weekKey}`);
    }
  } catch {
    // best-effort; ignore
  }
}

// ── Weekly guild event: a rotating co-op side quest next to the raid ──────
// The raid always asks for chapters; the event rotates through social goals
// so the pair never overlaps. One event per guild per week, created lazily on
// first read or first tick (same no-cron pattern as wars).
export const GUILD_EVENT_TYPES = ["post_created", "reply_created", "reaction_received"] as const;
export type GuildEventType = (typeof GUILD_EVENT_TYPES)[number];

export const EVENT_BONUS_XP = 150;

export function guildEventTitle(eventType: string, target: number): string {
  switch (eventType) {
    case "post_created":
      return `File ${target} records together`;
    case "reply_created":
      return `Write ${target} replies together`;
    case "reaction_received":
      return `Earn ${target} reactions together`;
    default:
      return `Reach ${target} together`;
  }
}

function hashCode(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

// Deterministic rotation: advances every week, offset per guild so the whole
// server isn't on the same objective.
export function eventTypeForWeek(guildId: string, weekKey: string): GuildEventType {
  return GUILD_EVENT_TYPES[(weekNumber(weekKey) + hashCode(guildId)) % GUILD_EVENT_TYPES.length];
}

// Like the raid target: scales with the roster, rounded to read like a quest.
export function eventTargetForGuild(eventType: GuildEventType, memberCount: number): number {
  const perMember =
    eventType === "post_created" ? 3 : eventType === "reply_created" ? 4 : 5;
  return Math.max(10, Math.ceil((memberCount * perMember) / 5) * 5);
}

export async function ensureGuildEvent(guildId: string): Promise<GuildEvent> {
  const weekKey = currentWeekKey();
  const existing = await prisma.guildEvent.findUnique({
    where: { guildId_weekKey: { guildId, weekKey } },
  });
  if (existing) return existing;
  const memberCount = await prisma.guildMember.count({ where: { guildId } });
  const eventType = eventTypeForWeek(guildId, weekKey);
  try {
    return await prisma.guildEvent.create({
      data: {
        guildId,
        weekKey,
        eventType,
        target: eventTargetForGuild(eventType, memberCount),
        bonusXp: EVENT_BONUS_XP,
      },
    });
  } catch {
    // Concurrent creation — the unique (guildId, weekKey) decided the race.
    return prisma.guildEvent.findUniqueOrThrow({
      where: { guildId_weekKey: { guildId, weekKey } },
    });
  }
}

// Tick the reader's guild event if this week's objective matches the action.
// Pays the one-time bonus and notifies the roster when the target is crossed.
// Best-effort — an event failure must never break the underlying action.
export async function bumpGuildEvent(userId: string, eventType: GuildEventType): Promise<void> {
  try {
    const membership = await prisma.guildMember.findUnique({ where: { userId } });
    if (!membership) return;
    const event = await ensureGuildEvent(membership.guildId);
    if (event.eventType !== eventType || event.completedAt) return;
    const [updated] = await prisma.$transaction([
      prisma.guildEvent.update({
        where: { id: event.id },
        data: { progress: { increment: 1 } },
      }),
      prisma.guildEventContribution.upsert({
        where: { eventId_userId: { eventId: event.id, userId } },
        create: { eventId: event.id, userId, value: 1 },
        update: { value: { increment: 1 } },
      }),
    ]);
    if (updated.progress < updated.target) return;
    // Claim atomically: only the update that flips completedAt pays out.
    const claimed = await prisma.guildEvent.updateMany({
      where: { id: event.id, completedAt: null },
      data: { completedAt: new Date() },
    });
    if (claimed.count === 0) return;
    const [guild, members] = await Promise.all([
      prisma.guild.update({
        where: { id: membership.guildId },
        data: { xp: { increment: updated.bonusXp } },
      }),
      prisma.guildMember.findMany({
        where: { guildId: membership.guildId },
        select: { userId: true },
      }),
    ]);
    await Promise.all(
      members.map((m) =>
        createNotification({
          userId: m.userId,
          kind: "guild_event_complete",
          title: "Guild event cleared!",
          safeBody: `${guild.name} finished “${guildEventTitle(event.eventType, event.target)}” — +${updated.bonusXp} Guild XP.`,
          targetUrl: `/guild/${membership.guildId}`,
          dedupeKey: `guild-event:${event.id}:${m.userId}`,
        }),
      ),
    );
  } catch {
    // best-effort; ignore
  }
}

// War score for one side: the sum of the guild's contribution transactions
// inside the week's window. Exact for any week — live or already over — so
// finalization freezes true totals even if nobody read the war before the
// rollover (the old weeklyXp sum evaporated as members' windows rolled).
export async function warScoreForGuild(guildId: string, weekKey: string): Promise<number> {
  const agg = await prisma.guildXpTransaction.aggregate({
    where: {
      guildId,
      createdAt: { gte: new Date(`${weekKey}T00:00:00Z`), lt: weekEndsAt(weekKey) },
    },
    _sum: { delta: true },
  });
  return agg._sum.delta ?? 0;
}

// Winner's purse for a weekly guild war, paid once at finalization.
export const WAR_WINNER_BONUS_XP = 200;

// Freeze finished wars: recompute both sides' final scores from the
// transaction log, pay the winner's bonus, and notify both rosters. Runs
// lazily from the war routes and from the server's periodic close-out tick.
export async function finalizePastWars(): Promise<void> {
  try {
    const weekKey = currentWeekKey();
    const wars = await prisma.guildWar.findMany({
      where: { finalizedAt: null, weekKey: { not: weekKey } },
      take: 20,
    });
    for (const war of wars) {
      // Claim atomically so concurrent finalizers can't double-pay.
      const claimed = await prisma.guildWar.updateMany({
        where: { id: war.id, finalizedAt: null },
        data: { finalizedAt: new Date() },
      });
      if (claimed.count === 0) continue;
      const [scoreA, scoreB] = await Promise.all([
        warScoreForGuild(war.guildAId, war.weekKey),
        warScoreForGuild(war.guildBId, war.weekKey),
      ]);
      await prisma.guildWar.update({ where: { id: war.id }, data: { scoreA, scoreB } });
      if (scoreA === scoreB) continue; // draw — no purse
      const winnerId = scoreA > scoreB ? war.guildAId : war.guildBId;
      const [winner, members] = await Promise.all([
        prisma.guild.update({
          where: { id: winnerId },
          data: { xp: { increment: WAR_WINNER_BONUS_XP } },
        }),
        prisma.guildMember.findMany({ where: { guildId: winnerId }, select: { userId: true } }),
      ]);
      await Promise.all(
        members.map((m) =>
          createNotification({
            userId: m.userId,
            kind: "guild_war_won",
            title: "Guild war won!",
            safeBody: `${winner.name} took week ${weekNumber(war.weekKey)}'s war — +${WAR_WINNER_BONUS_XP} Guild XP.`,
            targetUrl: `/guild/${winnerId}`,
            dedupeKey: `guild-war-won:${war.id}:${m.userId}`,
          }),
        ),
      );
    }
  } catch {
    // best-effort; the next tick retries anything unfinalized
  }
}

// Credit a member's guild for XP they just earned. Contribution flow: guild.xp
// and all-time contribution only ever increase; weekly contribution rolls over
// on the UTC week boundary. Best-effort — a guild-credit failure must never
// break the underlying action (posting, reading, etc.).
// LV 5 perk: contributions land 10% heavier (rounded up).
export const GUILD_BOOST_LEVEL = 5;
export const GUILD_BOOST_MULTIPLIER = 1.1;

export async function creditGuild(userId: string, amount: number): Promise<void> {
  if (amount <= 0) return;
  try {
    const membership = await prisma.guildMember.findUnique({
      where: { userId },
      include: { guild: { select: { xp: true } } },
    });
    if (!membership) return;
    const boosted =
      guildLevelForXp(membership.guild.xp) >= GUILD_BOOST_LEVEL
        ? Math.ceil(amount * GUILD_BOOST_MULTIPLIER)
        : amount;
    const weekKey = currentWeekKey();
    const sameWeek = membership.weekKey === weekKey;
    await prisma.$transaction([
      prisma.guild.update({
        where: { id: membership.guildId },
        data: { xp: { increment: boosted } },
      }),
      prisma.guildMember.update({
        where: { userId },
        data: sameWeek
          ? { contributionXp: { increment: boosted }, weeklyXp: { increment: boosted } }
          : { contributionXp: { increment: boosted }, weeklyXp: boosted, weekKey },
      }),
      prisma.guildXpTransaction.create({
        data: { guildId: membership.guildId, userId, delta: boosted },
      }),
    ]);
  } catch {
    // best-effort; ignore
  }
}
