import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { ZodError } from "zod";
import { registerRoutes } from "./routes/index.js";

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

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: "0.0.0.0" });
