// Image upload + local-file serving for post attachments (Social 3b).
// The composer re-encodes to JPEG client-side and POSTs the raw bytes here
// (no multipart), so the route just validates magic bytes and size, hands the
// buffer to the storage adapter, and returns the stored URL.
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { requireAcceptedTerms } from "../auth.js";
import { looksLikeJpeg, MAX_IMAGE_BYTES, saveImage, UPLOADS_DIR } from "../storage.js";

function httpError(statusCode: number, message: string): Error {
  return Object.assign(new Error(message), { statusCode });
}

export function registerUploadRoutes(app: FastifyInstance): void {
  // Raw JPEG bodies for the upload route only.
  app.addContentTypeParser(
    "image/jpeg",
    { parseAs: "buffer", bodyLimit: MAX_IMAGE_BYTES },
    (_req, body, done) => done(null, body),
  );

  app.post(
    "/uploads/image",
    {
      config: { rateLimit: { max: 40, timeWindow: "1 hour" } },
      bodyLimit: MAX_IMAGE_BYTES,
    },
    async (req) => {
      await requireAcceptedTerms(req);
      const buf = req.body as Buffer;
      if (!Buffer.isBuffer(buf) || buf.length === 0) {
        throw httpError(400, "Send the image as a raw image/jpeg body");
      }
      if (!looksLikeJpeg(buf)) throw httpError(400, "Only JPEG images are accepted");
      const url = await saveImage(buf);
      return { url };
    },
  );

  // Serve local-adapter files. Filenames are server-generated UUIDs, so the
  // strict pattern below doubles as the path-traversal guard.
  app.get<{ Params: { file: string } }>("/uploads/:file", async (req, reply) => {
    const { file } = req.params;
    if (!/^[0-9a-f-]{36}\.jpg$/i.test(file)) throw httpError(404, "Not found");
    const full = path.join(UPLOADS_DIR, file);
    try {
      const info = await stat(full);
      reply.header("content-type", "image/jpeg");
      reply.header("content-length", String(info.size));
      reply.header("cache-control", "public, max-age=31536000, immutable");
      return reply.send(createReadStream(full));
    } catch {
      throw httpError(404, "Not found");
    }
  });
}
