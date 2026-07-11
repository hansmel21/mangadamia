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
  displayBadges,
  levelForXp,
  xpForLevel,
} from "../badges.js";
import { prisma } from "../db/client.js";
import { CURRENT_TERMS_VERSION, validateUserContent } from "../policy.js";

const registerBody = z.object({
  email: z.string().email().max(200),
  username: z
    .string()
    .min(3)
    .max(20)
    .regex(/^[a-zA-Z0-9_]+$/, "letters, numbers and _ only"),
  password: z.string().min(8).max(200),
  acceptedTermsVersion: z.literal(CURRENT_TERMS_VERSION),
});

const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const commentBody = z.object({
  body: z.string().trim().min(1).max(1000),
  parentId: z.string().optional(),
});

const commentParams = z.object({
  canonicalId: z.string().min(1),
  chapterNumber: z.coerce.number(),
});

function httpError(statusCode: number, message: string): Error {
  return Object.assign(new Error(message), { statusCode });
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
      where: { OR: [{ email: email.toLowerCase() }, { username }] },
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
      },
    });
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
    const [stats, owned, fresh] = await Promise.all([
      getStats(user.id),
      prisma.userBadge.findMany({ where: { userId: user.id } }),
      prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { xp: true, equippedBadgeId: true },
      }),
    ]);
    const earnedAt = new Map(owned.map((b) => [b.badgeId, b.earnedAt]));
    const level = levelForXp(fresh.xp);
    return {
      user: publicUser(user),
      stats,
      xp: fresh.xp,
      level,
      equippedBadgeId: fresh.equippedBadgeId,
      xpForNextLevel: xpForLevel(level + 1),
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
    await prisma.user.delete({ where: { id: user.id } });
    return { ok: true };
  });

  // Equip an earned badge as your displayed Title (null to unequip)
  app.post("/me/title", async (req) => {
    const user = await requireUser(req);
    const { badgeId } = z.object({ badgeId: z.string().nullable() }).parse(req.body);
    if (badgeId) {
      const earned = await prisma.userBadge.findUnique({
        where: { userId_badgeId: { userId: user.id, badgeId } },
      });
      if (!earned) throw httpError(403, "You haven't earned that badge yet");
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { equippedBadgeId: badgeId },
    });
    return { ok: true, equippedBadgeId: badgeId };
  });

  // ── Public profiles & safety ──────────────────────────────────────────
  app.get<{ Params: { username: string } }>("/users/:username", async (req) => {
    const me = await getUser(req);
    const target = await prisma.user.findUnique({
      where: { username: req.params.username },
      select: { id: true, username: true, xp: true, createdAt: true },
    });
    if (!target) throw httpError(404, "No such reader");
    const [stats, owned, postCount, badges, blocked, recentPosts] = await Promise.all([
      getStats(target.id),
      prisma.userBadge.findMany({ where: { userId: target.id }, orderBy: { earnedAt: "asc" } }),
      prisma.post.count({
        where: { userId: target.id, moderationStatus: "visible", user: { status: { not: "banned" } } },
      }),
      displayBadges([target.id]),
      me
        ? prisma.block.findUnique({
            where: { blockerId_blockedId: { blockerId: me.id, blockedId: target.id } },
          })
        : null,
      prisma.post.findMany({
        where: {
          userId: target.id,
          parentId: null,
          moderationStatus: "visible",
          user: { status: { not: "banned" } },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          canonical: { select: { id: true, title: true, coverUrl: true } },
          _count: { select: { likes: true, replies: true } },
        },
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
      level: levelForXp(target.xp),
      memberDays: Math.floor((Date.now() - target.createdAt.getTime()) / 86_400_000),
      title: badges.get(target.id) ?? null,
      stats: { ...stats, posts: postCount },
      badges: earnedDefs,
      blockedByMe: !!blocked,
      isMe: me?.id === target.id,
      recentPosts: recentPosts.map((p) => ({
        id: p.id,
        body: p.body,
        isSpoiler: p.isSpoiler,
        createdAt: p.createdAt,
        chapterNumber: p.chapterNumber,
        likeCount: p._count.likes,
        replyCount: p._count.replies,
        series: p.canonical
          ? {
              canonicalId: p.canonical.id,
              title: p.canonical.title,
              coverUrl: p.canonical.coverUrl,
            }
          : null,
      })),
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
    else await prisma.block.create({ data: key });
    return { blocked: !existing };
  });

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
    await prisma.report.create({
      data: { reporterId: me.id, targetType, targetId, reason },
    });
    return { ok: true };
    },
  );

  // Reading activity (signed-in): powers reading badges/XP, and later sync
  app.post("/activity/read", async (req) => {
    const user = await requireUser(req);
    const { canonicalId, chapterNumber } = z
      .object({ canonicalId: z.string().min(1), chapterNumber: z.coerce.number() })
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
      newBadges = (await evaluateBadges(user.id)).map((b) => ({
        id: b.id,
        name: b.name,
        icon: b.icon,
      }));
    }
    return { ok: true, newBadges, levelUp };
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
          user: { status: { not: "banned" } },
          userId: { notIn: blockedIds },
        },
        orderBy: { createdAt: "desc" },
        take: 500,
        include: {
          user: { select: { username: true, xp: true } },
          _count: { select: { likes: true } },
          likes: me ? { where: { userId: me.id }, select: { userId: true } } : false,
        },
      });
      const badges = await displayBadges([...new Set(rows.map((c) => c.userId))]);
      interface CommentNode {
        id: string;
        parentId: string | null;
        body: string;
        username: string;
        level: number;
        badgeId: string | null;
        badgeIcon: string | null;
        createdAt: Date;
        likeCount: number;
        likedByMe: boolean;
        mine: boolean;
        replies: CommentNode[];
      }
      const serialize = (c: (typeof rows)[number]): CommentNode => ({
        id: c.id,
        parentId: c.parentId,
        body: c.body,
        username: c.user.username,
        level: levelForXp(c.user.xp),
        badgeId: badges.get(c.userId)?.id ?? null,
        badgeIcon: badges.get(c.userId)?.icon ?? null,
        createdAt: c.createdAt,
        likeCount: c._count.likes,
        likedByMe: me ? c.likes.length > 0 : false,
        mine: me ? c.userId === me.id : false,
        replies: [],
      });
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
      const { body, parentId } = commentBody.parse(req.body);
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
        data: { userId: user.id, canonicalId, chapterNumber, body, parentId: parent?.id },
      });
      // Notify the parent's author (not when replying to yourself)
      if (parent && parent.userId !== user.id) {
        await prisma.notification.create({
          data: { userId: parent.userId, commentId: comment.id },
        });
      }
      const levelBefore = levelForXp(user.xp);
      const updated = await prisma.user.update({
        where: { id: user.id },
        data: { xp: { increment: 10 } },
        select: { xp: true },
      });
      const levelAfter = levelForXp(updated.xp);
      const levelUp = levelAfter > levelBefore ? levelAfter : null;
      const newBadges = (await evaluateBadges(user.id)).map((b) => ({
        id: b.id,
        name: b.name,
        icon: b.icon,
      }));
      const badges = await displayBadges([user.id]);
      return {
        id: comment.id,
        parentId: comment.parentId,
        body: comment.body,
        username: user.username,
        level: levelForXp(updated.xp),
        badgeId: badges.get(user.id)?.id ?? null,
        badgeIcon: badges.get(user.id)?.icon ?? null,
        createdAt: comment.createdAt,
        likeCount: 0,
        likedByMe: false,
        mine: true,
        replies: [],
        newBadges,
        levelUp,
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
    isSpoiler: boolean;
    createdAt: Date;
    username: string;
    level: number;
    badgeId: string | null;
    badgeIcon: string | null;
    likeCount: number;
    likedByMe: boolean;
    mine: boolean;
    chapterNumber: number | null;
    series: { canonicalId: string; title: string; coverUrl: string | null } | null;
    replies: PostNode[];
  }

  const postInclude = (meId?: string) =>
    ({
      user: { select: { username: true, xp: true } },
      canonical: { select: { id: true, title: true, coverUrl: true } },
      _count: { select: { likes: true } },
      likes: meId ? { where: { userId: meId }, select: { userId: true } } : false,
    }) as const;

  app.get("/posts", async (req) => {
    const { page, canonicalId } = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        canonicalId: z.string().optional(),
      })
      .parse(req.query);
    const me = await getUser(req);
    const blockedIds = me ? await hiddenUserIds(me.id) : [];
    const rows = await prisma.post.findMany({
      where: {
        parentId: null,
        moderationStatus: "visible",
        user: { status: { not: "banned" } },
        userId: { notIn: blockedIds },
        ...(canonicalId ? { canonicalId } : {}),
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * 25,
      take: 25,
      include: {
        ...postInclude(me?.id),
        replies: {
          where: {
            userId: { notIn: blockedIds },
            moderationStatus: "visible",
            user: { status: { not: "banned" } },
          },
          orderBy: { createdAt: "asc" },
          include: postInclude(me?.id),
        },
      },
    });
    const userIds = [
      ...new Set([...rows.map((p) => p.userId), ...rows.flatMap((p) => p.replies.map((r) => r.userId))]),
    ];
    const badges = await displayBadges(userIds);
    const serialize = (p: (typeof rows)[number]["replies"][number]): PostNode => ({
      id: p.id,
      parentId: p.parentId,
      body: p.body,
      isSpoiler: p.isSpoiler,
      createdAt: p.createdAt,
      username: p.user.username,
      level: levelForXp(p.user.xp),
      badgeId: badges.get(p.userId)?.id ?? null,
      badgeIcon: badges.get(p.userId)?.icon ?? null,
      likeCount: p._count.likes,
      likedByMe: me ? p.likes.length > 0 : false,
      mine: me ? p.userId === me.id : false,
      chapterNumber: p.chapterNumber,
      series: p.canonical
        ? { canonicalId: p.canonical.id, title: p.canonical.title, coverUrl: p.canonical.coverUrl }
        : null,
      replies: [],
    });
    return rows.map((p) => ({ ...serialize(p), replies: p.replies.map(serialize) }));
  });

  app.post(
    "/posts",
    { config: { rateLimit: { max: 30, timeWindow: "1 hour" } } },
    async (req) => {
    const { body, canonicalId, chapterNumber, parentId, isSpoiler } = z
      .object({
        body: z.string().trim().min(1).max(1000),
        canonicalId: z.string().optional(),
        chapterNumber: z.coerce.number().optional(),
        parentId: z.string().optional(),
        isSpoiler: z.boolean().optional(),
      })
      .parse(req.body);
    const user = await requireAcceptedTerms(req);
    validateUserContent(body);
    if (canonicalId) {
      const canonical = await prisma.canonicalSeries.findUnique({ where: { id: canonicalId } });
      if (!canonical) throw httpError(404, "Unknown series");
    }
    // Replies flatten to the top-level post, same as comments
    let parent = null;
    if (parentId) {
      parent = await prisma.post.findUnique({ where: { id: parentId } });
      if (!parent || parent.moderationStatus !== "visible") {
        throw httpError(404, "No such post to reply to");
      }
      if (parent.parentId) {
        parent = await prisma.post.findUnique({ where: { id: parent.parentId } });
        if (!parent) throw httpError(404, "No such post to reply to");
      }
      if ((await hiddenUserIds(user.id)).includes(parent.userId)) {
        throw httpError(403, "You cannot interact with this user");
      }
    }
    const post = await prisma.post.create({
      data: {
        userId: user.id,
        body,
        isSpoiler: isSpoiler ?? false,
        canonicalId: parent ? parent.canonicalId : (canonicalId ?? null),
        chapterNumber: parent ? parent.chapterNumber : (chapterNumber ?? null),
        parentId: parent?.id,
      },
      include: postInclude(user.id),
    });
    if (parent && parent.userId !== user.id) {
      await prisma.notification.create({ data: { userId: parent.userId, postId: post.id } });
    }
    const levelBefore = levelForXp(user.xp);
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { xp: { increment: 8 } },
      select: { xp: true },
    });
    const levelAfter = levelForXp(updated.xp);
    const badges = await displayBadges([user.id]);
    return {
      id: post.id,
      parentId: post.parentId,
      body: post.body,
      isSpoiler: post.isSpoiler,
      createdAt: post.createdAt,
      username: user.username,
      level: levelAfter,
      badgeId: badges.get(user.id)?.id ?? null,
      badgeIcon: badges.get(user.id)?.icon ?? null,
      likeCount: 0,
      likedByMe: false,
      mine: true,
      chapterNumber: post.chapterNumber,
      series: post.canonical
        ? {
            canonicalId: post.canonical.id,
            title: post.canonical.title,
            coverUrl: post.canonical.coverUrl,
          }
        : null,
      replies: [],
      levelUp: levelAfter > levelBefore ? levelAfter : null,
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

  app.post<{ Params: { id: string } }>("/posts/:id/like", async (req) => {
    const user = await requireActiveUser(req);
    const post = await prisma.post.findUnique({ where: { id: req.params.id } });
    if (!post || post.moderationStatus !== "visible") throw httpError(404, "No such post");
    if ((await hiddenUserIds(user.id)).includes(post.userId)) {
      throw httpError(403, "You cannot interact with this user");
    }
    const key = { userId: user.id, postId: post.id };
    const existing = await prisma.postLike.findUnique({ where: { userId_postId: key } });
    if (existing) await prisma.postLike.delete({ where: { userId_postId: key } });
    else await prisma.postLike.create({ data: key });
    if (post.userId !== user.id) {
      await prisma.user.update({
        where: { id: post.userId },
        data: { xp: { increment: existing ? -5 : 5 } },
      });
      if (!existing) await evaluateBadges(post.userId);
    }
    const likeCount = await prisma.postLike.count({ where: { postId: post.id } });
    return { liked: !existing, likeCount };
  });

  // ── Notifications ─────────────────────────────────────────────────────
  app.get("/notifications", async (req) => {
    const user = await requireActiveUser(req);
    const rows = await prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        comment: {
          include: {
            user: { select: { username: true } },
            canonical: { select: { id: true, title: true } },
          },
        },
        post: {
          include: {
            user: { select: { username: true } },
            canonical: { select: { id: true, title: true } },
          },
        },
      },
    });
    return rows
      .map((n) => {
        const item = n.comment ?? n.post;
        if (!item) return null;
        return {
          id: n.id,
          type: n.comment ? "comment" : "post",
          createdAt: n.createdAt,
          read: n.readAt !== null,
          fromUsername: item.user.username,
          body: item.body.slice(0, 140),
          canonicalId: item.canonical?.id ?? null,
          seriesTitle: item.canonical?.title ?? null,
          chapterNumber: item.chapterNumber ?? null,
        };
      })
      .filter((n) => n !== null);
  });

  app.get("/notifications/count", async (req) => {
    const user = await getUser(req);
    if (!user) return { unread: 0 };
    const unread = await prisma.notification.count({
      where: { userId: user.id, readAt: null },
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

  app.post<{ Params: { id: string } }>("/comments/:id/like", async (req) => {
    const user = await requireActiveUser(req);
    const comment = await prisma.comment.findUnique({ where: { id: req.params.id } });
    if (!comment || comment.moderationStatus !== "visible") {
      throw httpError(404, "No such comment");
    }
    if ((await hiddenUserIds(user.id)).includes(comment.userId)) {
      throw httpError(403, "You cannot interact with this user");
    }
    const key = { userId: user.id, commentId: req.params.id };
    const existing = await prisma.commentLike.findUnique({
      where: { userId_commentId: key },
    });
    if (existing) {
      await prisma.commentLike.delete({ where: { userId_commentId: key } });
    } else {
      await prisma.commentLike.create({ data: key });
    }
    // XP for the comment's author (no farming your own comments)
    if (comment.userId !== user.id) {
      await prisma.user.update({
        where: { id: comment.userId },
        data: { xp: { increment: existing ? -5 : 5 } },
      });
      if (!existing) await evaluateBadges(comment.userId);
    }
    const likeCount = await prisma.commentLike.count({ where: { commentId: req.params.id } });
    return { liked: !existing, likeCount };
  });
}
