# System Protocol (2a/3x) — Implementation Wiring Guide

How each redesigned surface maps onto the existing `hansmel21/mangadamia` codebase. Everything reuses your INKLIGHT tokens (`app/src/theme.ts`) plus two additions, and your existing API/query layer wherever possible. New backend work is flagged ⚠.

## 0 · Token & primitive changes (do these first)

**theme.ts additions**
- `data: "#54D6FF"` — cyan "System data" accent for OPEN THREAD ▸ / ALL ▸ / FULL BOARD ▸ links.
- `surface: "#10121a"` (card surface on the new near-black `bg2: "#0a0b10"`), `hairline: "#1c2029"`.
- Radii convention: **3–4px on all System chrome** (buttons, chips, inputs, cards), 8–11px only for avatars. Replace current mixed 8/10/12/14 radii.

**SystemWindow.tsx** — extend, don't replace:
- New props: `accent?: string` (recolors border + corner brackets: red for war, gold for quests/requests, blue for theory threads), `notch?: {label, color}` (the floating label that breaks the top border — the post-kind notch), and `size?: "mini"` (9–11px corners, 1px border, no diamond header) for post cards and inline panels.
- Keep the existing open/close CRT choreography from `SystemModal.tsx` untouched — it is now also used by the search bar focus (see §4) and the composer sheet.

**New shared components**
- `HunterAvatar.tsx` — replaces round `ReaderAvatar` with the squircle (radius ~28%) avatar + **rank sigil chip** pinned bottom-right (reuses `hunterRankForLevel` + `rankColors` from `ranks.ts`, 14–17px, border 1.3px, bg color+1A). Rarity frame ring + glow logic carries over from `ReaderAvatar`.
- `GuildChip.tsx` — emblem glyph (existing `GuildCrest` SVG glyphs) + full guild name or `[TAG]`, tinted by `guild.primaryColor`. Used in post headers, boards, war cards.
- `SystemKey.tsx` — the new button. Variants: `primary` (gradient `#7c5cff→#6247d1`, radius 3, glow shadow, `▸ LABEL` 900/ls2), `outline` (1px `border` color, muted label), `active-chip` (purple .18 bg + 1.5px .7 border + ◆ prefix). Replaces all current Pressable one-off styles.
- `ScreenTitle.tsx` — the bracketed page title (2px corner ticks on a 1.5px bordered label, Bricolage 800 18px). Replaces the native header title; set `headerShown: false` and render in-screen.

## 1 · Navigation (`app/app/(tabs)/_layout.tsx`)

- 4 tabs → **5 keys**: `HOME (compass)` = current index.tsx · `GUILD (shield)` = guilds route promoted from HeaderMenu into a tab · `DUNGEON` center diamond = feed.tsx · `ARENA (trophy)` = arena.tsx promoted · `STATUS (circle-user)` = account.tsx.
- Center key: 58px square rotated 45°, 2px accent border + glow when active (`tabBarButton` custom component, translateY −18).
- `HeaderMenu.tsx` is **deleted**; its remaining entries move: Notifications → bell key on Home + Status headers (`notifCount` query unchanged), Quests → entry points on Status ("ALL QUESTS ▸") and Home daily-directive strip.
- Unread badge moves from Account tab to the STATUS key (same `tabBarBadge` wiring).

## 2 · Dungeon feed (`feed.tsx` + `PostCard.tsx`)

