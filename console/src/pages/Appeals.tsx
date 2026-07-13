// Appeals review — uphold or overturn moderation decisions.
import { useCallback, useEffect, useState } from "react";
import { req } from "../api";
import { Modal } from "../components";

interface AppealRow {
  id: string;
  status: string;
  message: string;
  response: string | null;
  createdAt: string;
  user: { username: string };
  moderationAction: { action: string; reason: string | null; targetType: string };
}

export function Appeals() {
  const [status, setStatus] = useState<"pending" | "upheld" | "overturned">("pending");
  const [rows, setRows] = useState<AppealRow[]>([]);
  const [target, setTarget] = useState<AppealRow | null>(null);
  const [response, setResponse] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    req<AppealRow[]>(`/admin/appeals?status=${status}`)
      .then((r) => {
        setRows(r);
        setError("");
      })
      .catch((e) => setError(e.message));
  }, [status]);
  useEffect(load, [load]);

  const decide = async (decision: "upheld" | "overturned") => {
    if (!target || response.trim().length < 10) return;
    setBusy(true);
    try {
      await req(`/admin/appeals/${target.id}/decision`, "POST", { decision, response: response.trim() });
      setTarget(null);
      setResponse("");
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1>APPEALS</h1>
      <div className="filters">
        <div>
          <label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="pending">pending</option>
            <option value="upheld">upheld</option>
            <option value="overturned">overturned</option>
          </select>
        </div>
        <span className="muted">{rows.length} appeal(s)</span>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <table>
        <thead>
          <tr>
            <th>Filed</th>
            <th>Reader</th>
            <th>Original action</th>
            <th>Appeal</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="muted">{new Date(r.createdAt).toLocaleString()}</td>
              <td>{r.user.username}</td>
              <td>
                <span className="chip">{r.moderationAction.action}</span>
                <div className="muted bodycell">{r.moderationAction.reason?.slice(0, 120)}</div>
              </td>
              <td className="bodycell muted">{r.message.slice(0, 200)}</td>
              <td>
                {status === "pending" ? (
                  <button className="ghost" onClick={() => setTarget(r)}>
                    DECIDE ▸
                  </button>
                ) : (
                  <span className="chip">{r.status}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {target ? (
        <Modal title={`Appeal by ${target.user.username}`} onClose={() => setTarget(null)}>
          <p className="muted bodycell">
            Against: {target.moderationAction.action} — {target.moderationAction.reason}
          </p>
          <p className="bodycell">"{target.message}"</p>
          <div className="field">
            <label>Response to the reader (min 10 chars)</label>
            <textarea rows={3} value={response} onChange={(e) => setResponse(e.target.value)} />
          </div>
          <div className="row">
            <button disabled={busy || response.trim().length < 10} onClick={() => decide("overturned")}>
              OVERTURN (restore)
            </button>
            <button className="danger" disabled={busy || response.trim().length < 10} onClick={() => decide("upheld")}>
              UPHOLD
            </button>
          </div>
          {error ? <p className="error">{error}</p> : null}
        </Modal>
      ) : null}
    </div>
  );
}
