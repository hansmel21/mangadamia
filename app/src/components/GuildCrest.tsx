// Guild emblem + [TAG] chip, shown next to a reader's name and across the
// guild screens. Emblems are app-owned SVG glyphs (no uploads) tinted with the
// guild's colors — same no-upload approach as avatars/frames.
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path, Polygon, Rect } from "react-native-svg";
import type { GuildCrestInfo } from "../api";

export const GUILD_EMBLEMS = [
  "crest",
  "fang",
  "flame",
  "eye",
  "tower",
  "blade",
  "moon",
  "wing",
] as const;

function Glyph({ emblemKey, color }: { emblemKey: string; color: string }) {
  const stroke = { stroke: color, strokeWidth: 2, fill: "none" as const };
  switch (emblemKey) {
    case "fang":
      return <Polygon points="6,6 10,6 8,16 6,6 12,6 12,6" {...stroke} strokeLinejoin="round" />;
    case "flame":
      return (
        <Path
          d="M12 3c2 3 4 4 4 8a4 4 0 0 1-8 0c0-2 1-3 2-4 0 1 1 2 2 2 0-2-1-4-0-6z"
          fill={color}
        />
      );
    case "eye":
      return (
        <>
          <Path d="M3 12c3-5 15-5 18 0-3 5-15 5-18 0z" {...stroke} strokeLinejoin="round" />
          <Circle cx={12} cy={12} r={2.4} fill={color} />
        </>
      );
    case "tower":
      return <Path d="M7 20V8h2V6h2v2h2V6h2v2h2v12z" fill={color} />;
    case "blade":
      return (
        <>
          <Path d="M12 3l2 12h-4z" fill={color} />
          <Rect x={7} y={15} width={10} height={2} fill={color} />
          <Rect x={11} y={15} width={2} height={5} fill={color} />
        </>
      );
    case "moon":
      return <Path d="M16 4a8 8 0 1 0 0 16 6 6 0 0 1 0-16z" fill={color} />;
    case "wing":
      return (
        <Path
          d="M4 14c4-1 7-4 8-8 1 4 4 7 8 8-3 1-6 1-8 3-2-2-5-2-8-3z"
          fill={color}
        />
      );
    case "crest":
    default:
      return <Path d="M12 3l7 2v6c0 5-3 8-7 10-4-2-7-5-7-10V5z" {...stroke} strokeLinejoin="round" />;
  }
}

export function GuildEmblem({
  emblemKey,
  primaryColor,
  secondaryColor,
  size = 22,
}: {
  emblemKey: string;
  primaryColor: string;
  secondaryColor?: string | null;
  size?: number;
}) {
  return (
    <View
      style={[
        styles.emblem,
        {
          width: size,
          height: size,
          borderRadius: size * 0.28,
          borderColor: primaryColor,
          backgroundColor: (secondaryColor ?? primaryColor) + "22",
        },
      ]}
    >
      <Svg width={size * 0.72} height={size * 0.72} viewBox="0 0 24 24">
        <Glyph emblemKey={emblemKey} color={primaryColor} />
      </Svg>
    </View>
  );
}

export function GuildCrest({
  guild,
  size = 18,
  showTag = true,
}: {
  guild: GuildCrestInfo;
  size?: number;
  showTag?: boolean;
}) {
  return (
    <View style={styles.crest}>
      <GuildEmblem
        emblemKey={guild.emblemKey}
        primaryColor={guild.primaryColor}
        secondaryColor={guild.secondaryColor}
        size={size}
      />
      {showTag ? (
        <Text style={[styles.tag, { color: guild.primaryColor }]} numberOfLines={1}>
          [{guild.tag}]
        </Text>
      ) : null}
    </View>
  );
}

// Compact bordered [TAG] pill, tinted by the guild's primary color. Used in
// post headers, boards and war cards where the emblem would be too heavy.
// Pass `showEmblem` to prefix the glyph, or `name` to spell the full guild name.
export function GuildChip({
  guild,
  showEmblem = false,
  name = false,
}: {
  guild: GuildCrestInfo;
  showEmblem?: boolean;
  name?: boolean;
}) {
  const color = guild.primaryColor;
  return (
    <View style={[styles.chip, { borderColor: color, backgroundColor: color + "16" }]}>
      {showEmblem ? (
        <GuildEmblem emblemKey={guild.emblemKey} primaryColor={color} secondaryColor={guild.secondaryColor} size={14} />
      ) : null}
      <Text style={[styles.chipTag, { color }]} numberOfLines={1}>
        {name ? guild.name : `[${guild.tag}]`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  emblem: { alignItems: "center", justifyContent: "center", borderWidth: 1.2 },
  crest: { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1 },
  tag: { fontSize: 10.5, fontWeight: "900", letterSpacing: 0.4 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 1,
    flexShrink: 1,
  },
  chipTag: { fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
});

// Level-gated hall decorations (cosmetic). Server owns the catalog + gating;
// this maps each key to its banner treatment: an accent color for the border/
// glow and a sigil flanking the guild name.
export const GUILD_DECOR: Record<string, { name: string; color: string; icon: string }> = {
  halo: { name: "Arcane Halo", color: "#6b5ecc", icon: "◈" },
  verdant: { name: "Verdant Wreath", color: "#56a87b", icon: "❖" },
  stormveil: { name: "Storm Veil", color: "#6d8fc4", icon: "⟡" },
  gilded: { name: "Gilded Frame", color: "#cda45e", icon: "✦" },
  bloodmoon: { name: "Blood Moon", color: "#ce5153", icon: "☾" },
  eclipse: { name: "Eclipse Crown", color: "#a79fe3", icon: "◐" },
};

// Placeholder color menu the create/edit UI can offer.
export const GUILD_COLORS = [
  "#6b5ecc",
  "#6d8fc4",
  "#56a87b",
  "#cda45e",
  "#ce5153",
  "#c06a87",
  "#9a7fd1",
  "#8992A3",
];
