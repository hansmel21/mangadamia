import type { BadgeInfo, BadgeMini } from "./api";
import { showBadgeToast } from "./components/BadgeToast";

// Celebrate freshly earned badges anywhere in the app.
export function celebrateBadges(badges?: BadgeMini[]) {
  if (badges && badges.length > 0) showBadgeToast(badges);
}

// Keep the collection available locally so the Account screen can always show
// every badge. The API response overlays earned state and live progress.
export const BADGE_CATALOG: BadgeInfo[] = [
  { id: "first-comment", name: "Sole Reader", icon: "📱", description: "Post your first comment — somebody had to be first (Omniscient Reader)", earned: false, earnedAt: null, progress: { current: 0, target: 1 } },
  { id: "commenter-10", name: "Talk no Jutsu", icon: "🍥", description: "Post 10 comments — win them over with words alone (Naruto)", earned: false, earnedAt: null, progress: { current: 0, target: 10 } },
  { id: "commenter-50", name: "Bankai", icon: "⚔️", description: "Post 50 comments — your true voice, fully released (Bleach)", earned: false, earnedAt: null, progress: { current: 0, target: 50 } },
  { id: "commenter-100", name: "Domain Expansion", icon: "🌀", description: "Post 100 comments — the whole room bends to your words (Jujutsu Kaisen)", earned: false, earnedAt: null, progress: { current: 0, target: 100 } },
  { id: "liked-10", name: "Picked Up", icon: "🎰", description: "Receive 10 likes — the readers chose you (Pick Me Up)", earned: false, earnedAt: null, progress: { current: 0, target: 10 } },
  { id: "liked-50", name: "S-Class Hero", icon: "👊", description: "Receive 50 likes — the association has noticed (One-Punch Man)", earned: false, earnedAt: null, progress: { current: 0, target: 50 } },
  { id: "liked-100", name: "Over 9000", icon: "💥", description: "Receive 100 likes — the scouter couldn't take it (Dragon Ball Z)", earned: false, earnedAt: null, progress: { current: 0, target: 100 } },
  { id: "reader-10", name: "Final Selection", icon: "🗡️", description: "Read 10 chapters — you survived the entrance exam (Demon Slayer)", earned: false, earnedAt: null, progress: { current: 0, target: 10 } },
  { id: "reader-100", name: "Reborn Scholar", icon: "📜", description: "Read 100 chapters — a library lives in your head now (Tales of Demons and Gods)", earned: false, earnedAt: null, progress: { current: 0, target: 100 } },
  { id: "reader-500", name: "Roadwork", icon: "🥊", description: "Read 500 chapters — the grind IS the power (Hajime no Ippo)", earned: false, earnedAt: null, progress: { current: 0, target: 500 } },
  { id: "reader-1000", name: "Shadow Monarch", icon: "🌑", description: "Read 1,000 chapters — arise (Solo Leveling)", earned: false, earnedAt: null, progress: { current: 0, target: 1000 } },
  { id: "member-1m", name: "Cabin Boy", icon: "⚓", description: "A month aboard the crew (One Piece)", earned: false, earnedAt: null, progress: { current: 0, target: 30 } },
  { id: "member-6m", name: "Hunter License", icon: "🎫", description: "Six months in — officially licensed (Hunter × Hunter)", earned: false, earnedAt: null, progress: { current: 0, target: 182 } },
  { id: "member-1y", name: "Elf Time", icon: "⏳", description: "A year here — barely a blink, really (Frieren)", earned: false, earnedAt: null, progress: { current: 0, target: 365 } },
];
