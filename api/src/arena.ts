// Arena mechanics (ARENA_PLAN.md phase 1): the weekly XP window every reader
// carries for the leaderboard, quiz scoring, and the lazy close-out that pays
// winner rewards when an ended event is first read.
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./db/client.js";
import { creditGuild, currentWeekKey } from "./guilds.js";
import { createNotification } from "./notifications.js";

type Db = PrismaClient | Prisma.TransactionClient;

// Roll a reader's weekly XP window forward and apply a delta. Mirrors the
// GuildMember weeklyXp/weekKey pattern: the window rolls over lazily on the
// first award of a new Monday-anchored UTC week. Negative deltas (moderation
// reversals) floor at zero. Best-effort — never let a leaderboard bump break
// the underlying action.
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

// ── Quiz config (stored on ArenaEvent.config) ───────────────────────────────
export interface QuizQuestion {
  q: string;
  options: string[];
  correct: number;
}
export interface QuizConfig {
  questions: QuizQuestion[];
  durationSec: number;
}
export interface PollConfig {
  options: string[];
}

export function arenaStatus(e: { startsAt: Date; endsAt: Date }, now = new Date()): string {
  if (now < e.startsAt) return "upcoming";
  if (now < e.endsAt) return "live";
  return "ended";
}

// Entry XP: showing up pays a little, skill pays more. Poll votes pay a flat
// stake. Both feed the weekly board and the guild war like any other XP.
export const QUIZ_ENTRY_XP = 10;
export const QUIZ_PER_CORRECT_XP = 5;
export const POLL_VOTE_XP = 5;
// Close-out bonuses (paid lazily when an ended event is first read).
export const QUIZ_WINNER_XP = 100;
export const POLL_MAJORITY_XP = 20;

export function scoreQuiz(config: QuizConfig, answers: number[]): number {
  let score = 0;
  config.questions.forEach((question, i) => {
    if (answers[i] === question.correct) score += 1;
  });
  return score;
}

// Award arena XP outside a transaction: total XP + weekly window + guild war.
export async function awardArenaXp(userId: string, amount: number): Promise<void> {
  if (amount <= 0) return;
  await prisma.user.update({ where: { id: userId }, data: { xp: { increment: amount } } });
  await bumpWeeklyXp(prisma, userId, amount);
  await creditGuild(userId, amount);
}

// Lazy close-out: pay winner rewards for an ended, un-finalized event.
// Quiz — best score (ties broken by reported ms) takes the winner bonus.
// Poll — every reader who voted with the majority takes a small payout.
// Claim finalizedAt atomically so concurrent readers can't double-pay.
export async function finalizeArenaEvent(eventId: string): Promise<void> {
  try {
    const claimed = await prisma.arenaEvent.updateMany({
      where: { id: eventId, finalizedAt: null, endsAt: { lt: new Date() } },
      data: { finalizedAt: new Date() },
    });
    if (claimed.count === 0) return;
    const event = await prisma.arenaEvent.findUnique({
      where: { id: eventId },
      include: { entries: true },
    });
    if (!event || event.entries.length === 0) return;

    if (event.kind === "quiz") {
      const winner = [...event.entries].sort((a, b) => {
        const scoreDiff = (b.score ?? 0) - (a.score ?? 0);
        if (scoreDiff !== 0) return scoreDiff;
        const aMs = (a.payload as { ms?: number }).ms ?? Number.MAX_SAFE_INTEGER;
        const bMs = (b.payload as { ms?: number }).ms ?? Number.MAX_SAFE_INTEGER;
        return aMs - bMs;
      })[0];
      if (winner && (winner.score ?? 0) > 0) {
        await awardArenaXp(winner.userId, QUIZ_WINNER_XP);
        // Winner's title (Gate Scholar) — idempotent, kept if already owned.
        await prisma.userTitle.upsert({
          where: { userId_titleId: { userId: winner.userId, titleId: "gate-scholar" } },
          create: { userId: winner.userId, titleId: "gate-scholar", source: "arena" },
          update: {},
        });
        await prisma.rewardGrant.upsert({
          where: {
            userId_rewardType_rewardId_sourceType_sourceId: {
              userId: winner.userId,
              rewardType: "title",
              rewardId: "gate-scholar",
              sourceType: "arena",
              sourceId: event.id,
            },
          },
          create: {
            userId: winner.userId,
            rewardType: "title",
            rewardId: "gate-scholar",
            sourceType: "arena",
            sourceId: event.id,
          },
          update: {},
        });
        await createNotification({
          userId: winner.userId,
          kind: "reward_granted",
          title: "Arena victory!",
          safeBody: `You won "${event.title}" — +${QUIZ_WINNER_XP} XP and the Gate Scholar title.`,
          targetUrl: "/arena",
          dedupeKey: `arena-win:${event.id}`,
        });
      }
    } else if (event.kind === "poll") {
      const tally = new Map<number, number>();
      for (const entry of event.entries) {
        const option = (entry.payload as { option?: number }).option;
        if (option !== undefined) tally.set(option, (tally.get(option) ?? 0) + 1);
      }
      const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
      // No payout on a tie for first — there's no majority to reward.
      const tied = top && [...tally.values()].filter((n) => n === top[1]).length > 1;
      if (top && !tied) {
        const winners = event.entries.filter(
          (entry) => (entry.payload as { option?: number }).option === top[0],
        );
        for (const winner of winners) {
          await awardArenaXp(winner.userId, POLL_MAJORITY_XP);
        }
      }
    }
  } catch {
    // best-effort; a failed close-out retries on the next read (finalizedAt
    // already claimed — acceptable: rewards are then skipped rather than
    // double-paid; the conservative failure mode).
  }
}
