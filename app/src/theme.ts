// INKLIGHT / SYSTEM PROTOCOL — Mangadamia's design tokens.
// Manga ink and screen-tone surfaces meet a restrained RPG status window.
// Reward gold is deliberately reserved for progress, rank, and earned items.
//
// Values are locked to the "System Protocol" redesign spec (UI-UX/): a
// near-black stage (#0a0b10), raised card surface (#10121a), ultraviolet
// actions (#7c5cff), and a cyan "system data" accent for ▸ deep links.
export const colors = {
  bg: "#0a0b10", // Print Black — the near-black stage
  bg2: "#07080c", // Deepest recess (behind the stage)
  card: "#10121a", // Main system panel / card surface
  surface: "#10121a", // Alias: card surface (guide token)
  panel: "#0d0f14", // Recessed HUD surface (reply bars, footers)
  panelRaised: "#171a21", // Interactive / elevated surface, cover tone
  hairline: "#1c2029", // Faintest divider between stacked rows
  border: "#262b36", // Quiet frame and panel gutters
  borderStrong: "#3a3f4e", // Visible system frame / outline buttons
  text: "#ecedf2", // Paper
  muted: "#8a90a0", // Manga screen-tone
  mutedStrong: "#c9cdd8",
  accent: "#7c5cff", // Ultraviolet — actions and selection
  accentBright: "#b7a6ff",
  accentSoft: "#b7a6ff",
  accentDeep: "#6247d1", // Gradient tail for primary keys
  accentGhost: "rgba(124,92,255,0.12)",
  accentLine: "rgba(124,92,255,0.45)",
  accentText: "#ffffff",
  data: "#54D6FF", // System data — OPEN THREAD ▸ / ALL ▸ / FULL BOARD ▸
  foil: "#f5b84c", // Rewards ONLY: XP, levels, badges
  foilSoft: "#FFE09A",
  foilGhost: "rgba(245,184,76,0.12)",
  fresh: "#4cc38a", // Success, synced, online
  freshGhost: "rgba(76,195,138,0.11)",
  danger: "#e5484d",
  dangerGhost: "rgba(229,72,77,0.10)",
  info: "#4BA3FF", // Theory blue / secondary war side / title flair
  shadow: "#000000",
};

// System chrome (buttons, chips, inputs, cards) uses tight 3–4px radii.
// Larger radii are reserved for avatars/emblems only.
export const radii = {
  chip: 3,
  control: 3,
  panel: 4,
  card: 4,
  avatar: 10,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
};

// Display face for identity moments (wordmark, series titles, levels).
// Body text stays on the system font — legibility first in a reader app.
export const fonts = {
  display: "BricolageGrotesque_800ExtraBold",
  displayBold: "BricolageGrotesque_700Bold",
};
