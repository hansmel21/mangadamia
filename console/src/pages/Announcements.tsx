// THE SYSTEM's voice — compose, pin/unpin, retire official announcements.
import { useCallback, useEffect, useState } from "react";
import { req } from "../api";

interface AnnouncementRow {
  id: string;
  body: string;
  pinned: boolean;
  moderationStatus: string;
  createdAt: string;
  reactionCount: number;
  replyCount: number;
}

export function Announcements() {
  const [rows, setRows] = useState<AnnouncementRow[]>([]);
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(true);
  const [notify, setNotify] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(() => {
    req<AnnouncementRow[]>("/admin/announcements")
      .then(setRows)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const publish = async () => {
    setBusy(true);
    setError("");
    try {
      await req("/admin/announcements", "POST", { body: body.trim(), pinned, notify });
      setNotice(notify ? "Published — notifying every reader." : "Published.");
      setBody("");
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const setPin = async (id: string, next: boolean) => {
    try {
      await req(`/admin/announcements/${id}`, "PATCH", { pinned: next });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const retire = async (id: string) => {
    if (!window.confirm("Retire this announcement? It's removed from the app (audited).")) return;
    try {
      await req(`/admin/announcements/${id}`, "DELETE");
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div>
      <h1>THE SYSTEM — ANNOUNCEMENTS</h1>
      <div className="field">
        <label>Transmission (renders as THE SYSTEM in every reader's feed)</label>
        <textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="⚙ Attention, hunters…" />
      </div>
      <div className="row" style={{ marginBottom: 16 }}>
        <label className="row">
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> pin atop the feed
        </label>
        <label className="row">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> notify every reader
        </label>
        <button disabled={busy || body.trim().length < 3} onClick={publish}>
          {busy ? "TRANSMITTING…" : "PUBLISH ▸"}
        </button>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {notice ? <p className="ok">{notice}</p> : null}

      <table>
        <thead>
          <tr>
            <th>Published</th>
            <th>Body</th>
            <th>Engagement</th>
            <th>State</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id}>
              <td className="muted">{new Date(a.createdAt).toLocaleString()}</td>
              <td className="bodycell">{a.body.slice(0, 220)}</td>
              <td className="muted">
                {a.reactionCount} reactions · {a.replyCount} replies
              </td>
              <td>
                {a.moderationStatus === "removed" ? (
                  <span className="chip removed">RETIRED</span>
                ) : a.pinned ? (
                  <span className="chip official">PINNED</span>
                ) : (
                  <span className="chip">in feed</span>
                )}
              </td>
              <td>
                {a.moderationStatus !== "removed" ? (
                  <div className="row">
                    <button className="ghost" onClick={() => setPin(a.id, !a.pinned)}>
                      {a.pinned ? "UNPIN" : "PIN"}
                    </button>
                    <button className="danger" onClick={() => retire(a.id)}>
                      RETIRE
                    </button>
                  </div>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
