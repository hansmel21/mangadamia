// Arena routes (ARENA_PLAN.md phase 1): weekly quiz + prediction pools with
// server-side scoring, the weekly XP leaderboard, and an admin event creator.
// Event status is computed on read; winner rewards pay out lazily the first
// time an ended event is read (no cron required).
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  arenaStatus,
  awardArenaXp,
  finalizeArenaEvent,
  POLL_VOTE_XP,
  QUIZ_ENTRY_XP,
  QUIZ_PER_CORRECT_XP,
  scoreQuiz,
  type PollConfig,
  type QuizConfig,
} from "../arena.js";
import { getUser, requireActiveUser, requireCapability } from "../auth.js";
import { prisma } from "../db/client.js";
import { currentWeekKey, weekEndsAt, weekNumber } from "../guilds.js";
import { identitiesForUsers } from "../identity.js";
import { recordActivity } from "../quests.js";

function httpError(statusCode: number, message: string): Error {
  return Object.assign(new Error(message), { statusCode });
}

const quizConfigSchema = z.object({
  questions: z
    .array(
      z.object({
        q: z.string().trim().min(1).max(300),
        options: z.array(z.string().trim().min(1).max(120)).min(2).max(4),
        correct: z.number().int().min(0),
      }),
    )
    .min(1)
    .max(20),
  durationSec: z.number().int().min(30).max(600).default(90),
});
const pollConfigSchema = z.object({
  options: z.array(z.string().trim().min(1).max(120)).min(2).max(6),
});

// Public payload for a quiz question: never leaks the correct index.
function publicQuestions(config: QuizConfig) {
  return config.questions.map((question) => ({ q: question.q, options: question.options }));
}

