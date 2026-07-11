// INKLIGHT — MangaShelf's design tokens ("printed ink meets a dark room").
// Central place for colors so every screen looks consistent.
export const colors = {
  bg: "#0d0f14", // Print Black — a dark room, not a void
  card: "#171a21", // Panel — the paper surfaces
  border: "#262b36", // Frame — panel gutters
  text: "#ecedf2", // Paper
  muted: "#8a90a0", // Tone — like manga screen-tone
  accent: "#7c5cff", // Ultraviolet — the brand; actions & selection
  accentSoft: "#b7a6ff",
  accentText: "#ffffff",
  foil: "#f5b84c", // Rewards ONLY: XP, levels, badges
  fresh: "#4cc38a", // Success and synced state
  danger: "#e5484d",
};

// Display face for identity moments (wordmark, series titles, levels).
// Body text stays on the system font — legibility first in a reader app.
export const fonts = {
  display: "BricolageGrotesque_800ExtraBold",
  displayBold: "BricolageGrotesque_700Bold",
};
