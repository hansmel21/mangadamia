// Role-permission toggles for guilds and gates. The leader (guildmaster /
// gatekeeper) flips switches for what the officer / warden ROLE may do; every
// key defaults to TRUE so historic behavior is unchanged until a leader
// tightens it. Leaders always pass every check; plain members never gain
// officer powers through this system. Leadership transfer, role changes, the
// leader-only kick escalation, and gate name/visibility edits are deliberately
// NOT toggleable.
export const GUILD_PERM_KEYS = [
  "approve_requests",
  "invite",
  "kick",
  "edit_info",
  "pin_board",
] as const;
export type GuildPermKey = (typeof GUILD_PERM_KEYS)[number];

export const GATE_PERM_KEYS = [
  "entry_requests",
  "authorize_posters",
  "kick",
  "edit_info",
  "pin",
  "remove_posts",
] as const;
export type GatePermKey = (typeof GATE_PERM_KEYS)[number];

// permissions Json shape: { officer: { invite: false } } / { warden: { pin: false } }.
// Read defensively — any malformed value falls back to the default (true).
function roleToggles(permissions: unknown, roleKey: string): Record<string, unknown> {
  if (!permissions || typeof permissions !== "object") return {};
  const forRole = (permissions as Record<string, unknown>)[roleKey];
  if (!forRole || typeof forRole !== "object") return {};
  return forRole as Record<string, unknown>;
}

export function hasGuildPerm(
  guild: { permissions: unknown },
  membership: { role: string } | null | undefined,
  key: GuildPermKey,
): boolean {
  if (!membership) return false;
  if (membership.role === "guildmaster") return true;
  if (membership.role !== "officer") return false;
  const value = roleToggles(guild.permissions, "officer")[key];
  return typeof value === "boolean" ? value : true;
}

export function hasGatePerm(
  gate: { permissions: unknown },
  membership: { role: string } | null | undefined,
  key: GatePermKey,
): boolean {
  if (!membership) return false;
  if (membership.role === "gatekeeper") return true;
  if (membership.role !== "warden") return false;
  const value = roleToggles(gate.permissions, "warden")[key];
  return typeof value === "boolean" ? value : true;
}

// The full capability map for a viewer, for client rendering ("can" payload).
export function guildCan(
  guild: { permissions: unknown },
  membership: { role: string } | null | undefined,
): Record<GuildPermKey, boolean> {
  return Object.fromEntries(
    GUILD_PERM_KEYS.map((key) => [key, hasGuildPerm(guild, membership, key)]),
  ) as Record<GuildPermKey, boolean>;
}

export function gateCan(
  gate: { permissions: unknown },
  membership: { role: string } | null | undefined,
): Record<GatePermKey, boolean> {
  return Object.fromEntries(
    GATE_PERM_KEYS.map((key) => [key, hasGatePerm(gate, membership, key)]),
  ) as Record<GatePermKey, boolean>;
}

// The stored toggle state for the settings screens (defaults filled in).
export function roleToggleState(
  permissions: unknown,
  roleKey: "officer" | "warden",
  keys: readonly string[],
): Record<string, boolean> {
  const stored = roleToggles(permissions, roleKey);
  return Object.fromEntries(
    keys.map((key) => [key, typeof stored[key] === "boolean" ? (stored[key] as boolean) : true]),
  );
}
