# Mangadamia — Roadmap & Progress

Living status doc. Updated after each milestone so work can resume cleanly.
Design docs: `GUILDS_PLAN.md`, `ARENA_PLAN.md`.

_Last updated: 2026-07-15._

> **2026-07-15 device pass — ALL CLEAR.** The owner verified everything that
> was pending on hardware: Gates (all tiers, promotion chip, directory tabs),
> composer rework, Guild Hall detail modals, the keyboard/✕ fix, the guild
> members de-dup, the hotfix batch, progression pack, THE SYSTEM
> announcements, draw competition, polish batch, and the GIF/image pickers.
> Every "pending device test" flag below is resolved.
>
> **Production sources decision (owner):** the app ships **multi-source**
> (MangaDex + Asura + Weeb Central via the external scraper service) — that
> is the point of the scraper API. No MangaDex-only production toggle.

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

### Social pack: comment reactions + trending + guild presence ✅ (2026-07-13, API-tested; UI pending device test)
- [x] **Reactions on chapter comments** — `CommentLike.type` (migration
      `comment_reactions`), `/comments/:id/react` with post-identical
      toggle/swap semantics; `CommentsSheet` uses the shared `ReactionBar`
      emote tray. (Achievement auto-records: cut by decision.)
- [x] **Trending threads** — `GET /posts/trending`: root posts ranked by fresh
      reactions + replies (replies ×2), 1h window auto-widening to 24h.
      Client: **HOT ticker** on the Dungeon feed (tap → thread) and
      **TRENDING IN THE DUNGEONS** rail on Home (top 3).
- [x] **Per-guild presence** (global online counter: cut by decision) —
      `User.lastActiveAt` bumped ≤1×/5min by the auth layer (fire-and-forget);
      hall payload gains `onlineCount` + per-member `online` (10-min window).
      Client: green "n ONLINE" on the guild banner, Online stat in the Hall,
      green dots on the roster.
- [x] **GUILD feed chip** — `GET /posts?feed=guild` (guildmates' public posts;
      the members-only board stays separate); chip on the Dungeon filter deck
      for guild members.

### Progression pack (3+4): streaks, ranks, chain bonus, war/raid/arena rewards, polish ✅ (2026-07-13, pending device test)
- [x] **Day streak** — `User.streakDays/streakDayKey` maintained by the same
      throttled auth-layer touch as presence (same UTC day keeps, yesterday
      +1, gap resets). **Weekly rank** computed on `/me` from the arena weekly
      board. Status grid: DAYS → **DAY STREAK 🔥** (gold at 7+), TOTAL XP →
      **WEEKLY RANK #n**; both also in the full status readout.
- [x] **Quest chain bonus** — clearing every active daily pays **+100 XP**
      once per UTC day (xpTransaction `quest_chain:dayKey` idempotence guard),
      with a notification and a synthetic "Daily Directive Chain" completion
      toast. **Per-quest `deepLink`** column (seeded for the launch set);
      client uses it, keyword heuristic stays as fallback.
- [x] **War finalization + winner purse** — war scores now computed from the
      `GuildXpTransaction` log per week window (exact even after member
      weekly windows roll), `GuildWar.finalizedAt` freezes finished wars,
      winner guild gets **+200 GXP** + roster notification. Runs from the new
      **5-minute scheduled close-out tick** in server.ts (also finalizes ended
      arena events) with lazy on-read fallback.
- [x] **Raid clear cosmetic** — every member who contributed ≥1 chapter that
      week earns the **Ember Wreath** frame (seeded `frame-ember`, idempotent
      grants + unlock notification).
- [x] **Arena winner title** — quiz close-out now also grants **Gate Scholar**
      (seeded `gate-scholar`) + victory notification.
- [x] Polish: **instant search-as-you-type** on Home (debounced, submit still
      records RECENT SCANS), roster **idle Nh/Nd** labels for offline members,
      **breathing pulse** on the online dots (guild banner + roster).

### THE SYSTEM: official announcements ✅ (2026-07-13, API E2E-tested; UI pending device test)
- [x] **Official posts** — `Post.isOfficial` (migration `official_announcements`,
      server-set only — unspoofable from the composer); serialized as
      **THE SYSTEM** (`official: true`, no author identity); `pinned` holds
      them in `GET /announcements/active` (top 3, block-proof). Feed block
      filter bypassed for officials in the global feed + thread view only.
