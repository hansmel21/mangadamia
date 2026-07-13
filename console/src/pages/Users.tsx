// User administration — search, titles, roles (owner password re-confirm).
import { useCallback, useEffect, useState } from "react";
import { can, req } from "../api";
import { Modal } from "../components";

interface TitleDef {
  id: string;
  name: string;
  rarity: string;
}
interface UserRow {
  id: string;
  username: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
  titles: { title: { id: string; name: string } }[];
}

const ROLES = ["user", "community_moderator", "moderator", "senior_moderator", "admin", "owner"];

export function Users() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<UserRow[]>([]);
  const [titles, setTitles] = useState<TitleDef[]>([]);
  const [target, setTarget] = useState<UserRow | null>(null);
  const [titleId, setTitleId] = useState("");
  const [role, setRole] = useState("user");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(() => {
    req<UserRow[]>(`/admin/users?q=${encodeURIComponent(q.trim())}`)
      .then((r) => {
        setRows(r);
        setError("");
      })
      .catch((e) => setError(e.message));
  }, [q]);
  useEffect(() => {
    const t = setTimeout(load, 350);
    return () => clearTimeout(t);
  }, [load]);
  useEffect(() => {
    req<TitleDef[]>("/admin/titles").then(setTitles).catch(() => {});
  }, []);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      setNotice(done);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1>READERS</h1>
      <div className="filters">
        <div>
          <label>Search username or email</label>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="search…" />
        </div>
        <span className="muted">{rows.length} result(s)</span>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {notice ? <p className="ok">{notice}</p> : null}
      <table>
        <thead>
          <tr>
            <th>Reader</th>
            <th>Role</th>
            <th>Status</th>
            <th>Titles</th>
            <th>Joined</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.id}>
              <td>
                {u.username}
                <div className="muted">{u.email}</div>
              </td>
              <td>
                <span className="chip">{u.role}</span>
              </td>
              <td>
                <span className={`chip ${u.status === "active" ? "visible" : "removed"}`}>{u.status}</span>
              </td>
              <td className="muted bodycell">{u.titles.map((t) => t.title.name).join(", ") || "—"}</td>
              <td className="muted">{new Date(u.createdAt).toLocaleDateString()}</td>
              <td>
                <button
                  className="ghost"
                  onClick={() => {
                    setTarget(u);
                    setRole(u.role);
                    setTitleId(titles[0]?.id ?? "");
                    setOwnerPassword("");
                    setNotice("");
                  }}
                >
                  MANAGE ▸
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {target ? (
        <Modal title={`Manage ${target.username}`} onClose={() => setTarget(null)}>
          <div className="field">
            <label>Grant title</label>
            <div className="row">
              <select value={titleId} onChange={(e) => setTitleId(e.target.value)}>
                {titles.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.rarity})
                  </option>
                ))}
              </select>
              <button
                disabled={busy || !titleId}
                onClick={() =>
                  run(() => req(`/admin/users/${target.id}/titles/${titleId}`, "POST"), "Title granted")
                }
              >
                GRANT
              </button>
              <button
                className="danger"
                disabled={busy || !titleId}
                onClick={() =>
                  run(() => req(`/admin/users/${target.id}/titles/${titleId}`, "DELETE"), "Title revoked")
                }
              >
                REVOKE
              </button>
            </div>
          </div>
          <div className="field">
            <label>Username-change credits</label>
            <button
              disabled={busy}
              onClick={() =>
                run(
                  () => req(`/admin/users/${target.id}/username-change`, "POST", { amount: 1 }),
                  "+1 username change granted",
                )
              }
            >
              GRANT +1
            </button>
          </div>
          {can("manage_roles") ? (
            <div className="field">
              <label>Role (owner password required)</label>
              <div className="row">
                <select value={role} onChange={(e) => setRole(e.target.value)}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <input
                  type="password"
                  placeholder="your password"
                  value={ownerPassword}
                  onChange={(e) => setOwnerPassword(e.target.value)}
                />
                <button
                  disabled={busy || !ownerPassword}
                  onClick={() =>
                    run(
                      () =>
                        req(`/admin/users/${target.id}/role`, "PATCH", { role, password: ownerPassword }),
                      `Role set to ${role}`,
                    )
                  }
                >
                  SET
                </button>
              </div>
            </div>
          ) : null}
          {error ? <p className="error">{error}</p> : null}
          {notice ? <p className="ok">{notice}</p> : null}
        </Modal>
      ) : null}
    </div>
  );
}
