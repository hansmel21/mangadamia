# Guilds — the community retention layer

The big one, for later. Small groups with their own hall, name, tag, and
emblem; a guild level driven by member activity; guild leaderboards; and
cooperative guild events. This is the Solo Leveling "hunter guild" concept
turned into retention mechanics — the thing that turns a userbase into a
community. Nothing here is built yet; this is the contract to build against,
in the spirit of `ARENA_PLAN.md`.

## Why it matters (the retention thesis)

A reader alone churns when they finish a series. A reader in a guild comes back
because other people are counting on them. Guilds add the four retention hooks
we don't have yet:

- **Identity / belonging** — an emblem and `[TAG]` next to your name everywhere.
- **Social accountability** — a member contribution board ("carry your weight").
- **Shared goals** — weekly guild events with pooled progress.
- **Investment / progression** — a guild level, unlockable perks, and a
  customizable Hall you don't want to abandon.

## Core concepts

- **One active guild per reader.** Guild identity only means something if it's
  singular (like a clan tag). Leaving is allowed, with a short **re-join
  cooldown** (e.g. 48h) so people can't guild-hop to farm event rewards.
- **Roles:** `guildmaster` (1, owns the guild), `officer` (invite / approve /
  moderate the wall / kick members), `member`.
- **Join policy:** `open` (join instantly), `request` (officer approves),
  `invite` (invite-only). Set by officers.
- **Member cap scales with guild level** — starts small (keeps them intimate),
  grows as the guild invests (e.g. 10 → 20 → 30 → 50).
- **Creating a guild is gated** behind an account level (e.g. LV 5) or a small
  XP cost, so we don't get a graveyard of one-person dead guilds.

## Guild level & "power" (honoring "guild level = aggregated member XP")

Two ways to read "aggregated member XP", with different consequences:

| Model | How | Problem |
|---|---|---|
| **A. Snapshot sum** | `guildXp = Σ current members' personal XP` | Volatile — jumps when a high-level reader joins, craters when they leave. Recruit-a-whale exploit. |
| **B. Contribution flow** | Guild accrues XP from member activity *while they're members*; it never drops | Durable, rewards sustained activity, retention-friendly |

**Recommended: a hybrid that shows both.**

- **Guild Level** is driven by **contribution flow (B)** — every time a member
  earns personal XP (reading, posting, quests), the same amount is also credited
  to the guild as **Guild XP** (a running, non-decreasing total). Level via a
  steeper curve than the personal one in `badges.ts`
  (`levelForXp`/`xpForLevel`), tuned so a small active guild reaches ~LV 10 in a
  season, not a weekend.
- **Guild Power** is the **snapshot sum (A)** — `Σ member levels`, shown as a
  flashy rating on the Hall ("⚔ Power 428"). This directly gives the
  "aggregated member XP" feel you described, as a *displayed stat*, without
  letting it wreck progression.

This way the number you had in mind is front-and-center, but the guild can't be
bought or gutted overnight.

Per-member we also track **weekly contribution** (resets Monday 00:00 UTC via the
same `periodFor()` boundaries as quests) and **all-time contribution** — for the
member board and event eligibility.

## The Headquarters (Guild Hall)

The deep page. A guild's home, System-window styled. Tabbed:

```
┌──────────────────────────────────────────────┐
│  ◇ [OBSD] The Obsidian Reapers        ⚙ (GM)  │  ← emblem, name, tag, edit
│  LV 12   ▓▓▓▓▓▓▓░░░  8,420 / 10,000 GXP        │
│  ⚔ Power 428 · 17 members · #3 this week       │
├──────────────────────────────────────────────┤
│  [ HALL ]  WALL   ROSTER   EVENTS              │  ← segmented tabs
├──────────────────────────────────────────────┤
│  HALL:                                         │
│   • Motto / banner                             │
│   • Perks unlocked at this level (+ next)      │
│   • Hall decorations (cosmetic, level-gated)   │
│   • This week's contribution leaders (top 3)   │
│   • Active guild event card                    │
└──────────────────────────────────────────────┘
```

- **Hall** — emblem, banner, motto, the level/XP/power block, the perk track
  (what's unlocked, what's next), and cosmetic **Hall decorations** unlocked by
  level (pure flex — a progression sink).
- **Wall** — members-only posts (below).
- **Roster** — members with role, level, weekly + all-time contribution;
  officer actions (promote/demote/kick, approve requests).
- **Events** — the active cooperative event + history (below).

**Customization (officers):** name, `[TAG]` (2–5 chars), emblem shape + primary/
secondary colors, motto, banner color, join policy — and, level-gated, Hall
decorations. **No user-uploaded images**: emblems are app-owned `assetKey` +
colors rendered as SVG, exactly like avatars/frames today
(`CosmeticDefinition` → `ReaderAvatar`/`BadgeMedallion`). Keeps us Play-safe and
moderation-light. Names/tags/mottos run through `validateUserContent()`.