- [x] **Admin endpoints** (cap `manage_rewards`): create (`pinned`/`notify`
      options), list, pin/unpin, audited delete. **Broadcast fan-out**:
      batched `createMany` notifications to all active readers
      (kind `announcement` → existing announcements preference bucket),
      idempotent dedupe, push dispatcher batch raised to 250.
- [x] **Arena auto-announce** — `POST /admin/arena/events` takes
      `announce: { pinned, notify }` and publishes "⚔ NEW ARENA EVENT…".
- [x] **Client** — SYSTEM NOTICE kind; official PostCards render with cyan
      System treatment (⚙ THE SYSTEM notch, 4 corner ticks + glow, wordmark
      instead of avatar); pinned notices at the top of the Dungeon feed
      (deduped from the stream). E2E: publish → active → 4/4 fan-out →
      unpin → audited delete.
- [x] Fix: Dungeon filter deck no longer pushes the sort key off-screen
      (chips wrap in their own column; HOT ▾ keeps a fixed slot).

## 🗺️ Deferred / next (phased — see the plan file)

### Moderation groundwork ✅ (2026-07-13, E2E-tested)
- [x] **`api/src/moderation.ts`** — the entire enforcement pipeline
      (snapshots, notices, notifications, XP reversal, audit) extracted into
      `applyModerationAction()`; the reports route is now a thin wrapper
      (round-trip verified identical). New `restoreContent()` undoes a
      mistaken removal without an appeal (audited, XP re-granted once, keyed
      by the audit row id).
- [x] **`GET /admin/content`** — browse/search ALL posts + comments (not just
      reported): text/author/status/kind/date/reported filters, 25/page, with
      author identity + report counts. **`POST /admin/content/:type/:id/action`**
      — direct actions without a report (per-action capability map, no
      dismiss, restore included). **`GET /admin/overview`** — dashboard
      counts. E2E: unreported post found → direct remove (404 public) →
      restore (200) → audit shows both with `report=none`.

### Arena Draw competition ✅ (2026-07-13, API E2E-tested; UI pending device test)
- [x] **Draw events** — ArenaEvent kind `draw` (`config.prompt`), entries are
      uploaded drawings (`isStoredImageUrl`-validated, +10 XP), **ArenaVote**
      (migration `arena_draw`): one community vote per reader, re-vote moves
      it, no self-votes, +2 XP first vote. Close-out: most votes wins
      (ties → earliest entry) → **+100 XP + Gate Artisan title** (seeded) +
      notification.
- [x] Client: draw card on the Arena hub; event screen renders the prompt,
      SUBMIT YOUR DRAWING (reuses the photo pick→JPEG→upload pipeline),
      2-col vote gallery with author identities + live counts, gold border on
      your vote, 👑 WINNER banner after close. Admin creator accepts
      `kind: "draw"` (console UI comes with the web console phase).
- [x] E2E: create → upload entry (+10) → vote (+2) → self-vote blocked →
      finalize → winner 110 XP + gate-artisan.

### Backlog polish batch ✅ (2026-07-13, pending device test)
- [x] **Search**: `/search` payload enriched (avg review rating + rating count
      + on-app reads) → result rows show the series **rank sigil + ★ rating +
      reads** under the title; instant as-you-type results shipped earlier.
