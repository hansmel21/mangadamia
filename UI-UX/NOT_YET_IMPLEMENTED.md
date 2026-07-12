# System Protocol — Features not yet in the app

Everything in the new UI-UX design (`System Protocol App.dc.html` +
`IMPLEMENTATION.md`) that the current app does **not** have yet, so we can build
it in later passes. Grouped by surface. Tags:

- ⚠ **Backend** — needs a new/extended API endpoint or data model (no client-only path).
- 🎨 **Client** — can be built with existing data/endpoints; UI/wiring work only.
- 🔀 **Both** — client shell exists but needs a small backend addition to be real.

The design's own build order (foundation → nav → feed → status/quests/library/home
→ guild → arena) is the recommended sequence; this file is the backlog, not the plan.

---

## Foundation (DONE this pass)
- ✅ Design tokens aligned to the spec (`bg #0a0b10`, `surface #10121a`, `hairline #1c2029`, `data #54D6FF`, tight 3–4px radii) — `app/src/theme.ts`.
- ✅ Primitives: `ScreenTitle`, `SystemKey` (primary/outline/chip), `HunterAvatar`, `GuildChip` — `SystemUI.tsx`, `HunterAvatar.tsx`, `GuildCrest.tsx`.
- ✅ Motion helpers: `useCrtOpen`, `usePulseGlow`, `useProgressGrow` — `app/src/anim.ts`.

## Navigation (§1)
- 🎨 **5-key command bar** replacing 4 tabs: HOME · ARCHIVE(library) · **DUNGEON** center diamond(feed) · GUILD · STATUS(account). Center key = 58px square rotated 45°, accent border + glow when active, raised −18px.
- 🎨 **GUILD promoted to a tab** (currently reached from HeaderMenu). Needs a `(tabs)/guild.tsx` entry that resolves the viewer's guild (or the guildless recruit state) — wire to `api.myGuild()` → `guild/[id]` or `guilds.tsx`.
- 🎨 **Delete `HeaderMenu.tsx`**; move its entries: Notifications → bell key on Home/Status headers; Quests → "ALL QUESTS ▸" on Status + daily strip on Home.
- 🎨 Unread badge moves from Account tab → STATUS key (same `notificationCount` wiring).
- 🎨 Arena lives **inside the Dungeon key** as a FEED/ARENA sub-view (not its own tab).

## Home + Search (§4)
- 🎨 Header **hunter chip** (avatar + LV + micro XP bar) from `api.me()` → taps to Status. Replaces hamburger.
- 🎨 Bell key with `notificationCount` on the Home header.
- 🎨 **Search focus state**: full-screen dim + glow, panel with RECENT SCANS + TOP MATCH.
  - RECENT SCANS: `listRecentSearches()` / `clearRecentSearches()` already exist in `library.ts` (SQLite) — UI wiring only. 🎨
  - TOP MATCH: instant lookup against library + `searchAll` (debounced). 🎨
  - **TRENDING IN THE DUNGEONS**: ⚠ needs `GET /posts/trending?window=1h` (rank tags by recent post/comment count). No trending endpoint exists.
- 🎨 Search results row restyle: rank sigil (from server rank scale — already on `SeriesReviewSummary.rank`), ★ rating + reads, right-aligned `IN LIBRARY`/`+ LIBRARY` action wired to library add/remove.
  - ⚠ **posts/hr per series** ("89 posts/hr") shown in hero/results — no per-series activity-rate metric today.
- 🎨 **SAFE badge** on the search bar (static — MangaDex safe rating).
- 🎨 Hero as a framed SystemWindow with CONTINUE CH.n (stored progress) + WALL buttons and TOP-n notch.
- 🎨 **Daily-directive strip** under the hero: top uncompleted daily from `api.quests()` with progress + XP + deep link.
- 🎨 Rails restyle only (square corners, CH.n corner badge on latest covers) — data unchanged.

