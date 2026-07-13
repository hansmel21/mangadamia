// INKLIGHT / SYSTEM PROTOCOL — Mangadamia's design tokens.
// Manga ink and screen-tone surfaces meet a restrained RPG status window.
// Reward gold is deliberately reserved for progress, rank, and earned items.
//
// 2026-07 recolor: every accent sits one register below its old neon value —
// arcane indigo for actions (the System's magic), steel for data links,
// antique gold for rewards, moss for success, muted crimson for danger.
// Fewer, calmer hues; paper lifted slightly for contrast against them.
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
  text: "#f2f3f7", // Paper (lifted for contrast)
  muted: "#8a90a0", // Manga screen-tone
  mutedStrong: "#c9cdd8",
  accent: "#6b5ecc", // Arcane indigo — actions and selection
  accentBright: "#a79fe3",
  accentSoft: "#a79fe3",
  accentDeep: "#544aa8", // Gradient tail for primary keys
  accentGhost: "rgba(107,94,204,0.12)",
  accentLine: "rgba(107,94,204,0.45)",
  accentText: "#ffffff",
  data: "#6faec9", // System data (steel) — OPEN THREAD ▸ / ALL ▸ / FULL BOARD ▸
  foil: "#cda45e", // Rewards ONLY: XP, levels, badges (antique gold)
  foilSoft: "#e8d3a0",
  foilGhost: "rgba(205,164,94,0.12)",
  fresh: "#56a87b", // Success, synced, online (moss)
  freshGhost: "rgba(86,168,123,0.11)",
  danger: "#ce5153", // Muted crimson — danger keeps its pop without the neon
  dangerGhost: "rgba(206,81,83,0.10)",
  info: "#6d8fc4", // Theory slate-blue / secondary war side / title flair
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
