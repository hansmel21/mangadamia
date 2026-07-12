// Reaction bar for System Records. A single "React" button opens the emote row
// (❤️ 🔥 🤯 😭 💀); reactions already left show as tappable count chips. One
// reaction per reader: tap your current one to clear it, another to swap.
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ReactionType } from "../api";
import { REACTIONS, reactionEmoji } from "../ranks";
import { colors } from "../theme";

export function ReactionBar({
  reactions,
  myReaction,
  onReact,
  disabled,
}: {
  reactions: Record<string, number>;
  myReaction: string | null;
  onReact: (type: ReactionType) => void;
  disabled?: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const present = REACTIONS.filter((r) => (reactions[r.type] ?? 0) > 0);
  const myEmoji = myReaction ? reactionEmoji[myReaction] : null;

  const react = (type: ReactionType) => {
    setPickerOpen(false);
    if (!disabled) onReact(type);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Pressable
          style={[styles.reactBtn, myReaction && styles.reactBtnOn]}
          onPress={() => setPickerOpen((v) => !v)}
          hitSlop={6}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={myReaction ? "Change your reaction" : "React"}
        >
          <Text style={styles.reactEmoji}>{myEmoji ?? "🙂"}</Text>
          <Text style={[styles.reactLabel, myReaction && styles.reactLabelOn]}>
            {myReaction ? "Reacted" : "React"}
          </Text>
        </Pressable>

        {present.map((r) => (
          <Pressable
            key={r.type}
            style={[styles.chip, myReaction === r.type && styles.chipOn]}
            onPress={() => react(r.type)}
            hitSlop={6}
            disabled={disabled}
            accessibilityLabel={r.label}
          >
            <Text style={styles.chipEmoji}>{r.emoji}</Text>
            <Text style={[styles.chipCount, myReaction === r.type && styles.chipCountOn]}>
              {reactions[r.type]}
            </Text>
          </Pressable>
        ))}
      </View>

      {pickerOpen ? (
        <View style={styles.picker}>
          {REACTIONS.map((r) => (
            <Pressable
              key={r.type}
              style={[styles.pickerBtn, myReaction === r.type && styles.pickerBtnOn]}
              onPress={() => react(r.type)}
              hitSlop={6}
              accessibilityLabel={r.label}
            >
              <Text style={styles.pickerEmoji}>{r.emoji}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  reactBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: 999,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reactBtnOn: { borderColor: "rgba(124,92,255,0.6)", backgroundColor: "rgba(124,92,255,0.12)" },
  reactEmoji: { fontSize: 15 },
  reactLabel: { color: colors.muted, fontSize: 12.5, fontWeight: "800" },
  reactLabelOn: { color: colors.accentSoft },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 9,
    borderRadius: 999,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { borderColor: colors.accentSoft, backgroundColor: "rgba(124,92,255,0.12)" },
  chipEmoji: { fontSize: 14 },
  chipCount: { color: colors.muted, fontSize: 12, fontWeight: "700", fontVariant: ["tabular-nums"] },
  chipCountOn: { color: colors.text },
  picker: {
    flexDirection: "row",
    gap: 6,
    alignSelf: "flex-start",
    padding: 6,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: "rgba(124,92,255,0.4)",
  },
  pickerBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  pickerBtnOn: { backgroundColor: "rgba(124,92,255,0.18)" },
  pickerEmoji: { fontSize: 22 },
});
