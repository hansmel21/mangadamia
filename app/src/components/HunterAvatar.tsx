// HunterAvatar — the System Protocol identity chip. A squircle avatar (radius
// ~28%) bordered in the hunter's rank color, with a rank sigil chip pinned
// bottom-right. Carries over the rarity frame ring + glow (and crown) from the
// old round ReaderAvatar, so equipped cosmetics still read at a glance.
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import type { PublicIdentity } from "../api";
import { hunterRankForLevel, rankColors, type Rank } from "../ranks";
import { normalizeRarity, rarityColors } from "../rarity";
import { colors } from "../theme";

export function HunterAvatar({
  identity,
  size = 38,
  rank: rankOverride,
  showRank = true,
  style,
}: {
  identity: PublicIdentity;
  size?: number;
  /** Force a rank sigil (else derived from the identity's level). */
  rank?: Rank;
  showRank?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const rank = rankOverride ?? hunterRankForLevel(identity.level);
  const rankColor = rankColors[rank];
  const avatarRarity = normalizeRarity(identity.avatar?.rarity);
  const frameRarity = normalizeRarity(identity.frame?.rarity);
  const avatarTone = rarityColors[avatarRarity];
  const frameTone = rarityColors[frameRarity];
  const hasFrame = !!identity.frame;
  const initial = identity.username[0]?.toUpperCase() ?? "?";

  const ringColor = hasFrame ? frameTone.main : rankColor;
  const chipSize = Math.max(14, Math.round(size * 0.42));

  return (
    <View style={[{ width: size, height: size }, style]}>
      <View
        style={[
          styles.avatar,
          {
            width: size,
            height: size,
            borderRadius: size * 0.28,
            borderColor: ringColor,
            backgroundColor: identity.avatar?.primaryColor ?? avatarTone.main ?? colors.accent,
            shadowColor: hasFrame ? frameTone.main : "transparent",
          },
        ]}
      >
        <Text style={[styles.initial, { fontSize: size * 0.4 }]}>{initial}</Text>
      </View>
      {identity.frame?.assetKey === "crown" ? (
        <Text style={[styles.crown, { fontSize: size * 0.34, top: -size * 0.28 }]}>♛</Text>
      ) : null}
      {showRank ? (
        <View
          style={[
            styles.rankChip,
            {
              width: chipSize,
              height: chipSize,
              borderRadius: Math.round(chipSize * 0.28),
              borderColor: rankColor,
            },
          ]}
        >
          <Text style={[styles.rankText, { color: rankColor, fontSize: chipSize * 0.58 }]}>{rank}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    overflow: "hidden",
    shadowOpacity: 0.13,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  initial: { color: "#0B0B11", fontWeight: "900" },
  crown: { position: "absolute", alignSelf: "center", color: colors.foilSoft, fontWeight: "900" },
  rankChip: {
    position: "absolute",
    bottom: -5,
    right: -5,
    borderWidth: 1.3,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  rankText: { fontWeight: "900" },
});
