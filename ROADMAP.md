# Mangadamia — Roadmap & Progress

Living status doc. Updated after each milestone so work can resume cleanly.
Design docs: `GUILDS_PLAN.md`, `ARENA_PLAN.md`.

_Last updated: 2026-07-11._

## ✅ Shipped

### Social / Dungeons UX
- Renamed **Feed → Dungeons** (swords icon).
- **Reddit-style post threads**: nested replies via `Post.rootId`
  (migration `20260711030000_post_thread_nesting`), tap a feed card to open the
  full conversation, per-comment reply, thread comment counts.
- **PostCard** visual rework, bigger like/reply tap targets, translucent reward
  pops (badge/quest/EXP), EXP-gain toast on posting.
- **Hamburger menu** (top-right, all tabs) → Notifications, Quests, Guilds,
  Arena; replaced the standalone notification bell.

### Reader
- **Continuous reading**: reaching a chapter's end loads the next chapter
  inline (vertical mode).
- **Quest-completion fix**: chapters now reliably report completion (on
  crossing into the next chapter / reaching the end), fixing "finish a chapter"
  and daily/weekly reading quests.

### Account & Library
- **Account tab overhaul**: Collection tiles, Titles moved into a scrollable
  modal, cleaner Account / Staff / Legal sections.
- **Library + History merged** into one tab with a top switcher.

### Quests
- Quest cards are clickable → detail modal (rewards explained); Quest Window
  always refetches on open so completions show immediately.

### Guilds — Phase 1 (see `GUILDS_PLAN.md`)
- Migration `20260711184927_guilds` (applied).
- Create/browse/level-leaderboard, **Guild Hall** (HALL + ROSTER),
  join/leave with guildmaster succession, request approval, kick, role changes.
- **Hybrid XP**: level = contribution flow (`creditGuild` hooked into
  read/comment/post/like); **power** = Σ member levels.
- **One guild per reader**; `GuildCrest` (`[TAG]` + emblem) next to names.
- Backend: `api/src/guilds.ts`, `api/src/routes/guilds.ts`, guild crest in
  `identity.ts`. Client: `guilds`, `guild/[id]`, `guild/create`.

### Fixes
- **SystemModal keyboard avoidance** (composer/inputs no longer hidden behind
  the keyboard).

## 🔨 In progress

### Social rework → "The System" in-world social (Core scope)
Plan: `.claude/plans/i-think-we-should-quizzical-wirth.md`. Posts become typed
**System Records** (record / theory / review / spoiler_intel), reactions
become **⚡ Endorse (EXP) + free emotes**, and **Reviews** roll up into a
community **series rank** (E→S) shown on the series screen.

- [x] Schema: `Post.kind`, `Post.rating`, `PostLike.type` + migration
      `20260711212222_system_social` (applied)
- [x] Backend: post kind/rating, reaction endpoint (`/posts/:id/react`),
      reaction aggregation in serialize + feed/thread, reviews summary
      (`GET /canonical/:id/reviews`), `api/src/ranks.ts`. Verified live.
- [x] Client: `ReactionBar`, `RankBadge`, `ReviewRating`, System Record card
      (`PostCard`), composer type picker + review rating, feed type filter
      (All/Theories/Reviews), series community-rank badge + "Rate series".
      `src/ranks.ts` (hunter ranks + reaction/kind presentation).
- [x] Final app typecheck — clean; client committed.
- [ ] Device test end-to-end

### Social v2 — Phase 1: Social Feel v2 (in progress)
Plan: `.claude/plans/i-think-we-should-quizzical-wirth.md`. Prominent type tabs,
plain reactions (drop ⚡ Endorse → ❤️/emotes), richer per-type System Record
cards + `SeriesEmbed`. Later phases: post functions (polls, sorting,
quote-repost, mentions/#tags), images (Cloudinary, local-first), full guild
depth (invites, wall, events, customization, contribution), Arena PvP games.

- [ ] Prominent type tab bar (feed)
- [ ] Reactions rework (drop Endorse; XP on any reaction received)
- [ ] Richer System Record cards + `SeriesEmbed`

## 🗺️ Deferred / next

- **Guilds** next slice: members-only **guild wall** (`Post.guildId`),
  edit-guild-after-creation UI, then guild **events** + leaderboard snapshots.
- **Social** fast-follow: auto-generated **Achievement** System Records
  (finish series / level up / badge) with an opt-in toggle; reactions on chapter
  comments.
- **The Arena** (weekly games, leaderboards, pools) — deferred to far future
  (`ARENA_PLAN.md`).