export function registerArenaRoutes(app: FastifyInstance): void {
  // ── Hub list ──────────────────────────────────────────────────────────
  app.get("/arena/events", async (req) => {
    const me = await getUser(req);
    const now = new Date();
    const events = await prisma.arenaEvent.findMany({
      where: { endsAt: { gte: new Date(now.getTime() - 30 * 86_400_000) } },
      orderBy: [{ endsAt: "asc" }],
      take: 20,
      include: {
        _count: { select: { entries: true } },
        entries: me ? { where: { userId: me.id } } : false,
      },
    });
    // Pay out any ended events that haven't closed yet (lazy, best-effort).
    for (const event of events) {
      if (arenaStatus(event, now) === "ended" && !event.finalizedAt) {
        void finalizeArenaEvent(event.id);
      }
    }
    const weekKey = currentWeekKey();
    return {
      weekNo: weekNumber(weekKey),
      weekEndsAt: weekEndsAt(weekKey),
      events: events
        .map((event) => {
          const myEntry = me && Array.isArray(event.entries) ? event.entries[0] : undefined;
          return {
            id: event.id,
            kind: event.kind,
            title: event.title,
            description: event.description,
            startsAt: event.startsAt,
            endsAt: event.endsAt,
            status: arenaStatus(event, now),
            entryCount: event._count.entries,
            entered: !!myEntry,
            myScore: myEntry?.score ?? null,
          };
        })
        .sort((a, b) => {
          const order: Record<string, number> = { live: 0, upcoming: 1, ended: 2 };
          return (order[a.status] ?? 3) - (order[b.status] ?? 3);
        }),
    };
  });

  // ── One event (quiz runner / pool card data) ──────────────────────────
  app.get<{ Params: { id: string } }>("/arena/events/:id", async (req) => {
    const me = await getUser(req);
    const event = await prisma.arenaEvent.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { entries: true } } },
    });
    if (!event) throw httpError(404, "No such event");
    const now = new Date();
    const status = arenaStatus(event, now);
    if (status === "ended" && !event.finalizedAt) void finalizeArenaEvent(event.id);
    const myEntry = me
      ? await prisma.arenaEntry.findUnique({
          where: { eventId_userId: { eventId: event.id, userId: me.id } },
        })
      : null;

    const base = {
      id: event.id,
      kind: event.kind,
      title: event.title,
      description: event.description,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      status,
      entryCount: event._count.entries,
      entered: !!myEntry,
      myScore: myEntry?.score ?? null,
    };

    if (event.kind === "quiz") {
      const config = event.config as unknown as QuizConfig;
      // Correct answers only travel after the reader has locked an entry (or
      // the event ended) — a live quiz never leaks its answer key.
      const revealed = !!myEntry || status === "ended";
      return {
        ...base,
        durationSec: config.durationSec,
        questionCount: config.questions.length,
        questions: publicQuestions(config),
        answers: revealed ? config.questions.map((question) => question.correct) : null,
        myAnswers: myEntry ? ((myEntry.payload as { answers?: number[] }).answers ?? null) : null,
      };
    }

    // poll
    const config = event.config as unknown as PollConfig;
    const tally = await prisma.arenaEntry.findMany({
      where: { eventId: event.id },
      select: { payload: true },
    });
    const votes = config.options.map(
      (_, i) =>
        tally.filter((entry) => (entry.payload as { option?: number }).option === i).length,
    );
    return {
      ...base,
      options: config.options,
      votes,
      totalVotes: tally.length,
      myVote: myEntry ? ((myEntry.payload as { option?: number }).option ?? null) : null,
    };
  });

  // ── Enter (quiz submit / pool vote) ───────────────────────────────────
  app.post<{ Params: { id: string } }>(
    "/arena/events/:id/entry",
    { config: { rateLimit: { max: 30, timeWindow: "1 hour" } } },
    async (req) => {
      const user = await requireActiveUser(req);
      const event = await prisma.arenaEvent.findUnique({ where: { id: req.params.id } });
      if (!event) throw httpError(404, "No such event");
      if (arenaStatus(event) !== "live") throw httpError(409, "This event isn't live");

      if (event.kind === "quiz") {
        const config = event.config as unknown as QuizConfig;
        const { answers, ms } = z
          .object({
            answers: z.array(z.number().int().min(-1)).max(config.questions.length),
            ms: z.number().int().min(0).max(3_600_000).default(0),
          })
          .parse(req.body);
        const existing = await prisma.arenaEntry.findUnique({
          where: { eventId_userId: { eventId: event.id, userId: user.id } },
        });
        if (existing) throw httpError(409, "You already entered this quiz");
        const score = scoreQuiz(config, answers);
        await prisma.arenaEntry.create({
          data: { eventId: event.id, userId: user.id, payload: { answers, ms }, score },
        });
        const xp = QUIZ_ENTRY_XP + score * QUIZ_PER_CORRECT_XP;
        await awardArenaXp(user.id, xp);
        const activity = await recordActivity(user.id, {
          type: "arena_entry",
          eventKey: event.id,
        });
        return {
          ok: true,
          score,
          total: config.questions.length,
          answers: config.questions.map((question) => question.correct),
          xpAwarded: xp,
          levelUp: activity.levelUp,
          completedQuests: activity.completedQuests,
        };
      }

      // poll — one stake per reader; re-voting moves it (no extra XP).
      const config = event.config as unknown as PollConfig;
      const { option } = z
        .object({ option: z.number().int().min(0).max(config.options.length - 1) })
        .parse(req.body);
      const existing = await prisma.arenaEntry.findUnique({
        where: { eventId_userId: { eventId: event.id, userId: user.id } },
      });
      if (existing) {
        await prisma.arenaEntry.update({
          where: { id: existing.id },
          data: { payload: { option } },
        });
        return { ok: true, myVote: option, xpAwarded: 0 };
      }
      await prisma.arenaEntry.create({
        data: { eventId: event.id, userId: user.id, payload: { option } },
      });
      await awardArenaXp(user.id, POLL_VOTE_XP);
      const activity = await recordActivity(user.id, { type: "arena_entry", eventKey: event.id });
      return {
        ok: true,
        myVote: option,
        xpAwarded: POLL_VOTE_XP,
        levelUp: activity.levelUp,
        completedQuests: activity.completedQuests,
      };
    },
  );

  // ── Weekly XP leaderboard (computed live from the weekly window) ──────
  app.get("/arena/leaderboards/weekly_xp", async (req) => {
    const me = await getUser(req);
    const weekKey = currentWeekKey();
    const top = await prisma.user.findMany({
      where: { weekKey, weeklyXp: { gt: 0 }, status: "active" },
      orderBy: [{ weeklyXp: "desc" }, { id: "asc" }],
      take: 20,
      select: { id: true, weeklyXp: true },
    });
    const identities = await identitiesForUsers(top.map((row) => row.id), me?.id);
    let mine: { rank: number; xp: number } | null = null;
    if (me) {
      const meRow = await prisma.user.findUnique({
        where: { id: me.id },
        select: { weeklyXp: true, weekKey: true },
      });
      const myXp = meRow?.weekKey === weekKey ? meRow.weeklyXp : 0;
      if (myXp > 0) {
        const ahead = await prisma.user.count({
          where: { weekKey, weeklyXp: { gt: myXp }, status: "active" },
        });
        mine = { rank: ahead + 1, xp: myXp };
      }
    }
    return {
      weekNo: weekNumber(weekKey),
      weekEndsAt: weekEndsAt(weekKey),
      rows: top.map((row, i) => ({
        rank: i + 1,
        xp: row.weeklyXp,
        identity: identities.get(row.id) ?? null,
      })),
      me: mine,
    };
  });

  // ── Admin: create an event ────────────────────────────────────────────
  app.post("/admin/arena/events", async (req) => {
    await requireCapability(req, "manage_rewards");
    const body = z
      .object({
        kind: z.enum(["quiz", "poll"]),
        title: z.string().trim().min(3).max(120),
        description: z.string().trim().max(500).default(""),
        startsAt: z.coerce.date(),
        endsAt: z.coerce.date(),
        canonicalId: z.string().optional(),
        config: z.unknown(),
      })
      .parse(req.body);
    if (body.endsAt <= body.startsAt) throw httpError(400, "endsAt must be after startsAt");
    const config =
      body.kind === "quiz" ? quizConfigSchema.parse(body.config) : pollConfigSchema.parse(body.config);
    if (body.kind === "quiz") {
      for (const question of (config as QuizConfig).questions) {
        if (question.correct >= question.options.length) {
          throw httpError(400, "A question's correct index is out of range");
        }
      }
    }
    const event = await prisma.arenaEvent.create({
      data: {
        kind: body.kind,
        title: body.title,
        description: body.description,
        startsAt: body.startsAt,
        endsAt: body.endsAt,
        canonicalId: body.canonicalId ?? null,
        config: config as object,
      },
    });
    return { id: event.id };
  });
}
