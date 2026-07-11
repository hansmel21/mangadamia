// Code-drawn badge medallions — every badge carries its OWN mark, an
// original shape alluding to its series (no trademarked art). Materials
// still encode the tier: Ink → Tone → Foil → Ultra. The artist pass later
// replaces these drawings, nothing else.
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  Path,
  Pattern,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";

type Tier = 1 | 2 | 3 | 4;

const TIER_COLORS: Record<Tier, { bg: string; ring: string; glyph: string }> = {
  1: { bg: "#171a21", ring: "#8a90a0", glyph: "#9aa0b0" },
  2: { bg: "#171a21", ring: "#c9cfdc", glyph: "#dfe3ec" },
  3: { bg: "#1d1608", ring: "#f5b84c", glyph: "#f5b84c" },
  4: { bg: "#15112a", ring: "#9d85ff", glyph: "#b7a6ff" },
};

const stroke = (color: string, width = 2.4) => ({
  fill: "none" as const,
  stroke: color,
  strokeWidth: width,
  strokeLinejoin: "round" as const,
  strokeLinecap: "round" as const,
});

// One mark per badge (keyed by badge id). Drawn in an 84×84 viewBox.
const MARKS: Record<string, { tier: Tier; draw: (c: string) => ReactNode }> = {
  // Sole Reader (ORV) — the phone he reads on
  "first-comment": {
    tier: 1,
    draw: (c) => (
      <>
        <Rect x={33} y={24} width={18} height={36} rx={4} {...stroke(c)} />
        <Path d="M37 32 h10 M37 38 h10 M37 44 h6" {...stroke(c, 2)} />
        <Path d="M40 54 h4" {...stroke(c, 2.4)} />
      </>
    ),
  },
  // Talk no Jutsu (Naruto) — the swirl
  "commenter-10": {
    tier: 2,
    draw: (c) => (
      <Path
        d="M44.5 42 a2.5 2.5 0 0 1 -2.5 2.5 a5 5 0 0 1 -5 -5 a7.5 7.5 0 0 1 7.5 -7.5 a10.5 10.5 0 0 1 10.5 10.5 a13.5 13.5 0 0 1 -13.5 13.5 a16.5 16.5 0 0 1 -16.5 -16.5"
        {...stroke(c)}
      />
    ),
  },
  // Bankai (Bleach) — a released katana
  "commenter-50": {
    tier: 3,
    draw: (c) => (
      <>
        <Path d="M56 24 L36 48" {...stroke(c)} />
        <Path d="M56 24 c0 4 -1 7 -3 9" {...stroke(c, 2)} />
        <Path d="M31 43 L41 53" {...stroke(c)} />
        <Path d="M34 50 L27 57" {...stroke(c, 2.8)} />
      </>
    ),
  },
  // Domain Expansion (JJK) — the domain gate
  "commenter-100": {
    tier: 4,
    draw: (c) => (
      <>
        <Path d="M42 24 L60 42 L42 60 L24 42 Z" {...stroke(c)} />
        <Circle cx={42} cy={42} r={7} {...stroke(c, 2)} />
        <Circle cx={42} cy={42} r={1.8} fill={c} />
      </>
    ),
  },
  // Picked Up (Pick Me Up) — the gacha capsule
  "liked-10": {
    tier: 1,
    draw: (c) => (
      <>
        <Circle cx={42} cy={42} r={14} {...stroke(c)} />
        <Path d="M28 42 h28" {...stroke(c, 2)} />
        <Circle cx={37} cy={35} r={2} fill={c} />
      </>
    ),
  },
  // S-Class Hero (OPM) — the association shield
  "liked-50": {
    tier: 3,
    draw: (c) => (
      <>
        <Path
          d="M42 24 c5 2.5 10 3.5 13 3.8 v13 c0 9.5 -6.5 15.5 -13 19.2 c-6.5 -3.7 -13 -9.7 -13 -19.2 v-13 c3 -0.3 8 -1.3 13 -3.8 Z"
          {...stroke(c)}
        />
        <Path d="M47 34.5 c-5 -2.5 -10 0.5 -6.5 4.5 l4.5 3 c3.5 3.5 -1.5 7.5 -7 5" {...stroke(c, 2.2)} />
      </>
    ),
  },
  // Over 9000 (DBZ) — the scouter
  "liked-100": {
    tier: 4,
    draw: (c) => (
      <>
        <Circle cx={37} cy={43} r={9.5} {...stroke(c)} />
        <Circle cx={37} cy={43} r={2} fill={c} />
        <Path d="M46.5 43 h9" {...stroke(c, 2)} />
        <Rect x={55} y={38} width={5} height={10} rx={1.5} {...stroke(c, 2)} />
        <Path d="M37 33.5 L33 27" {...stroke(c, 2)} />
      </>
    ),
  },
  // Final Selection (Demon Slayer) — the checkered haori
  "reader-10": {
    tier: 1,
    draw: (c) => (
      <>
        <Rect x={30} y={30} width={24} height={24} {...stroke(c, 2.2)} />
        <Rect x={30} y={30} width={8} height={8} fill={c} />
        <Rect x={46} y={30} width={8} height={8} fill={c} />
        <Rect x={38} y={38} width={8} height={8} fill={c} />
        <Rect x={30} y={46} width={8} height={8} fill={c} />
        <Rect x={46} y={46} width={8} height={8} fill={c} />
      </>
    ),
  },
  // Reborn Scholar (Tales of Demons and Gods) — the scroll
  "reader-100": {
    tier: 2,
    draw: (c) => (
      <>
        <Path d="M32 32 h20 a4 4 0 0 1 4 4 v12 a4 4 0 0 1 -4 4 h-20" {...stroke(c)} />
        <Circle cx={32} cy={36} r={4} {...stroke(c, 2)} />
        <Circle cx={32} cy={48} r={4} {...stroke(c, 2)} />
        <Path d="M40 38 h10 M40 44 h10" {...stroke(c, 2)} />
      </>
    ),
  },
  // Roadwork (Hajime no Ippo) — the boxing glove
  "reader-500": {
    tier: 3,
    draw: (c) => (
      <>
        <Path
          d="M35 40 v-4 a9 9 0 0 1 18 0 v8 a9 9 0 0 1 -9 9 h-2 a7 7 0 0 1 -7 -7 z"
          {...stroke(c)}
        />
        <Path d="M35 40 a4.5 4.5 0 0 0 -4 5 c0.5 3 3 4.5 6 4.5" {...stroke(c, 2.2)} />
        <Path d="M38 56 h12" {...stroke(c, 2.4)} />
      </>
    ),
  },
  // Shadow Monarch (Solo Leveling) — the monarch's crown
  "reader-1000": {
    tier: 4,
    draw: (c) => (
      <>
        <Path d="M28 53 v-14 l8 7 l6 -15 l6 15 l8 -7 v14 Z" {...stroke(c)} />
        <Circle cx={42} cy={48} r={1.8} fill={c} />
        <Circle cx={34} cy={49} r={1.4} fill={c} />
        <Circle cx={50} cy={49} r={1.4} fill={c} />
      </>
    ),
  },
  // Cabin Boy (One Piece) — the ship's anchor
  "member-1m": {
    tier: 1,
    draw: (c) => (
      <>
        <Circle cx={42} cy={27} r={4} {...stroke(c)} />
        <Path d="M42 31 V53 M34 38 H50 M27 47 c1 7 7 11 15 11 s14 -4 15 -11 l-5 2 M27 47 l5 2" {...stroke(c)} />
      </>
    ),
  },
  // Hunter License (HxH) — the license card
  "member-6m": {
    tier: 3,
    draw: (c) => (
      <>
        <Rect x={27} y={32} width={30} height={20} rx={3} {...stroke(c)} />
        <Rect x={31} y={36} width={8} height={8} {...stroke(c, 2)} />
        <Path d="M43 38 h10 M43 44 h10 M31 48 h6" {...stroke(c, 2)} />
      </>
    ),
  },
  // Elf Time (Frieren) — the hourglass
  "member-1y": {
    tier: 4,
    draw: (c) => (
      <>
        <Path d="M32 26 h20 M32 58 h20" {...stroke(c)} />
        <Path
          d="M34 26 c0 8 6 11 8 16 c-2 5 -8 8 -8 16 M50 26 c0 8 -6 11 -8 16 c2 5 8 8 8 16"
          {...stroke(c, 2.2)}
        />
        <Path d="M38.5 54 l3.5 -5 l3.5 5 z" fill={c} />
      </>
    ),
  },
};

