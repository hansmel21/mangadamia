// Reaction bar for System Records. ⚡ Endorse is the primary (grants the author
// EXP); the ＋ opens the emote picker (🔥 🤯 😭 💀 — free). One reaction per
// reader per post: tapping your current reaction clears it, another swaps it.
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ReactionType } from "../api";
import { REACTIONS } from "../ranks";
import { colors } from "../theme";

const EMOTES = REACTIONS.filter((r) => r.type !== "endorse");

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
  const endorseCount = reactions.endorse ?? 0;
  const shownEmotes = EMOTES.filter((r) => (reactions[r.type] ?? 0) > 0 || myReaction === r.type);

  const react = (type: ReactionType) => {
    setPickerOpen(false);
    if (!disabled) onReact(type);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Pressable
          style={[styles.pill, myReaction === "endorse" && styles.endorseOn]}
          onPress={() => react("endorse")}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Endorse"
        >
          <Text style={styles.emoji}>⚡</Text>
          <Text style={[styles.count, myReaction === "endorse" && styles.countOn]}>
            {endorseCount > 0 ? endorseCount : "Endorse"}
          </Text>
        </Pressable>

        {shownEmotes.map((r) => (
          <Pressable
            key={r.type}
            style={[styles.pill, myReaction === r.type && styles.pillOn]}
            onPress={() => react(r.type)}
            hitSlop={6}
            accessibilityLabel={r.label}
          >
            <Text style={styles.emoji}>{r.emoji}</Text>
            {(reactions[r.type] ?? 0) > 0 ? (
              <Text style={[styles.count, myReaction === r.type && styles.countOn]}>
                {reactions[r.type]}
              </Text>
            ) : null}
          </Pressable>
        ))}

        <Pressable
          style={[styles.addPill, pickerOpen && styles.addOn]}
          onPress={() => setPickerOpen((v) => !v)}
          hitSlop={8}
          accessibilityLabel="Add a reaction"
        >
          <Text style={styles.addText}>{pickerOpen ? "×" : "＋"}</Text>
        </Pressable>
      </View>

      {pickerOpen ? (
        <View style={styles.picker}>
          {EMOTES.map((r) => (
            <Pressable
              key={r.type}
              style={[styles.pickerBtn, myReaction === r.type && styles.pickerBtnOn]}
              onPress={() => react(r.type)}
              hitSlop={6}
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
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: 999,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  endorseOn: { borderColor: colors.foil, backgroundColor: "rgba(245,184,76,0.12)" },
  pillOn: { borderColor: colors.accentSoft, backgroundColor: "rgba(124,92,255,0.12)" },
  emoji: { fontSize: 15 },
  count: { color: colors.muted, fontSize: 12.5, fontWeight: "700", fontVariant: ["tabular-nums"] },
  countOn: { color: colors.text },
  addPill: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  addOn: { borderColor: colors.accentSoft },
  addText: { color: colors.muted, fontSize: 16, fontWeight: "800", lineHeight: 18 },
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
  pickerBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  pickerBtnOn: { backgroundColor: "rgba(124,92,255,0.18)" },
  pickerEmoji: { fontSize: 20 },
});
