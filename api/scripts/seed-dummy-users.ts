// Seed ~32 dummy readers who look like a real community: records, theories,
// reviews, polls, replies, chapter comments, reactions, follows, guilds
// (roles, permissions, invites, board notices), gates (all three visibility
// tiers, wardens, pins, promotions), reads, weekly boards, streaks, items.
//
//   cd api && npm run seed:dummies
//
// Every dummy signs in with the password below (see the printed roster).
// Re-running skips usernames that already exist.
import { prisma } from "../src/db/client.js";
import { hashPassword } from "../src/auth.js";
import { ensureDefaultIdentity } from "../src/identity.js";
import { currentWeekKey } from "../src/guilds.js";
import { grantItem } from "../src/items.js";
import { CURRENT_TERMS_VERSION } from "../src/policy.js";

const PASSWORD = "HunterPass123!";
const weekKey = currentWeekKey();
const now = Date.now();
const daysAgo = (d: number, jitterHours = 12) =>
  new Date(now - d * 86_400_000 + (Math.random() - 0.5) * jitterHours * 3_600_000);
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
const shuffle = <T>(arr: readonly T[]): T[] => [...arr].sort(() => Math.random() - 0.5);

// ── Personas ────────────────────────────────────────────────────────────────
// xp sets the level (level = floor(sqrt(xp/100))+1): 400→LV3, 1600→LV5, 8100→LV10.
const PERSONAS: { username: string; bio?: string; xp: number; streak: number }[] = [
  { username: "ShadowMonarch_Kai", bio: "Arise. Currently rereading everything.", xp: 9200, streak: 21 },
  { username: "gate_crasher_yuna", bio: "S-rank opinions, E-rank patience.", xp: 6400, streak: 12 },
  { username: "MurimLord", bio: "Cultivation or nothing.", xp: 5100, streak: 9 },
  { username: "panel_addict", bio: "One more chapter. Always one more.", xp: 4400, streak: 15 },
  { username: "IsekaiSkeptic", bio: "Truck-kun's strongest critic.", xp: 3900, streak: 4 },
  { username: "TowerClimber99", xp: 3300, streak: 8 },
  { username: "regressor_rin", bio: "I've read this timeline before.", xp: 2900, streak: 6 },
  { username: "BlueLockedIn", xp: 2500, streak: 3 },
  { username: "chainsaw_cathy", bio: "Denji did nothing wrong.", xp: 2200, streak: 7 },
  { username: "NoblesseOblige", xp: 1900, streak: 2 },
  { username: "mana_deficit", bio: "Running on fumes and manhwa.", xp: 1700, streak: 11 },
  { username: "VillainessStan", bio: "She was right, actually.", xp: 1500, streak: 5 },
  { username: "orv_theorist", bio: "Three ways to survive a ruined world…", xp: 1400, streak: 9 },
  { username: "DungeonResetFan", xp: 1200, streak: 1 },
  { username: "sss_reader", xp: 1000, streak: 4 },
  { username: "webtoon_wanderer", xp: 900, streak: 2 },
  { username: "KniferOfDawn", xp: 800, streak: 6 },
  { username: "plotarmor_pete", bio: "It's not plot armor if it's earned.", xp: 700, streak: 0 },
  { username: "cliffhanger_cho", xp: 650, streak: 3 },
  { username: "SilentHunterMia", xp: 550, streak: 8 },
  { username: "double_chapter_dan", xp: 500, streak: 1 },
  { username: "ArcaneArchivist", bio: "Cataloguing every awakening scene.", xp: 450, streak: 2 },
  { username: "first_clear_finn", xp: 420, streak: 0 },
  { username: "gacha_regrets", xp: 300, streak: 5 },
  { username: "MokkojiReader", xp: 260, streak: 1 },
  { username: "sidequest_sara", xp: 220, streak: 0 },
  { username: "wall_lurker", bio: "Mostly here to react.", xp: 180, streak: 2 },
  { username: "new_awakener", xp: 140, streak: 1 },
  { username: "chapter_zero", xp: 110, streak: 0 },
  { username: "quiet_bookmark", xp: 90, streak: 3 },
  { username: "prologue_paula", xp: 60, streak: 0 },
  { username: "fresh_recruit_leo", bio: "Just awakened. Be nice.", xp: 30, streak: 1 },
];

const SERIES: { title: string }[] = [
  { title: "Ashes of the Regressor" },
  { title: "Duke of the Obsidian Tower" },
  { title: "My S-Rank Party Betrayed Me" },
  { title: "Chronicles of the Mana Sea" },
  { title: "The 8th Circle Archmage Retires" },
];

