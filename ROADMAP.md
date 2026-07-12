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

**Next phases (build order):** Feed layout (ticker/filter deck/online) + Composer
sheet + Thread view → Home/Search + Status + Quest Log + Library/History → full
Guild Hall (war/raid/board, ⚠ backend) → Arena (⚠ backend). See
`NOT_YET_IMPLEMENTED.md` for the endpoint list.

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
