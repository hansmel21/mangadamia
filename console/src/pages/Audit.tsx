// Moderation audit log — the last 200 actions, expandable snapshots.
import { useEffect, useState } from "react";
import { req } from "../api";

interface AuditRow {
  id: string;
  moderatorSnapshot: string;
  targetType: string;
  targetId: string;
  action: string;
  reasonCode: string;
  reason: string | null;
  reportId: string | null;
  beforeSnapshot: unknown;
  afterSnapshot: unknown;
  createdAt: string;
}

export function Audit() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    req<AuditRow[]>("/admin/audit").then(setRows).catch((e) => setError(e.message));
  }, []);
  return (
    <div>
      <h1>AUDIT LOG</h1>
      {error ? <p className="error">{error}</p> : null}
      <table>
        <thead>
          <tr>
            <th>When</th>
            <th>Moderator</th>
            <th>Action</th>
            <th>Target</th>
            <th>Reason</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <>
              <tr key={r.id}>
                <td className="muted">{new Date(r.createdAt).toLocaleString()}</td>
                <td>{r.moderatorSnapshot}</td>
                <td>
                  <span className="chip">{r.action}</span>
                  {r.reportId ? <span className="muted"> via report</span> : <span className="muted"> direct</span>}
                </td>
                <td className="muted">
                  {r.targetType} {r.targetId.slice(0, 10)}…
                </td>
                <td className="bodycell muted">
                  [{r.reasonCode}] {r.reason?.slice(0, 120)}
                </td>
                <td>
                  <button className="ghost" onClick={() => setOpen(open === r.id ? null : r.id)}>
                    {open === r.id ? "HIDE" : "SNAPSHOTS"}
                  </button>
                </td>
              </tr>
              {open === r.id ? (
                <tr key={`${r.id}-snap`}>
                  <td colSpan={6}>
                    <pre className="muted" style={{ whiteSpace: "pre-wrap", fontSize: 11 }}>
                      before: {JSON.stringify(r.beforeSnapshot, null, 2)}
                      {"\n"}after: {JSON.stringify(r.afterSnapshot, null, 2)}
                    </pre>
                  </td>
                </tr>
              ) : null}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}