## Guild wall

Reuse the `Post` infrastructure — add a nullable `guildId` to `Post`. A guild
wall is just posts with that `guildId`, members-only, with the same nested
threading, likes, reports, and moderation we just built. `GET /posts?guildId=…`
mirrors the existing `canonicalId` wall filter. Posting to the guild wall also
earns contribution XP, so the wall itself feeds the guild's level.

## Leaderboards

- **Guild leaderboard** (global): guilds ranked by **weekly Guild XP** and
  **all-time level / power**. Computed on read for the live week; frozen into a
  `LeaderboardSnapshot` (the same table `ARENA_PLAN.md` proposes, `board =
  "guild_weekly_xp"`) when the week closes, so history is stable and cheap.
- **Member board** (within a guild): weekly + all-time contribution, so the
  guild can see who's carrying and gently pressure the lurkers.

## Guild events (cooperative goals)

Time-boxed shared objectives — the heartbeat that brings everyone back weekly.

- **Co-op raids:** the guild collectively hits a target from pooled member
  activity — "read 500 chapters," "leave 200 comments," "complete 50 quests"
  this week. Progress = sum of member `recordActivity` events tagged to the
  event's `eventType`. This reuses the quest engine's event model directly.
- **Completion rewards** the guild (Guild XP, a guild cosmetic / decoration) and
  every participating member (individual XP / a title), granted through the
  existing `rewardGrant` + `XpTransaction` path so moderation reversals already
  cover it.
- **Guild-vs-guild** (later, folds into the Arena): which guild reads/posts most
  this week → leaderboard placement → seasonal guild cosmetics.

Scheduling reuses the Arena's approach: a cron/Railway job flips event
`status` on `startsAt`/`endsAt`, scores, grants, and snapshots — and notifies
members via `createNotification` (`kind: "guild_event_*"`), which the header
bell surfaces for free.

## Data model (Prisma sketch)

```prisma
model Guild {
  id            String   @id @default(cuid())
  name          String   @unique
  tag           String   @unique          // 2–5 chars, shown as [TAG]
  emblemKey     String                      // app-owned SVG asset
  primaryColor  String
  secondaryColor String?
  motto         String?
  description   String?
  joinPolicy    String   @default("request") // open | request | invite
  xp            Int      @default(0)          // contribution flow (never drops)
  guildmasterId String
  createdAt     DateTime @default(now())
  members       GuildMember[]
  events        GuildEvent[]
  @@index([xp])
}

model GuildMember {
  guildId          String
  userId           String   @unique          // one guild per reader
  role             String   @default("member") // guildmaster | officer | member
  contributionXp   Int      @default(0)        // all-time, this guild
  weeklyXp         Int      @default(0)
  weekKey          String                       // matches quests' periodFor()
  joinedAt         DateTime @default(now())
  guild            Guild    @relation(fields: [guildId], references: [id], onDelete: Cascade)
  user             User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@id([guildId, userId])
  @@index([guildId, weeklyXp])
}

model GuildJoinRequest { guildId String; userId String; status String @default("pending"); createdAt DateTime @default(now()); @@id([guildId, userId]) }
model GuildInvite      { guildId String; userId String; invitedById String; status String @default("pending"); createdAt DateTime @default(now()); @@id([guildId, userId]) }

model GuildXpTransaction {  // audit trail, mirrors XpTransaction
  id String @id @default(cuid())
  guildId String; userId String; delta Int; sourceType String; createdAt DateTime @default(now())
  @@index([guildId, createdAt])
}

model GuildEvent {
  id        String   @id @default(cuid())
  guildId   String
  eventType String                       // "chapter_completed" | "comment_created" | …
  title     String
  target    Int
  progress  Int      @default(0)
  status    String   @default("active")  // active | complete | ended
  startsAt  DateTime
  endsAt    DateTime
  rewards   Json
  guild     Guild    @relation(fields: [guildId], references: [id], onDelete: Cascade)
}

model GuildEventContribution { eventId String; userId String; value Int @default(0); @@id([eventId, userId]) }
```

Plus: `Post.guildId String?` (guild wall), and a `GuildEmblem` catalog table
analogous to `CosmeticDefinition` for the app-owned emblem/decoration assets.

## Identity integration

Add a `guild` field to `PublicIdentity` (in `identity.ts`) so the tag + emblem
render next to a username everywhere `UserIdentity` is used — feed, threads,
comments, profiles:

```ts
guild: { id: string; tag: string; emblemKey: string; primaryColor: string; secondaryColor: string | null; level: number } | null
```

`identitiesForUsers()` batch-loads it with one `GuildMember` join keyed by
userId, so no per-row N+1. A small `<GuildCrest>` SVG component renders it, same
pattern as `ReaderAvatar`.

## The XP hook (how the guild actually levels)

