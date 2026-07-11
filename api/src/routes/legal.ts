import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { verifyPassword } from "../auth.js";
import { prisma } from "../db/client.js";
import { CURRENT_TERMS_VERSION, PROHIBITED_CONTENT, SUPPORT_EMAIL } from "../policy.js";
import { deleteUserCompletely } from "../accounts.js";

const developer = process.env.DEVELOPER_LEGAL_NAME ?? "Mangadamia developer";
const esc = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>body{font:16px/1.55 system-ui;max-width:760px;margin:auto;padding:32px;color:#171a21}h1,h2{line-height:1.2}a{color:#5b3fd6}.box{padding:16px;background:#f4f1ff;border-radius:8px}input,button{font:inherit;padding:10px;width:100%;box-sizing:border-box;margin:6px 0}button{cursor:pointer}</style></head><body><h1>${esc(title)}</h1><p>Effective ${CURRENT_TERMS_VERSION}</p>${body}<hr><p>${esc(developer)} · <a href="mailto:${esc(SUPPORT_EMAIL)}">${esc(SUPPORT_EMAIL)}</a></p></body></html>`;
}

export function registerLegalRoutes(app: FastifyInstance): void {
  app.get("/legal/terms", async (_req, reply) =>
    reply.type("text/html").send(
      page(
        "Mangadamia Terms of Use",
        `<h2>Community participation</h2><p>Users must confirm they are at least 13, meet the minimum digital-consent age in their country, and accept these terms before posting.</p><h2>Prohibited conduct</h2><ul>${PROHIBITED_CONTENT.map((item) => `<li>${esc(item)}</li>`).join("")}</ul><h2>Moderation</h2><p>We may review reports, remove content, and warn, suspend, or ban accounts. Users may report content and users, block users, acknowledge warnings, and appeal moderation decisions in the app.</p><h2>Third-party content</h2><p>Manga titles, covers, and chapters remain the property of their creators and rights holders. Mangadamia accesses the documented MangaDex API and does not provide offline chapter downloads.</p>`,
      ),
    ),
  );

  app.get("/legal/community", async (_req, reply) =>
    reply.type("text/html").send(
      page(
        "Mangadamia Community Guidelines",
        `<p>Be respectful, mark spoilers, and do not spam or manipulate engagement.</p><h2>Zero tolerance child-safety rule</h2><p>Child sexual abuse and exploitation, grooming, sexualization of minors, requests for illegal material, and links to such material are prohibited. We remove it, disable involved accounts, preserve evidence where legally required, and report to appropriate authorities.</p><h2>Report and block</h2><p>Use the in-app controls on posts, comments, and profiles. Urgent safety concerns may be sent to the support contact below.</p>`,
      ),
    ),
  );

  app.get("/legal/privacy", async (_req, reply) =>
    reply.type("text/html").send(
      page(
        "Mangadamia Privacy Policy",
        `<h2>Data collected</h2><p>We process email address, username, password hash, sessions, age attestation, Terms acceptance, profile settings, titles, cosmetics, follows, library and reading activity, quest progress, posts, comments, likes, reports, blocks, push device tokens, notifications, appeals, moderation records, and security logs such as IP address and request metadata.</p><h2>Purposes</h2><p>Data is used to operate accounts, sync reading activity, provide community and reward features, deliver opted-in notifications, secure the service, prevent abuse, and investigate reports.</p><h2>Service providers and MangaDex</h2><p>Hosting, database, crash-reporting, and notification providers may process data to provide their services. Catalog and chapter delivery use MangaDex and its delivery network, which receive ordinary network information.</p><h2>Retention and deletion</h2><p>Account data is retained while active. Account deletion removes associated profile, content, reading data, rewards, social relationships, device tokens, notifications, reports, appeals, and moderation records.</p><h2>Security and rights</h2><p>Production traffic is encrypted in transit and passwords are hashed. Contact us to request access, correction, or deletion.</p>`,
      ),
    ),
  );

  app.get("/legal/delete-account", async (_req, reply) =>
    reply.type("text/html").send(
      page(
        "Delete your Mangadamia account",
        `<p>Deleting your account permanently removes its profile, content, library, reading and quest activity, rewards, social relationships, device tokens, reports, notifications, appeals, moderation records, and active sessions. This cannot be undone.</p><form id="delete"><label>Email<input id="email" type="email" required autocomplete="email"></label><label>Password<input id="password" type="password" required autocomplete="current-password"></label><button type="submit">Delete account and associated data</button></form><p id="result" class="box" hidden></p><script>document.getElementById('delete').addEventListener('submit',async(e)=>{e.preventDefault();const result=document.getElementById('result');result.hidden=false;result.textContent='Processing…';const response=await fetch('/public/delete-account',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:document.getElementById('email').value,password:document.getElementById('password').value})});const data=await response.json().catch(()=>({message:'Request failed'}));result.textContent=response.ok?'Your account and associated data were deleted.':(data.message||'Request failed');});</script>`,
      ),
    ),
  );

  app.post(
    "/public/delete-account",
    { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } },
    async (req) => {
    const { email, password } = z
      .object({ email: z.string().email().max(200), password: z.string().min(1).max(200) })
      .parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw Object.assign(new Error("Email or password was not accepted"), { statusCode: 403 });
    }
    await deleteUserCompletely(user.id);
    return { ok: true };
    },
  );
}