- [x] **Guild directory**: `AT WAR` / `RECRUITING` chips (server `atWar` flag
      from the week's pairings) + gold champion card for #1.
- [x] **Thread series rows**: **READ ▸** deep link straight into the reader at
      the stored position (`getResumeForCanonical` in library.ts).
- [x] **Guild XP multiplier is real**: guild LV 5 perk — `creditGuild` applies
      +10% (ceil) to every member contribution; on the Hall perk track.
- [x] **Motion**: `SystemProgress` now grows on mount app-wide; Dungeon center
      key gets a 150ms glow-in on activation; arena LIVE chip + online dots
      already pulse. Reader chrome confirmed shipped (stale backlog line).
- [x] **History CLEAR** — `hidden_from_history` flag on `last_read`: CLEAR LOG
      hides Expedition Log rows without touching resume positions; reading
      re-surfaces a series automatically.
- [x] Doc cleanup: 13 stale/shipped backlog lines marked in
      `UI-UX/NOT_YET_IMPLEMENTED.md`.

### Web admin console ✅ (2026-07-13, browser-verified against the live dev API)
- [x] **`/console`** — Vite + React + TS SPA (deps: react, react-router, vite
      only; dark System theme). **Served by the API same-origin at
      `/console/`** (`@fastify/static` + SPA fallback, registered only when a
      build exists) — zero CORS surface. Dev: `cd console && npm run dev`
      (:5173 proxies to :3000). Prod build: `cd console && npm run build`.
- [x] **8 pages**, sidebar filtered by capability, zero-capability sign-ins
      rejected: Dashboard (live overview counts) · **Content audit** (browse
      ALL posts/comments, filters, direct remove/restore/warn/suspend/ban) ·
      Reports queue · Appeals · Audit log (expandable snapshots) · Readers
      (titles/roles with owner-password confirm) · **Announcements** (THE
      SYSTEM composer: pin + notify-everyone, unpin, audited retire) ·
      **Arena events** (quiz/pool/draw builders + auto-announce toggle).
- [x] Verified in-browser: owner login → dashboard counts → content audit
      listing all 16 real posts → reports queue showing the real pending
      report → announcement composer → arena builder with live event history.
- ⚠ **Deploy note**: Railway build must also run `cd console && npm ci &&
      npm run build` (or prebuild dist); without it the API simply serves no
      console (clean fallback).

**Pre-Arena plan — COMPLETE** (see `.claude/plans/check-roadmap-and-all-mutable-dragonfly.md`):
1. ✅ Announcements + THE SYSTEM · 2. ✅ Moderation groundwork ·
3. ✅ Arena Draw competition · 4. ✅ Backlog polish batch · 5. ✅ Web admin console

### UI rework batch 🔍 (2026-07-13 — LOCAL ONLY, awaiting owner review before push)
- [x] **Recolor** — every accent one register calmer (arcane indigo `#6b5ecc`,
      steel data `#6faec9`, antique gold `#cda45e`, moss `#56a87b`, muted
      crimson `#ce5153`, slate info, dusty rose); paper lifted to `#f2f3f7`;
      all hardcoded old-palette values swept across 41 files; every glow
      `shadowOpacity` scaled ~40% down.
- [x] **Nav**: Dungeon key sits just proud of the bar (was floating 18px up,
      now 6, 52px diamond); reader back control is icon-only; **QUESTS
      replaces STATUS in the tab bar** (Status stays routable from the
      hunter chip; `/quests` route unchanged, back arrow removed).
- [x] **Notifications near-realtime**: count + inbox poll every 15s.
- [x] **Dungeon**: filter chips → one **scope dropdown** (All records /
      Theories / Reviews / Following / Guild) + sort key; body font 15→13.5;
      footer collapsed to one quiet row (compact borderless ReactionBar +
      reply/quote + OPEN ▸).
- [x] **Post titles** — `Post.title` (migration `post_titles`, replies never
      carry one), TITLE input in the composer, bold headline on cards,
      trending ticker prefers the title. Composer sections separated
      (hairline above the attach/options row).
- [x] **Guild tab decluttered**: banner taps into the Hall; quick keys are
      BOARD · **EVENTS** · INVITE (officers) · MANAGE; war window + raid +
      weekly event moved to the new nested `guild/events/[id]` screen.

### Hotfix batch ✅ (2026-07-15, typechecked + API E2E; UI pending device test)
- [x] **Dungeon feed blank on scope switch** — `useSwitchFade` now uses the JS
      driver (a native-driven spring starting while the list was unmounted
      left the remounted view stuck at opacity 0), and the feed's animated
      wrapper stays mounted through loading.
- [x] **Guild tab = the Hall** — members land straight on the full Hall
      (banner, quick keys BOARD · EVENTS · MEMBERS · MANAGE, Guild Status,
      Vanguard, Perk Track, board preview, LEAVE). `guild/[id]` keeps serving
      foreign guilds + the members screen.
- [x] **Hall tabs** — ROSTER renamed **MEMBERS** (invite box stays on top),
      duplicated BOARD ↗ tab removed; `guild/[id]?tab=members` deep link.
- [x] **Invite autocomplete** — new `GET /users/search?q=` (auth-gated,
      prefix-ranked, ≤8 identities, banned/self excluded; E2E-verified);
      debounced dropdown under the invite input, roster/pending filtered out.
- [x] **"(tabs)" back-button text** — `headerBackButtonDisplayMode: "minimal"`
      on the root stack (icon-only back everywhere).
- [x] **Quest Log** — cadence chips scroll horizontally (they overflowed);
      new **COMPLETED** tab owns claimed quests (they leave the other tabs).
- [x] **HOME key closes search** — tapping the HOME tab while a search is open
      dismisses the keyboard + clears the query/results back to the default
      Home view (`tabPress` listener → `clearSearch`).
- [x] **Duplicate HALL inside the members screen** — `guild/[id]` kept its own
      HALL | MEMBERS tabs after the guild tab became the full Hall. Members
      now get a roster-only screen (no tabs); bare own-guild links redirect to
      the guild-tab Hall. Foreign guilds keep both tabs (their only hall).
- [x] **Composer ✕ hidden by the keyboard** (iPhone 14 Pro report) —
      `SystemSheet` had no height cap, so the keyboard-avoiding push shoved
      the header off the top of the screen. Now: safe-area top padding +
      `maxHeight` on the sheet with a shrinkable ScrollView (header stays
      pinned, content scrolls), plus drag-down dismisses the keyboard.
- [x] **Backward continuous reading** — scrolling up at the top of a chapter
      prepends the PREVIOUS chapter inline (vertical mode), mirroring the
      forward flow: pages fetched before the queue prepend,
      `maintainVisibleContentPosition` anchors the viewport, and leaving a
      chapter upward no longer marks it completed (forward-only guard).
      Bottom-bar PREV now scrolls in place when the chapter is loaded above.
      **Fix (same day):** the trigger is a real upward scroll gesture near the
      top (dy<0 within ¾ viewport, armed 600ms after mount) — the first cut
      used `onStartReached`, which re-fires on every content-size change while
      images load, so plain chapter opens auto-prepended the previous chapter
      and anchor drift started chapters on random pages.

### External scraper service ✅ (2026-07-15, E2E-tested end-to-end)
- [x] **New `scraper/` service** (Fastify, stateless, no DB) hosting the three
      source adapters — **MangaDex** (safe-only, Play-compliant) + **Asura
      Scans** + **Weeb Central** (cheerio HTML scrapers, browser UA, per-host
      throttle). Exposes the `Source` contract over REST behind an
      `x-scraper-key` shared secret: `/sources`, `/sources/:id/list`
      (popular/search/latest/newest), `/series/:id`, `/…/pages`, public
      `/health`. `npm run test:source <id>` smoke-tests an adapter live.
- [x] **API consumes it remotely** — `api/src/sources/remote.ts` factory +
      static registry (`sources/index.ts`); deleted the in-process
      `mangadex.ts`/`http.ts`. `catalog`/`unified`/`health` unchanged. Env
      `SCRAPER_URL` + `SCRAPER_API_KEY`.
- [x] **Multi-server restored** — with three sources back, cross-source
      discovery + `/canonical/:id/sources` repopulate per-series "servers"
      (verified: Solo Leveling → Asura 67ch + Weeb Central 68ch; licensed on
      MangaDex). No switcher rebuild — it was dormant, not removed.
- [x] **Page Referer headers** — migration `page_headers` (`Page.headers Json?`);
      stored/returned by `getPagesCached`; threaded into the reader +
      series-prefetch `expo-image` calls so scanlation CDNs (which 403 without
      their own Referer) load.
- [x] Verified: `/browse` merges all 3 sources, `/search` returns multi-server
      cards, Asura pages carry `{Referer}` end-to-end + persisted in DB, and the
      API serves cached data when the scraper is stopped (SWR fallback). All
      three workspaces typecheck clean.
- ⚠ **Policy note:** re-adds HTML scraping / browser UA / hotlink Referer
      headers that the README/PLAY_COMPLIANCE previously disclaimed — revisit
      Play submission posture before shipping to production.
- ⚠ **Deploy:** scraper runs as its own service; set matching `SCRAPER_API_KEY`
      on both sides (see README).

### Gates — Reddit-style communities in the Dungeon ✅ (2026-07-15, API E2E-tested 45/45; UI pending device test)
Owner request "Communities" built as **Gates** (manhwa dungeon-gate flavor, no
`r/` prefix — ⛩ chip instead). Unrelated to guilds; readers join many gates.
Plan: `.claude/plans/refactored-pondering-manatee.md`.
- [x] **Schema** (migration `20260715105653_gates`): `Gate` (name unique,
      emblem/colors shared with guild catalog, `visibility open|restricted|private`,
      ownerId), `GateMember` (`@@id([userId,gateId])` — many gates per reader,
      role `gatekeeper|warden|member`, `approvedPoster` for sealed gates),
      `GateJoinRequest`; `Post.gateId` + `Post.promotedAt` + indexes.
- [x] **Routes** (`api/src/routes/gates.ts`): create (5/hr, name-clash 409),
      directory (popular/new, search; **hidden gates masked in name search
      only**), detail (masked shell for outsiders), join (private → entry
      request + notification), leave (gatekeeper succession → warden → oldest,
      last-out deletes gate), requests admit/deny, members, role
      promote/demote, authorize-poster, kick, PATCH edit (visibility/name
      gatekeeper-only; **→private demotes all promoted posts**), `GET /me/gates`.
- [x] **Feed integration** (`social.ts`): posts carry `gate` payload +
      `promoted`; `POST /posts` takes `gateId` (open = anyone, sealed =
      authorized/wardens, hidden = raiders; replies inherit + viewability
      check); **promotion mechanic** — a gate post crossing
      `GATE_PROMOTION_THRESHOLD` (env, default 5) reactions gets `promotedAt`
      and surfaces on the main wall + trending (never from hidden gates;
      sticky until the gate goes private); `feed=gates` scope (joined-gates
      firehose); `GET /gates/:id/posts` (hot/new/top, pinned first,
      authorRole); pin endpoint now warden-aware; `POST /posts/:id/gate-remove`
      (status `gate_removed` — vanishes everywhere, staff pipeline untouched).
- [x] **Leak guards** (hidden gates): post detail/react/vote/quote 404,
      mentions skipped, profile posts exclude gate posts, **review aggregates
      exclude hidden-gate reviews** (closed a would-be leak into public series
      ranks — search enrichment + reviews summary), global feed/trending OR
      clause. Account deletion now runs **gate succession** per owned gate
      (same fix as the guild-orphan bug).
- [x] **Client**: Dungeon gains **THE WALL | ⛩ GATES tabs** — GATES embeds the
      directory (`GateDirectory.tsx`: debounced search, POPULAR/NEW, YOUR
      GATES section, OPEN A GATE); screens `gate/create` (visibility selector),
      `gate/[id]` (header window, ENTER/WITHDRAW/REQUEST ENTRY, hot/new/top,
      warden PIN/REMOVE rows, masked hidden shell, composer preselects the
      gate), `gate/members/[id]` (roles, AUTHORIZE, KICK, entry requests);
      **⛩ GateChip** on promoted wall cards (tap → gate); composer **POST
      INTO** picker (THE DUNGEON | my gates); MY GATES scope in the wall
      dropdown.
- [x] **E2E (45/45)**: duplicate 409 · open-gate post without joining +
      signed-out view · sealed 403 → authorize → post + outsider reply ·
      hidden-gate 404s (detail/react/feed/quote), masked search, absent from
      directory+wall · request → admit → read · promotion at threshold with
      gate payload, 1-below stays off, hidden never promotes, →private
      demotes · member pin 403, warden pin + pinned-first, gate-remove hides
      from thread, non-mod remove 403 · hidden-gate review doesn't move
      public series rank · gatekeeper leave → warden inherits → dissolve
      cascades posts. Both workspaces typecheck clean.
- Naming: OPEN/SEALED/HIDDEN gate · GATEKEEPER/WARDEN/RAIDER · ENTER/WITHDRAW/
  REQUEST ENTRY/AUTHORIZE. Fast-follows deferred: GateInvite, gate rank E→S
  flourish, gate posts on profiles.

## 🧗 Depth batch (owner-approved plan, 2026-07-15 — 8 phases)
Plan: `.claude/plans/refactored-pondering-manatee.md`. Arena boards →
permissions → board tiers → gate ranks → level milestones → items → guild
depth → XP balance.

### Depth 1 — Arena boards, snapshots, history, champion cosmetics ✅ (2026-07-15, E2E 16/16)
- [x] **`LeaderboardSnapshot`** (migration `arena_boards_snapshots`): board +
      periodKey unique, rows Json, finalizedAt. The 5-min tick **live-upserts
      this week's weekly_xp board** (the per-user weekly window is destroyed
      lazily at rollover — ≤5 min trailing imprecision accepted) and **freezes
      last week's boards once**: weekly_quests (durable via completedAt) +
      the week's top-5 series boards (durable via first-read readAt).
      Indexes: `UserQuestProgress(completedAt)`, `ReadChapter(canonicalId, readAt)`.