- Header = ScreenTitle "DUNGEON" + **online counter** (⚠ new endpoint `GET /presence/count`, or approximate with active-sessions-last-15-min; poll 60s like notifCount).
- **Raid-thread ticker**: top post by comments-per-hour. ⚠ extend feed API with `GET /posts/trending?window=1h` (rank by recent comment count). Tap → thread route.
- Filter deck: merges the old typeTabs + scope + sort rows into ONE row. Chips ALL/THEORIES/REVIEWS map to existing `typeFilter`; **GUILD** chip = new `feedMode: "guild"` (⚠ server: filter posts by author.guildId = viewer's guild). HOT key cycles hot/top/new (existing `sort` state).
- **PostCard rework**: mini SystemWindow (`size="mini"`, 2 top corner ticks) with the kind label as a `notch` breaking the top border (kind colors from `POST_KINDS`). Header row = HunterAvatar 38 + username + LV + time; second line = GuildChip + TitleFlair. Series embed becomes the slim left-accent-bar row (bg `bg2`, borderLeft 2px accent). Action rail = SystemKey chips: my-reaction chip (emoji + count, purple when reacted — same `reactToPost` optimistic patch), comment count, share; right link `OPEN THREAD ▸` in `colors.data`.
- **Guild-war rally card**: injected into the feed list as a pinned item when the viewer's guild has an active war (⚠ new `GET /guilds/:id/war` — see §6). Red-tinted gradient card, both emblems, score bar (flex widths = score ratio), personal contribution line.
- FAB → `NEW RECORD` SystemKey (gradient, pen icon), opens composer.

## 3 · Composer (`PostComposer.tsx`)

- Becomes a bottom sheet with SystemWindow top border + corner ticks (reuse SystemModal choreography, anchored bottom).
- Kind selector: 5 equal SystemKey tiles (emoji + label) — same `kind` state as today.
- **Auto-tag**: prefill the series/chapter row from the reader's last read position (`library.ts` history) with an ✕ to remove — currently manual tagging.
- Spoiler shield toggle inline (existing `isSpoiler` flag); char counter; publish = primary SystemKey. Footer XP hint reads from quests state ("first record today" daily).

## 4 · Home + Search (`(tabs)/index.tsx`)

- Header: bracketed wordmark MANGADAMIA (left) + bell key with count + **hunter chip** (avatar + LV + micro XP bar, from the `me` query) → taps to STATUS. This replaces the hamburger.
- **Search key**: full-width command input, 1.5px purple border with 2 corner ticks, SAFE badge (MangaDex safe rating, static). Keep the scroll hide/show but reuse the existing System collapse animation (already written — `hideBar/showBar`).
- **Focus state** (new): border →.8 + glow, rest of screen dims; panel shows TOP MATCH (instant lookup against library + catalog `searchAll` debounced), RECENT SCANS (existing `listRecentSearches`), TRENDING IN THE DUNGEONS (⚠ same `posts/trending` endpoint, grouped by tag).
- **Results**: result meta row (count + ALL/ONGOING/DONE chips = existing `status` filter, restyled as SystemKey chips). Rows add: series rank sigil (from server `ranks.ts` scale), ★ rating + reads + posts/hr, right-aligned `IN LIBRARY` (cyan) / `+ LIBRARY` (purple) action — wire to library add/remove.
- Hero: framed SystemWindow (corner brackets) instead of full-bleed; buttons = CONTINUE CH.n (reader route w/ stored progress) + WALL (series wall route). TOP-n notch top-left.
- Daily-directive strip under hero: top uncompleted daily from `api.quests` (already polled) with progress bar + XP; taps into the quest's deep link.
- Rails unchanged data-wise (`browseLatest/browseNew/ranks/recommended`), restyled: square corners, CH.n corner badge on latest covers.

## 5 · Thread view (`app/post/[id].tsx` + PostCard thread mode)

- Root post = full SystemWindow with 4 corner brackets, kind-colored ScreenTitle ("THEORY THREAD"), OP badge, series row gains `READ ▸` deep link.
- Reply sort row (TOP ◆ / NEW): ⚠ add `sort` param to the thread endpoint (currently chronological only).
- Replies = flat cards; **one** indent level with the purple rail (existing `replyIndent` style), deeper levels collapse behind `▾ N MORE REPLIES` (client-side: render depth ≤1, group the rest — replaces depth-6 indent cap).
- Spoiler replies collapse to a one-line dashed shield chip (existing reveal-whole-thread behavior).
- Sticky reply bar: avatar + input + gradient send key (replaces the reply-per-card buttons for top-level replies; per-card REPLY still sets the parent id).

## 6 · Guild — the big one

**Directory (`guilds.tsx`)** — for guildless users: recruit SystemWindow ("UNAFFILIATED HUNTER DETECTED", FOUND A GUILD primary key — existing `/guild/create` route; +10% XP copy ⚠ implies a server XP multiplier for guild members). Leaderboard rows add war status chips (`AT WAR` / `RECRUITING` from joinPolicy + war state) and ⚔ power; #1 gets gold-tinted card. Sort dropdown = existing `level` sort param.

**Guild Hall (`guild/[id].tsx`)** — HALL/ROSTER tabs replaced by a scrolling home base:
1. Banner: emblem + name + LV/⚔/online count (⚠ presence per guild) + slim XP bar (existing xp/xpFloor math).
2. **War window** (red SystemWindow): ⚠ new model `GuildWar {id, weekNo, guildA, guildB, scoreA, scoreB, endsAt}`; score = sum of member GXP earned during the war window (you already track `weeklyXp` per member — war score can be derived from it). Buttons: CONTRIBUTE (→ Dungeon feed), HISTORY (⚠ `GET /guilds/:id/wars`).
3. Quick keys: BOARD / RAIDS / ROSTER / MANAGE (manage visible for GM/officer — existing `myRole` checks).
4. **Guild raid** (gold card): ⚠ new model `GuildRaid {questId, target, progress, rewardId, resetsAt}` — a shared weekly quest; progress = sum of member chapter completions (hook into the same event that feeds personal quests in `api/src/quests.ts`).
5. **Board preview** (3 latest) → full board screen: ⚠ new `GuildPost` model (guild-scoped posts, reuse Post table with `guildId` + `pinned` flag; GM/officer can pin — the 📌 row). Reuses composer + reactions.

**Roster (3d)** — join-requests window (existing `pendingRequests` + `answerGuildRequest`), enriched with applicant LV/rank/chapters (⚠ include stats in the request payload). Member rows: rank-ordered by `weeklyXp` (data exists), online dot (presence), role chips, `idle Nd` from lastActiveAt (⚠ expose), ⋯ opens the existing MemberManageModal unchanged.

## 7 · Arena (`arena.tsx`) — replaces the stub, per ARENA_PLAN
- Header: ARENA ScreenTitle + week/countdown (server week number).
- **Quiz card**: `ArenaEvent {type: quiz, seriesId, questions, opensAt, closesAt}` ⚠ full backend from ARENA_PLAN.md; LIVE chip + entries count; ENTER QUIZ primary key → quiz runner screen; reward = title + XP through the existing rewards system (`RewardInfo`).
- **Draw competition**: entries as images ⚠ (needs upload policy exception or off-app hosting — flagged, since current policy is no uploads); voting = one vote per user, reuse poll vote plumbing.
- **Weekly EXP board**: podium (top 3) + pinned own-rank row — server already tracks weekly XP; ⚠ endpoint `GET /leaderboard/weekly?around=me`.
- **Prediction pool**: literally a system Poll with a deadline + XP payout on resolution (reuse `PollView` vote wiring; ⚠ resolution job).

## 8 · Status (`(tabs)/account.tsx`)
- Header: STATUS ScreenTitle + bell + settings key (settings key opens the old menu rows — edit profile, legal, sign-out — as a pushed screen; keeps this screen a pure character sheet).
- Identity: HunterAvatar 88 wrapped in an **XP ring** (SVG circle, dashoffset = xp progress — same math as current xpFill) + rank sigil; title flair + guild chip; LV + "n XP to LV n+1".
- **HUNTER RECORD window**: 6-stat grid = existing `me.stats` (+ ⚠ `dayStreak`, `weeklyRank` — streak needs a server counter; weeklyRank from the leaderboard endpoint).
- **EQUIPPED slots** (TITLE/FRAME/AVATAR): current equip flows (`equipTitle`, appearance screen) surfaced as three slot cards; tap → the existing modals.
- Badges rail: horizontal `BadgeMedallion` row (earned glow, locked 35% opacity — existing), ALL ▸ → badge grid screen.
- TODAY'S QUESTS strip: same `api.quests` data filtered to daily; checkmarks + strikethrough when complete; ALL QUESTS ▸ → Quest Log.

## 9 · Quest Log (`quests.tsx`)
- Cadence chips (DAILY n/n, WEEKLY, SEASON, MILESTONE) filter the existing quest list client-side; live reset countdown in header (`resetsAt`).
- **Chain bonus** row: ⚠ new server rule — completing all dailies grants +100 XP (one synthetic quest).
- Quest cards: done = gold "CLAIMED", active = corner-ticked card with `GO TO DUNGEON ▸` **deep link per quest** (⚠ add `deepLink` field to quest payload, e.g. route + params); epic/seasonal quests get rarity-tinted gradient (reuse `rarityColors`).
- Detail modal unchanged (SystemModal) — restyle only.

## 10 · Library (`(tabs)/library.tsx`)
- ARCHIVE ScreenTitle + SYNCED cloud state (existing sync.ts status).
- **RESUME EXPEDITION** window: most-recent history row (title, ch, page, % bar) + gradient play key → reader.
- Shelf chips READING/CAUGHT UP/DONE = client filter on unread counts (data in local library DB).
- Grid cards: square corners, purple `+n` unread badge (chapters ahead of progress), bottom progress hairline (purple reading / green caught-up), dashed ADD SERIES tile → Home search.

## Motion (all screens)
- Every window/sheet/tray opens with the existing CRT line-stretch→spring (SystemModal/ReactionBar code — extract to `anim.ts` as `useCrtOpen`).
- Pulse-glow keyframe (online dots, LIVE chips): 2s opacity .55↔1.
- Progress bars animate width on mount (Animated.timing 400ms out-cubic).
- Tab change: existing `shift` animation stays; center Dungeon key gets a 150ms glow-in when activated.

## Suggested build order
1. Tokens + SystemKey/HunterAvatar/GuildChip/ScreenTitle primitives (§0)
2. Nav restructure (§1) — pure client
3. Feed + PostCard + composer + thread (§2/3/5) — mostly client, 2 small endpoints (trending, guild feed)
4. Status + Quest Log + Library + Home/Search (§8/9/10/4) — client + 3 small endpoints
5. Guild base: board → raid → war (§6) — biggest server lift, ship in that order
6. Arena (§7) — per ARENA_PLAN, quiz first
