// Thin fetch wrapper for the console. Same origin as the API (served at
// /console/ in prod, Vite proxy in dev), bearer token from localStorage.

export interface ConsoleUser {
  id: string;
  username: string;
  email: string;
  role: string;
  capabilities: string[];
  status: string;
}

const TOKEN_KEY = "console.token";
const USER_KEY = "console.user";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const getUser = (): ConsoleUser | null => {
  const raw = localStorage.getItem(USER_KEY);
  try {
    return raw ? (JSON.parse(raw) as ConsoleUser) : null;
  } catch {
    return null;
  }
};
export const saveSession = (token: string, user: ConsoleUser) => {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};
export const clearSession = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
};
export const can = (cap: string) => getUser()?.capabilities.includes(cap) ?? false;

export async function req<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    clearSession();
    window.location.assign("/console/");
    throw new Error("Session expired — sign in again");
  }
  if (!res.ok) {
    let message = `${res.status} on ${path}`;
    try {
      const parsed = (await res.json()) as { message?: string };
      if (parsed.message) message = parsed.message;
    } catch {
      // keep fallback
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export async function login(email: string, password: string): Promise<ConsoleUser> {
  const res = await req<{ token: string; user: ConsoleUser }>("/auth/login", "POST", {
    email,
    password,
  });
  if (!res.user.capabilities || res.user.capabilities.length === 0) {
    throw new Error("This account has no staff capabilities.");
  }
  saveSession(res.token, res.user);
  return res.user;
}