- [x] **Weekly champions** paid at freeze (idempotent grants + deduped
      notifications): #1 weekly_xp → **Monarch's Regalia** frame (legendary,
      seeded), #1 weekly_quests → **Weekly Sovereign** title. **Season I
      cosmetics seeded** (frame + avatar, 2026-07-20 → 08-17) using the
      previously-unused availableFrom/Until columns — auto-granted to
      champions while the window is open.
- [x] **Endpoints**: `/arena/leaderboards/weekly_quests` (completedAt window,
      me-rank), `/series/:canonicalId` (first-reads this week), `/top_series`
      (picker feed), `/history?board=` (frozen podiums, deleted users
      tolerated).
- [x] **Client**: arena hub board selector **EXP | QUESTS | SERIES** (shared
      podium + rows), top-series chip picker, collapsible **PAST WEEKS**
      frozen podium history.
- [x] E2E: 9/9 HTTP (ordering, me-ranks, 404s, regex guard) + 7/7 internals
      (freeze exactly-once, champion grants idempotent, notification dedupe).

### Depth 2 — Role permission toggles (guilds + gates) ✅ (2026-07-15, E2E 19/19)
- [x] **`permissions Json?`** on Guild + Gate (migration `role_permissions`) +
      `api/src/permissions.ts`: `hasGuildPerm`/`hasGatePerm` (leader always
      true, plain members false, officer/warden reads toggles — **missing keys
      default TRUE** so historic behavior is unchanged until tightened).
      Guild keys: approve_requests · invite · kick · edit_info · pin_board.
      Gate keys: entry_requests · authorize_posters · kick · edit_info · pin ·
      remove_posts. NOT toggleable: role changes/leadership, leader-only kick
      escalation, gate name/visibility.