Today personal XP is granted in a handful of places (`/activity/read`, comment/
post creation, likes, `recordActivity` quest rewards). Centralize that into one
helper — `awardXp(userId, amount, source)` — that:

1. increments `user.xp` + writes the `XpTransaction` (as today), then
2. if the user is in a guild, increments `guild.xp`, the member's
   `contributionXp`/`weeklyXp`, writes a `GuildXpTransaction`, and bumps any
   active `GuildEvent` whose `eventType` matches.

One choke point → guild leveling, contribution tracking, and event progress all
stay in sync with personal XP for free.

## API sketch

```
POST   /guilds                      create (gated by level/cost)
GET    /guilds?sort=weekly|level    browse + leaderboard
GET    /guilds/:id                  hall: guild, my membership, perks, active event
PATCH  /guilds/:id                  officers: name/tag/emblem/motto/policy/decorations
POST   /guilds/:id/join             open→join, request→pending
POST   /guilds/:id/requests/:userId accept | reject
POST   /guilds/:id/invites          invite a reader
DELETE /guilds/:id/members/:userId  leave (self) / kick (officer)
POST   /guilds/:id/members/:userId/role  promote | demote | transfer GM
GET    /guilds/:id/members          roster + contribution board
GET    /posts?guildId=:id           guild wall (reuses the post routes)
GET    /guilds/:id/events           active + past events
```

## Client screens

- **Guilds hub** — your guild card (or "Found a guild" CTA), browse/search, and
  the guild leaderboard. New entry in the **hamburger menu** next to Quests /
  Arena.
- **Guild Hall** — the tabbed HQ above (Hall / Wall / Roster / Events).
- **Create / customize guild** — name, tag, emblem picker (shape + colors),
  motto, policy.
- **`<GuildCrest>`** — the tag+emblem chip shown by `UserIdentity` app-wide.

## Moderation & Play compliance

- Guild names/tags/mottos → `validateUserContent()`; guilds are reportable;
  staff (`view_reports`) can rename or **dissolve** a guild from the existing
  moderation queue.
- Guild wall posts use the moderation pipeline we already have (nested threads,
  removal, XP reversal via `reverseActivityForContent`).
- Emblems/decorations are app-owned assets (no uploads) → no image moderation,
  Play-safe, consistent with avatars/frames.
- Members-only content still respects blocks and 13+ rules.

## Anti-abuse & edge cases

- One guild per user + re-join cooldown (kills event-farming guild-hopping).
- Contribution-flow leveling means leaving/disbanding doesn't tank the guild.
- Guildmaster leaves → transfer to longest-tenured officer, else oldest member;
  last member out dissolves the guild.
- Name/tag uniqueness + profanity filter; creation gate reduces dead guilds.
- Optional **inactivity decay**: a guild with zero activity for N weeks is
  archived (frees its name/tag) — decide later.

## Phased rollout

1. **Phase 1 — the guild exists. ✅ BUILT (2026-07-11).** Create (full
   customization: name, `[TAG]`, curated emblem + colors, motto), browse +
   level leaderboard, the Guild Hall (HALL + ROSTER tabs), join/leave with
   guildmaster succession, request approval, kick, and role changes
   (promote/demote/transfer). Guild XP contribution flow is hooked into
   reading/commenting/posting/likes (`creditGuild`), the `<GuildCrest>` shows
   next to names everywhere, and one-guild-per-user is enforced. Decisions
   locked: **hybrid XP** (level = contribution flow, power = Σ member levels),
   **one guild per reader**, **open creation during testing**, **curated
   emblems**. Backend: `api/src/guilds.ts`, `api/src/routes/guilds.ts`, identity
   crest in `identity.ts`, migration `20260711184927_guilds`. Client: `guilds`,
   `guild/[id]`, `guild/create` screens + `GuildCrest`.
   **Not yet:** the members-only guild wall (`Post.guildId`) and editing a guild
   after creation (the `PATCH /guilds/:id` endpoint exists; no UI yet) — next slice.
2. **Phase 2 — progression & standing.** Guild + member leaderboards, emblem/
   motto/decoration customization, level-gated perks (a "Guildmaster" title, a
   guild flair members can equip, larger member cap, Hall decorations).
3. **Phase 3 — the heartbeat.** Cooperative weekly guild events with pooled
   progress + rewards, and the notifications around them.
4. **Phase 4 — rivalry.** Guild-vs-guild competition (folds into the Arena),
   seasonal guild cosmetics, richer Hall decorations.

## Open decisions (your call)

1. **Guild XP model** — go with the recommended hybrid (Level = contribution
   flow, Power = member-level sum), or the literal snapshot sum you described?
2. **One guild per reader**, or allow membership in a few? (Recommend one.)
3. **Creation gate** — account level, an XP cost, both, or open to everyone?
4. **Emblems** — a curated app-owned set (recommended), or unlockable via guild
   level like cosmetics?
