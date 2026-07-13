// Accounts + per-chapter comments and likes.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createSession,
  getUser,
  hashPassword,
  publicUser,
  requireAcceptedTerms,
  requireActiveUser,
  requireUser,
  verifyPassword,
} from "../auth.js";
import {
  BADGES,
  evaluateBadges,
  getStats,
  levelForXp,
  xpForLevel,
} from "../badges.js";
import { prisma } from "../db/client.js";
import { ensureDefaultIdentity, identitiesForUsers, identityForUser } from "../identity.js";
import { createNotification } from "../notifications.js";
import { bumpWeeklyXp } from "../arena.js";
import { bumpGuildEvent, bumpGuildRaid, creditGuild, currentWeekKey } from "../guilds.js";
import { isReactionType, seriesRankForAverage } from "../ranks.js";
import { CURRENT_TERMS_VERSION, validateGifUrl, validateUserContent } from "../policy.js";
import { isStoredImageUrl } from "../storage.js";
import { questListForUser, recordActivity } from "../quests.js";
import { deleteUserCompletely } from "../accounts.js";

const registerBody = z.object({
  email: z.string().email().max(200),
  username: z
    .string()
    .min(3)
    .max(20)
    .regex(/^[a-zA-Z0-9_]+$/, "letters, numbers and _ only"),
  password: z.string().min(8).max(200),
  acceptedTermsVersion: z.literal(CURRENT_TERMS_VERSION),
  ageConfirmed: z.literal(true),
});

const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const commentBody = z.object({
  body: z.string().trim().min(1).max(1000),
  parentId: z.string().optional(),
  isSpoiler: z.boolean().optional().default(false),
});

const commentParams = z.object({
  canonicalId: z.string().min(1),
  chapterNumber: z.coerce.number(),
});

function httpError(statusCode: number, message: string): Error {
  return Object.assign(new Error(message), { statusCode });
}

function extractMentions(body: string): string[] {
  const seen = new Set<string>();
  for (const match of body.matchAll(/(^|[^a-zA-Z0-9_])@([a-zA-Z0-9_]{3,20})\b/g)) {
    seen.add(match[2].toLowerCase());
  }
  return [...seen];
}

async function notifyMentions({
  authorId,
  authorUsername,
  body,
  targetUrl,
  targetKind,
  targetId,
  metadata,
  postId,
  commentId,
}: {
  authorId: string;
  authorUsername: string;
  body: string;
  targetUrl: string;
  targetKind: "post" | "comment";
  targetId: string;
  metadata: Record<string, unknown>;
  postId?: string;
  commentId?: string;
}): Promise<void> {
  const names = extractMentions(body);
  if (names.length === 0) return;
  const [blockedIds, mentionedUsers] = await Promise.all([
    hiddenUserIds(authorId),
    prisma.user.findMany({
      where: {
        status: "active",
        OR: names.map((name) => ({ username: { equals: name, mode: "insensitive" as const } })),
      },
      select: { id: true, username: true },
    }),
  ]);
  const hidden = new Set(blockedIds);
  for (const mentioned of mentionedUsers) {
    if (mentioned.id === authorId || hidden.has(mentioned.id)) continue;
    await createNotification({
      userId: mentioned.id,
      actorId: authorId,
      kind: "mention",
      title: "You were mentioned",
      safeBody: `@${authorUsername} mentioned you.`,
      targetUrl,
      metadata: { ...metadata, mentionedUsername: mentioned.username },
      dedupeKey: `mention:${targetKind}:${targetId}:${mentioned.id}`,
      postId,
      commentId,
    });
  }
}

async function hiddenUserIds(userId: string): Promise<string[]> {
  const rows = await prisma.block.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true },
  });
  return rows.map((row) => (row.blockerId === userId ? row.blockedId : row.blockerId));
}

