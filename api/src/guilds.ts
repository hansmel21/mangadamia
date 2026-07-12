// Guild mechanics: leveling, membership caps, weekly contribution windows, and
// the XP contribution hook. Guild level is driven by contribution flow — XP
// members earn while joined, which never decreases — while "power" (sum of
// member levels) is computed on read as a flashy aggregate rating.
import { levelForXp } from "./badges.js";
import { prisma } from "./db/client.js";

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
      }
    }
  } catch {
    // best-effort; ignore
  }
}

// Live war score for one side: the sum of members' weekly contribution in the
// given week. Members whose weekKey is stale contribute 0 (their weeklyXp is
// from an older week and rolls over on their next credit).
export async function warScoreForGuild(guildId: string, weekKey: string): Promise<number> {
  const agg = await prisma.guildMember.aggregate({
    where: { guildId, weekKey },
    _sum: { weeklyXp: true },
  });
  return agg._sum.weeklyXp ?? 0;
}

// Credit a member's guild for XP they just earned. Contribution flow: guild.xp
// and all-time contribution only ever increase; weekly contribution rolls over
// on the UTC week boundary. Best-effort — a guild-credit failure must never
// break the underlying action (posting, reading, etc.).
export async function creditGuild(userId: string, amount: number): Promise<void> {
  if (amount <= 0) return;
  try {
    const membership = await prisma.guildMember.findUnique({ where: { userId } });
    if (!membership) return;
    const weekKey = currentWeekKey();
    const sameWeek = membership.weekKey === weekKey;
    await prisma.$transaction([
      prisma.guild.update({
        where: { id: membership.guildId },
        data: { xp: { increment: amount } },
      }),
      prisma.guildMember.update({
        where: { userId },
        data: sameWeek
          ? { contributionXp: { increment: amount }, weeklyXp: { increment: amount } }
          : { contributionXp: { increment: amount }, weeklyXp: amount, weekKey },
      }),
      prisma.guildXpTransaction.create({
        data: { guildId: membership.guildId, userId, delta: amount },
      }),
    ]);
  } catch {
    // best-effort; ignore
  }
}
