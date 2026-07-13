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

## Navigation (§1) — DONE (Phases 1–3)
- ✅ 5-key command bar (HOME · ARCHIVE · DUNGEON diamond · GUILD · STATUS), unread badge on STATUS.
- ✅ GUILD tab (`(tabs)/guild.tsx`): recruit window / Hall banner + quick keys.
- ✅ `HeaderMenu.tsx` deleted — Notifications → bell keys (Home/Status), Quests → ALL QUESTS ▸ (Status) + daily directive (Home), Guilds → tab, Arena → key on Dungeon header.
- ✅ Every tab renders its own in-screen ScreenTitle header (`headerShown:false` globally).

## Home + Search (§4) — layout DONE (Phase 3); data-dependent bits remain
- ✅ Header: bracketed wordmark + bell key (unread count) + hunter chip (LV + micro XP bar → Status).
- ✅ Search key: corner ticks + SAFE badge; RECENT SCANS panel + "safe catalog" note; ALL/ONGOING/DONE SystemKey chips + result count; `± LIBRARY` action on result rows (local library + cloud sync).
- ✅ Framed hero window (4 brackets, TOP-n notch, CONTINUE CH.n from stored progress / OPEN + WALL keys).
- ✅ Daily-directive strip (top uncompleted daily quest, progress + XP → Quest Log).
- ✅ Rails: square corners, CH.n badge on LATEST covers.
- ✅ **TOP MATCH instant search** — shipped 2026-07-13 (debounced as-you-type).
- ✅ **TRENDING IN THE DUNGEONS** — shipped 2026-07-13 (`GET /posts/trending`, Home rail).
- ⚠ **Rank sigil + ★ rating + reads + posts/hr on result rows** — search payload has no rank/rating/activity metrics.

## Dungeon feed (§2) — layout DONE (Phase 2); backend items remain
- ✅ In-screen DUNGEON ScreenTitle + ARENA key; one-row filter deck (ALL/THEORIES/REVIEWS/FOLLOWING chips + HOT▾ sort cycle); NEW RECORD gradient key.
- ✅ PostCard rework: mini SystemWindow + kind notch, HunterAvatar + GuildChip, `OPEN THREAD ▸` in `colors.data`.
- ✂ **Online counter** (global) — cut by decision 2026-07-13; presence is per-guild only.
- ✅ **Raid-thread ticker** — shipped 2026-07-13 (HOT ticker fed by /posts/trending).
- ✅ **GUILD feed chip** — shipped 2026-07-13 (`feed=guild`, guildmates’ public posts).
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

## Guild (§6) — war/raid/board DONE (Phase 4, backend + client, E2E-tested)
- ✅ **Guild War**: `GuildWar` model + lazy weekly matchmaking (nearest-XP unpaired guild, member-triggered), scores derived from members' `weeklyXp` and snapshotted on read. `GET /guilds/:id/war` + `/wars` (history with won/lost). Client: red war window on the Guild tab (scores, bar, CONTRIBUTE → feed, inline HISTORY) + **rally card pinned in the Dungeon feed** during an active war.
- ✅ **Guild Raid**: `GuildRaidProgress` model; first-completion-per-week chapter events tick it (same distinct-event window as quests — not farmable); +250 guild XP paid once on target. `GET /guilds/:id/raid` (target scales with roster, `myShare`). Client: gold raid card on the Guild tab.
- ✅ **Guild Board**: reuses Post + new `pinned` flag. `GET/POST /guilds/:id/board`, `POST /posts/:id/pin` (officers). Replies inherit `guildId`; leak guards added everywhere (public feed, post detail, react, vote, quote, profile recentPosts — all verified 404/hidden for outsiders). Client: board preview on Guild tab + full board screen (`guild/board/[id]`) with inline composer + officer pin toggles.
- ✅ **Presence per guild** — shipped 2026-07-13 (User.lastActiveAt, onlineCount + roster dots).
- ✅ **Roster enrichment** — shipped 2026-07-13 (online dots + idle Nh/Nd from lastActiveAt).
- 🔀 **Guild XP multiplier** ("+10% XP" recruit copy) — ⚠ if it should be real.
- 🎨 Directory war-status chips (`AT WAR`/`RECRUITING`) + #1 gold card — restyle; `AT WAR` can now read war state.
- 🎨 Old Hall screen (`guild/[id].tsx`) roster restyle to weekly-GXP ordering + role chips (data exists).
- ✅ **War refinements** — shipped 2026-07-13 (transaction-log scoring, finalizedAt freeze, +200 GXP winner purse, 5-min close-out tick).
- ✅ **Raid cosmetic reward** — shipped 2026-07-13 (Ember Wreath frame to contributing members).

## Arena (§7) — quiz + board + pools DONE (Phase 5, E2E-tested)
- ✅ **Quiz**: `ArenaEvent`/`ArenaEntry` models, server-side scoring (the answer
  key never reaches the device until the entry is locked — no mid-quiz ✓/✗ by
  design, anti-cheat), one entry per reader, countdown auto-submit, XP on entry
  (10 + 5/correct), +100 XP winner bonus at lazy close-out. Quiz runner screen
  `arena/[id]` with post-run ✓/✗ review. Admin creator `POST /admin/arena/events`.