## Dungeon feed (§2) — layout DONE (Phase 2); backend items remain
- ✅ In-screen DUNGEON ScreenTitle + ARENA key; one-row filter deck (ALL/THEORIES/REVIEWS/FOLLOWING chips + HOT▾ sort cycle); NEW RECORD gradient key.
- ✅ PostCard rework: mini SystemWindow + kind notch, HunterAvatar + GuildChip, `OPEN THREAD ▸` in `colors.data`.
- ⚠ **Online counter** ("312 ONLINE") — needs `GET /presence/count` (or approximate active-sessions-last-15-min). Poll 60s.
- ⚠ **Raid-thread ticker** (top post by comments/hr) — needs `GET /posts/trending?window=1h`.
- 🔀 **GUILD feed chip** (`feedMode: "guild"`) — `api.feed()` has no `mode='guild'`; server must filter posts by `author.guildId === viewer.guildId`. (FOLLOWING chip fills the slot meanwhile.)
- ⚠ **Guild-war rally card** pinned in-feed when viewer's guild has an active war — needs `GET /guilds/:id/war` (see Guild War below).

## Composer (§3) — DONE (Phase 2)
- ✅ Bottom sheet (`SystemSheet.tsx`, CRT choreography), 5 kind tiles, auto-tag
  from last read (`getLastReadTag()` in `library.ts`) with ✕ remove, spoiler
  shield toggle, char counter, gradient PUBLISH RECORD key, XP footer hint.

## Thread view (§5) — DONE (Phase 2)
- ✅ Kind-colored ScreenTitle header, root post as full 4-bracket System window,
  TOP ◆ / NEW reply sort (client-side — server `sort` param unnecessary since
  the full tree ships to the client), one indent level + `▾ N MORE REPLIES`
  collapse, one-line dashed shield chip for spoiler replies, sticky reply bar
  (viewer avatar + input + gradient send).
- 🎨 Series row `READ ▸` deep link into the reader (needs stored-progress route
  resolution — pair with the Library phase).

## Guild (§6) — the big backend lift
- ⚠ **Presence per guild** ("14 ONLINE") — no per-guild online count.
- ⚠ **Guild War** model `GuildWar {id, weekNo, guildA, guildB, scoreA, scoreB, endsAt}`; war score derived from members' `weeklyXp` during the window (weeklyXp already tracked). Endpoints: `GET /guilds/:id/war`, `GET /guilds/:id/wars` (history).
- ⚠ **Guild Raid** model `GuildRaid {questId, target, progress, rewardId, resetsAt}` — shared weekly quest; progress = sum of member chapter completions (hook the same event as personal quests in `api/src/quests.ts`).
- ⚠ **Guild Board** — guild-scoped posts. Reuse Post table with `guildId` + `pinned` flag; GM/officer can pin (📌). New: `api.createGuildPost`, `GET /guilds/:id/board`.
- 🎨 **Guild Hall** as a scrolling home base (banner + war window + quick keys BOARD/RAIDS/ROSTER/MANAGE + raid card + board preview) — replaces current HALL/ROSTER tabs.
- 🔀 **Roster enrichment**: join-requests already exist (`pendingRequests` + `answerGuildRequest`), but design wants applicant LV/rank/chapters in the request payload (⚠ include stats), member `idle Nd` from `lastActiveAt` (⚠ expose), online dot (⚠ presence). Weekly-GXP ordering data exists.
- 🔀 **Guild XP multiplier** ("+10% XP" recruit copy) — implies a server-side XP bonus for guild members. ⚠ if it should be real.
- 🎨 Directory war-status chips (`AT WAR`/`RECRUITING` from joinPolicy + war state), ⚔ power, #1 gold card — mostly restyle; `AT WAR` needs war state.

## Arena (§7) — new surface (per ARENA_PLAN.md)
- ⚠ **Quiz**: `ArenaEvent {type:quiz, seriesId, questions, opensAt, closesAt}`, `api.arenaEnter`, `api.arenaSubmit(score, ms)` → rewards pipeline. Quiz runner screen. Full backend.
- ⚠ **Weekly EXP board**: podium + own-rank row — needs `GET /leaderboard/weekly?around=me` (weekly XP tracked; endpoint missing).
- ⚠ **Prediction pool**: a Poll with a deadline + XP payout on resolution — reuse `PollView` vote wiring; needs a resolution job.
- ⚠ **Draw competition**: image entries + one-vote-per-user. **Blocked by the no-uploads policy** — needs an upload exception or off-app hosting. Voting can reuse poll plumbing.
- 🎨 Week number + countdown in header (server week number).

