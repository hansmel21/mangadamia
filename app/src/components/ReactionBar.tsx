// Reaction bar for System Records. Tapping "React" opens a floating emote tray
// with the same "status window" choreography as SystemModal (stretch to a line,
// unfold, squeeze flat on close). The reactions a post has are shown as one
// condensed cluster (up to 3 emojis + a total) so it never sprawls. One
// reaction per reader: tap your current one to clear it, another to swap.
import { usePathname } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
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
  const [trayMounted, setTrayMounted] = useState(false);
  const sx = useRef(new Animated.Value(0.08)).current;
  const sy = useRef(new Animated.Value(0.045)).current;
  const op = useRef(new Animated.Value(0)).current;
  const pathname = usePathname();

  const total = Object.values(reactions).reduce((sum, n) => sum + n, 0);
  const present = REACTIONS.filter((r) => (reactions[r.type] ?? 0) > 0).slice(0, 3);
  const myEmoji = myReaction ? reactionEmoji[myReaction] : null;

  // Never leave the tray open when the screen changes underneath it (e.g. you
  // opened it, then tapped a post and navigated away).
  useEffect(() => {
    setPickerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (pickerOpen) {
      setTrayMounted(true);
      sx.setValue(0.08);
      sy.setValue(0.045);
      op.setValue(0);
      Animated.sequence([
        Animated.parallel([
          Animated.timing(op, { toValue: 1, duration: 90, useNativeDriver: true }),
          Animated.timing(sx, {
            toValue: 1,
            duration: 170,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        Animated.spring(sy, { toValue: 1, damping: 13, stiffness: 160, useNativeDriver: true }),
      ]).start();
    } else if (trayMounted) {
      Animated.sequence([
        Animated.timing(sy, {
          toValue: 0.045,
          duration: 170,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.parallel([
          Animated.timing(sx, {
            toValue: 0.08,
            duration: 150,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(op, { toValue: 0, duration: 140, useNativeDriver: true }),
        ]),
      ]).start(({ finished }) => finished && setTrayMounted(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickerOpen]);

  const react = (type: ReactionType) => {
    setPickerOpen(false);
    if (!disabled) onReact(type);
  };

  return (
    <View style={styles.wrap}>
      {trayMounted ? (
        <Animated.View
          style={[styles.tray, { opacity: op, transform: [{ scaleX: sx }, { scaleY: sy }] }]}
        >
          {REACTIONS.map((r) => (
            <Pressable
              key={r.type}
              style={({ pressed }) => [
                styles.trayBtn,
                myReaction === r.type && styles.trayBtnOn,
                pressed && styles.trayBtnPressed,
              ]}
              onPress={() => react(r.type)}
              hitSlop={4}
              accessibilityLabel={r.label}
            >
              <Text style={styles.trayEmoji}>{r.emoji}</Text>
            </Pressable>
          ))}
        </Animated.View>
      ) : null}

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

        {total > 0 ? (
          <Pressable
            style={styles.summary}
            onPress={() => setPickerOpen(true)}
            hitSlop={6}
            disabled={disabled}
            accessibilityLabel={`${total} reactions`}
          >
            <View style={styles.summaryEmojis}>
              {present.map((r, i) => (
                <View key={r.type} style={[styles.summaryEmojiWrap, i > 0 && { marginLeft: -7 }]}>
                  <Text style={styles.summaryEmoji}>{r.emoji}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.summaryCount}>{total}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, position: "relative" },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  tray: {
    position: "absolute",
    bottom: "100%",
    left: 0,
    marginBottom: 8,
    flexDirection: "row",
    gap: 4,
    padding: 6,
    borderRadius: 999,
    backgroundColor: "rgba(23,26,33,0.98)",
    borderWidth: 1.5,
    borderColor: "rgba(107,94,204,0.6)",
    zIndex: 50,
    shadowColor: colors.accent,
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 12,
  },
  trayBtn: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  trayBtnOn: { backgroundColor: "rgba(107,94,204,0.22)" },
  trayBtnPressed: { transform: [{ scale: 1.25 }] },
  trayEmoji: { fontSize: 24 },
  // Quiet ghost pill — sits level with the other footer actions instead of
  // standing out as its own chunky control.
  reactBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  reactBtnOn: { borderColor: "rgba(107,94,204,0.5)", backgroundColor: "rgba(107,94,204,0.08)" },
  reactEmoji: { fontSize: 13 },
  reactLabel: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  reactLabelOn: { color: colors.accentSoft },
  summary: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 4, paddingHorizontal: 2 },
  summaryEmojis: { flexDirection: "row" },
  summaryEmojiWrap: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryEmoji: { fontSize: 10.5 },
  summaryCount: { color: colors.muted, fontSize: 11, fontWeight: "700", fontVariant: ["tabular-nums"] },
});
