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
