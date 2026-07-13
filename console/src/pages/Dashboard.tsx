import { useEffect, useState } from "react";
import { req } from "../api";
import { StatCard } from "../components";

interface Overview {
  pendingReports: number;
  pendingAppeals: number;
  users: { total: number; activeToday: number; suspended: number; banned: number };
  posts24h: number;
  comments24h: number;
  removed7d: number;
  liveArenaEvents: number;
}

export function Dashboard() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    req<Overview>("/admin/overview").then(setData).catch((e) => setError(e.message));
  }, []);
  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">loading…</p>;
  return (
    <div>
      <h1>SYSTEM OVERVIEW</h1>
      <div className="statgrid">
        <StatCard label="Pending reports" value={data.pendingReports} tone={data.pendingReports > 0 ? "warn" : undefined} />
        <StatCard label="Pending appeals" value={data.pendingAppeals} tone={data.pendingAppeals > 0 ? "warn" : undefined} />
        <StatCard label="Readers" value={data.users.total} />
        <StatCard label="Active today" value={data.users.activeToday} />
        <StatCard label="Suspended" value={data.users.suspended} tone={data.users.suspended > 0 ? "warn" : undefined} />
        <StatCard label="Banned" value={data.users.banned} tone={data.users.banned > 0 ? "bad" : undefined} />
        <StatCard label="Posts (24h)" value={data.posts24h} />
        <StatCard label="Comments (24h)" value={data.comments24h} />
        <StatCard label="Removals (7d)" value={data.removed7d} />
        <StatCard label="Live arena events" value={data.liveArenaEvents} />
      </div>
      <p className="muted">
        All actions taken here are written to the moderation audit log with your username attached.
      </p>
    </div>
  );
}