- [x] **Dedicated leader-only endpoints** `PUT /guilds/:id/permissions` (GM) /
      `PUT /gates/:id/permissions` (GK) — deliberately separate from PATCH
      (officer-reachable; officers must not widen their own powers). Every
      officer/warden check across guilds.ts, gates.ts and social.ts
      (pin/gate-remove) now goes through the permission helpers; detail
      payloads expose per-capability `can` + toggle state for the leader.
- [x] **Client**: OFFICER PERMISSIONS switches in the guild editor (GM only,
      instant save); **new Gate Settings screen** (`gate/edit/[id]`) — first
      client UI for PATCH /gates/:id: description/emblem/color for wardens
      with edit rights, name/visibility + WARDEN PERMISSIONS for the
      gatekeeper; ⚙ SETTINGS key on the gate header.
- [x] E2E 19/19: defaults on, non-leader PUT 403, toggled-off invite/edit/pin/
      remove 403 while untouched powers keep working, leader unaffected,
      `can` payloads match.

### Future ideas (owner requests, 2026-07-15)
- **Guild board priorities** — posts flaggable as priority/announcement tiers
  beyond the pin (e.g. war-organization notices surfaced during an active
  guild war).
- **More depth for guilds + the account leveling system** — owner wants both
  systems to grow richer (more to do inside a guild; more meaning/progression
  attached to hunter levels). Scope to be designed together before building.

**→ NEXT: Arena PvP** (`ARENA_PLAN.md`) — the final track.
3. Arena **Draw competition** (unblocked by image storage)
4. Backlog polish batch (search autocomplete + enriched rows, guild directory
   chips, thread READ ▸, guild XP multiplier perk, motion sweep, reader parity,
   history CLEAR, doc cleanup)
5. **Web admin console** (final pre-Arena item): standalone desktop console —
   content audit, reports/appeals/audit, users, announcements composer, arena
   event creator. Vite+React SPA in `/console`, served by the API (same origin).

_Guilds Phase 4 done and **device-verified** (2026-07-12). GIPHY_API_KEY is
configured in api/.env — **last check: GIF posting + picker on device**, then
Social 3b images or Arena._



**Arena — Phase 5 (its own track):** PvP turn-based manga-character battles,
online vs other players + async — matchmaking, server-authoritative game state,
real-time sync, character roster, ranked ladder (`ARENA_PLAN.md`). The rest of
the Arena (quiz, pools, draw, leaderboards) also lives there.

**Social fast-follow:** ~~achievement auto-records~~ (cut by decision); reactions on
chapter comments ✅ (shipped 2026-07-13).
