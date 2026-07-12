// Hunter-rank sigil (E→S) derived from a reader's level. Shown on System
// Record cards to give authority a visible tier.
import { StyleSheet, Text, View } from "react-native";
import { hunterRankForLevel, rankColors } from "../ranks";

export function RankBadge({ level, size = 18 }: { level: number | null; size?: number }) {
  const rank = hunterRankForLevel(level);
  const color = rankColors[rank];
  return (
    <View
      style={[
        styles.badge,
        { width: size, height: size, borderRadius: size * 0.28, borderColor: color, backgroundColor: color + "1A" },
      ]}
    >
      <Text style={[styles.letter, { color, fontSize: size * 0.62 }]}>{rank}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignItems: "center", justifyContent: "center", borderWidth: 1.3 },
  letter: { fontWeight: "900" },
});
