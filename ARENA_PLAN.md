# The Arena — weekly games, leaderboards & community pools

A planning doc for the next social layer on top of Dungeons. Nothing here is
wired to real data yet; the app ships a laid-out **Arena hub** placeholder
(`app/app/arena.tsx`) so the navigation and layout exist while the backend is
built out. This document is the contract the implementation should follow.

## Vision

Dungeons is the always-on feed. The **Arena** is the *scheduled* layer — a
weekly rhythm of lightweight competitions and rankings that give readers a
reason to come back on a cadence, reusing the XP / badge / title / cosmetic
reward machinery we already have (`recordActivity`, `rewardGrant`, quests).

## Hub layout

A single **Arena** screen with a segmented control at the top, three sections:

```
┌──────────────────────────────────────────────┐
│  ARENA                                     🔔  │
│  [ GAMES ]   LEADERBOARDS    POOLS             │  ← segmented control
├──────────────────────────────────────────────┤
│  ▸ This week's featured game (hero card)       │
│  ▸ Live / upcoming game cards (status chips)   │
│  ▸ Past results (collapsed)                     │
└──────────────────────────────────────────────┘
```

- **Games** — the featured weekly game as a hero card, then a list of
  live/upcoming/ended game cards. Each opens a game screen.
- **Leaderboards** — segmented by board (Weekly XP · Weekly Quests ·
  Series-specific). Ranked rows reuse `UserIdentity`. Your own row is pinned.
- **Pools** — community prediction/voting pools ("Who wins the duel next
  chapter?"). One-tap vote, results after the window closes.

Entry points: a link in the **Account** tab (shipped) and, once live, a header
button on the Dungeons feed.

## Game types (phase them in)

1. **Quiz** — N timed multiple-choice questions about a featured series.
   Score = correct answers; ties broken by time. Simplest to ship first.
2. **Community poll / prediction pool** — vote before a deadline; closest to the
   outcome (or majority) earns a small reward. No content moderation surface.
3. **Draw competition** — image submissions + a voting window. Highest
   moderation cost (uploads + judging) — ship last, behind image moderation.
4. **PvP manga battles** — simple **turn-based** duels using **random manga
   characters** (roster drawn from the catalog), played **online against another
   player** (real-time via websockets, or async "play-by-turn" with push
   notifications). Needs the most new infra: matchmaking/lobby, a
   **server-authoritative** turn/game-state engine (never trust the client),
   reconnection handling, and anti-cheat. Ranked ladder + seasonal rewards fold
   into the Arena leaderboard. Biggest build — its own track, after the simpler
   games prove the Arena loop.

## Data model sketch (Prisma)

```prisma
model ArenaEvent {
  id          String   @id @default(cuid())
  kind        String   // "quiz" | "poll" | "draw"
  title       String
  description String
  status      String   @default("upcoming") // upcoming | live | judging | ended
  startsAt    DateTime
  endsAt      DateTime
  canonicalId String?  // optional series focus
  config      Json     // quiz questions, poll options, etc.
  createdAt   DateTime @default(now())
  entries     ArenaEntry[]
}

model ArenaEntry {
  id        String   @id @default(cuid())
  eventId   String
  userId    String
  payload   Json     // answers / vote / submission ref
  score     Int?     // filled at scoring time
  createdAt DateTime @default(now())
  event     ArenaEvent @relation(fields: [eventId], references: [id], onDelete: Cascade)

  @@unique([eventId, userId]) // one entry per reader per event
}

model LeaderboardSnapshot {
  id        String   @id @default(cuid())
  board     String   // "weekly_xp" | "weekly_quests" | "series:<canonicalId>"
  periodKey String   // ISO week, matches quests' periodFor()
  rows      Json     // [{ userId, value, rank }] top N, frozen at close
  createdAt DateTime @default(now())

  @@unique([board, periodKey])
}
```

Rewards are **not** stored on the event — grant them through the existing
`rewardGrant` + `recordActivity` path (so reversals, XP transactions, and quest
progress all keep working) when an event is scored.

## API sketch

```
GET  /arena/events?status=live|upcoming|ended   → hub game list
GET  /arena/events/:id                          → one event + my entry
POST /arena/events/:id/entry                    → submit answers / vote (idempotent per user)
GET  /arena/leaderboards/:board                 → live board (computed) or snapshot if the period closed
```

Leaderboards for the *current* period are computed on read from
`XpTransaction` / `UserQuestProgress`; once a period closes, freeze the top N
into `LeaderboardSnapshot` so history is stable and cheap.

## Scheduling & scoring

- Reuse the UTC week boundaries from `periodFor()` in `api/src/quests.ts` so the
  Arena's "week" lines up with weekly quests.
- A scheduled job (cron / Railway scheduler) flips `status` on `startsAt` /
  `endsAt`, scores entries, grants rewards, and writes the leaderboard snapshot.
- Notify participants via the existing `createNotification` (`kind: "arena_*"`)
  and the new notification bell surfaces it for free.

## Reward integration

- Quiz/poll/draw completion → `recordActivity(userId, { type: "arena_entry", ... })`
  so it can drive quests ("Enter 3 Arena events this week").
- Winners → `rewardGrant` for a title/cosmetic + an XP transaction, exactly like
  quest rewards, so moderation reversals already cover it.

## Phased rollout

1. **Phase 0 (shipped):** Arena hub placeholder + Account entry point + this plan.
2. **Phase 1:** `ArenaEvent`/`ArenaEntry` models, quiz game end-to-end, weekly XP
   leaderboard (computed), scheduled open/close/score job.
3. **Phase 2:** community pools, weekly-quests leaderboard, snapshots + history.
4. **Phase 3:** draw competitions (needs image upload + moderation), series
   leaderboards, seasonal Arena cosmetics.
5. **Phase 4 (its own track):** **PvP manga battles** — matchmaking, a
   server-authoritative turn-based engine, real-time/async sync, character
   roster, ranked ladder. The largest build; start once the simpler Arena games
   are live.