## Status (§8)
- 🎨 HunterAvatar 88 wrapped in an **XP ring** (SVG circle, dashoffset = xp progress).
- 🎨 HUNTER RECORD 6-stat grid — `me.stats` covers chapters/comments/reactions/badges, but:
  - ⚠ **dayStreak** — needs a server-side daily streak counter.
  - ⚠ **weeklyRank** — from the weekly leaderboard endpoint (missing).
- 🎨 EQUIPPED slots (TITLE/FRAME/AVATAR) → existing equip flows.
- 🎨 Badges rail + `ALL ▸` grid; TODAY'S QUESTS strip from `api.quests()` (daily filter).
- 🎨 Settings key opens the old menu rows (edit profile, legal, sign-out) as a pushed screen — keeps Status a pure character sheet.

## Quest Log (§9)
- 🎨 Cadence chips (DAILY/WEEKLY/SEASON/MILESTONE) — client filter on existing `cadence`.
- 🎨 Live reset countdown from `resetsAt`.
- ⚠ **Chain bonus** ("clear all 3 dailies → +100 XP") — new server rule / synthetic quest.
- ⚠ **Per-quest deep link** — add a `deepLink` field (route + params) to the quest payload for `GO TO DUNGEON ▸`.
- 🎨 Rarity-tinted gradient for epic/seasonal quests (reuse `rarityColors`).

## Library / Archive (§10)
- 🎨 ARCHIVE ScreenTitle + SYNCED state (`sync.ts` status exists).
- 🎨 **RESUME EXPEDITION** window (most-recent history row + play key).
- 🎨 Shelf chips READING/CAUGHT UP/DONE — client filter on unread counts.
- 🎨 Grid cards: `+n` unread badge (chapters ahead of progress), bottom progress hairline (purple reading / green caught-up), dashed ADD SERIES tile → Home search.
- 🎨 **HISTORY / EXPEDITION LOG** screen (rows with %, RESUME ▸) + CLEAR — uses local history; confirm `library.ts` exposes/clears history.

## Reader (design parity)
- 🎨 System-styled reader chrome (top bar title/chapter, side tap zones, bottom progress + "SAVE & EXIT ▸", XP-on-clear hint) — mostly restyle of the existing reader.

## Motion (all screens)
- 🎨 Every window/sheet/tray opens with `useCrtOpen` (extracted this pass).
- 🎨 `usePulseGlow` on online dots + LIVE chips (extracted this pass).
- 🎨 `useProgressGrow` on progress bars on mount (extracted this pass).
- 🎨 Center Dungeon key gets a 150ms glow-in on activation.

---

## Backend endpoints summary (⚠ new work)
1. `GET /presence/count` — global online count.
2. `GET /guilds/:id/presence` (or include in guild detail) — per-guild online.
3. `GET /posts/trending?window=1h` — trending threads + trending tags (feed ticker, search).
4. `api.feed(..., mode='guild')` — guild-scoped feed filter.
5. Thread replies `sort` param (TOP/NEW).
6. Guild War: `GET /guilds/:id/war`, `GET /guilds/:id/wars`, `GuildWar` model.
7. Guild Raid: `GuildRaid` model + progress hook in `quests.ts`.
8. Guild Board: guild-scoped posts (`guildId` + `pinned`) + create/list.
9. Weekly leaderboard: `GET /leaderboard/weekly?around=me`.
10. Arena: `ArenaEvent` + quiz enter/submit + prediction-pool resolution job.
11. Profile stats: `dayStreak`, `weeklyRank` on `me`.
12. Quests: `deepLink` field + daily chain-bonus rule.
13. Series activity rate ("posts/hr") — per-series recent post/comment rate.
14. Guild member XP multiplier (if "+10% XP" should be real).
15. Recent-search persistence (local, not server) for RECENT SCANS.
16. Draw competition uploads — **blocked** by the no-uploads policy (needs a decision).
