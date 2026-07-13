// Image storage abstraction (Social 3b). Local-disk adapter for development
// (files under api/uploads, served by GET /uploads/:file, stored as relative
// "/uploads/…" URLs the client resolves against its API base); Cloudinary
// adapter for production — set CLOUDINARY_URL (cloudinary://key:secret@cloud)
// and uploads switch over with no code changes. Optional CLOUDINARY_MODERATION
// (e.g. "aws_rek") turns on Cloudinary's AI moderation for Play compliance.
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
export const MAX_IMAGES_PER_POST = 4;

function parseCloudinaryUrl(): { cloud: string; key: string; secret: string } | null {
  const raw = process.env.CLOUDINARY_URL;
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "cloudinary:" || !u.username || !u.password || !u.hostname) return null;
    return { cloud: u.hostname, key: u.username, secret: u.password };
  } catch {
    return null;
  }
}

// JPEG magic bytes — the composer always re-encodes to JPEG before upload.
export function looksLikeJpeg(buf: Buffer): boolean {
  return buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[buf.length - 1] === 0xd9;
}

async function saveLocal(buf: Buffer): Promise<string> {
  await mkdir(UPLOADS_DIR, { recursive: true });
  const name = `${randomUUID()}.jpg`;
  await writeFile(path.join(UPLOADS_DIR, name), buf);
  return `/uploads/${name}`;
}

async function saveCloudinary(
  buf: Buffer,
  cfg: { cloud: string; key: string; secret: string },
): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000);
  const params: Record<string, string> = { timestamp: String(timestamp) };
  const moderation = process.env.CLOUDINARY_MODERATION;
  if (moderation) params.moderation = moderation;
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  const signature = createHash("sha1").update(toSign + cfg.secret).digest("hex");
  const form = new FormData();
  form.set("file", `data:image/jpeg;base64,${buf.toString("base64")}`);
  form.set("api_key", cfg.key);
  form.set("timestamp", String(timestamp));
  form.set("signature", signature);
  if (moderation) form.set("moderation", moderation);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cfg.cloud}/image/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    throw Object.assign(new Error("Image upload failed"), { statusCode: 502 });
  }
  const data = (await res.json()) as { secure_url?: string };
  if (!data.secure_url) {
    throw Object.assign(new Error("Image upload failed"), { statusCode: 502 });
  }
  return data.secure_url;
}

export async function saveImage(buf: Buffer): Promise<string> {
  const cloudinary = parseCloudinaryUrl();
  return cloudinary ? saveCloudinary(buf, cloudinary) : saveLocal(buf);
}

// A post may only reference images our storage produced: local "/uploads/…"
// paths or this account's Cloudinary delivery URLs.
export function isStoredImageUrl(url: string): boolean {
  if (/^\/uploads\/[0-9a-f-]{36}\.jpg$/i.test(url)) return true;
  const cloudinary = parseCloudinaryUrl();
  if (!cloudinary) return false;
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      u.hostname === "res.cloudinary.com" &&
      u.pathname.startsWith(`/${cloudinary.cloud}/`)
    );
  } catch {
    return false;
  }
}
