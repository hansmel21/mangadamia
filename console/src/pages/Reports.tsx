// Reports queue — the existing endpoint, on a desktop table.
import { useCallback, useEffect, useState } from "react";
import { req } from "../api";
import { ActionForm, Modal } from "../components";

interface ReportRow {
  id: string;
  targetType: string;
  targetId: string;
  reason: string | null;
  status: string;
  createdAt: string;
  reporter: { username: string };
  target: { body?: string; username?: string; moderationStatus?: string } | null;
  targetIdentity: { username: string } | null;
}

export function Reports() {
  const [status, setStatus] = useState<"pending" | "resolved" | "dismissed">("pending");
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [target, setTarget] = useState<ReportRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    req<{ capabilities: string[]; reports: ReportRow[] }>(`/admin/reports?status=${status}`)
      .then((r) => {
        setRows(r.reports);
        setCapabilities(r.capabilities);
        setError("");
      })
      .catch((e) => setError(e.message));
  }, [status]);
  useEffect(load, [load]);

  const capActions: Record<string, string> = {
    dismiss: "view_reports",
    correct_spoiler: "correct_spoilers",
    remove_content: "remove_content",
    warn: "warn_users",
    suspend_7d: "suspend_users",
    suspend_30d: "suspend_users",
    ban: "ban_users",
  };
  const allowedActions = Object.keys(capActions).filter((a) => capabilities.includes(capActions[a]));

  const act = async (input: { action: string; reasonCode: string; reason: string }) => {
    if (!target) return;
    setBusy(true);
    try {
      await req(`/admin/reports/${target.id}/action`, "POST", input);
      setTarget(null);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1>REPORTS QUEUE</h1>
      <div className="filters">
        <div>
          <label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="pending">pending</option>
            <option value="resolved">resolved</option>
            <option value="dismissed">dismissed</option>
          </select>
        </div>
        <span className="muted">{rows.length} report(s)</span>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <table>
        <thead>
          <tr>
            <th>Filed</th>
            <th>Reporter</th>
            <th>Target</th>
            <th>Reason</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="muted">{new Date(r.createdAt).toLocaleString()}</td>
              <td>{r.reporter.username}</td>
              <td className="bodycell">
                <span className="chip">{r.targetType}</span>{" "}
                {r.targetIdentity?.username ?? r.target?.username ?? ""}
                <div className="muted">{r.target?.body?.slice(0, 160) ?? "(content gone)"}</div>
              </td>
              <td className="bodycell muted">{r.reason ?? "—"}</td>
              <td>
                {status === "pending" ? (
                  <button className="ghost" onClick={() => setTarget(r)}>
                    REVIEW ▸
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {target ? (
        <Modal title={`Report on ${target.targetType}`} onClose={() => setTarget(null)}>
          <p className="muted bodycell">{target.target?.body?.slice(0, 400) ?? "(content unavailable)"}</p>
          <p className="muted">Reported by {target.reporter.username}: {target.reason ?? "no reason given"}</p>
          <ActionForm actions={allowedActions} onSubmit={act} busy={busy} />
          {error ? <p className="error">{error}</p> : null}
        </Modal>
      ) : null}
    </div>
  );
}
