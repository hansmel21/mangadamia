// Small shared pieces: stat card, action modal (mirrors the server's
// actionBody zod), pager, status chip.
import { useState, type ReactNode } from "react";

export function StatCard({ label, value, tone }: { label: string; value: number | string; tone?: "warn" | "bad" }) {
  return (
    <div className={`stat ${tone ?? ""}`}>
      <div className="v">{value}</div>
      <div className="l">{label}</div>
    </div>
  );
}

export function StatusChip({ status }: { status: string }) {
  return <span className={`chip ${status}`}>{status.toUpperCase()}</span>;
}

export function Pager({ page, setPage, hasMore }: { page: number; setPage: (p: number) => void; hasMore: boolean }) {
  return (
    <div className="pager">
      <button className="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>
        ◂ PREV
      </button>
      <span>page {page}</span>
      <button className="ghost" disabled={!hasMore} onClick={() => setPage(page + 1)}>
        NEXT ▸
      </button>
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export const REASON_CODES = [
  "spam",
  "harassment",
  "hate",
  "sexual_content",
  "child_safety",
  "copyright",
  "spoiler",
  "impersonation",
  "fraud",
  "other",
] as const;

// Action form used by both the reports queue and direct content actions.
export function ActionForm({
  actions,
  onSubmit,
  busy,
}: {
  actions: string[];
  onSubmit: (input: { action: string; reasonCode: string; reason: string }) => void;
  busy: boolean;
}) {
  const [action, setAction] = useState(actions[0] ?? "");
  const [reasonCode, setReasonCode] = useState<string>("other");
  const [reason, setReason] = useState("");
  return (
    <div>
      <div className="field">
        <label>Action</label>
        <select value={action} onChange={(e) => setAction(e.target.value)}>
          {actions.map((a) => (
            <option key={a} value={a}>
              {a.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Reason code</label>
        <select value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
          {REASON_CODES.map((c) => (
            <option key={c} value={c}>
              {c.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Reason (shown to the reader, min 3 chars)</label>
        <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <button
        disabled={busy || reason.trim().length < 3}
        onClick={() => onSubmit({ action, reasonCode, reason: reason.trim() })}
      >
        {busy ? "APPLYING…" : "APPLY ACTION"}
      </button>
    </div>
  );
}
