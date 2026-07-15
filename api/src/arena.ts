// Arena mechanics (ARENA_PLAN.md phase 1): the weekly XP window every reader
// carries for the leaderboard, quiz scoring, and the lazy close-out that pays
// winner rewards when an ended event is first read.
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./db/client.js";
import { creditGuild, currentWeekKey, weekEndsAt } from "./guilds.js";
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
export interface DrawConfig {
  prompt: string;
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
export const DRAW_ENTRY_XP = 10;
export const DRAW_VOTE_XP = 2;
// Close-out bonuses (paid lazily when an ended event is first read).
export const QUIZ_WINNER_XP = 100;
export const POLL_MAJORITY_XP = 20;
export const DRAW_WINNER_XP = 100;

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
    } else if (event.kind === "draw") {
      // Most community votes wins; ties break to the earliest entry.
      const tally = await prisma.arenaVote.groupBy({
        by: ["entryId"],
        where: { eventId: event.id },
        _count: true,
      });
      const votesByEntry = new Map(tally.map((t) => [t.entryId, t._count]));
      const winner = [...event.entries].sort((a, b) => {
        const diff = (votesByEntry.get(b.id) ?? 0) - (votesByEntry.get(a.id) ?? 0);
        if (diff !== 0) return diff;
        return a.createdAt.getTime() - b.createdAt.getTime();
      })[0];
      if (winner && (votesByEntry.get(winner.id) ?? 0) > 0) {
        await awardArenaXp(winner.userId, DRAW_WINNER_XP);
        await prisma.userTitle.upsert({
          where: { userId_titleId: { userId: winner.userId, titleId: "gate-artisan" } },
          create: { userId: winner.userId, titleId: "gate-artisan", source: "arena" },
          update: {},
        });
        await prisma.rewardGrant.upsert({
          where: {
            userId_rewardType_rewardId_sourceType_sourceId: {
              userId: winner.userId,
              rewardType: "title",
              rewardId: "gate-artisan",
              sourceType: "arena",
              sourceId: event.id,
            },
          },
          create: {
            userId: winner.userId,
            rewardType: "title",
            rewardId: "gate-artisan",
            sourceType: "arena",
            sourceId: event.id,
          },
          update: {},
        });
        await createNotification({
          userId: winner.userId,
          kind: "reward_granted",
          title: "Draw competition won!",
          safeBody: `Your entry took "${event.title}" — +${DRAW_WINNER_XP} XP and the Gate Artisan title.`,
          targetUrl: "/arena",
          dedupeKey: `arena-draw-win:${event.id}`,
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

// ── Leaderboard snapshots + weekly champions (ARENA_PLAN phase 2) ──────────
// While a week is live the weekly_xp board is upserted on every 5-min tick —
// the per-user weekly window is destroyed lazily at rollover, so it cannot be
// reconstructed afterwards (≤5 min of trailing XP is the accepted
// imprecision). Durable boards (weekly_quests, series:<id>) are computed and
// frozen exactly once after the week ends, and champions are paid then.

export function previousWeekKey(weekKey = currentWeekKey()): string {
  return new Date(new Date(`${weekKey}T00:00:00Z`).getTime() - 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

interface BoardRow {
  userId: string;
  value: number;
}

// Prisma's InputJsonValue rejects typed arrays without a cast.
const asJson = (rows: BoardRow[]) => rows as unknown as Prisma.InputJsonValue;

// Champion payouts are idempotent two ways: the reward upserts never
// duplicate, and the notification dedupeKey pins one ping per board+week.
async function grantBoardChampion(
  userId: string,
  reward: { type: "title" | "cosmetic"; id: string; label: string },
  board: string,
  periodKey: string,
): Promise<void> {
  if (reward.type === "title") {
    await prisma.userTitle.upsert({
      where: { userId_titleId: { userId, titleId: reward.id } },
      create: { userId, titleId: reward.id, source: "arena_board" },
      update: {},
    });
  } else {
    await prisma.userCosmetic.upsert({
      where: { userId_cosmeticId: { userId, cosmeticId: reward.id } },
      create: { userId, cosmeticId: reward.id, source: "arena_board" },
      update: {},
    });
  }
  await prisma.rewardGrant.upsert({
    where: {
      userId_rewardType_rewardId_sourceType_sourceId: {
        userId,
        rewardType: reward.type,
        rewardId: reward.id,
        sourceType: "arena_board",
        sourceId: `${board}:${periodKey}`,
      },
    },
    create: {
      userId,
      rewardType: reward.type,
      rewardId: reward.id,
      sourceType: "arena_board",
      sourceId: `${board}:${periodKey}`,
    },
    update: {},
  });
  await createNotification({
    userId,
    kind: "reward_granted",
    title: "Weekly champion!",
    safeBody: `You topped last week's board — ${reward.label} is yours.`,
    targetUrl: "/arena",
    dedupeKey: `board-champ:${board}:${periodKey}:${reward.id}`,
  });
}

// Seasonal cosmetics use CosmeticDefinition.availableFrom/Until: whichever
// seasonal reward of the right kind is open right now goes to the champion
// alongside the evergreen one.
async function openSeasonalCosmetic(kind: "frame" | "avatar"): Promise<string | null> {
  const now = new Date();
  const row = await prisma.cosmeticDefinition.findFirst({
    where: {
      kind,
      isActive: true,
      availableFrom: { not: null, lte: now },
      availableUntil: { not: null, gt: now },
    },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });
  return row?.id ?? null;
}

export async function snapshotBoards(): Promise<void> {
  try {
    const weekKey = currentWeekKey();
    // 1. Live-upsert this week's XP board (top 20, userId + value only).
    const top = await prisma.user.findMany({
      where: { weekKey, weeklyXp: { gt: 0 }, status: "active" },
      orderBy: [{ weeklyXp: "desc" }, { id: "asc" }],
      take: 20,
      select: { id: true, weeklyXp: true },
    });
    const rows: BoardRow[] = top.map((u) => ({ userId: u.id, value: u.weeklyXp }));
    if (rows.length > 0) {
      await prisma.leaderboardSnapshot.upsert({
        where: { board_periodKey: { board: "weekly_xp", periodKey: weekKey } },
        create: { board: "weekly_xp", periodKey: weekKey, rows: asJson(rows) },
        update: { rows: asJson(rows) },
      });
    }
    // 2. Freeze last week's boards once + crown the champions.
    await finalizeWeekBoards(previousWeekKey(weekKey));
  } catch {
    // best-effort; retried next tick
  }
}

async function finalizeWeekBoards(periodKey: string): Promise<void> {
  const windowStart = new Date(`${periodKey}T00:00:00Z`);
  const windowEnd = weekEndsAt(periodKey);

  // weekly_xp: the live-upserted snapshot just stops updating at rollover —
  // claiming its finalizedAt is the once-only lock for the XP champion.
  const claimedXp = await prisma.leaderboardSnapshot.updateMany({
    where: { board: "weekly_xp", periodKey, finalizedAt: null },
    data: { finalizedAt: new Date() },
  });
  if (claimedXp.count > 0) {
    const snap = await prisma.leaderboardSnapshot.findUnique({
      where: { board_periodKey: { board: "weekly_xp", periodKey } },
    });
    const champ = (snap?.rows as BoardRow[] | undefined)?.[0];
    if (champ) {
      await grantBoardChampion(
        champ.userId,
        { type: "cosmetic", id: "frame-monarch", label: "the Monarch's Regalia frame" },
        "weekly_xp",
        periodKey,
      );
      const seasonal = await openSeasonalCosmetic("frame");
      if (seasonal) {
        await grantBoardChampion(
          champ.userId,
          { type: "cosmetic", id: seasonal, label: "a Season reward" },
          "weekly_xp",
          periodKey,
        );
      }
    }
  }

  // weekly_quests: durable (completedAt timestamps) — compute + freeze once.
  const questsExists = await prisma.leaderboardSnapshot.findUnique({
    where: { board_periodKey: { board: "weekly_quests", periodKey } },
    select: { id: true },
  });
  if (!questsExists) {
    const grouped = await prisma.userQuestProgress.groupBy({
      by: ["userId"],
      where: { completedAt: { gte: windowStart, lt: windowEnd } },
      _count: true,
      orderBy: [{ _count: { userId: "desc" } }, { userId: "asc" }],
      take: 20,
    });
    const questRows: BoardRow[] = grouped.map((g) => ({ userId: g.userId, value: g._count }));
    try {
      await prisma.leaderboardSnapshot.create({
        data: {
          board: "weekly_quests",
          periodKey,
          rows: asJson(questRows),
          finalizedAt: new Date(),
        },
      });
      const champ = questRows[0];
      if (champ) {
        await grantBoardChampion(
          champ.userId,
          { type: "title", id: "weekly-sovereign", label: "the Weekly Sovereign title" },
          "weekly_quests",
          periodKey,
        );
        const seasonal = await openSeasonalCosmetic("avatar");
        if (seasonal) {
          await grantBoardChampion(
            champ.userId,
            { type: "cosmetic", id: seasonal, label: "a Season reward" },
            "weekly_quests",
            periodKey,
          );
        }
      }
    } catch {
      // unique collision: another instance froze it first — champions are
      // idempotent anyway, so losing the race is safe.
    }
  }

  // series:<canonicalId>: freeze the week's top ~5 most-read series (durable
  // via first-read timestamps). No champion payout — bragging rights only.
  const hotSeries = await prisma.readChapter.groupBy({
    by: ["canonicalId"],
    where: { readAt: { gte: windowStart, lt: windowEnd } },
    _count: true,
    orderBy: [{ _count: { canonicalId: "desc" } }],
    take: 5,
  });
  for (const series of hotSeries) {
    const board = `series:${series.canonicalId}`;
    const exists = await prisma.leaderboardSnapshot.findUnique({
      where: { board_periodKey: { board, periodKey } },
      select: { id: true },
    });
    if (exists) continue;
    const readers = await prisma.readChapter.groupBy({
      by: ["userId"],
      where: { canonicalId: series.canonicalId, readAt: { gte: windowStart, lt: windowEnd } },
      _count: true,
      orderBy: [{ _count: { userId: "desc" } }, { userId: "asc" }],
      take: 20,
    });
    try {
      await prisma.leaderboardSnapshot.create({
        data: {
          board,
          periodKey,
          rows: asJson(readers.map((r) => ({ userId: r.userId, value: r._count }))),
          finalizedAt: new Date(),
        },
      });
    } catch {
      // lost the freeze race; fine
    }
  }
}