const RECORD_BODIES = [
  "Just hit the midpoint of the tower arc and the pacing is unreal. Nobody spoil me.",
  "That double-page spread this week deserves to be framed. Print industry could never.",
  "Reading three series at once and every single one is on a betrayal arc. Exhausting.",
  "The art style shift after chapter 40 grew on me way more than I expected.",
  "Anyone else notice the blacksmith shows up in the background of every major fight?",
  "Finally caught up. The wait between chapters is going to physically hurt.",
  "This week's chapter was 90% reaction faces and honestly? Peak.",
  "Binged 60 chapters instead of sleeping. The gate said pull, so I pulled.",
  "The way this author writes food scenes should be illegal. I'm starving.",
  "New season, new opening chapter, same protagonist making terrible decisions.",
];
const THEORY_BODIES = [
  "Theory: the masked commander is the MC's brother from the first timeline. The sword hilt matches panel-for-panel in ch. 12.",
  "The system messages have been using 'we' instead of 'it' for three chapters. That's not a translation choice — something's inside.",
  "Calling it now: the guild master knew about the dungeon break and let it happen to force the awakening.",
  "If you re-read the prophecy with the shrine's mural in mind, the 'seventh star' has to be the healer. All the eclipse imagery points at her.",
  "The regression count isn't 3. The narration slips in chapter 8 — 'again, as always' — that's a loop way older than we think.",
  "Everyone assumes the demon king is sealed. The seal is ON the kingdom. Read the border runes again.",
];
const REVIEW_BODIES = [
  "Tight power system, zero filler, and side characters that actually matter. The rare series that respects your time.",
  "Gorgeous art carrying a mid story so far — but the last arc finally found its footing. Cautiously hopeful.",
  "Started as a generic dungeon story, quietly became the best political drama I've read this year.",
  "The MC's growth is EARNED. Every level-up costs something. More of this, please.",
  "Dropped it twice, came back twice. The hooks are shameless and they work. 4 stars and my dignity.",
  "World-building is dense in the best way — the appendix pages are a meal by themselves.",
];
const REPLY_BODIES = [
  "This is exactly what I've been saying since chapter 20!",
  "Strong disagree — the pacing argument falls apart if you read the side stories.",
  "Wait, I completely missed that panel. Going back to check right now.",
  "The translation actually softens that line a lot. The raw is way more ominous.",
  "Spoiler-adjacent but you're going to love what happens in ~10 chapters.",
  "Objection noted and overruled. The healer theory is canon in my heart.",
  "This thread is why I open this app every morning, honestly.",
  "You dropped this 👑",
  "Adding this to the guild board, the war council needs to see it.",
  "Half agree — the art peaked earlier but the writing is peaking NOW.",
  "My reread this weekend is going to be entirely because of this post.",
  "The author liked a fan theory like this once. Manifesting.",
];
const COMMENT_BODIES = [
  "That last panel gave me chills.",
  "The anatomy in this fight is wild, the rotation on that kick!",
  "Called this development three chapters ago. Vindicated.",
  "Translator note of the year, no contest.",
  "This chapter was worth the wait. Mostly.",
  "The lettering on the shout page goes so hard.",
  "Quietly the saddest chapter in the whole series.",
  "Re-reading this after the reveal hits completely differently.",
];
const GUILDS = [
  { name: "Order of the Broken Gate", tag: "OBG", emblemKey: "blade", primaryColor: "#6b5ecc", motto: "We clear what others fear." },
  { name: "Moonlit Panel Society", tag: "MPS", emblemKey: "moon", primaryColor: "#6d8fc4", motto: "Read by night, theorize by day." },
  { name: "Crimson Bookmark", tag: "CRIM", emblemKey: "flame", primaryColor: "#ce5153", motto: "Never lose your page." },
  { name: "The Side Quest Guild", tag: "SIDE", emblemKey: "wing", primaryColor: "#56a87b", motto: "The main story can wait." },
];
const GATES = [
  { name: "Regressor Theorycraft", visibility: "open", emblemKey: "eye", primaryColor: "#6b5ecc", description: "Timeline charts, loop-count debates, prophecy math." },
  { name: "Panel Appreciation", visibility: "open", emblemKey: "flame", primaryColor: "#cda45e", description: "Post the spreads that rewired your brain." },
  { name: "Manhwa Recommendations", visibility: "open", emblemKey: "crest", primaryColor: "#56a87b", description: "Tell us what to read next. Be honest." },
  { name: "Spoiler Vault", visibility: "restricted", emblemKey: "tower", primaryColor: "#ce5153", description: "Raw readers only. Authorized posters keep the vault sealed." },
  { name: "Translation Corner", visibility: "restricted", emblemKey: "fang", primaryColor: "#6d8fc4", description: "TL notes, raw comparisons, nuance debates." },
  { name: "The Inner Sanctum", visibility: "private", emblemKey: "moon", primaryColor: "#a79fe3", description: "You weren't supposed to find this." },
] as const;

