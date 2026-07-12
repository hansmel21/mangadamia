// 1–5 star rating — read-only display, or tappable input when onChange is given
// (used in review cards and the composer's Review mode).
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";

export function ReviewRating({
  value,
  onChange,
  size = 18,
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: number;
}) {
  return (
    <View style={styles.row}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= value;
        const star = (
          <Text style={[styles.star, { fontSize: size, color: filled ? colors.foil : colors.border }]}>
            {filled ? "★" : "☆"}
          </Text>
        );
        return onChange ? (
          <Pressable key={n} hitSlop={8} onPress={() => onChange(n)}>
            {star}
          </Pressable>
        ) : (
          <View key={n}>{star}</View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 2, alignItems: "center" },
  star: { lineHeight: undefined },
});
