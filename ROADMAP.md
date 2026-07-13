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

**Phase 5 — Arena (done, E2E-tested live; ARENA_PLAN phase 1 complete):**
- **Migration** `arena_events_weekly_xp`: `ArenaEvent`/`ArenaEntry` +
  `User.weeklyXp`/`weekKey` (Monday-anchored weekly window).
- **Backend** (`api/src/arena.ts`, `routes/arena.ts`):
  - Quiz: server-side scoring — the answer key never reaches the device until
    the entry is locked (anti-cheat). One entry per reader; XP = 10 + 5/correct;
    +100 XP winner bonus at close. Admin creator (`manage_rewards`).
  - Prediction pools: one stake per reader (re-vote moves it), +5 XP first
    vote, automatic majority payout (+20 XP) — no resolution job needed.
  - Lazy close-out (like war matchmaking): the first read after `endsAt`
    finalizes and pays winners; `finalizedAt` claimed atomically.
  - **Weekly XP leaderboard**: `bumpWeeklyXp` hooked at every XP site
    (posts/reactions/reads/comments/quests/reversals/arena);
    `GET /arena/leaderboards/weekly_xp` = top 20 + own pinned rank.
- **Client**: Arena hub (`arena/index`) — LIVE quiz hero with pulse chip,
  pool cards with live percentages, weekly board podium + own-rank row, past
  results; quiz runner (`arena/[id]`) with countdown auto-submit and ✓/✗
  review after entry. Seeded a demo quiz + pool for this week.
- Verified live: entry scoring (3/5 → 25 XP), double-entry rejection, answer-key
  protection, pool vote + tallies, leaderboard rank.

**Remaining polish:** draw competition (blocked on uploads), winner titles,
scheduled close-out + snapshots, roster restyle, presence, trending. See
`NOT_YET_IMPLEMENTED.md`.

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

### Social v2 — Phase 3a: GIFs ✅ (2026-07-12 — GIF posting + picker pending device test; GIPHY key configured)
- [x] **GIFs on posts/replies** — `Post.gifUrl` (migration `post_gifs`);
      `validateGifUrl()` allowlists https Giphy/Tenor media URLs; composer GIF
      URL field; `PostCard` renders the GIF via `expo-image` (spoiler-shield
      aware); quoted-post embeds carry it too.
- [x] Feed fix bundled in: switching type/scope/sort/topic now drops cached
      feed pages (`clearFeedPages`) and remounts the list, so stale pages don't
      flash.
- [x] **In-app GIF picker** (Meta-style, replaces the paste-a-URL field) —
      composer GIF key → full-screen picker: trending on open, debounced
      search, 2-column infinite grid, tap to attach (preview + ✕ in the
      composer). Server proxy `GET /gifs/search` (`api/src/routes/gifs.ts`)
      normalizes **Giphy or Tenor** (set `GIPHY_API_KEY` or `TENOR_API_KEY`
      in `api/.env` — see `.env.example`), pins rating pg-13/medium for Play,
      auth-gated + rate-limited. Without a key the picker shows a setup hint.

### Guilds — Phase 4a: invites ✅ (2026-07-12, verified live 2026-07-12)
- [x] **Guild invites** — `GuildInvite` model (migration `guild_invites`);
      officers invite by exact @username (`POST /guilds/:id/invites` — if the
      reader already had a pending join request it auto-accepts them instead);
      invited reader answers via `POST /guilds/:id/invites/respond`
      (accept respects the member cap, voids their other invites/requests, and
      works on invite-only guilds); officers can revoke
      (`DELETE /guilds/:id/invites/:userId`). Hall payload gained
      `invitePending` + `pendingInvites`. Client: invite banner with
      ACCEPT / DECLINE on the Hall tab, "INVITE A READER" box + awaiting-answer
      list on the Roster tab. Notifications: `guild_invite`,
      `guild_invite_accepted`.

### Guilds — Phase 4b: hall board access + contribution board ✅ (2026-07-12, verified live 2026-07-12)
- [x] Audit: the **guild wall/board already shipped** in the Phase-4 war/raid/board
      commit (`GET/POST /guilds/:id/board`, officer pinning, members-only
      threads, feed exclusion, `guild/board/[id]` screen) — the old "Guild wall"
      backlog bullet was stale. What was missing: the Guild Hall never linked
      to it.
- [x] **BOARD ↗** entry in the Guild Hall tab row → board screen.
- [x] **Contribution board** — RANK / WEEKLY / ALL-TIME ordering chips on the
      Roster tab with position numbers (#1 in foil), weekly-first stat line in
      WEEKLY mode.
- [x] **This Week's Vanguard** — top-3 weekly contributors card on the Hall tab
      (from the HQ sketch in `GUILDS_PLAN.md`).

### Guilds — Phase 4c: edit-guild UI ✅ (2026-07-12, verified live 2026-07-12)
- [x] **Edit Guild screen** (`guild/edit/[id]`) — the UI for the long-existing
      `PATCH /guilds/:id`: name, tag, emblem + color (curated set, live crest
      preview), **join policy selector** (open / request / invite-only, so
      invite-only guilds are now actually configurable client-side), motto,
      description. Officer-gated client-side; server already enforced it.
- [x] Entry points: **⚙ EDIT GUILD** button on the Hall tab (officers), and the
      guild home's **MANAGE** quick key now opens the editor (it previously
      just opened the Hall).