- ✅ **Weekly EXP board**: `User.weeklyXp/weekKey` window bumped at every XP
  award site (posts, reactions, reads, comments, quests, reversals, arena);
  `GET /arena/leaderboards/weekly_xp` with top 20 + own pinned rank. Podium UI.
- ✅ **Prediction pool**: ArenaEvent kind "poll", one stake per reader (re-vote
  moves it), +5 XP first vote, **automatic majority payout** (+20 XP, no-tie
  rule) at lazy close — no admin resolution job needed.
- ✅ Week number + countdown header; past-results list; hub at `arena/index`.
- ⚠ **Draw competition**: still **blocked by the no-uploads policy**.
- ✅ **Winner titles** — shipped 2026-07-13 (Gate Scholar granted at quiz close-out).
  at close-out (current winner reward is XP only).
- ✅ **Scheduled close-out** — shipped 2026-07-13 (5-min in-process tick for arena + wars; lazy fallback kept).
  endsAt). A cron makes payouts prompt + enables LeaderboardSnapshot history
  (ARENA_PLAN phase 2).
- ⚠ **Weekly-quests + series leaderboards** (ARENA_PLAN phase 2).

## Status (§8) — DONE (Phase 3); two stats backend-gated
- ✅ STATUS header + bell + settings key; menus moved to new `account/settings.tsx` (edit profile, follow requests, moderation, staff, legal, sign-out, delete).
- ✅ XP ring (SVG dashoffset) around HunterAvatar; TitleFlair + GuildChip; LV + "n XP to LV n+1".
- ✅ HUNTER RECORD 6-stat grid (CHAPTERS / RECORDS / REACTIONS / BADGES / DAYS / TOTAL XP) → full status modal.
- ✅ EQUIPPED slots (TITLE / FRAME / AVATAR) → titles modal / appearance screen.
- ✅ Badges rail (locked 35%) with ALL ▸ expanding to the grid; TODAY'S QUESTS strip (✓/strikethrough, ALL QUESTS ▸).
- ✅ **dayStreak** — shipped 2026-07-13 (User.streakDays via auth touch; Status grid).
- ✅ **weeklyRank** — shipped 2026-07-13 (computed on /me; Status grid).

## Quest Log (§9) — DONE (Phase 3); chain bonus + precise links backend-gated
- ✅ QUEST LOG ScreenTitle + live HH:MM:SS reset countdown; cadence chips (ALL/DAILY n/n/WEEKLY/SEASON/MILESTONE), client-filtered.
- ✅ Done = gold CLAIMED strikethrough; active = corner-ticked card with `GO TO DUNGEON ▸`/`GO READ ▸` (client keyword heuristic); epic/seasonal rarity tint.
- ✅ **Chain bonus** — shipped 2026-07-13 (+100 XP once/day when all dailies clear).
- ✅ **Per-quest `deepLink`** — shipped 2026-07-13 (column + seeds; heuristic fallback).

## Library / Archive (§10) — DONE (Phase 3)
- ✅ ARCHIVE ScreenTitle + HISTORY key + SYNCED/LOCAL state; RESUME EXPEDITION window (cover, ch/page, % bar, play key → reader).
- ✅ Shelf chips ALL/READING n/CAUGHT UP/DONE (client filter on progress + series detail); grid `+n` unread badges + progress hairlines + dashed ADD SERIES tile.
- ✅ EXPEDITION LOG history view (rows with % bar + RESUME ▸).
- 🎨 History CLEAR intentionally omitted: `last_read` doubles as the progress store — clearing would erase reading positions. Needs a separate history table first.

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
5. Thread replies `sort` param (TOP/NEW). *(client-side sort shipped in Phase 2 — server param optional)*
6. ~~Guild War~~ ✅ shipped (Phase 4: `GET /guilds/:id/war`, `/wars`, `GuildWar` model, lazy matchmaking).
7. ~~Guild Raid~~ ✅ shipped (Phase 4: `GuildRaidProgress` + completion hook + `GET /guilds/:id/raid`).
8. ~~Guild Board~~ ✅ shipped (Phase 4: board create/list/pin + leak guards).
9. ~~Weekly leaderboard~~ ✅ shipped (Phase 5: `GET /arena/leaderboards/weekly_xp` + `User.weeklyXp` window).
10. ~~Arena~~ ✅ shipped (Phase 5: quiz + pools + lazy close-out; draw comp & titles remain).
11. Profile stats: `dayStreak` on `me` (⚠); `weeklyRank` is now derivable from the weekly board endpoint (🎨 wire into Status grid).
12. Quests: `deepLink` field + daily chain-bonus rule.
13. Series activity rate ("posts/hr") — per-series recent post/comment rate.
14. Guild member XP multiplier (if "+10% XP" should be real).
15. Recent-search persistence (local, not server) for RECENT SCANS.
16. Draw competition uploads — **blocked** by the no-uploads policy (needs a decision).
