import { existsSync } from "node:fs";
import path from "node:path";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { ZodError } from "zod";
import { registerRoutes } from "./routes/index.js";
import { finalizeArenaEvent } from "./arena.js";
import { prisma } from "./db/client.js";
import { finalizePastWars } from "./guilds.js";
import { dispatchPendingPushes } from "./notifications.js";

if (process.env.NODE_ENV === "production") {
  const required = ["DATABASE_URL", "SUPPORT_EMAIL", "DEVELOPER_LEGAL_NAME", "APP_USER_AGENT"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) throw new Error(`Missing production configuration: ${missing.join(", ")}`);
}

const app = Fastify({
  logger: true,
  bodyLimit: 256 * 1024,
  trustProxy: process.env.TRUST_PROXY === "true",
});

const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);
await app.register(cors, {
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    callback(null, false);
  },
});
await app.register(helmet, { contentSecurityPolicy: false });
await app.register(rateLimit, {
  global: true,
  max: 120,
  timeWindow: "1 minute",
});

app.setErrorHandler((error, req, reply) => {
  if (error instanceof ZodError) {
    return reply.status(400).send({ message: "Invalid request", issues: error.issues });
  }
  const err = error as Error & { statusCode?: number };
  const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
  if (status >= 500) req.log.error(error);
  return reply.status(status).send({
    message: status >= 500 ? "Internal server error" : err.message,
  });
});

registerRoutes(app);

// Web admin console: the built SPA from /console/dist, served same-origin at
// /console/ (no CORS surface). Registered only when a build exists, so the
// API boots clean in dev without one — use `vite dev` (:5173) there instead.
const consoleDist = path.resolve(process.cwd(), "../console/dist");
if (existsSync(consoleDist)) {
  await app.register(fastifyStatic, {
    root: consoleDist,
    prefix: "/console/",
    wildcard: false,
  });
  // SPA fallback: any non-asset /console path renders the app shell.
  app.get("/console", (_req, reply) => reply.redirect("/console/"));
  app.get("/console/*", (_req, reply) => reply.sendFile("index.html", consoleDist));
}

// Best-effort delivery for queued, spoiler-safe pushes. Database notifications
// remain the source of truth if the provider or network is unavailable.
// Batch of 250 so an announcement blast to the whole userbase drains quickly.
void dispatchPendingPushes(250);
setInterval(() => void dispatchPendingPushes(250), 30_000).unref();

// Scheduled close-outs: ended arena events pay their winners and finished
// guild wars freeze + pay promptly instead of waiting for the next read.
// The lazy on-read paths remain as the fallback if the process was down.
async function runScheduledCloseouts(): Promise<void> {
  try {
    const ended = await prisma.arenaEvent.findMany({
      where: { finalizedAt: null, endsAt: { lt: new Date() } },
      select: { id: true },
      take: 20,
    });
    for (const event of ended) await finalizeArenaEvent(event.id);
  } catch {
    // best-effort; retried next tick
  }
  await finalizePastWars();
}
void runScheduledCloseouts();
setInterval(() => void runScheduledCloseouts(), 5 * 60_000).unref();

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: "0.0.0.0" });