const TIER_NAMES: Record<Tier, string> = { 1: "Ink", 2: "Tone", 3: "Foil", 4: "Ultra" };

/** Material tier name for a badge id ("Ink" | "Tone" | "Foil" | "Ultra"). */
export function badgeTierName(badgeId?: string | null): string | null {
  const mark = badgeId ? MARKS[badgeId] : undefined;
  return mark ? TIER_NAMES[mark.tier] : null;
}

export function BadgeMedallion({
  badgeId,
  size = 44,
  fallbackIcon,
  glow = false,
}: {
  badgeId?: string | null;
  size?: number;
  fallbackIcon?: string | null;
  // Subtle halo for unlocked badges (Ultra tier already glows by design)
  glow?: boolean;
}) {
  const mark = badgeId ? MARKS[badgeId] : undefined;
  if (!mark) {
    // Unknown/future badge id — fall back to the server's emoji
    return fallbackIcon ? <Text style={{ fontSize: size * 0.62 }}>{fallbackIcon}</Text> : null;
  }
  const c = TIER_COLORS[mark.tier];
  const patternId = `tone-${badgeId}`;

  // Earned halo: a soft shadow in the tier's color around the medallion
  // silhouette (Ultra keeps its own built-in violet aura).
  const halo =
    glow && mark.tier !== 4
      ? {
          shadowColor: c.ring,
          shadowOpacity: 0.6,
          shadowRadius: Math.max(4, size * 0.14),
          shadowOffset: { width: 0, height: 0 },
          elevation: 6,
        }
      : undefined;

  return (
    <View style={halo}>
    <Svg width={size} height={size} viewBox="0 0 84 84">
      <Defs>
        <Pattern id={patternId} width={6} height={6} patternUnits="userSpaceOnUse">
          <Circle cx={2} cy={2} r={1} fill="#aab2c5" opacity={0.4} />
        </Pattern>
        <RadialGradient id="ultraGlow" cx="50%" cy="50%">
          <Stop offset="55%" stopColor="#7c5cff" stopOpacity={0} />
          <Stop offset="100%" stopColor="#7c5cff" stopOpacity={0.55} />
        </RadialGradient>
        <RadialGradient id={`earned-${badgeId}`} cx="50%" cy="50%">
          <Stop offset="60%" stopColor={c.ring} stopOpacity={0} />
          <Stop offset="100%" stopColor={c.ring} stopOpacity={0.24} />
        </RadialGradient>
      </Defs>

      {mark.tier === 4 && <Circle cx={42} cy={42} r={41} fill="url(#ultraGlow)" />}
      {glow && mark.tier !== 4 && (
        <Circle cx={42} cy={42} r={41} fill={`url(#earned-${badgeId})`} />
      )}
      <Circle
        cx={42}
        cy={42}
        r={mark.tier === 4 ? 36 : 38}
        fill={c.bg}
        stroke={c.ring}
        strokeWidth={mark.tier >= 3 ? 3 : 2.5}
      />
      {mark.tier === 2 && <Circle cx={42} cy={42} r={33} fill={`url(#${patternId})`} />}
      {mark.tier === 3 && (
        <Circle cx={42} cy={42} r={31} fill="none" stroke={c.ring} strokeWidth={1} opacity={0.5} />
      )}
      {mark.draw(c.glyph)}
      {mark.tier === 4 && (
        <Path
          d="M62 20 l1.2 2.4 2.4 1.2 -2.4 1.2 -1.2 2.4 -1.2 -2.4 -2.4 -1.2 2.4 -1.2 Z"
          fill="#b7a6ff"
        />
      )}
    </Svg>
    </View>
  );
}
