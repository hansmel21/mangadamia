// Signed-in session (token + user), persisted on-device in SQLite.
// Components subscribe via useSyncExternalStore-compatible subscribe/get.
import { db } from "./library";

export interface SessionUser {
  id: string;
  username: string;
  email: string;
  acceptedTermsVersion: string | null;
  role: "user" | "moderator" | "admin";
  status: "active" | "suspended" | "banned";
}

db.execSync(`CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);

let token: string | null = null;
let user: SessionUser | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded) return;
  loaded = true;
  const row = db.getFirstSync<{ value: string }>(`SELECT value FROM kv WHERE key = 'session'`);
  if (row) {
    try {
      const s = JSON.parse(row.value) as { token: string; user: SessionUser };
      token = s.token;
      user = s.user;
    } catch {
      // corrupted row — treat as signed out
    }
  }
}

export function getToken(): string | null {
  load();
  return token;
}

export function getSessionUser(): SessionUser | null {
  load();
  return user;
}

export function setSession(t: string | null, u: SessionUser | null) {
  token = t;
  user = u;
  loaded = true;
  if (t && u) {
    db.runSync(`INSERT OR REPLACE INTO kv (key, value) VALUES ('session', ?)`, [
      JSON.stringify({ token: t, user: u }),
    ]);
  } else {
    db.runSync(`DELETE FROM kv WHERE key = 'session'`);
  }
  for (const l of listeners) l();
}

export function updateSessionUser(patch: Partial<SessionUser>) {
  load();
  if (!token || !user) return;
  setSession(token, { ...user, ...patch });
}

export function subscribeSession(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
