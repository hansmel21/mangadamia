// ⛩ gate chip — marks a post that lives inside a Gate (community). Tinted by
// the gate's color; tapping jumps into the gate. Modeled on GuildChip.
import { router } from "expo-router";
import { Pressable, StyleSheet, Text } from "react-native";
import type { PostGateInfo } from "../api";
import { colors } from "../theme";

export function GateChip({ gate, onPress }: { gate: PostGateInfo; onPress?: () => void }) {
  const color = gate.primaryColor || colors.accentSoft;
  return (
    <Pressable
      style={({ pressed }) => [
        styles.chip,
        { borderColor: color, backgroundColor: color + "16" },
        pressed && { opacity: 0.7 },
      ]}
      onPress={
        onPress ?? (() => router.push({ pathname: "/gate/[id]", params: { id: gate.id } }))
      }
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={`Open the ${gate.name} gate`}
    >
      <Text style={[styles.text, { color }]} numberOfLines={1}>
        ⛩ {gate.name.toUpperCase()}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 1,
    flexShrink: 1,
  },
  text: { fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
});