export function registerSocialRoutes(app: FastifyInstance): void {
  // ── Accounts ──────────────────────────────────────────────────────────
  app.post(
    "/auth/register",
    { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } },
    async (req) => {
    const { email, username, password, acceptedTermsVersion } = registerBody.parse(req.body);
    const clash = await prisma.user.findFirst({
      where: {
        OR: [
          { email: email.toLowerCase() },
          { username: { equals: username, mode: "insensitive" } },
        ],
      },
    });
    if (clash) {
      throw httpError(
        409,
        clash.email === email.toLowerCase() ? "Email already registered" : "Username taken",
      );
    }
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        username,
        passwordHash: hashPassword(password),
        acceptedTermsVersion,
        acceptedTermsAt: new Date(),
        ageConfirmedAt: new Date(),
      },
    });
    await ensureDefaultIdentity(user.id);
    return { token: await createSession(user.id), user: publicUser(user) };
    },
  );

  app.post(
    "/auth/login",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (req) => {
    const { email, password } = loginBody.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw httpError(401, "Wrong email or password");
    }
    if (user.status === "banned") throw httpError(403, "This account has been banned");
    return { token: await createSession(user.id), user: publicUser(user) };
    },
  );

  app.post("/auth/logout", async (req) => {
    const auth = req.headers.authorization;
    if (auth?.startsWith("Bearer ")) {
      await prisma.session.deleteMany({ where: { token: auth.slice(7) } });
    }
    return { ok: true };
  });

  app.get("/me", async (req) => {
    const user = await requireUser(req);
    // Evaluate here too — it's what eventually grants account-age badges
    await evaluateBadges(user.id);
    const [stats, owned, fresh, followerCount, followingCount, pendingFollowCount, identity] = await Promise.all([
      getStats(user.id),
      prisma.userBadge.findMany({ where: { userId: user.id } }),
      prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        include: {
          titles: { include: { title: true }, orderBy: { unlockedAt: "asc" } },
          cosmetics: { include: { cosmetic: true }, orderBy: { unlockedAt: "asc" } },
          moderationNotices: {
            where: { requiresAcknowledgement: true, acknowledgedAt: null },
            select: { id: true },
          },
        },
      }),
      prisma.follow.count({ where: { followingId: user.id, status: "accepted" } }),
      prisma.follow.count({ where: { followerId: user.id, status: "accepted" } }),
      prisma.follow.count({ where: { followingId: user.id, status: "pending" } }),
      identityForUser(user.id, user.id),
    ]);
    const earnedAt = new Map(owned.map((b) => [b.badgeId, b.earnedAt]));
    const level = levelForXp(fresh.xp);
    return {
      user: publicUser(user),
      identity,
      bio: fresh.bio,
      stats,
      xp: fresh.xp,
      level,
      equippedBadgeId: fresh.equippedBadgeId,
      equippedTitleId: fresh.equippedTitleId,
      equippedAvatarId: fresh.equippedAvatarId,
      equippedFrameId: fresh.equippedFrameId,
      xpForNextLevel: xpForLevel(level + 1),
      usernameChangesLeft: fresh.usernameChangesLeft,
      followerCount,
      followingCount,
      pendingFollowCount,
      pendingNoticeCount: fresh.moderationNotices.length,
      privacy: {
        profileVisibility: fresh.profileVisibility,
        showLevel: fresh.showLevel,
        showTitle: fresh.showTitle,
        showBadges: fresh.showBadges,
        showStats: fresh.showStats,
        showPosts: fresh.showPosts,
        showFavorites: fresh.showFavorites,
        showReadingHistory: fresh.showReadingHistory,
        showFollows: fresh.showFollows,
        showJoinDate: fresh.showJoinDate,
      },
      titles: fresh.titles.map(({ title, unlockedAt, source }) => ({
        id: title.id,
        name: title.name,
        description: title.description,
        rarity: title.rarity,
        source,
        unlockedAt,
      })),
      cosmetics: fresh.cosmetics.map(({ cosmetic, unlockedAt, source }) => ({
        id: cosmetic.id,
        name: cosmetic.name,
        description: cosmetic.description,
        kind: cosmetic.kind,
        rarity: cosmetic.rarity,
        assetKey: cosmetic.assetKey,
        primaryColor: cosmetic.primaryColor,
        secondaryColor: cosmetic.secondaryColor,
        source,
        unlockedAt,
      })),
      badges: BADGES.map((b) => ({
        id: b.id,
        name: b.name,
        icon: b.icon,
        description: b.description,
        earned: earnedAt.has(b.id),
        earnedAt: earnedAt.get(b.id) ?? null,
        progress: { current: Math.min(stats[b.stat], b.target), target: b.target },
      })),
    };
  });

  app.post("/me/terms", async (req) => {
    const user = await requireActiveUser(req);
    const { version } = z.object({ version: z.literal(CURRENT_TERMS_VERSION) }).parse(req.body);
    await prisma.user.update({
      where: { id: user.id },
      data: { acceptedTermsVersion: version, acceptedTermsAt: new Date() },
    });
    return { ok: true, acceptedTermsVersion: version };
  });

  app.delete("/me/account", async (req) => {
    const user = await requireUser(req);
    const { password } = z.object({ password: z.string().min(1).max(200) }).parse(req.body);
    if (!verifyPassword(password, user.passwordHash)) {
      throw httpError(403, "Password confirmation failed");
    }
    await deleteUserCompletely(user.id);
    return { ok: true };
  });

  // Equip an unlocked Title. Badges are intentionally a separate collection.
  app.post("/me/title", async (req) => {
    const user = await requireUser(req);
    const { titleId } = z.object({ titleId: z.string().nullable() }).parse(req.body);
    if (titleId) {
      const unlocked = await prisma.userTitle.findUnique({
        where: { userId_titleId: { userId: user.id, titleId } },
      });
      if (!unlocked) throw httpError(403, "You haven't unlocked that title yet");
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { equippedTitleId: titleId },
    });
    return { ok: true, equippedTitleId: titleId };
  });

  app.post("/me/cosmetic", async (req) => {
    const user = await requireUser(req);
    const { slot, cosmeticId } = z
      .object({ slot: z.enum(["avatar", "frame"]), cosmeticId: z.string().nullable() })
      .parse(req.body);
    if (slot === "avatar" && !cosmeticId) throw httpError(400, "An avatar is required");
    if (cosmeticId) {
      const owned = await prisma.userCosmetic.findUnique({
        where: { userId_cosmeticId: { userId: user.id, cosmeticId } },
        include: { cosmetic: true },
      });
      if (!owned || owned.cosmetic.kind !== slot) {
        throw httpError(403, `You haven't unlocked that ${slot} yet`);
      }
    }
    await prisma.user.update({
      where: { id: user.id },
      data: slot === "avatar" ? { equippedAvatarId: cosmeticId } : { equippedFrameId: cosmeticId },
    });
    return { ok: true, slot, cosmeticId };
  });

  app.patch("/me/profile", async (req) => {
    const user = await requireActiveUser(req);
    const { bio, username } = z
      .object({
        bio: z.string().trim().max(240).nullable().optional(),
        username: z
          .string()
          .trim()
          .min(3)
          .max(20)
          .regex(/^[a-zA-Z0-9_]+$/, "letters, numbers and _ only")
          .optional(),
      })
      .parse(req.body);
    if (bio) validateUserContent(bio);
    if (username && username !== user.username) {
      const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      if (fresh.usernameChangesLeft < 1) {
        throw httpError(403, "Your one username change has already been used");
      }
      const clash = await prisma.user.findFirst({
        where: { username: { equals: username, mode: "insensitive" }, id: { not: user.id } },
      });
      if (clash) throw httpError(409, "Username taken");
      await prisma.$transaction([
        prisma.usernameChange.create({
          data: { userId: user.id, previousUsername: user.username, newUsername: username },
        }),
        prisma.user.update({
          where: { id: user.id },
          data: { username, usernameChangesLeft: { decrement: 1 }, bio: bio === undefined ? undefined : bio || null },
        }),
      ]);
    } else if (bio !== undefined) {
      await prisma.user.update({ where: { id: user.id }, data: { bio: bio || null } });
    }
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    return { user: publicUser(updated), bio: updated.bio, usernameChangesLeft: updated.usernameChangesLeft };
  });

  app.patch("/me/privacy", async (req) => {
    const user = await requireUser(req);
    const settings = z
      .object({
        profileVisibility: z.enum(["public", "private"]).optional(),
        showLevel: z.boolean().optional(),
        showTitle: z.boolean().optional(),
        showBadges: z.boolean().optional(),
        showStats: z.boolean().optional(),
        showPosts: z.boolean().optional(),
        showFavorites: z.boolean().optional(),
        showReadingHistory: z.boolean().optional(),
        showFollows: z.boolean().optional(),
        showJoinDate: z.boolean().optional(),
      })
      .parse(req.body);
    await prisma.user.update({ where: { id: user.id }, data: settings });
    return { ok: true, privacy: settings };
  });

  // ── Public profiles & safety ──────────────────────────────────────────
  app.get<{ Params: { username: string } }>("/users/:username", async (req) => {
    const me = await getUser(req);
    const target = await prisma.user.findUnique({
      where: { username: req.params.username },
      select: {
        id: true,
        username: true,
        bio: true,
        status: true,
        createdAt: true,
        profileVisibility: true,
        showBadges: true,
        showStats: true,
        showPosts: true,
        showFavorites: true,
        showReadingHistory: true,
        showFollows: true,
        showJoinDate: true,
      },
    });
    if (!target) throw httpError(404, "No such reader");
    if (target.status === "banned") {
      return {
        id: null,
        username: "Removed Reader",
        unavailable: "removed",
        isMe: false,
        blockedByMe: false,
        blockedMe: false,
      };
    }
    const isMe = me?.id === target.id;
    const [block, follow, followerCount, followingCount] = await Promise.all([
      me && !isMe
        ? prisma.block.findFirst({
            where: {
              OR: [
                { blockerId: me.id, blockedId: target.id },
                { blockerId: target.id, blockedId: me.id },
              ],
            },
          })
        : null,
      me && !isMe
        ? prisma.follow.findUnique({
            where: { followerId_followingId: { followerId: me.id, followingId: target.id } },
          })
        : null,
      prisma.follow.count({ where: { followingId: target.id, status: "accepted" } }),
      prisma.follow.count({ where: { followerId: target.id, status: "accepted" } }),
    ]);
    const blockedByMe = block?.blockerId === me?.id;
    const blockedMe = block?.blockedId === me?.id;
    if (block && !isMe) {
      return {
        id: target.id,
        username: target.username,
        unavailable: "blocked",
        isMe: false,
        blockedByMe,
        blockedMe,
        followStatus: null,
      };
    }
    const privateProfile =
      target.profileVisibility === "private" && !isMe && follow?.status !== "accepted";
    const [identity, stats, owned, postCount, recentPosts, favorites, recentReads] = await Promise.all([
      identityForUser(target.id, me?.id),
      getStats(target.id),
      prisma.userBadge.findMany({ where: { userId: target.id }, orderBy: { earnedAt: "asc" } }),
      prisma.post.count({
        where: { userId: target.id, parentId: null, guildId: null, moderationStatus: "visible" },
      }),
      prisma.post.findMany({
        where: {
          userId: target.id,
          parentId: null,
          // Guild-board posts are members-only; profiles never surface them.
          guildId: null,
          moderationStatus: "visible",
        },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          canonical: { select: { id: true, title: true, coverUrl: true } },
          seriesTags: {
            orderBy: { position: "asc" },
            include: { canonical: { select: { id: true, title: true, coverUrl: true } } },
          },
          _count: { select: { likes: true, replies: true } },
        },
      }),
      prisma.libraryEntry.findMany({
        where: { userId: target.id },
        orderBy: { addedAt: "desc" },
        take: 12,
        include: { canonical: { select: { id: true, title: true, coverUrl: true } } },
      }),
      prisma.readChapter.findMany({
        where: { userId: target.id },
        orderBy: { readAt: "desc" },
        take: 20,
        include: { canonical: { select: { id: true, title: true, coverUrl: true } } },
      }),
    ]);
    const earnedDefs = owned
      .map((o) => {
        const def = BADGES.find((b) => b.id === o.badgeId);
        return def
          ? { id: def.id, name: def.name, icon: def.icon, earnedAt: o.earnedAt }
          : null;
      })
      .filter((b) => b !== null);
    return {
      id: target.id,
      username: target.username,
      bio: target.bio,
      identity,
      private: privateProfile,
      isMe,
      blockedByMe,
      blockedMe,
      followStatus: follow?.status ?? null,
      followerCount: target.showFollows || isMe ? followerCount : null,
      followingCount: target.showFollows || isMe ? followingCount : null,
      memberDays:
        target.showJoinDate || isMe
          ? Math.floor((Date.now() - target.createdAt.getTime()) / 86_400_000)
          : null,
      stats: !privateProfile && (target.showStats || isMe) ? { ...stats, posts: postCount } : null,
      badges: !privateProfile && (target.showBadges || isMe) ? earnedDefs : [],
      recentPosts: !privateProfile && (target.showPosts || isMe) ? recentPosts.map((p) => ({
        id: p.id,
        body: p.body,
        isSpoiler: p.isSpoiler,
        createdAt: p.createdAt,
        chapterNumber: p.chapterNumber,
        likeCount: p._count.likes,
        replyCount: p._count.replies,
        seriesTags: p.seriesTags.map((tag) => ({
          canonicalId: tag.canonical.id,
          title: tag.canonical.title,
          coverUrl: tag.canonical.coverUrl,
          chapterNumber: tag.chapterNumber,
        })),
        series: p.canonical
          ? {
              canonicalId: p.canonical.id,
              title: p.canonical.title,
              coverUrl: p.canonical.coverUrl,
            }
          : null,
      })) : [],
      favorites:
        !privateProfile && (target.showFavorites || isMe)
          ? favorites.map((entry) => ({
              canonicalId: entry.canonical.id,
              title: entry.canonical.title,
              coverUrl: entry.canonical.coverUrl,
            }))
          : [],
      recentReads:
        !privateProfile && (target.showReadingHistory || isMe)
          ? recentReads.map((read) => ({
              canonicalId: read.canonical.id,
              title: read.canonical.title,
              coverUrl: read.canonical.coverUrl,
              chapterNumber: read.chapterNumber,
              readAt: read.readAt,
            }))
          : [],
    };
  });

  // Toggle blocking a user (their posts/comments disappear for you)
  app.post<{ Params: { username: string } }>("/users/:username/block", async (req) => {
    const me = await requireActiveUser(req);
    const target = await prisma.user.findUnique({ where: { username: req.params.username } });
    if (!target) throw httpError(404, "No such reader");
    if (target.id === me.id) throw httpError(400, "You can't block yourself");
    const key = { blockerId: me.id, blockedId: target.id };
    const existing = await prisma.block.findUnique({ where: { blockerId_blockedId: key } });
    if (existing) await prisma.block.delete({ where: { blockerId_blockedId: key } });
    else {
      await prisma.$transaction([
        prisma.block.create({ data: key }),
        prisma.follow.deleteMany({
          where: {
            OR: [
              { followerId: me.id, followingId: target.id },
              { followerId: target.id, followingId: me.id },
            ],
          },
        }),
      ]);
    }
    return { blocked: !existing };
  });

  app.put<{ Params: { username: string } }>("/users/:username/follow", async (req) => {
    const me = await requireActiveUser(req);
    const target = await prisma.user.findUnique({ where: { username: req.params.username } });
    if (!target || target.status === "banned") throw httpError(404, "No such reader");
    if (target.id === me.id) throw httpError(400, "You can't follow yourself");
    if ((await hiddenUserIds(me.id)).includes(target.id)) {
      throw httpError(403, "You cannot interact with this reader");
    }
    const existingFollow = await prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: me.id, followingId: target.id } },
    });
    if (existingFollow) {
      return { status: existingFollow.status, completedQuests: [], levelUp: null };
    }
    const status = target.profileVisibility === "private" ? "pending" : "accepted";
    const follow = await prisma.follow.upsert({
      where: { followerId_followingId: { followerId: me.id, followingId: target.id } },
      create: {
        followerId: me.id,
        followingId: target.id,
        status,
        acceptedAt: status === "accepted" ? new Date() : null,
      },
      update: {},
    });
    await createNotification({
      userId: target.id,
      actorId: me.id,
      kind: status === "accepted" ? "new_follower" : "follow_request",
      title: status === "accepted" ? "New follower" : "New follow request",
      safeBody:
        status === "accepted"
          ? `@${me.username} followed you.`
          : `@${me.username} requested to follow you.`,
      targetUrl: `/user/${encodeURIComponent(me.username)}`,
      dedupeKey: `follow:${me.id}:${target.id}:${status}`,
    });
    const activity =
      follow.status === "accepted"
        ? await recordActivity(me.id, { type: "follow_created", eventKey: target.id })
        : { completedQuests: [], levelUp: null };
    return { status: follow.status, ...activity };
  });

  app.delete<{ Params: { username: string } }>("/users/:username/follow", async (req) => {
    const me = await requireActiveUser(req);
    const target = await prisma.user.findUnique({ where: { username: req.params.username } });
    if (!target) throw httpError(404, "No such reader");
    await prisma.follow.deleteMany({ where: { followerId: me.id, followingId: target.id } });
    return { ok: true };
  });

  app.get("/me/follow-requests", async (req) => {
    const me = await requireUser(req);
    const rows = await prisma.follow.findMany({
      where: { followingId: me.id, status: "pending" },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const identities = await identitiesForUsers(rows.map((row) => row.followerId), me.id);
    return rows.map((row) => ({
      user: identities.get(row.followerId),
      requestedAt: row.createdAt,
    }));
  });

  app.post<{ Params: { userId: string } }>("/me/follow-requests/:userId", async (req) => {
    const me = await requireActiveUser(req);
    const { action } = z.object({ action: z.enum(["accept", "reject"]) }).parse(req.body);
    const follow = await prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: req.params.userId, followingId: me.id } },
      include: { follower: { select: { username: true } } },
    });
    if (!follow || follow.status !== "pending") throw httpError(404, "Follow request not found");
    if (action === "reject") {
      await prisma.follow.delete({
        where: { followerId_followingId: { followerId: follow.followerId, followingId: me.id } },
      });
      return { ok: true, status: "rejected" };
    }
    await prisma.follow.update({
      where: { followerId_followingId: { followerId: follow.followerId, followingId: me.id } },
      data: { status: "accepted", acceptedAt: new Date() },
    });
    await createNotification({
      userId: follow.followerId,
      actorId: me.id,
      kind: "follow_accepted",
      title: "Follow request accepted",
      safeBody: `@${me.username} accepted your follow request.`,
      targetUrl: `/user/${encodeURIComponent(me.username)}`,
      dedupeKey: `follow-accepted:${follow.followerId}:${me.id}`,
    });
    const activity = await recordActivity(follow.followerId, {
      type: "follow_created",
      eventKey: me.id,
    });
    return { ok: true, status: "accepted", ...activity };
  });

  app.get<{ Params: { username: string; direction: string } }>(
    "/users/:username/:direction(followers|following)",
    async (req) => {
      const me = await getUser(req);
      const target = await prisma.user.findUnique({ where: { username: req.params.username } });
      if (!target) throw httpError(404, "No such reader");
      const isMe = me?.id === target.id;
      const accepted = me
        ? await prisma.follow.findUnique({
            where: { followerId_followingId: { followerId: me.id, followingId: target.id } },
          })
        : null;
      if (!target.showFollows && !isMe) throw httpError(403, "This reader keeps follows private");
      if (target.profileVisibility === "private" && !isMe && accepted?.status !== "accepted") {
        throw httpError(403, "This profile is private");
      }
      const rows =
        req.params.direction === "followers"
          ? await prisma.follow.findMany({
              where: { followingId: target.id, status: "accepted" },
              orderBy: { createdAt: "desc" },
              take: 200,
            })
          : await prisma.follow.findMany({
              where: { followerId: target.id, status: "accepted" },
              orderBy: { createdAt: "desc" },
              take: 200,
            });
      const ids = rows.map((row) =>
        req.params.direction === "followers" ? row.followerId : row.followingId,
      );
      const hidden = me ? new Set(await hiddenUserIds(me.id)) : new Set<string>();
      const visibleIds = ids.filter((id) => !hidden.has(id));
      const identities = await identitiesForUsers(visibleIds, me?.id);
      return visibleIds.map((id) => identities.get(id)).filter(Boolean);
    },
  );

  app.post(
    "/report",
    { config: { rateLimit: { max: 20, timeWindow: "1 hour" } } },
    async (req) => {
    const me = await requireActiveUser(req);
    const { targetType, targetId, reason } = z
      .object({
        targetType: z.enum(["post", "comment", "user"]),
        targetId: z.string().min(1),
        reason: z.string().max(300).optional(),
      })
      .parse(req.body);
    const target =
      targetType === "post"
        ? await prisma.post.findUnique({ where: { id: targetId } })
        : targetType === "comment"
          ? await prisma.comment.findUnique({ where: { id: targetId } })
          : await prisma.user.findUnique({ where: { id: targetId } });
    if (!target) throw httpError(404, "The reported item no longer exists");
    const existing = await prisma.report.findFirst({
      where: { reporterId: me.id, targetType, targetId, status: "pending" },
    });
    if (existing) return { ok: true, duplicate: true };
    const report = await prisma.report.create({
      data: { reporterId: me.id, targetType, targetId, reason },
    });
    const activity = await recordActivity(me.id, {
      type: "report_created",
      eventKey: `${targetType}:${targetId}`,
      metadata: { reportId: report.id, targetType },
    });
    return { ok: true, ...activity };
    },
  );

  // Reading activity (signed-in): powers reading badges/XP, and later sync
  app.post("/activity/read", async (req) => {
    const user = await requireUser(req);
    const { canonicalId, chapterNumber, event } = z
      .object({
        canonicalId: z.string().min(1),
        chapterNumber: z.coerce.number(),
        event: z.enum(["opened", "completed"]).default("opened"),
      })
      .parse(req.body);
    const canonical = await prisma.canonicalSeries.findUnique({ where: { id: canonicalId } });
    if (!canonical) throw httpError(404, "Unknown series");
    const created = await prisma.readChapter.createMany({
      data: [{ userId: user.id, canonicalId, chapterNumber }],
      skipDuplicates: true,
    });
    let newBadges: { id: string; name: string; icon: string }[] = [];
    let levelUp: number | null = null;
    if (created.count > 0) {
      const before = levelForXp(user.xp);
      const updated = await prisma.user.update({
        where: { id: user.id },
        data: { xp: { increment: 2 } },
        select: { xp: true },
      });
      const after = levelForXp(updated.xp);
      if (after > before) levelUp = after;
      await bumpWeeklyXp(prisma, user.id, 2);
      await creditGuild(user.id, 2);
      newBadges = (await evaluateBadges(user.id)).map((b) => ({
        id: b.id,
        name: b.name,
        icon: b.icon,
      }));
    }
    // Guild raid: the first completion of a chapter this week ticks the
    // shared weekly raid (same distinct-event window the quest engine uses,
    // so re-reporting a chapter can't farm raid progress).
    if (event === "completed") {
      const priorThisWeek = await prisma.activityEvent.count({
        where: {
          userId: user.id,
          type: "chapter_completed",
          eventKey: `${canonicalId}:${chapterNumber}`,
          reversedAt: null,
          createdAt: { gte: new Date(`${currentWeekKey()}T00:00:00Z`) },
        },
      });
      if (priorThisWeek === 0) void bumpGuildRaid(user.id);
    }
    const activity = await recordActivity(user.id, {
      type: event === "completed" ? "chapter_completed" : "chapter_opened",
      eventKey: `${canonicalId}:${chapterNumber}`,
      canonicalId,
      chapterNumber,
    });
    return {
      ok: true,
      newBadges,
      levelUp: activity.levelUp ?? levelUp,
      completedQuests: activity.completedQuests,
    };
  });

  app.get("/quests", async (req) => {
    const user = await requireUser(req);
    return questListForUser(user.id);
  });

  // ── Comments ──────────────────────────────────────────────────────────
  app.get<{ Params: { canonicalId: string; chapterNumber: string } }>(
    "/comments/:canonicalId/:chapterNumber",
    async (req) => {
      const { canonicalId, chapterNumber } = commentParams.parse(req.params);
      const me = await getUser(req);
      const blockedIds = me ? await hiddenUserIds(me.id) : [];
      const rows = await prisma.comment.findMany({
        where: {
          canonicalId,
          chapterNumber,
          moderationStatus: "visible",
          userId: { notIn: blockedIds },
        },
        orderBy: { createdAt: "desc" },
        take: 500,
        include: {
          likes: { select: { userId: true, type: true } },
        },
      });
      const identities = await identitiesForUsers(rows.map((c) => c.userId), me?.id);
      interface CommentNode {
        id: string;
        parentId: string | null;
        body: string;
        isSpoiler: boolean;
        author: Awaited<ReturnType<typeof identityForUser>>;
        username: string;
        level: number | null;
        createdAt: Date;
        likeCount: number;
        likedByMe: boolean;
        reactions: Record<string, number>;
        myReaction: string | null;
        mine: boolean;
        replies: CommentNode[];
      }
      const serialize = (c: (typeof rows)[number]): CommentNode => {
        const reactions: Record<string, number> = {};
        for (const l of c.likes) reactions[l.type] = (reactions[l.type] ?? 0) + 1;
        const myReaction = me ? (c.likes.find((l) => l.userId === me.id)?.type ?? null) : null;
        return {
          id: c.id,
          parentId: c.parentId,
          body: c.body,
          isSpoiler: c.isSpoiler,
          author: identities.get(c.userId) ?? null,
          username: identities.get(c.userId)?.username ?? "Removed Reader",
          level: identities.get(c.userId)?.level ?? null,
          createdAt: c.createdAt,
          likeCount: c.likes.length,
          likedByMe: !!myReaction,
          reactions,
          myReaction,
          mine: me ? c.userId === me.id : false,
          replies: [],
        };
      };
      // Thread: top-level newest first, replies oldest first underneath
      const byId = new Map(rows.map((c) => [c.id, serialize(c)]));
      const topLevel: CommentNode[] = [];
      for (const c of rows) {
        const node = byId.get(c.id);
        if (!node) continue;
        if (c.parentId && byId.has(c.parentId)) byId.get(c.parentId)?.replies.unshift(node);
        else topLevel.push(node);
      }
      return topLevel;
    },
  );

  app.post<{ Params: { canonicalId: string; chapterNumber: string } }>(
    "/comments/:canonicalId/:chapterNumber",
    { config: { rateLimit: { max: 30, timeWindow: "1 hour" } } },
    async (req) => {
      const { canonicalId, chapterNumber } = commentParams.parse(req.params);
      const { body, parentId, isSpoiler } = commentBody.parse(req.body);
      const user = await requireAcceptedTerms(req);
      validateUserContent(body);
      const canonical = await prisma.canonicalSeries.findUnique({ where: { id: canonicalId } });
      if (!canonical) throw httpError(404, "Unknown series");

      // Replies attach to a top-level comment in the same thread (a reply to
      // a reply lands on the same top-level parent).
      let parent = null;
      if (parentId) {
        parent = await prisma.comment.findUnique({ where: { id: parentId } });
        if (
          !parent ||
          parent.moderationStatus !== "visible" ||
          parent.canonicalId !== canonicalId ||
          parent.chapterNumber !== chapterNumber
        ) {
          throw httpError(404, "No such comment to reply to");
        }
        if (parent.parentId) {
          parent = await prisma.comment.findUnique({ where: { id: parent.parentId } });
          if (!parent) throw httpError(404, "No such comment to reply to");
        }
        if ((await hiddenUserIds(user.id)).includes(parent.userId)) {
          throw httpError(403, "You cannot interact with this user");
        }
      }

      const comment = await prisma.comment.create({
        data: { userId: user.id, canonicalId, chapterNumber, body, isSpoiler, parentId: parent?.id },
      });
      // Notify the parent's author (not when replying to yourself)
      if (parent && parent.userId !== user.id) {
        await createNotification({
          userId: parent.userId,
          actorId: user.id,
          kind: "comment_reply",
          title: "New reply",
          safeBody: `@${user.username} replied to your chapter discussion.`,
          targetUrl: "/notifications",
          metadata: { canonicalId, chapterNumber, commentId: comment.id },
          dedupeKey: `comment-reply:${comment.id}`,
          commentId: comment.id,
        });
      }
      await notifyMentions({
        authorId: user.id,
        authorUsername: user.username,
        body,
        targetUrl: "/notifications",
        targetKind: "comment",
        targetId: comment.id,
        metadata: { canonicalId, chapterNumber, commentId: comment.id },
        commentId: comment.id,
      });
      const levelBefore = levelForXp(user.xp);
      const updated = await prisma.user.update({
        where: { id: user.id },
        data: { xp: { increment: 10 } },
        select: { xp: true },
      });
      const levelAfter = levelForXp(updated.xp);
      const levelUp = levelAfter > levelBefore ? levelAfter : null;
      await bumpWeeklyXp(prisma, user.id, 10);
      await creditGuild(user.id, 10);
      const newBadges = (await evaluateBadges(user.id)).map((b) => ({
        id: b.id,
        name: b.name,
        icon: b.icon,
      }));
      const identity = await identityForUser(user.id, user.id);
      const activity = await recordActivity(user.id, {
        type: "comment_created",
        eventKey: comment.id,
        canonicalId,
        chapterNumber,
      });
      return {
        id: comment.id,
        parentId: comment.parentId,
        body: comment.body,
        isSpoiler: comment.isSpoiler,
        author: identity,
        username: user.username,
        level: identity?.level ?? levelForXp(updated.xp),
        createdAt: comment.createdAt,
        likeCount: 0,
        likedByMe: false,
        reactions: {},
        myReaction: null,
        mine: true,
        replies: [],
        xpAwarded: 10,
        newBadges,
        levelUp: activity.levelUp ?? levelUp,
        completedQuests: activity.completedQuests,
      };
    },
  );

  // ── Cloud sync: library + progress + read marks ───────────────────────
  app.get("/sync/library", async (req) => {
    const user = await requireUser(req);
    const rows = await prisma.libraryEntry.findMany({
      where: { userId: user.id },
      include: { canonical: { select: { title: true, coverUrl: true } } },
      orderBy: { addedAt: "desc" },
    });
    return rows.map((r) => ({
      canonicalId: r.canonicalId,
      source: r.source,
      sourceSeriesId: r.sourceSeriesId,
      title: r.canonical.title,
      coverUrl: r.canonical.coverUrl,
      addedAt: r.addedAt,
    }));
  });

  app.put<{ Params: { canonicalId: string } }>("/sync/library/:canonicalId", async (req) => {
    const user = await requireActiveUser(req);
    const { source, sourceSeriesId } = z
      .object({ source: z.literal("mangadex"), sourceSeriesId: z.string().uuid() })
      .parse(req.body);
    const canonical = await prisma.canonicalSeries.findUnique({
      where: { id: req.params.canonicalId },
    });
    if (!canonical) throw httpError(404, "Unknown series");
    await prisma.libraryEntry.upsert({
      where: { userId_canonicalId: { userId: user.id, canonicalId: canonical.id } },
      create: { userId: user.id, canonicalId: canonical.id, source, sourceSeriesId },
      update: { source, sourceSeriesId },
    });
    return { ok: true };
  });

  app.delete<{ Params: { canonicalId: string } }>("/sync/library/:canonicalId", async (req) => {
    const user = await requireActiveUser(req);
    await prisma.libraryEntry.deleteMany({
      where: { userId: user.id, canonicalId: req.params.canonicalId },
    });
    return { ok: true };
  });

  app.get("/sync/progress", async (req) => {
    const user = await requireUser(req);
    const rows = await prisma.progress.findMany({ where: { userId: user.id } });
    return rows.map((r) => ({
      canonicalId: r.canonicalId,
      chapterNumber: r.chapterNumber,
      pageIndex: r.pageIndex,
      pageCount: r.pageCount,
      updatedAt: r.updatedAt,
    }));
  });

  app.put<{ Params: { canonicalId: string } }>("/sync/progress/:canonicalId", async (req) => {
    const user = await requireUser(req);
    const { chapterNumber, pageIndex, pageCount } = z
      .object({
        chapterNumber: z.coerce.number(),
        pageIndex: z.coerce.number().int().min(0).default(0),
        pageCount: z.coerce.number().int().positive().optional(),
      })
      .parse(req.body);
    const canonical = await prisma.canonicalSeries.findUnique({
      where: { id: req.params.canonicalId },
    });
    if (!canonical) throw httpError(404, "Unknown series");
    await prisma.progress.upsert({
      where: { userId_canonicalId: { userId: user.id, canonicalId: canonical.id } },
      create: {
        userId: user.id,
        canonicalId: canonical.id,
        chapterNumber,
        pageIndex,
        pageCount,
      },
      update: { chapterNumber, pageIndex, pageCount, updatedAt: new Date() },
    });
    return { ok: true };
  });

  // Read marks for one series (pull), and bulk push of locally read chapters
  app.get<{ Params: { canonicalId: string } }>("/sync/reads/:canonicalId", async (req) => {
    const user = await requireUser(req);
    const rows = await prisma.readChapter.findMany({
      where: { userId: user.id, canonicalId: req.params.canonicalId },
      select: { chapterNumber: true },
    });
    return rows.map((r) => r.chapterNumber);
  });

  app.post<{ Params: { canonicalId: string } }>("/sync/reads/:canonicalId", async (req) => {
    const user = await requireUser(req);
    const { numbers } = z
      .object({ numbers: z.array(z.coerce.number()).max(5000) })
      .parse(req.body);
    const canonical = await prisma.canonicalSeries.findUnique({
      where: { id: req.params.canonicalId },
    });
    if (!canonical) throw httpError(404, "Unknown series");
    if (numbers.length > 0) {
      await prisma.readChapter.createMany({
        data: numbers.map((n) => ({
          userId: user.id,
          canonicalId: canonical.id,
          chapterNumber: n,
        })),
        skipDuplicates: true,
      });
    }
    return { ok: true };
  });

  // ── Posts: the social wall ────────────────────────────────────────────
  interface PostNode {
    id: string;
    parentId: string | null;
    body: string;
    kind: string;
    rating: number | null;
    gifUrl: string | null;
    imageUrls: string[];
    isSpoiler: boolean;
    createdAt: Date;
    author: Awaited<ReturnType<typeof identityForUser>>;
    username: string;
    level: number | null;
    // Per-type reaction counts, e.g. { endorse: 42, hype: 8 }.
    reactions: Record<string, number>;
    myReaction: string | null;
    mine: boolean;
    chapterNumber: number | null;
    series: { canonicalId: string; title: string; coverUrl: string | null } | null;
    seriesTags: {
      canonicalId: string;
      title: string;
      coverUrl: string | null;
      chapterNumber: number | null;
    }[];
    replies: PostNode[];
    // Total comments in this post's whole thread (all nesting levels).
    commentCount: number;
    // Present on poll posts.
    poll: {
      options: { id: string; text: string; votes: number }[];
      totalVotes: number;
      myVote: string | null;
    } | null;
    // Present on quote-reposts: the embedded post being quoted.
    quotedPost: {
      id: string;
      author: Awaited<ReturnType<typeof identityForUser>>;
      username: string;
      body: string;
      kind: string;
      rating: number | null;
      gifUrl: string | null;
      imageUrls: string[];
      isSpoiler: boolean;
      createdAt: Date;
      series: { canonicalId: string; title: string; coverUrl: string | null } | null;
    } | null;
  }

  const postInclude = (meId?: string) =>
    ({
      canonical: { select: { id: true, title: true, coverUrl: true } },
      seriesTags: {
        orderBy: { position: "asc" as const },
        include: { canonical: { select: { id: true, title: true, coverUrl: true } } },
      },
      likes: meId ? { where: { userId: meId }, select: { type: true } } : false,
      pollOptions: {
        orderBy: { position: "asc" as const },
        select: { id: true, text: true, position: true, _count: { select: { votes: true } } },
      },
      pollVotes: meId ? { where: { userId: meId }, select: { optionId: true } } : false,
      quotedPost: {
        select: {
          id: true,
          userId: true,
          body: true,
          kind: true,
          rating: true,
          gifUrl: true,
          imageUrls: true,
          isSpoiler: true,
          createdAt: true,
          moderationStatus: true,
          canonical: { select: { id: true, title: true, coverUrl: true } },
        },
      },
    }) as const;

  // Structural shape of a post row loaded with postInclude(); shared by the
  // feed and the single-post thread endpoint so their output can't drift.
  interface SerializablePost {
    id: string;
    parentId: string | null;
    body: string;
    kind: string;
    rating: number | null;
    gifUrl: string | null;
    imageUrls: string[];
    isSpoiler: boolean;
    createdAt: Date;
    userId: string;
    chapterNumber: number | null;
    canonical: { id: string; title: string; coverUrl: string | null } | null;
    seriesTags: {
      canonical: { id: string; title: string; coverUrl: string | null };
      chapterNumber: number | null;
    }[];
    likes?: { type: string }[] | false;
    pollOptions?: { id: string; text: string; position: number; _count: { votes: number } }[];
    pollVotes?: { optionId: string }[] | false;
    quotedPost?: {
      id: string;
      userId: string;
      body: string;
      kind: string;
      rating: number | null;
      gifUrl: string | null;
      imageUrls: string[];
      isSpoiler: boolean;
      createdAt: Date;
      moderationStatus: string;
      canonical: { id: string; title: string; coverUrl: string | null } | null;
    } | null;
  }

  const serializePost = (
    p: SerializablePost,
    identities: Awaited<ReturnType<typeof identitiesForUsers>>,
    meId?: string,
    reactionCounts: Record<string, number> = {},
  ): PostNode => ({
    id: p.id,
    parentId: p.parentId,
    body: p.body,
    kind: p.kind,
    rating: p.rating,
    gifUrl: p.gifUrl,
    imageUrls: p.imageUrls,
    isSpoiler: p.isSpoiler,
    createdAt: p.createdAt,
    author: identities.get(p.userId) ?? null,
    username: identities.get(p.userId)?.username ?? "Removed Reader",
    level: identities.get(p.userId)?.level ?? null,
    reactions: reactionCounts,
    myReaction: Array.isArray(p.likes) && p.likes[0] ? p.likes[0].type : null,
    mine: !!meId && p.userId === meId,
    chapterNumber: p.chapterNumber,
    series: p.canonical
      ? { canonicalId: p.canonical.id, title: p.canonical.title, coverUrl: p.canonical.coverUrl }
      : null,
    seriesTags: p.seriesTags.map((tag) => ({
      canonicalId: tag.canonical.id,
      title: tag.canonical.title,
      coverUrl: tag.canonical.coverUrl,
      chapterNumber: tag.chapterNumber,
    })),
    replies: [],
    commentCount: 0,
    poll:
      p.pollOptions && p.pollOptions.length > 0
        ? {
            options: p.pollOptions.map((o) => ({ id: o.id, text: o.text, votes: o._count.votes })),
            totalVotes: p.pollOptions.reduce((n, o) => n + o._count.votes, 0),
            myVote: Array.isArray(p.pollVotes) && p.pollVotes[0] ? p.pollVotes[0].optionId : null,
          }
        : null,
    quotedPost:
      p.quotedPost && p.quotedPost.moderationStatus === "visible"
        ? {
            id: p.quotedPost.id,
            author: identities.get(p.quotedPost.userId) ?? null,
            username: identities.get(p.quotedPost.userId)?.username ?? "Removed Reader",
            body: p.quotedPost.body,
            kind: p.quotedPost.kind,
            rating: p.quotedPost.rating,
            gifUrl: p.quotedPost.gifUrl,
            imageUrls: p.quotedPost.imageUrls,
            isSpoiler: p.quotedPost.isSpoiler,
            createdAt: p.quotedPost.createdAt,
            series: p.quotedPost.canonical
              ? {
                  canonicalId: p.quotedPost.canonical.id,
                  title: p.quotedPost.canonical.title,
                  coverUrl: p.quotedPost.canonical.coverUrl,
                }
              : null,
          }
        : null,
  });

  // Per-post reaction counts, e.g. Map<postId, { endorse: 42, hype: 8 }>.
  const reactionsForPosts = async (
    postIds: string[],
  ): Promise<Map<string, Record<string, number>>> => {
    const map = new Map<string, Record<string, number>>();
    if (postIds.length === 0) return map;
    const groups = await prisma.postLike.groupBy({
      by: ["postId", "type"],
      where: { postId: { in: postIds } },
      _count: true,
    });
    for (const g of groups) {
      const rec = map.get(g.postId) ?? {};
      rec[g.type] = g._count;
      map.set(g.postId, rec);
    }
    return map;
  };

  app.get("/posts", async (req) => {
    const { page, canonicalId, feed, kind, sort, topic } = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        canonicalId: z.string().optional(),
        feed: z.enum(["global", "following"]).default("global"),
        kind: z.enum(["theory", "review"]).optional(),
        sort: z.enum(["new", "top", "hot"]).default("new"),
        topic: z
          .string()
          .trim()
          .regex(/^[a-zA-Z0-9_]{2,40}$/)
          .optional(),
      })
      .parse(req.query);
    const me = await getUser(req);
    if (feed === "following" && !me) throw httpError(401, "Sign in to view your Following feed");
    const blockedIds = me ? await hiddenUserIds(me.id) : [];
    const followingIds =
      feed === "following" && me
        ? (
            await prisma.follow.findMany({
              where: { followerId: me.id, status: "accepted" },
              select: { followingId: true },
            })
          ).map((row) => row.followingId)
        : null;
    // new = chronological; top = most-reacted all-time; hot = most-reacted in
    // the last week (a small-app-friendly "what's popular right now").
    const orderBy =
      sort === "new"
        ? [{ createdAt: "desc" as const }]
        : [{ likes: { _count: "desc" as const } }, { createdAt: "desc" as const }];
    const rows = await prisma.post.findMany({
      where: {
        parentId: null,
        // Guild-board posts never surface in public feeds.
        guildId: null,
        moderationStatus: "visible",
        userId: { notIn: blockedIds },
        ...(followingIds && me ? { userId: { in: [...followingIds, me.id], notIn: blockedIds } } : {}),
        ...(kind ? { kind } : {}),
        ...(topic ? { body: { contains: `#${topic}`, mode: "insensitive" } } : {}),
        ...(sort === "hot" ? { createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } } : {}),
        ...(canonicalId
          ? { OR: [{ canonicalId }, { seriesTags: { some: { canonicalId } } }] }
          : {}),
      },
      orderBy,
      skip: (page - 1) * 25,
      take: 25,
      include: postInclude(me?.id),
    });
    // Preview cards show the whole thread's comment count, not just direct replies.
    const rootIds = rows.map((p) => p.id);
    const counts = rootIds.length
      ? await prisma.post.groupBy({
          by: ["rootId"],
          where: { rootId: { in: rootIds }, moderationStatus: "visible", userId: { notIn: blockedIds } },
          _count: true,
        })
      : [];
    const countByRoot = new Map(counts.map((c) => [c.rootId, c._count]));
    const [identities, reactionMap] = await Promise.all([
      identitiesForUsers(
        [...rows.map((p) => p.userId), ...rows.flatMap((p) => (p.quotedPost ? [p.quotedPost.userId] : []))],
        me?.id,
      ),
      reactionsForPosts(rootIds),
    ]);
    return rows.map((p) => ({
      ...serializePost(p, identities, me?.id, reactionMap.get(p.id) ?? {}),
      commentCount: countByRoot.get(p.id) ?? 0,
    }));
  });

  // A single post plus its whole nested reply thread (Reddit-style): the root
  // post, its top-level comments, and every reply beneath them. Opening any
  // reply resolves to the root post the conversation hangs off.
  app.get<{ Params: { id: string } }>("/posts/:id", async (req) => {
    const me = await getUser(req);
    const blockedIds = me ? await hiddenUserIds(me.id) : [];
    const tapped = await prisma.post.findUnique({ where: { id: req.params.id } });
    if (!tapped || tapped.moderationStatus !== "visible") throw httpError(404, "No such post");
    const rootId = tapped.rootId ?? tapped.id;
    const rootPost = await prisma.post.findUnique({
      where: { id: rootId },
      include: postInclude(me?.id),
    });
    if (!rootPost || rootPost.moderationStatus !== "visible") throw httpError(404, "No such post");
    if (me && blockedIds.includes(rootPost.userId)) throw httpError(404, "No such post");
    // Guild-board threads are members-only. 404 (not 403) so existence
    // doesn't leak to outsiders.
    if (rootPost.guildId) {
      const membership = me
        ? await prisma.guildMember.findUnique({ where: { userId: me.id } })
        : null;
      if (!membership || membership.guildId !== rootPost.guildId) {
        throw httpError(404, "No such post");
      }
    }
    const descendants = await prisma.post.findMany({
      where: { rootId, moderationStatus: "visible", userId: { notIn: blockedIds } },
      orderBy: { createdAt: "asc" },
      include: postInclude(me?.id),
    });
    const all = [rootPost, ...descendants];
    const [identities, reactionMap] = await Promise.all([
      identitiesForUsers(
        [...all.map((p) => p.userId), ...all.flatMap((p) => (p.quotedPost ? [p.quotedPost.userId] : []))],
        me?.id,
      ),
      reactionsForPosts(all.map((p) => p.id)),
    ]);

    // Build the tree: attach each reply under its parent (oldest-first). A
    // reply whose parent was removed/blocked reattaches to the root so it isn't
    // silently lost.
    const nodes = new Map(
      all.map((p) => [p.id, serializePost(p, identities, me?.id, reactionMap.get(p.id) ?? {})]),
    );
    for (const p of descendants) {
      const node = nodes.get(p.id);
      if (!node) continue;
      const parent = (p.parentId && nodes.get(p.parentId)) || nodes.get(rootId);
      parent?.replies.push(node);
    }
    const root = nodes.get(rootId);
    if (!root) throw httpError(404, "No such post");
    // Newest top-level comments first; nested replies stay chronological.
    root.replies.reverse();
    root.commentCount = descendants.length;
    return root;
  });

  app.post(
    "/posts",
    { config: { rateLimit: { max: 30, timeWindow: "1 hour" } } },
    async (req) => {
    const {
      body,
      canonicalId,
      chapterNumber,
      parentId,
      isSpoiler,
      seriesTags,
      kind,
      rating,
      gifUrl,
      imageUrls,
      pollOptions,
      quotedPostId,
    } = z
      .object({
        body: z.string().trim().min(1).max(1000),
        canonicalId: z.string().optional(),
        chapterNumber: z.coerce.number().optional(),
        parentId: z.string().optional(),
        isSpoiler: z.boolean().optional(),
        kind: z.enum(["record", "theory", "review", "spoiler_intel", "poll"]).optional(),
        rating: z.coerce.number().int().min(1).max(5).optional(),
        gifUrl: z.string().trim().max(500).optional(),
        imageUrls: z.array(z.string().trim().max(500)).max(4).optional(),
        pollOptions: z.array(z.string().trim().min(1).max(80)).min(2).max(6).optional(),
        quotedPostId: z.string().optional(),
        seriesTags: z
          .array(
            z.object({ canonicalId: z.string().min(1), chapterNumber: z.coerce.number().optional() }),
          )
          .max(5)
          .optional(),
      })
      .parse(req.body);
    const user = await requireAcceptedTerms(req);
    validateUserContent(body);
    const cleanGifUrl = gifUrl ? validateGifUrl(gifUrl) : null;
    const cleanImageUrls = imageUrls ?? [];
    if (cleanImageUrls.some((u) => !isStoredImageUrl(u))) {
      throw httpError(400, "Attach images through the composer's photo picker");
    }
    // Replies are always plain records; a post's type only applies to top-level.
    const postKind = parentId ? "record" : (kind ?? "record");
    const requestedTags = seriesTags ?? (canonicalId ? [{ canonicalId, chapterNumber }] : []);
    if (postKind === "review") {
      if (rating === undefined) throw httpError(400, "A review needs a 1–5 rating");
      if (requestedTags.length !== 1) throw httpError(400, "Pick exactly one series to review");
    }
    if (postKind === "poll") {
      if (!pollOptions || pollOptions.length < 2) throw httpError(400, "A poll needs at least 2 options");
      for (const option of pollOptions) validateUserContent(option);
    }
    // Quote-reposts embed another top-level post; only top-level posts can quote.
    let quoted = null;
    if (quotedPostId && !parentId) {
      quoted = await prisma.post.findUnique({ where: { id: quotedPostId } });
      // Guild-board posts can't be quoted onto the public feed.
      if (!quoted || quoted.moderationStatus !== "visible" || quoted.parentId || quoted.guildId) {
        throw httpError(404, "That post can't be quoted");
      }
      if ((await hiddenUserIds(user.id)).includes(quoted.userId)) {
        throw httpError(403, "You cannot interact with this user");
      }
    }
    const uniqueTags = [...new Map(requestedTags.map((tag) => [tag.canonicalId, tag])).values()];
    if (uniqueTags.length > 0) {
      const count = await prisma.canonicalSeries.count({
        where: { id: { in: uniqueTags.map((tag) => tag.canonicalId) } },
      });
      if (count !== uniqueTags.length) throw httpError(404, "One or more tagged series do not exist");
    }
    // Replies nest under their actual parent (Reddit-style). A reply's thread
    // root is the parent's root — or the parent itself, if it's a top-level post.
    let parent = null;
    let root = null;
    if (parentId) {
      parent = await prisma.post.findUnique({ where: { id: parentId } });
      if (!parent || parent.moderationStatus !== "visible") {
        throw httpError(404, "No such post to reply to");
      }
      root = parent.rootId
        ? await prisma.post.findUnique({ where: { id: parent.rootId } })
        : parent;
      if (!root || root.moderationStatus !== "visible") {
        throw httpError(404, "No such post to reply to");
      }
      // Replies in a guild-board thread stay on the board: members only, and
      // the reply inherits the thread's guildId below.
      if (root.guildId) {
        const membership = await prisma.guildMember.findUnique({ where: { userId: user.id } });
        if (!membership || membership.guildId !== root.guildId) {
          throw httpError(404, "No such post to reply to");
        }
      }
      if ((await hiddenUserIds(user.id)).includes(parent.userId)) {
        throw httpError(403, "You cannot interact with this user");
      }
    }
    // Top-level posts carry the series tags; replies inherit the thread's
    // series context from the root but don't repeat the chips.
    const primaryTag = uniqueTags[0];
    const post = await prisma.post.create({
      data: {
        userId: user.id,
        body,
        kind: postKind,
        rating: postKind === "review" ? (rating ?? null) : null,
        gifUrl: cleanGifUrl,
        imageUrls: cleanImageUrls,
        isSpoiler: postKind === "spoiler_intel" ? true : (isSpoiler ?? false),
        canonicalId: root ? root.canonicalId : (primaryTag?.canonicalId ?? null),
        chapterNumber: root ? root.chapterNumber : (primaryTag?.chapterNumber ?? null),
        parentId: parent?.id,
        rootId: parent ? (parent.rootId ?? parent.id) : null,
        guildId: root?.guildId ?? null,
        seriesTags:
          !parent && uniqueTags.length > 0
            ? {
                create: uniqueTags.map((tag, position) => ({
                  canonicalId: tag.canonicalId,
                  chapterNumber: tag.chapterNumber,
                  position,
                })),
              }
            : undefined,
        pollOptions:
          postKind === "poll" && pollOptions
            ? { create: pollOptions.map((text, position) => ({ text, position })) }
            : undefined,
        quotedPostId: quoted ? quoted.id : null,
      },
      include: postInclude(user.id),
    });
    if (quoted && quoted.userId !== user.id) {
      await createNotification({
        userId: quoted.userId,
        actorId: user.id,
        kind: "post_quote",
        title: "Your record was quoted",
        safeBody: `@${user.username} quoted your post.`,
        targetUrl: `/post/${post.id}`,
        metadata: { postId: post.id, quotedPostId: quoted.id },
        dedupeKey: `post-quote:${post.id}`,
        postId: post.id,
      });
    }
    if (parent && parent.userId !== user.id) {
      await createNotification({
        userId: parent.userId,
        actorId: user.id,
        kind: "post_reply",
        title: "New reply",
        safeBody: `@${user.username} replied to you.`,
        targetUrl: `/post/${(root ?? parent).id}`,
        metadata: { postId: post.id, parentId: parent.id },
        dedupeKey: `post-reply:${post.id}`,
        postId: post.id,
      });
    }
    await notifyMentions({
      authorId: user.id,
      authorUsername: user.username,
      body,
      targetUrl: `/post/${(root ?? post).id}`,
      targetKind: "post",
      targetId: post.id,
      metadata: { postId: post.id, rootId: (root ?? post).id },
      postId: post.id,
    });
    const levelBefore = levelForXp(user.xp);
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { xp: { increment: 8 } },
      select: { xp: true },
    });
    await bumpWeeklyXp(prisma, user.id, 8);
    await creditGuild(user.id, 8);
    void bumpGuildEvent(user.id, parent ? "reply_created" : "post_created");
    const levelAfter = levelForXp(updated.xp);
    const identity = await identityForUser(user.id, user.id);
    const quotedAuthor = post.quotedPost
      ? await identityForUser(post.quotedPost.userId, user.id)
      : null;
    const activity = await recordActivity(user.id, {
      type: parent ? "post_reply_created" : "post_created",
      eventKey: post.id,
      canonicalId: post.canonicalId ?? undefined,
      chapterNumber: post.chapterNumber ?? undefined,
    });
    return {
      id: post.id,
      parentId: post.parentId,
      body: post.body,
      kind: post.kind,
      rating: post.rating,
      gifUrl: post.gifUrl,
      imageUrls: post.imageUrls,
      isSpoiler: post.isSpoiler,
      createdAt: post.createdAt,
      author: identity,
      username: user.username,
      level: identity?.level ?? levelAfter,
      reactions: {},
      myReaction: null,
      mine: true,
      chapterNumber: post.chapterNumber,
      series: post.canonical
        ? {
            canonicalId: post.canonical.id,
            title: post.canonical.title,
            coverUrl: post.canonical.coverUrl,
          }
        : null,
      seriesTags: post.seriesTags.map((tag) => ({
        canonicalId: tag.canonical.id,
        title: tag.canonical.title,
        coverUrl: tag.canonical.coverUrl,
        chapterNumber: tag.chapterNumber,
      })),
      replies: [],
      commentCount: 0,
      poll:
        post.pollOptions.length > 0
          ? {
              options: post.pollOptions.map((o) => ({ id: o.id, text: o.text, votes: o._count.votes })),
              totalVotes: 0,
              myVote: null,
            }
          : null,
      quotedPost:
        post.quotedPost && post.quotedPost.moderationStatus === "visible"
          ? {
              id: post.quotedPost.id,
              author: quotedAuthor,
              username: quotedAuthor?.username ?? "Removed Reader",
              body: post.quotedPost.body,
              kind: post.quotedPost.kind,
              rating: post.quotedPost.rating,
              gifUrl: post.quotedPost.gifUrl,
              imageUrls: post.quotedPost.imageUrls,
              isSpoiler: post.quotedPost.isSpoiler,
              createdAt: post.quotedPost.createdAt,
              series: post.quotedPost.canonical
                ? {
                    canonicalId: post.quotedPost.canonical.id,
                    title: post.quotedPost.canonical.title,
                    coverUrl: post.quotedPost.canonical.coverUrl,
                  }
                : null,
            }
          : null,
      xpAwarded: 8,
      levelUp: activity.levelUp ?? (levelAfter > levelBefore ? levelAfter : null),
      completedQuests: activity.completedQuests,
    };
    },
  );

  app.delete<{ Params: { id: string } }>("/posts/:id", async (req) => {
    const user = await requireUser(req);
    const post = await prisma.post.findUnique({ where: { id: req.params.id } });
    if (!post || post.moderationStatus !== "visible") throw httpError(404, "No such post");
    if (post.userId !== user.id) throw httpError(403, "Not your post");
    await prisma.post.delete({ where: { id: post.id } });
    return { ok: true };
  });

  // React to a post. One reaction per reader per post — sending the same type
  // again clears it, a different type swaps it. The first reaction a reader
  // leaves grants the author EXP (and feeds quests + guild contribution);
  // swapping emotes doesn't.
  app.post<{ Params: { id: string } }>("/posts/:id/react", async (req) => {
    const user = await requireActiveUser(req);
    const { type } = z.object({ type: z.string() }).parse(req.body);
    if (!isReactionType(type)) throw httpError(400, "Unknown reaction");
    const post = await prisma.post.findUnique({ where: { id: req.params.id } });
    if (!post || post.moderationStatus !== "visible") throw httpError(404, "No such post");
    if (post.guildId) {
      const membership = await prisma.guildMember.findUnique({ where: { userId: user.id } });
      if (!membership || membership.guildId !== post.guildId) throw httpError(404, "No such post");
    }
    if ((await hiddenUserIds(user.id)).includes(post.userId)) {
      throw httpError(403, "You cannot interact with this user");
    }
    const key = { userId: user.id, postId: post.id };
    const existing = await prisma.postLike.findUnique({ where: { userId_postId: key } });
    const action = !existing ? "create" : existing.type === type ? "remove" : "switch";
    if (action === "create") await prisma.postLike.create({ data: { ...key, type } });
    else if (action === "remove") await prisma.postLike.delete({ where: { userId_postId: key } });
    else await prisma.postLike.update({ where: { userId_postId: key }, data: { type } });

    // EXP tracks whether the reader has *a* reaction, not which emote.
    const delta = (action === "create" ? 5 : 0) - (action === "remove" ? 5 : 0);
    let activity: Awaited<ReturnType<typeof recordActivity>> = {
      completedQuests: [],
      levelUp: null,
    };
    if (post.userId !== user.id && delta !== 0) {
      await prisma.user.update({
        where: { id: post.userId },
        data: { xp: { increment: delta } },
      });
      await bumpWeeklyXp(prisma, post.userId, delta);
      if (delta > 0) {
        await creditGuild(post.userId, 5);
        void bumpGuildEvent(post.userId, "reaction_received");
        await evaluateBadges(post.userId);
        await createNotification({
          userId: post.userId,
          actorId: user.id,
          kind: "post_reaction",
          title: "Your record got a reaction",
          safeBody: `@${user.username} reacted to your post.`,
          targetUrl: `/post/${post.rootId ?? post.id}`,
          metadata: { postId: post.id },
          dedupeKey: `post-like:${post.id}:${user.id}`,
          postId: post.id,
        });
        await recordActivity(post.userId, {
          type: "like_received",
          eventKey: `post:${post.id}:${user.id}`,
        });
      } else {
        await prisma.notification.updateMany({
          where: { userId: post.userId, dedupeKey: `post-like:${post.id}:${user.id}` },
          data: { dismissedAt: new Date() },
        });
      }
    }
    if (action === "create") {
      activity = await recordActivity(user.id, { type: "like_given", eventKey: `post:${post.id}` });
    }
    const groups = await prisma.postLike.groupBy({
      by: ["type"],
      where: { postId: post.id },
      _count: true,
    });
    const reactions = Object.fromEntries(groups.map((g) => [g.type, g._count]));
    return { reactions, myReaction: action === "remove" ? null : type, ...activity };
  });

  // Vote on a poll post. One vote per reader; re-voting moves it.
  app.post<{ Params: { id: string } }>("/posts/:id/vote", async (req) => {
    const user = await requireActiveUser(req);
    const { optionId } = z.object({ optionId: z.string().min(1) }).parse(req.body);
    const post = await prisma.post.findUnique({ where: { id: req.params.id } });
    if (!post || post.moderationStatus !== "visible" || post.kind !== "poll") {
      throw httpError(404, "No such poll");
    }
    if (post.guildId) {
      const membership = await prisma.guildMember.findUnique({ where: { userId: user.id } });
      if (!membership || membership.guildId !== post.guildId) throw httpError(404, "No such poll");
    }
    const option = await prisma.pollOption.findUnique({ where: { id: optionId } });
    if (!option || option.postId !== post.id) throw httpError(404, "No such option");
    await prisma.pollVote.upsert({
      where: { userId_postId: { userId: user.id, postId: post.id } },
      create: { userId: user.id, postId: post.id, optionId },
      update: { optionId },
    });
    const options = await prisma.pollOption.findMany({
      where: { postId: post.id },
      orderBy: { position: "asc" },
      select: { id: true, text: true, _count: { select: { votes: true } } },
    });
    return {
      options: options.map((o) => ({ id: o.id, text: o.text, votes: o._count.votes })),
      totalVotes: options.reduce((n, o) => n + o._count.votes, 0),
      myVote: optionId,
    };
  });

  // ── Guild board — the members-only wall (reuses the Post table) ────────
  async function requireGuildMember(userId: string, guildId: string) {
    const membership = await prisma.guildMember.findUnique({ where: { userId } });
    if (!membership || membership.guildId !== guildId) {
      throw httpError(403, "Guild members only");
    }
    return membership;
  }

  app.get<{ Params: { id: string } }>("/guilds/:id/board", async (req) => {
    const user = await requireUser(req);
    await requireGuildMember(user.id, req.params.id);
    const { page } = z
      .object({ page: z.coerce.number().int().min(1).default(1) })
      .parse(req.query);
    const blockedIds = await hiddenUserIds(user.id);
    const rows = await prisma.post.findMany({
      where: {
        guildId: req.params.id,
        parentId: null,
        moderationStatus: "visible",
        userId: { notIn: blockedIds },
      },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * 25,
      take: 25,
      include: postInclude(user.id),
    });
    const rootIds = rows.map((p) => p.id);
    const [counts, identities, reactionMap, memberRoles] = await Promise.all([
      rootIds.length
        ? prisma.post.groupBy({
            by: ["rootId"],
            where: { rootId: { in: rootIds }, moderationStatus: "visible", userId: { notIn: blockedIds } },
            _count: true,
          })
        : [],
      identitiesForUsers(rows.map((p) => p.userId), user.id),
      reactionsForPosts(rootIds),
      prisma.guildMember.findMany({
        where: { guildId: req.params.id, userId: { in: rows.map((p) => p.userId) } },
        select: { userId: true, role: true },
      }),
    ]);
    const countByRoot = new Map(counts.map((c) => [c.rootId, c._count]));
    const roleByUser = new Map(memberRoles.map((m) => [m.userId, m.role]));
    return rows.map((p) => ({
      ...serializePost(p, identities, user.id, reactionMap.get(p.id) ?? {}),
      commentCount: countByRoot.get(p.id) ?? 0,
      pinned: p.pinned,
      authorRole: roleByUser.get(p.userId) ?? null,
    }));
  });

  app.post<{ Params: { id: string } }>(
    "/guilds/:id/board",
    { config: { rateLimit: { max: 30, timeWindow: "1 hour" } } },
    async (req) => {
      const user = await requireAcceptedTerms(req);
      const membership = await requireGuildMember(user.id, req.params.id);
      const { body, isSpoiler } = z
        .object({
          body: z.string().trim().min(1).max(1000),
          isSpoiler: z.boolean().optional(),
        })
        .parse(req.body);
      validateUserContent(body);
      const post = await prisma.post.create({
        data: {
          userId: user.id,
          body,
          kind: "record",
          isSpoiler: isSpoiler ?? false,
          guildId: req.params.id,
        },
      });
      void bumpGuildEvent(user.id, "post_created");
      const identity = await identityForUser(user.id, user.id);
      return {
        id: post.id,
        body: post.body,
        kind: post.kind,
        isSpoiler: post.isSpoiler,
        createdAt: post.createdAt,
        author: identity,
        username: user.username,
        pinned: false,
        authorRole: membership.role,
        reactions: {},
        myReaction: null,
        mine: true,
        commentCount: 0,
      };
    },
  );

  // Officers pin/unpin a board post (the 📌 row at the top of the board).
  app.post<{ Params: { id: string } }>("/posts/:id/pin", async (req) => {
    const user = await requireActiveUser(req);
    const post = await prisma.post.findUnique({ where: { id: req.params.id } });
    if (!post || post.moderationStatus !== "visible" || !post.guildId || post.parentId) {
      throw httpError(404, "No such board post");
    }
    const membership = await prisma.guildMember.findUnique({ where: { userId: user.id } });
    if (
      !membership ||
      membership.guildId !== post.guildId ||
      !["guildmaster", "officer"].includes(membership.role)
    ) {
      throw httpError(403, "Officers only");
    }
    const updated = await prisma.post.update({
      where: { id: post.id },
      data: { pinned: !post.pinned },
    });
    return { ok: true, pinned: updated.pinned };
  });

  // Community review summary for a series: average rating, count, letter rank,
  // and the viewer's own review if they've filed one.
  app.get<{ Params: { id: string } }>("/canonical/:id/reviews", async (req) => {
    const me = await getUser(req);
    const canonicalId = req.params.id;
    const agg = await prisma.post.aggregate({
      where: { kind: "review", canonicalId, moderationStatus: "visible", rating: { not: null } },
      _avg: { rating: true },
      _count: true,
    });
    const count = agg._count;
    const average = agg._avg.rating ?? 0;
    const myReview = me
      ? await prisma.post.findFirst({
          where: { kind: "review", canonicalId, userId: me.id, moderationStatus: "visible" },
          orderBy: { createdAt: "desc" },
          select: { id: true, rating: true, body: true },
        })
      : null;
    return {
      canonicalId,
      count,
      average,
      rank: count > 0 ? seriesRankForAverage(average) : null,
      myReview: myReview ? { id: myReview.id, rating: myReview.rating ?? 0, body: myReview.body } : null,
    };
  });

  // ── Notifications ─────────────────────────────────────────────────────
  app.get("/notifications", async (req) => {
    const user = await requireUser(req);
    const { cursor } = z.object({ cursor: z.string().optional() }).parse(req.query);
    const rows = await prisma.notification.findMany({
      where: {
        userId: user.id,
        dismissedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { createdAt: "desc" },
      take: 31,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        comment: {
          include: {
            canonical: { select: { id: true, title: true } },
          },
        },
        post: {
          include: {
            canonical: { select: { id: true, title: true } },
          },
        },
      },
    });
    const hasMore = rows.length > 30;
    const page = rows.slice(0, 30);
    const identities = await identitiesForUsers(
      page.map((notification) => notification.actorId).filter((id): id is string => !!id),
      user.id,
    );
    await prisma.notification.updateMany({
      where: { id: { in: page.map((notification) => notification.id) }, seenAt: null },
      data: { seenAt: new Date() },
    });
    const items = page.map((n) => {
        const item = n.comment ?? n.post;
        const actor = n.actorId ? identities.get(n.actorId) ?? null : null;
        return {
          id: n.id,
          kind: n.kind,
          type: n.comment ? "comment" : n.post ? "post" : "system",
          createdAt: n.createdAt,
          read: n.readAt !== null,
          seen: n.seenAt !== null,
          title: n.title ?? "Notification",
          body: n.safeBody ?? "Open Mangadamia to view this update.",
          targetUrl: n.targetUrl,
          metadata: n.metadata,
          actor,
          fromUsername: actor?.username ?? "Mangadamia",
          canonicalId: item?.canonical?.id ?? null,
          seriesTitle: item?.canonical?.title ?? null,
          chapterNumber: item?.chapterNumber ?? null,
        };
      });
    return { items, nextCursor: hasMore ? page.at(-1)?.id ?? null : null };
  });

  app.get("/notifications/count", async (req) => {
    const user = await getUser(req);
    if (!user) return { unread: 0 };
    const unread = await prisma.notification.count({
      where: { userId: user.id, readAt: null, dismissedAt: null },
    });
    return { unread };
  });

  app.post("/notifications/read", async (req) => {
    const user = await requireUser(req);
    await prisma.notification.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>("/notifications/:id/read", async (req) => {
    const user = await requireUser(req);
    const updated = await prisma.notification.updateMany({
      where: { id: req.params.id, userId: user.id },
      data: { readAt: new Date(), seenAt: new Date() },
    });
    if (updated.count === 0) throw httpError(404, "Notification not found");
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>("/notifications/:id", async (req) => {
    const user = await requireUser(req);
    const updated = await prisma.notification.updateMany({
      where: { id: req.params.id, userId: user.id },
      data: { dismissedAt: new Date(), readAt: new Date() },
    });
    if (updated.count === 0) throw httpError(404, "Notification not found");
    return { ok: true };
  });

  app.get("/notifications/preferences", async (req) => {
    const user = await requireUser(req);
    return prisma.notificationPreference.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    });
  });

  app.patch("/notifications/preferences", async (req) => {
    const user = await requireUser(req);
    const preferences = z
      .object({
        pushEnabled: z.boolean().optional(),
        replies: z.boolean().optional(),
        reactions: z.boolean().optional(),
        follows: z.boolean().optional(),
        quests: z.boolean().optional(),
        newChapters: z.boolean().optional(),
        announcements: z.boolean().optional(),
      })
      .parse(req.body);
    return prisma.notificationPreference.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...preferences },
      update: preferences,
    });
  });

  app.put("/notifications/devices", async (req) => {
    const user = await requireUser(req);
    const { expoToken, platform, locale, deviceName } = z
      .object({
        expoToken: z
          .string()
          .regex(/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/),
        platform: z.enum(["android", "ios"]),
        locale: z.string().max(20).optional(),
        deviceName: z.string().max(100).optional(),
      })
      .parse(req.body);
    await prisma.pushDevice.upsert({
      where: { expoToken },
      create: { userId: user.id, expoToken, platform, locale, deviceName },
      update: { userId: user.id, platform, locale, deviceName, revokedAt: null, lastSeenAt: new Date() },
    });
    return { ok: true };
  });

  app.delete("/notifications/devices", async (req) => {
    const user = await requireUser(req);
    const { expoToken } = z.object({ expoToken: z.string().min(1) }).parse(req.body);
    await prisma.pushDevice.updateMany({
      where: { userId: user.id, expoToken },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  });

  app.get("/me/moderation-notices", async (req) => {
    const user = await requireUser(req);
    return prisma.moderationNotice.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        moderationAction: {
          select: { id: true, action: true, reasonCode: true, reason: true, createdAt: true },
        },
      },
    });
  });

  app.post<{ Params: { id: string } }>("/me/moderation-notices/:id/acknowledge", async (req) => {
    const user = await requireUser(req);
    const updated = await prisma.moderationNotice.updateMany({
      where: { id: req.params.id, userId: user.id },
      data: { acknowledgedAt: new Date() },
    });
    if (updated.count === 0) throw httpError(404, "Notice not found");
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>("/me/moderation-notices/:id/appeal", async (req) => {
    const user = await requireUser(req);
    const { message } = z.object({ message: z.string().trim().min(20).max(2000) }).parse(req.body);
    validateUserContent(message);
    const notice = await prisma.moderationNotice.findFirst({
      where: { id: req.params.id, userId: user.id },
    });
    if (!notice?.moderationActionId) throw httpError(404, "Appealable decision not found");
    const appeal = await prisma.appeal.create({
      data: { userId: user.id, moderationActionId: notice.moderationActionId, message },
    });
    return { ok: true, appeal };
  });

  app.get("/me/appeals", async (req) => {
    const user = await requireUser(req);
    return prisma.appeal.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, message: true, response: true, createdAt: true, reviewedAt: true },
    });
  });

  app.delete<{ Params: { id: string } }>("/comments/:id", async (req) => {
    const user = await requireUser(req);
    const comment = await prisma.comment.findUnique({ where: { id: req.params.id } });
    if (!comment || comment.moderationStatus !== "visible") {
      throw httpError(404, "No such comment");
    }
    if (comment.userId !== user.id) throw httpError(403, "Not your comment");
    await prisma.comment.delete({ where: { id: comment.id } });
    return { ok: true };
  });

  // React to a chapter comment — same emote set and semantics as posts: one
  // reaction per reader, tap the same emote to clear, another to swap. EXP
  // tracks whether the reader has *a* reaction, not which emote.
  app.post<{ Params: { id: string } }>("/comments/:id/react", async (req) => {
    const user = await requireActiveUser(req);
    const { type } = z.object({ type: z.string() }).parse(req.body);
    if (!isReactionType(type)) throw httpError(400, "Unknown reaction");
    const comment = await prisma.comment.findUnique({ where: { id: req.params.id } });
    if (!comment || comment.moderationStatus !== "visible") {
      throw httpError(404, "No such comment");
    }
    if ((await hiddenUserIds(user.id)).includes(comment.userId)) {
      throw httpError(403, "You cannot interact with this user");
    }
    const key = { userId: user.id, commentId: req.params.id };
    const existing = await prisma.commentLike.findUnique({ where: { userId_commentId: key } });
    const action = !existing ? "create" : existing.type === type ? "remove" : "switch";
    if (action === "create") await prisma.commentLike.create({ data: { ...key, type } });
    else if (action === "remove")
      await prisma.commentLike.delete({ where: { userId_commentId: key } });
    else await prisma.commentLike.update({ where: { userId_commentId: key }, data: { type } });

    // XP for the comment's author (no farming your own comments)
    const delta = (action === "create" ? 5 : 0) - (action === "remove" ? 5 : 0);
    if (comment.userId !== user.id && delta !== 0) {
      await prisma.user.update({
        where: { id: comment.userId },
        data: { xp: { increment: delta } },
      });
      await bumpWeeklyXp(prisma, comment.userId, delta);
      if (delta > 0) {
        await creditGuild(comment.userId, 5);
        void bumpGuildEvent(comment.userId, "reaction_received");
        await evaluateBadges(comment.userId);
        await createNotification({
          userId: comment.userId,
          actorId: user.id,
          kind: "comment_like",
          title: "Your comment got a reaction",
          safeBody: `@${user.username} reacted to your comment.`,
          targetUrl: "/notifications",
          metadata: { commentId: comment.id },
          dedupeKey: `comment-like:${comment.id}:${user.id}`,
          commentId: comment.id,
        });
      } else {
        await prisma.notification.updateMany({
          where: { userId: comment.userId, dedupeKey: `comment-like:${comment.id}:${user.id}` },
          data: { dismissedAt: new Date() },
        });
      }
    }
    const activity =
      action === "create"
        ? await recordActivity(user.id, { type: "like_given", eventKey: `comment:${comment.id}` })
        : { completedQuests: [], levelUp: null };
    if (action === "create" && comment.userId !== user.id) {
      await recordActivity(comment.userId, {
        type: "like_received",
        eventKey: `comment:${comment.id}:${user.id}`,
      });
    }
    const groups = await prisma.commentLike.groupBy({
      by: ["type"],
      where: { commentId: comment.id },
      _count: true,
    });
    const reactions = Object.fromEntries(groups.map((g) => [g.type, g._count]));
    return { reactions, myReaction: action === "remove" ? null : type, ...activity };
  });
}
