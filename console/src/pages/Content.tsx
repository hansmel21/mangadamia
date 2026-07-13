// Content audit — browse and act on EVERYTHING, not just reported items.
import { useCallback, useEffect, useState } from "react";
import { req } from "../api";
import { ActionForm, Modal, Pager, StatusChip } from "../components";

interface ContentItem {
  id: string;
  type: "post" | "comment";
  body: string;
  kind?: string;
  isOfficial?: boolean;
  guildId?: string | null;
  gifUrl?: string | null;
  imageUrls?: string[];
  canonicalId?: string;
  chapterNumber?: number;
  moderationStatus: string;
  moderationReason: string | null;
  createdAt: string;
  author: { username: string } | null;
  reactionCount: number;
  replyCount?: number;
  reportCount: number;
}

export function Content() {
  const [type, setType] = useState<"post" | "comment">("post");
  const [q, setQ] = useState("");
  const [username, setUsername] = useState("");
  const [status, setStatus] = useState("all");
  const [reported, setReported] = useState(false);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<ContentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [target, setTarget] = useState<ContentItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(() => {
    const params = new URLSearchParams({ type, status, page: String(page) });
    if (q.trim()) params.set("q", q.trim());
    if (username.trim()) params.set("username", username.trim());
    if (reported) params.set("reported", "true");
    req<{ total: number; items: ContentItem[] }>(`/admin/content?${params}`)
      .then((r) => {
        setItems(r.items);
        setTotal(r.total);
        setError("");
      })
      .catch((e) => setError(e.message));
  }, [type, q, username, status, reported, page]);

  useEffect(load, [load]);

  const act = async (input: { action: string; reasonCode: string; reason: string }) => {
    if (!target) return;
    setBusy(true);
    setError("");
    try {
      await req(`/admin/content/${target.type}/${target.id}/action`, "POST", input);
      setNotice(`${input.action} applied to ${target.type} ${target.id.slice(0, 8)}…`);
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
      <h1>CONTENT AUDIT</h1>
      <div className="filters">
        <div>
          <label>Type</label>
          <select value={type} onChange={(e) => { setType(e.target.value as "post" | "comment"); setPage(1); }}>
            <option value="post">posts</option>
            <option value="comment">chapter comments</option>
          </select>
        </div>
        <div>
          <label>Body contains</label>
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="search text" />
        </div>
        <div>
          <label>Author</label>
          <input value={username} onChange={(e) => { setUsername(e.target.value); setPage(1); }} placeholder="exact username" />
        </div>
        <div>
          <label>Status</label>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="all">all</option>
            <option value="visible">visible</option>
            <option value="removed">removed</option>
          </select>
        </div>
        <div>
          <label>Reported only</label>
          <input type="checkbox" checked={reported} onChange={(e) => { setReported(e.target.checked); setPage(1); }} />
        </div>
        <span className="muted">{total} match{total === 1 ? "" : "es"}</span>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {notice ? <p className="ok">{notice}</p> : null}

      <table>
        <thead>
          <tr>
            <th>Author</th>
            <th>Body</th>
            <th>Meta</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item.author?.username ?? "—"}</td>
              <td className="bodycell">
                {item.body.slice(0, 240)}
                {item.imageUrls?.length ? <div className="muted">📷 {item.imageUrls.length} image(s)</div> : null}
                {item.gifUrl ? <div className="muted">GIF attached</div> : null}
              </td>
              <td>
                <div className="muted">{new Date(item.createdAt).toLocaleString()}</div>
                {item.kind ? <span className="chip">{item.kind}</span> : null}{" "}
                {item.isOfficial ? <span className="chip official">SYSTEM</span> : null}{" "}
                {item.guildId ? <span className="chip">guild board</span> : null}{" "}
                {item.reportCount > 0 ? <span className="chip reported">{item.reportCount} report(s)</span> : null}
                <div className="muted">
                  {item.reactionCount} reactions{item.replyCount != null ? ` · ${item.replyCount} replies` : ""}
                </div>
              </td>
              <td>
                <StatusChip status={item.moderationStatus} />
                {item.moderationReason ? <div className="muted">{item.moderationReason}</div> : null}
              </td>
              <td>
                <button className="ghost" onClick={() => setTarget(item)}>
                  ACT ▸
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pager page={page} setPage={setPage} hasMore={page * 25 < total} />

      {target ? (
        <Modal title={`Moderate ${target.type} by ${target.author?.username ?? "unknown"}`} onClose={() => setTarget(null)}>
          <p className="muted bodycell">{target.body.slice(0, 400)}</p>
          <ActionForm
            actions={
              target.moderationStatus === "removed"
                ? ["restore_content", "warn", "suspend_7d", "suspend_30d", "ban"]
                : ["remove_content", "correct_spoiler", "warn", "suspend_7d", "suspend_30d", "ban"]
            }
            onSubmit={act}
            busy={busy}
          />
          {error ? <p className="error">{error}</p> : null}
        </Modal>
      ) : null}
    </div>
  );
}
