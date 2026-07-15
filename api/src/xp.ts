// Central user-XP award path: one place for the streak multiplier, the weekly
// window, guild contribution, and level-milestone checks. Every direct XP
// site (reads, comments, posts, reactions, arena) routes through here.
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./db/client.js";
import { creditGuild, currentWeekKey } from "./guilds.js";
import { levelForXp } from "./badges.js";
import { maybeGrantLevelMilestones } from "./progression.js";

type Db = PrismaClient | Prisma.TransactionClient;

// 7+ day streaks earn 10% more XP (rounded up) — loyalty should compound.
export const STREAK_BONUS_DAYS = 7;
export const STREAK_BONUS_MULTIPLIER = 1.1;

// Roll a reader's weekly XP window forward and apply a delta. Mirrors the
// GuildMember weeklyXp/weekKey pattern: the window rolls over lazily on the
// first award of a new Monday-anchored UTC week. Negative deltas (moderation
// reversals) floor at zero. Best-effort — never let a leaderboard bump break
// the underlying action. (Moved from arena.ts; arena re-exports it.)
export async function bumpWeeklyXp(db: Db, userId: string, delta: number): Promise<void> {
  if (delta === 0) return;
  try {
    const weekKey = currentWeekKey();
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { weeklyXp: true, weekKey: true },
    });
    if (!user) return;
    const base = user.weekKey === weekKey ? user.weeklyXp : 0;
    await db.user.update({
      where: { id: userId },
      data: { weeklyXp: Math.max(0, base + delta), weekKey },
    });
  } catch {
    // best-effort; ignore
  }
}

export interface XpAward {
  awarded: number;
  bonus: number;
  levelUp: number | null;
}

// Award positive XP with the streak multiplier applied. Reversals stay flat
// and negative at their call sites (boost applies to earning, not clawback —
// the ≤1 XP asymmetry per reversal is accepted).
export async function awardUserXp(userId: string, base: number): Promise<XpAward> {
  if (base <= 0) return { awarded: 0, bonus: 0, levelUp: null };
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { xp: true, streakDays: true },
  });
  if (!user) return { awarded: 0, bonus: 0, levelUp: null };
  const boosted =
    user.streakDays >= STREAK_BONUS_DAYS ? Math.ceil(base * STREAK_BONUS_MULTIPLIER) : base;
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { xp: { increment: boosted } },
    select: { xp: true },
  });
  await bumpWeeklyXp(prisma, userId, boosted);
  await creditGuild(userId, boosted);
  const levelBefore = levelForXp(user.xp);
  const levelAfter = levelForXp(updated.xp);
  if (levelAfter > levelBefore) void maybeGrantLevelMilestones(userId);
  return {
    awarded: boosted,
    bonus: boosted - base,
    levelUp: levelAfter > levelBefore ? levelAfter : null,
  };
}
