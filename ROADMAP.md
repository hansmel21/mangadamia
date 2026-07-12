# Mangadamia — Roadmap & Progress

Living status doc. Updated after each milestone so work can resume cleanly.
Design docs: `GUILDS_PLAN.md`, `ARENA_PLAN.md`.

_Last updated: 2026-07-12._

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

## 🎨 System Protocol UI/UX redesign (in progress)

Full-app redesign to the "System Protocol" spec in `UI-UX/` (interactive
prototype `System Protocol App.dc.html` + `IMPLEMENTATION.md`). Backlog of
not-yet-built features and ⚠ backend endpoints: **`UI-UX/NOT_YET_IMPLEMENTED.md`**.

**Phase 1 — foundation + nav (done, typechecks clean):**
- **Tokens** locked to spec — `bg #0a0b10`, `surface #10121a`, `hairline #1c2029`,
  cyan `data #54D6FF`, tight 3–4px radii (`app/src/theme.ts`).
- **Primitives**: `ScreenTitle` (bracketed page title), `SystemKey`
  (primary/outline/chip), `HunterAvatar` (squircle + rank sigil), `GuildChip`
  (bordered `[TAG]`) — in `SystemUI.tsx`, `HunterAvatar.tsx`, `GuildCrest.tsx`.
- **Motion helpers**: `useCrtOpen`, `usePulseGlow`, `useProgressGrow` (`anim.ts`).
- **Nav → 5-key command bar**: HOME · ARCHIVE · **DUNGEON** (center diamond) ·
  GUILD (new tab) · STATUS, with unread badge on STATUS (`(tabs)/_layout.tsx`).
  New `(tabs)/guild.tsx` (recruit state + Hall banner/quick-keys shell).
  HeaderMenu retained on not-yet-redesigned screens until each gets its own
  in-screen header.
- **Identity treatment app-wide**: `UserIdentity` now uses `HunterAvatar` +
  `GuildChip`, so feed/thread/profiles get the squircle + rank sigil look.
- **PostCard** → mini System-window: kind **notch** breaking the top border,
  corner ticks, square radius, `OPEN THREAD ▸` in cyan `data`.

**Phase 2 — Feed + Composer + Thread (done, typechecks clean):**
- **Feed** (`(tabs)/feed.tsx`): in-screen DUNGEON ScreenTitle + ARENA key,
  one-row filter deck (ALL/THEORIES/REVIEWS/FOLLOWING chips + HOT▾ sort cycle),
  gradient NEW RECORD key. Online counter / raid ticker / war card wait on
  backend (see backlog).
- **Composer** (`PostComposer.tsx`): now the "NEW RECORD" bottom sheet on the
  new `SystemSheet.tsx` (CRT open/close), 5 kind tiles, **auto-tag from last
  read** (`getLastReadTag()` added to `library.ts`) with ✕ remove, spoiler
  shield toggle + char counter, gradient PUBLISH RECORD key.
- **Thread** (`post/[id].tsx`): kind-colored ScreenTitle header, root post as a
  full 4-bracket System window (`PostCard root` prop), **TOP ◆ / NEW reply
  sort** (client-side), **one indent level + `▾ N MORE REPLIES` collapse**,
  one-line dashed shield chip for spoiler replies, sticky reply bar (viewer
  avatar + input + gradient send).

**Phase 3 — Home/Search + Status + Quest Log + Archive (done, typechecks clean):**
- **Home** (`(tabs)/index.tsx`): in-screen wordmark header + bell key + hunter
  chip (LV + XP bar → Status), search key with corner ticks + SAFE badge,
  framed hero window (TOP-n notch, CONTINUE CH.n from stored progress, WALL),
  daily-directive strip, CH.n badges on the LATEST rail, `± LIBRARY` actions
  on search result rows, ALL/ONGOING/DONE chips + result count.
- **Status** (`(tabs)/account.tsx`): pure character sheet — XP ring (SVG)
  around HunterAvatar, HUNTER RECORD 6-stat grid, EQUIPPED slots, badges rail
  with ALL ▸ grid, TODAY'S QUESTS strip. Menus moved to new
  **`account/settings.tsx`** (edit profile, follow requests, moderation,
  staff, legal, sign out, delete account).
- **Quest Log** (`quests.tsx`): live reset countdown, cadence chips, CLAIMED /
  corner-ticked cards, GO TO DUNGEON ▸ deep-link heuristic, rarity tints.
- **Archive** (`(tabs)/library.tsx`): RESUME EXPEDITION window, shelf chips,
  unread `+n` badges + progress hairlines (SeriesGrid), ADD SERIES tile,
  EXPEDITION LOG history view. `listHistory()` now returns `pageCount`.
- **HeaderMenu deleted** — every entry has a System Protocol replacement; all
  five tabs render their own in-screen headers.

