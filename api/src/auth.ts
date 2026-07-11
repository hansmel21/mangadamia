// Password hashing (scrypt, no external deps) and bearer-session helpers.
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { User } from "@prisma/client";
import type { FastifyRequest } from "fastify";
import { prisma } from "./db/client.js";
import { CURRENT_TERMS_VERSION } from "./policy.js";

const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(hash, "hex"));
}

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await prisma.session.create({
    data: { token, userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
  });
  return token;
}

/** Resolve the user for a request's bearer token, or null. */
export async function getUser(req: FastifyRequest): Promise<User | null> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  const session = await prisma.session.findUnique({
    where: { token: auth.slice(7) },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) return null;
  if (
    session.user.status === "suspended" &&
    session.user.suspendedUntil &&
    session.user.suspendedUntil <= new Date()
  ) {
    return prisma.user.update({
      where: { id: session.user.id },
      data: { status: "active", suspendedUntil: null },
    });
  }
  return session.user;
}

/** Like getUser, but 401s when unauthenticated. */
export async function requireUser(req: FastifyRequest): Promise<User> {
  const user = await getUser(req);
  if (!user) throw Object.assign(new Error("Sign in required"), { statusCode: 401 });
  return user;
}

export async function requireActiveUser(req: FastifyRequest): Promise<User> {
  const user = await requireUser(req);
  if (user.status === "banned") {
    throw Object.assign(new Error("This account has been banned"), { statusCode: 403 });
  }
  if (user.status === "suspended") {
    throw Object.assign(new Error("This account is temporarily suspended"), { statusCode: 403 });
  }
  return user;
}

export async function requireAcceptedTerms(req: FastifyRequest): Promise<User> {
  const user = await requireActiveUser(req);
  if (user.acceptedTermsVersion !== CURRENT_TERMS_VERSION) {
    throw Object.assign(new Error("Accept the current Terms of Use before posting"), {
      statusCode: 403,
    });
  }
  return user;
}

export async function requireModerator(req: FastifyRequest): Promise<User> {
  const user = await requireActiveUser(req);
  if (user.role !== "moderator" && user.role !== "admin") {
    throw Object.assign(new Error("Moderator access required"), { statusCode: 403 });
  }
  return user;
}

export function publicUser(u: User) {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    acceptedTermsVersion: u.acceptedTermsVersion,
    role: u.role,
    status: u.status,
  };
}
