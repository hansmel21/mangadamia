// Console shell: login gate, capability-filtered sidebar, routed pages.
import { useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { clearSession, getToken, getUser, login, type ConsoleUser } from "./api";
import { Announcements } from "./pages/Announcements";
import { Appeals } from "./pages/Appeals";
import { ArenaEvents } from "./pages/ArenaEvents";
import { Audit } from "./pages/Audit";
import { Content } from "./pages/Content";
import { Dashboard } from "./pages/Dashboard";
import { Reports } from "./pages/Reports";
import { Users } from "./pages/Users";

function Login({ onLogin }: { onLogin: (u: ConsoleUser) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      onLogin(await login(email.trim(), password));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="login-wrap">
      <div className="login-box">
        <h1>SYSTEM CONSOLE</h1>
        <div className="field">
          <label>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </div>
        {error ? <p className="error">{error}</p> : null}
        <button disabled={busy || !email || !password} onClick={submit}>
          {busy ? "AUTHENTICATING…" : "ENTER ▸"}
        </button>
        <p className="muted" style={{ fontSize: 11, marginTop: 12 }}>
          Staff accounts only — sign-ins without capabilities are rejected.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<ConsoleUser | null>(() => (getToken() ? getUser() : null));
  if (!user) return <Login onLogin={setUser} />;
  const caps = new Set(user.capabilities);
  const nav: { to: string; label: string; cap: string }[] = [
    { to: "/", label: "◆ DASHBOARD", cap: "view_reports" },
    { to: "/content", label: "CONTENT AUDIT", cap: "view_reports" },
    { to: "/reports", label: "REPORTS", cap: "view_reports" },
    { to: "/appeals", label: "APPEALS", cap: "review_appeals" },
    { to: "/audit", label: "AUDIT LOG", cap: "view_audit" },
    { to: "/users", label: "READERS", cap: "manage_rewards" },
    { to: "/announcements", label: "ANNOUNCEMENTS", cap: "manage_rewards" },
    { to: "/arena", label: "ARENA EVENTS", cap: "manage_rewards" },
  ];
  return (
    <>
      <nav className="sidebar">
        <div className="brand">⟐ SYSTEM CONSOLE</div>
        {nav
          .filter((n) => caps.has(n.cap))
          .map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === "/"} className={({ isActive }) => (isActive ? "active" : "")}>
              {n.label}
            </NavLink>
          ))}
        <div className="whoami">
          {user.username} · {user.role}
          <br />
          <a
            href="/console/"
            onClick={(e) => {
              e.preventDefault();
              clearSession();
              setUser(null);
            }}
          >
            sign out ▸
          </a>
        </div>
      </nav>
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          {caps.has("view_reports") ? <Route path="/content" element={<Content />} /> : null}
          {caps.has("view_reports") ? <Route path="/reports" element={<Reports />} /> : null}
          {caps.has("review_appeals") ? <Route path="/appeals" element={<Appeals />} /> : null}
          {caps.has("view_audit") ? <Route path="/audit" element={<Audit />} /> : null}
          {caps.has("manage_rewards") ? <Route path="/users" element={<Users />} /> : null}
          {caps.has("manage_rewards") ? <Route path="/announcements" element={<Announcements />} /> : null}
          {caps.has("manage_rewards") ? <Route path="/arena" element={<ArenaEvents />} /> : null}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}