async function main() {
  console.log("── Seeding dummy community ─────────────────────────────");

  // 1. Canonical series (skip existing by title).
  const seriesIds: string[] = [];
  for (const s of SERIES) {
    const existing = await prisma.canonicalSeries.findFirst({ where: { title: s.title } });
    if (existing) {
      seriesIds.push(existing.id);
      continue;
    }
    const row = await prisma.canonicalSeries.create({
      data: { title: s.title, normTitles: [s.title.toLowerCase()] },
    });
    seriesIds.push(row.id);
  }
  console.log(`series ready: ${seriesIds.length}`);

  // 2. Users.
  const users: { id: string; username: string; xp: number }[] = [];
  for (const p of PERSONAS) {
    const existing = await prisma.user.findUnique({ where: { username: p.username } });
    if (existing) {
      users.push({ id: existing.id, username: p.username, xp: existing.xp });
      continue;
    }
    const createdAt = daysAgo(20 + Math.random() * 40);
    const user = await prisma.user.create({
      data: {
        username: p.username,
        email: `${p.username.toLowerCase()}@dummy.mangadamia.test`,
        passwordHash: hashPassword(PASSWORD),
        acceptedTermsVersion: CURRENT_TERMS_VERSION,
        acceptedTermsAt: createdAt,
        ageConfirmedAt: createdAt,
        createdAt,
        bio: p.bio ?? null,
        xp: p.xp,
        streakDays: p.streak,
        streakDayKey: p.streak > 0 ? new Date().toISOString().slice(0, 10) : null,
        lastActiveAt: daysAgo(Math.random() * 2),
      },
    });
    await ensureDefaultIdentity(user.id);
    users.push({ id: user.id, username: p.username, xp: p.xp });
  }
  console.log(`users ready: ${users.length}`);
  const byName = new Map(users.map((u) => [u.username, u]));
  const active = users.slice(0, 20); // the chattier crowd

  // 3. Reads — history spread over 3 weeks + some this week (feeds series
  // boards + read counts).
  let readRows = 0;
  for (const u of users) {
    const seriesCount = 1 + Math.floor(Math.random() * 3);
    for (const canonicalId of shuffle(seriesIds).slice(0, seriesCount)) {
      const chapters = 3 + Math.floor(Math.random() * 25);
      const start = 1 + Math.floor(Math.random() * 30);
      const rows = Array.from({ length: chapters }, (_, i) => ({
        userId: u.id,
        canonicalId,
        chapterNumber: start + i,
        readAt: daysAgo(Math.random() * 16),
      }));
      const created = await prisma.readChapter.createMany({ data: rows, skipDuplicates: true });
      readRows += created.count;
    }
  }
  console.log(`chapter reads: ${readRows}`);

  // 4. Top-level posts (records, theories, reviews, one poll each for a few).
  const postIds: { id: string; userId: string }[] = [];
  const mkPost = async (
    userId: string,
    data: {
      body: string;
      kind: string;
      title?: string;
      rating?: number;
      canonicalId?: string;
      gateId?: string;
      guildId?: string;
      isSpoiler?: boolean;
      createdAt: Date;
      pollOptions?: string[];
      pinned?: boolean;
      announcement?: boolean;
      promotedAt?: Date | null;
    },
  ) => {
    const post = await prisma.post.create({
      data: {
        userId,
        body: data.body,
        kind: data.kind,
        title: data.title ?? null,
        rating: data.rating ?? null,
        canonicalId: data.canonicalId ?? null,
        gateId: data.gateId ?? null,
        guildId: data.guildId ?? null,
        isSpoiler: data.isSpoiler ?? false,
        createdAt: data.createdAt,
        pinned: data.pinned ?? false,
        announcement: data.announcement ?? false,
        promotedAt: data.promotedAt ?? null,
        ...(data.canonicalId
          ? { seriesTags: { create: [{ canonicalId: data.canonicalId, position: 0 }] } }
          : {}),
        ...(data.pollOptions
          ? { pollOptions: { create: data.pollOptions.map((text, position) => ({ text, position })) } }
          : {}),
      },
    });
    return post;
  };

  for (let i = 0; i < 46; i++) {
    const author = pick(active);
    const roll = Math.random();
    const createdAt = daysAgo(Math.random() * 12);
    if (roll < 0.42) {
      const post = await mkPost(author.id, {
        body: pick(RECORD_BODIES),
        kind: "record",
        title: Math.random() < 0.3 ? "Tonight's reading log" : undefined,
        canonicalId: Math.random() < 0.5 ? pick(seriesIds) : undefined,
        createdAt,
      });
      postIds.push({ id: post.id, userId: author.id });
    } else if (roll < 0.68) {
      const post = await mkPost(author.id, {
        body: pick(THEORY_BODIES),
        kind: "theory",
        title: Math.random() < 0.6 ? "THEORY — read before next chapter" : undefined,
        canonicalId: pick(seriesIds),
        isSpoiler: Math.random() < 0.3,
        createdAt,
      });
      postIds.push({ id: post.id, userId: author.id });
    } else if (roll < 0.9) {
      const post = await mkPost(author.id, {
        body: pick(REVIEW_BODIES),
        kind: "review",
        rating: 3 + Math.floor(Math.random() * 3),
        canonicalId: pick(seriesIds),
        createdAt,
      });
      postIds.push({ id: post.id, userId: author.id });
    } else {
      const post = await mkPost(author.id, {
        body: "Settle this for the guild: which arc genre is eating this year?",
        kind: "poll",
        pollOptions: ["Tower climbs", "Regression", "Academy", "Cooking, unironically"],
        createdAt,
      });
      postIds.push({ id: post.id, userId: author.id });
      // A few votes.
      const options = await prisma.pollOption.findMany({ where: { postId: post.id } });
      for (const voter of shuffle(users).slice(0, 6)) {
        if (voter.id === author.id) continue;
        await prisma.pollVote.create({
          data: { userId: voter.id, postId: post.id, optionId: pick(options).id },
        }).catch(() => {});
      }
    }
  }
  console.log(`wall posts: ${postIds.length}`);

  // 5. Replies (nested one level, correct rootId).
  let replyCount = 0;
  for (const parent of postIds) {
    const replies = Math.floor(Math.random() * 4);
    for (let i = 0; i < replies; i++) {
      const author = pick(users);
      const reply = await prisma.post.create({
        data: {
          userId: author.id,
          body: pick(REPLY_BODIES),
          kind: "record",
          parentId: parent.id,
          rootId: parent.id,
          createdAt: daysAgo(Math.random() * 8),
        },
      });
      replyCount++;
      // Occasionally a nested reply.
      if (Math.random() < 0.3) {
        await prisma.post.create({
          data: {
            userId: pick(users).id,
            body: pick(REPLY_BODIES),
            kind: "record",
            parentId: reply.id,
            rootId: parent.id,
            createdAt: daysAgo(Math.random() * 6),
          },
        });
        replyCount++;
      }
    }
  }
  console.log(`replies: ${replyCount}`);

  // 6. Reactions on posts (each user reacts to a spread of posts).
  const REACTIONS = ["like", "hype", "mindblown", "pain", "dead"];
  let reactionCount = 0;
  for (const u of users) {
    for (const post of shuffle(postIds).slice(0, 4 + Math.floor(Math.random() * 8))) {
      if (post.userId === u.id) continue;
      await prisma.postLike
        .create({
          data: { userId: u.id, postId: post.id, type: pick(REACTIONS), createdAt: daysAgo(Math.random() * 7) },
        })
        .then(() => reactionCount++)
        .catch(() => {});
    }
  }
  console.log(`reactions: ${reactionCount}`);

  // 7. Chapter comments.
  let commentCount = 0;
  for (let i = 0; i < 55; i++) {
    await prisma.comment.create({
      data: {
        userId: pick(users).id,
        canonicalId: pick(seriesIds),
        chapterNumber: 1 + Math.floor(Math.random() * 40),
        body: pick(COMMENT_BODIES),
        isSpoiler: Math.random() < 0.15,
        createdAt: daysAgo(Math.random() * 12),
      },
    });
    commentCount++;
  }
  console.log(`chapter comments: ${commentCount}`);

  // 8. Follows (a loose web).
  let followCount = 0;
  for (const u of users) {
    for (const target of shuffle(users).slice(0, 2 + Math.floor(Math.random() * 5))) {
      if (target.id === u.id) continue;
      await prisma.follow
        .create({ data: { followerId: u.id, followingId: target.id, status: "accepted" } })
        .then(() => followCount++)
        .catch(() => {});
    }
  }
  console.log(`follows: ${followCount}`);

  // 9. Guilds — 4 guilds, one-guild-per-reader, roles, xp levels, board
  // posts (incl. a pinned note + a NOTICE), permission tweak, pending
  // invites/requests.
  const unassigned = shuffle(users);
  const guildXp = [14_000, 6_000, 2_600, 900]; // LV6 / LV4 / LV3 / LV2
  for (let gi = 0; gi < GUILDS.length; gi++) {
    const def = GUILDS[gi];
    if (await prisma.guild.findFirst({ where: { name: def.name } })) continue;
    const roster = unassigned.splice(0, 5 + Math.floor(Math.random() * 3));
    if (roster.length < 3) break;
    const gm = roster[0];
    const guild = await prisma.guild.create({
      data: {
        name: def.name,
        tag: def.tag,
        emblemKey: def.emblemKey,
        primaryColor: def.primaryColor,
        motto: def.motto,
        xp: guildXp[gi] ?? 800,
        guildmasterId: gm.id,
        ...(gi === 0 ? { permissions: { officer: { invite: false } } } : {}),
        members: {
          create: roster.map((member, idx) => ({
            userId: member.id,
            role: idx === 0 ? "guildmaster" : idx === 1 ? "officer" : "member",
            contributionXp: Math.floor(Math.random() * 2000),
            weeklyXp: Math.floor(Math.random() * 220),
            weekKey,
          })),
        },
      },
    });
    // Guild XP transactions this week (war scoring realism).
    for (const member of roster) {
      await prisma.guildXpTransaction.create({
        data: { guildId: guild.id, userId: member.id, delta: 20 + Math.floor(Math.random() * 120) },
      });
    }
    // Board chatter + a pinned note + a war NOTICE.
    const boardPosts = [
      { body: "Weekly raid target is close — everyone file your chapters tonight!", pinned: false, announcement: false },
      { body: "Recruiting one more theory-brained reader. Send them our way.", pinned: true, announcement: false },
      { body: "⚔ WAR ORDERS: focus reads on the tower series, reactions on everything. We do NOT lose this week.", pinned: false, announcement: true },
      { body: pick(RECORD_BODIES), pinned: false, announcement: false },
    ];
    for (const bp of boardPosts) {
      await mkPost(pick(roster).id, {
        body: bp.body,
        kind: "record",
        guildId: guild.id,
        pinned: bp.pinned,
        announcement: bp.announcement,
        createdAt: daysAgo(Math.random() * 5),
      });
    }
    // A pending join request + invite for realism.
    const outsiderPool = users.filter((u) => !roster.some((r) => r.id === u.id));
    const requester = outsiderPool[gi * 2];
    const invitee = outsiderPool[gi * 2 + 1];
    if (requester) {
      const requesterInGuild = await prisma.guildMember.findUnique({ where: { userId: requester.id } });
      if (!requesterInGuild) {
        await prisma.guildJoinRequest
          .create({ data: { guildId: guild.id, userId: requester.id } })
          .catch(() => {});
      }
    }
    if (invitee) {
      const inviteeInGuild = await prisma.guildMember.findUnique({ where: { userId: invitee.id } });
      if (!inviteeInGuild) {
        await prisma.guildInvite
          .create({ data: { guildId: guild.id, userId: invitee.id, invitedById: gm.id } })
          .catch(() => {});
      }
    }
    console.log(`guild ready: ${def.name} (${roster.length} members)`);
  }

  // 10. Gates — all three tiers, wardens, authorized posters, gate posts,
  // pins/notices, promoted-to-wall posts, hidden-gate entry requests, and a
  // permission tweak.
  for (let gi = 0; gi < GATES.length; gi++) {
    const def = GATES[gi];
    if (await prisma.gate.findFirst({ where: { name: def.name } })) continue;
    const roster = shuffle(users).slice(0, 6 + Math.floor(Math.random() * 8));
    const gk = roster[0];
    const gate = await prisma.gate.create({
      data: {
        name: def.name,
        description: def.description,
        emblemKey: def.emblemKey,
        primaryColor: def.primaryColor,
        visibility: def.visibility,
        ownerId: gk.id,
        ...(gi === 1 ? { permissions: { warden: { pin: false } } } : {}),
        members: {
          create: roster.map((member, idx) => ({
            userId: member.id,
            role: idx === 0 ? "gatekeeper" : idx === 1 ? "warden" : "member",
            approvedPoster: def.visibility === "restricted" ? idx < 4 : false,
          })),
        },
      },
    });
    // Gate posts: some hot enough to promote onto the wall (open/sealed only).
    const gatePostCount = 4 + Math.floor(Math.random() * 5);
    for (let i = 0; i < gatePostCount; i++) {
      const author = pick(roster);
      const hot = def.visibility !== "private" && i === 0;
      const post = await mkPost(author.id, {
        body: pick([...THEORY_BODIES, ...RECORD_BODIES]),
        kind: Math.random() < 0.4 ? "theory" : "record",
        title: Math.random() < 0.35 ? `From the ${def.name} floor` : undefined,
        gateId: gate.id,
        canonicalId: Math.random() < 0.4 ? pick(seriesIds) : undefined,
        createdAt: daysAgo(Math.random() * 6),
        pinned: i === 1,
        announcement: i === 2 && Math.random() < 0.5,
        promotedAt: hot ? daysAgo(Math.random() * 2) : null,
      });
      // Reactions inside the gate (promoted ones get plenty).
      for (const reactor of shuffle(users).slice(0, hot ? 8 : 3)) {
        if (reactor.id === author.id) continue;
        await prisma.postLike
          .create({ data: { userId: reactor.id, postId: post.id, type: pick(REACTIONS) } })
          .catch(() => {});
      }
      // A couple of replies.
      for (const replier of shuffle(roster).slice(0, 2)) {
        await prisma.post.create({
          data: {
            userId: replier.id,
            body: pick(REPLY_BODIES),
            kind: "record",
            parentId: post.id,
            rootId: post.id,
            gateId: gate.id,
            createdAt: daysAgo(Math.random() * 4),
          },
        });
      }
    }
    // Hidden gate: pending entry requests.
    if (def.visibility === "private") {
      for (const requester of shuffle(users.filter((u) => !roster.some((r) => r.id === u.id))).slice(0, 3)) {
        await prisma.gateJoinRequest
          .create({ data: { gateId: gate.id, userId: requester.id } })
          .catch(() => {});
      }
    }
    console.log(`gate ready: ${def.name} [${def.visibility}] (${roster.length} raiders)`);
  }

  // 11. Weekly boards: weeklyXp windows + quest completions this week.
  const boardUsers = shuffle(users).slice(0, 16);
  for (const u of boardUsers) {
    await prisma.user.update({
      where: { id: u.id },
      data: { weeklyXp: 20 + Math.floor(Math.random() * 400), weekKey },
    });
  }
  const questIds = ["daily-three", "daily-voice", "weekly-twenty"];
  let questRows = 0;
  for (const u of shuffle(users).slice(0, 14)) {
    const completions = 1 + Math.floor(Math.random() * 6);
    for (let i = 0; i < completions; i++) {
      const dayOffset = Math.floor(Math.random() * 5);
      const day = new Date(new Date(`${weekKey}T00:00:00Z`).getTime() + dayOffset * 86_400_000);
      const questId = pick(questIds);
      await prisma.userQuestProgress
        .create({
          data: {
            userId: u.id,
            questId,
            periodKey: questId === "weekly-twenty" ? weekKey : `${day.toISOString().slice(0, 10)}`,
            progress: 3,
            completedAt: new Date(day.getTime() + Math.random() * 60_000_000),
          },
        })
        .then(() => questRows++)
        .catch(() => {});
    }
  }
  console.log(`weekly quest completions: ${questRows}`);

  // 12. Items for a handful of inventories.
  for (const u of shuffle(users).slice(0, 10)) {
    await grantItem(u.id, pick(["xp-elixir-s", "streak-shield", "gate-key", "monarch-chest"]), 1, "seed", `seed:${u.username}`, false);
  }
  console.log("items sprinkled: 10");

  console.log("\n── Done ────────────────────────────────────────────────");
  console.log(`All dummy accounts sign in with password: ${PASSWORD}`);
  console.log("Sample logins:");
  for (const u of users.slice(0, 5)) {
    console.log(`  ${u.username.toLowerCase()}@dummy.mangadamia.test  ·  @${u.username}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