### Guilds — Phase 4d: weekly guild events ✅ (2026-07-12, verified live 2026-07-12)
- [x] **Rotating weekly co-op event** next to the fixed raid — `GuildEvent` +
      `GuildEventContribution` (migration `guild_events`); type rotates
      deterministically per guild per week (file records / write replies /
      earn reactions — never duplicates the raid's chapters), target scales
      with roster size, created lazily on first read/tick (no cron, same
      pattern as wars). Ticks from the existing XP hook sites (post/reply
      creation incl. guild board, reactions received). Completion pays
      +150 Guild XP once (atomic claim) and notifies the whole roster
      (`guild_event_complete`).
- [x] Endpoints: `GET /guilds/:id/event` (ensures + returns this week's, with
      viewer share) and `GET /guilds/:id/events` (finished-week history).
- [x] Client: GUILD EVENT card on the guild tab under the raid card (accent
      styling, progress bar, your share, reward state). Verified via API
      smoke test: event lazily created with roster-scaled target.

### Guilds — Phase 4e: perks & hall decorations ✅ (2026-07-12, verified live 2026-07-12)
- [x] **Perk track** — derived server-side (`guildPerks`), shown in a Hall
      "Perk Track" window: base features, the growing member cap, and four
      decoration tiers with lock states (LV 2/4/6/8).
- [x] **Hall decorations** — curated level-gated catalog (`GUILD_DECORATIONS`:
      Arcane Halo, Verdant Wreath, Storm Veil, Gilded Frame, Blood Moon,
      Eclipse Crown). `Guild.decorationKey` (migration `guild_decorations`);
      PATCH validates the level gate server-side. Edit screen gains a
      decoration picker (locked cells show 🔒 LV n); equipped decoration tints
      the guild-tab banner and the Hall header (border, glow, flanking sigils,
      name plate) via the client `GUILD_DECOR` style map.

**🏰 Guilds Phase 4 (full depth) is COMPLETE: invites · wall/board ·
contribution board · edit UI · weekly events · perks/decorations.**

### Fix: account deletion runs guild succession ✅ (2026-07-12)
- [x] `deleteUserCompletely` now applies the leave route's rules in the
      deletion transaction (officer/oldest-member succession + notification,
      last-member dissolve) — deleting a guildmaster can no longer orphan a
      guild. Dev DB scanned: no existing orphans. Exercised live via the E2E
      cleanup below.

### Social v2 — Phase 3b: images on posts ✅ (2026-07-12, API E2E-tested; UI pending device test)
- [x] **Storage abstraction** (`api/src/storage.ts`) — local-disk adapter in
      dev (`api/uploads/`, gitignored, served by `GET /uploads/:file` with a
      UUID-pattern path guard + immutable caching); **Cloudinary adapter** for
      prod (signed REST upload, no SDK dep) — flips on via `CLOUDINARY_URL`,
      optional `CLOUDINARY_MODERATION` for Play-compliant AI gating (both in
      `.env.example`).
- [x] **Upload route** `POST /uploads/image` — raw `image/jpeg` binary body
      (no multipart dep), 3MB limit, JPEG magic-byte check, auth + terms +
      rate-limited (40/h).
- [x] **`Post.imageUrls`** (max 4, migration `post_images`) — server accepts
      only URLs our storage produced (`isStoredImageUrl`); serialized through
      feed/thread/quote like `gifUrl`.
- [x] **Client** — composer 📷 key (`expo-image-picker` + `-manipulator`,
      SDK 54): multi-select up to 4, always re-encodes to JPEG (HEIC-safe) and
      downscales to ≤1600px, uploads via `FileSystem.uploadAsync` binary,
      thumbnail row with ✕, publish disabled while uploading. `PostCard`
      renders 1 image full-width (4:3) or a 2-col grid; relative dev URLs
      resolve against the API base (`resolveMediaUrl`).
- [x] **API-level E2E verified**: register → upload → serve (200) → post with
      image → foreign-URL rejection → account cleanup via the new deletion
      path. Device pass still needed for the picker UI.

## 🗺️ Deferred / next (phased — see the plan file)

_Guilds Phase 4 done and **device-verified** (2026-07-12). GIPHY_API_KEY is
configured in api/.env — **last check: GIF posting + picker on device**, then
Social 3b images or Arena._



**Arena — Phase 5 (its own track):** PvP turn-based manga-character battles,
online vs other players + async — matchmaking, server-authoritative game state,
real-time sync, character roster, ranked ladder (`ARENA_PLAN.md`). The rest of
the Arena (quiz, pools, draw, leaderboards) also lives there.

**Social fast-follow:** auto-generated **Achievement** records; reactions on
chapter comments.