**Phase 4 — Guild war/raid/board, backend + client (done, E2E-tested live):**
- **Migration** `20260712191519_guild_war_raid_board`: `Post.pinned`,
  `GuildWar` (weekly head-to-head, lazy matchmaking, score snapshots),
  `GuildRaidProgress` (weekly shared chapter target + one-time bonus claim).
- **Backend** (`api/src/guilds.ts`, `routes/guilds.ts`, `routes/social.ts`):
  - War: `GET /guilds/:id/war` (member-triggered nearest-XP matchmaking;
    scores = Σ member `weeklyXp`, snapshotted on read) + `/wars` history.
  - Raid: first-completion-per-week chapter events tick progress (quest-style
    distinct-event window — not farmable); +250 guild XP once on target;
    `GET /guilds/:id/raid` with roster-scaled target + `myShare`.
  - Board: `GET/POST /guilds/:id/board`, `POST /posts/:id/pin` (officers);
    replies inherit `guildId`. **Leak guards** on public feed, post detail,
    react, vote, quote, and profile recentPosts — all verified via curl
    (outsider gets 404/hidden; member reads/replies fine).
- **Client**: Guild tab is the full Hall (banner, red war window with score
  bar + CONTRIBUTE + inline history, gold raid card, board preview), new
  board screen `guild/board/[id]` (inline composer, officer pins), and a
  war **rally card pinned in the Dungeon feed** during an active war.
- Found in testing: account deletion orphans guilds (pre-existing; leave-route
  succession never runs) — flagged as a separate task.

**Next phases (build order):** Arena (⚠ backend, per ARENA_PLAN) → remaining
polish (roster restyle, presence, trending). See `NOT_YET_IMPLEMENTED.md`.

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

### Social v2 — Phase 1: Social Feel v2 ✅ (2026-07-12)
Plan: `.claude/plans/i-think-we-should-quizzical-wirth.md`.
- [x] Prominent type tab bar (bold segmented control) + small scope toggle
- [x] Reactions rework — dropped ⚡ Endorse → ❤️/🔥/🤯/😭/💀; XP now on any
      reaction received (migration `20260712054020_reactions_like`)
- [x] Richer per-type System Record cards (type-colored accent + banner) +
      new `SeriesEmbed`
- [x] Polish pass: floating reaction tray that opens/closes with the SystemModal
      "status window" choreography (stretch→unfold→squeeze) and auto-closes on
      route change; condensed reaction cluster (≤3 emojis + total, never
      sprawls); cross-fade tab transitions; comment threads as distinct
      contrasting cards (Reddit boxes); guild `[TAG]` inline with the username;
      removed the confusing rank "E" sigil; hid "RECORD" on plain posts.

### Social v2 — Phase 2: post functions ✅ (2026-07-12)
- [x] **Polls** — `poll` record kind + `PollOption`/`PollVote` models
      (migration `polls`); composer poll builder (2–6 options); one-tap vote
      with live result bars (`PollView`); `POST /posts/:id/vote`. Verified live.
- [x] Feed sorting — **New** (chronological) / **Top** (most-reacted all-time) /
      **Hot** (most-reacted this week); selector on the feed, cross-fades on switch.
- [x] Quote-repost (`Post.quotedPostId`) — quoted record embed, quote composer
      mode, quote notification, feed/wall/thread actions.
- [x] Mentions (@user → notification) & #hashtags (tappable topic filter)

## 🗺️ Deferred / next (phased — see the plan file)

_Phase 2 (post functions) is complete. Next recommended track: Social Phase 3 media, starting with GIFs because hosted provider URLs avoid upload/storage/moderation complexity._

**Social — Phase 3: media in posts, comments & replies**
- **Images** (Cloudinary, built local-first): client picker + compress
  (`expo-image-picker`/`-manipulator`); `api/src/storage.ts` abstraction
  (local-disk dev adapter now, Cloudinary adapter for prod); `Post.imageUrls`;
  Cloudinary AI moderation gating in prod for Play compliance.
- **GIFs** (simpler — no upload/storage/moderation): a Giphy/Tenor GIF picker;
  posting/replying/commenting stores the provider GIF URL on the post. Ship
  GIFs first since the provider handles hosting + content safety.

**Guilds — Phase 4: full depth** (currently way too basic)
- **Invites** (net-new `GuildInvite` model + endpoints + UI — can't invite today)
- **Guild wall** (wire `Post.guildId` into `/posts` + Hall Wall tab)
- **Guild events** (net-new `GuildEvent` models; co-op weekly goals + rewards)
- **Customization & perks** (edit hall, level unlocks, guild title/decorations)
- **Contribution board** (weekly + all-time member board in the Hall)

**Arena — Phase 5 (its own track):** PvP turn-based manga-character battles,
online vs other players + async — matchmaking, server-authoritative game state,
real-time sync, character roster, ranked ladder (`ARENA_PLAN.md`). The rest of
the Arena (quiz, pools, draw, leaderboards) also lives there.

**Social fast-follow:** auto-generated **Achievement** records; reactions on
chapter comments.
