// Reaction bar for System Records. Tapping "React" springs a floating emote
// tray up over the card and animates closed into itself (Facebook-style). The
// reactions a post has are shown as one condensed cluster (up to 3 emojis + a
// total), so it never sprawls no matter how many people react. One reaction per
// reader: tap your current one to clear it, another to swap.
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
  const anim = useRef(new Animated.Value(0)).current;

  const total = Object.values(reactions).reduce((sum, n) => sum + n, 0);
  const present = REACTIONS.filter((r) => (reactions[r.type] ?? 0) > 0).slice(0, 3);
  const myEmoji = myReaction ? reactionEmoji[myReaction] : null;

  useEffect(() => {
    if (pickerOpen) {
      setTrayMounted(true);
      Animated.spring(anim, {
        toValue: 1,
        useNativeDriver: true,
        damping: 12,
        stiffness: 220,
        mass: 0.7,
      }).start();
    } else if (trayMounted) {
      Animated.timing(anim, {
        toValue: 0,
        duration: 170,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => finished && setTrayMounted(false));
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
          style={[
            styles.tray,
            {
              opacity: anim,
              transform: [
                { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
                { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) },
              ],
            },
          ]}
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
    borderColor: "rgba(124,92,255,0.6)",
    zIndex: 50,
    shadowColor: colors.accent,
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 12,
  },
  trayBtn: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  trayBtnOn: { backgroundColor: "rgba(124,92,255,0.22)" },
  trayBtnPressed: { transform: [{ scale: 1.25 }] },
  trayEmoji: { fontSize: 24 },
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
  summary: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4, paddingHorizontal: 4 },
  summaryEmojis: { flexDirection: "row" },
  summaryEmojiWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryEmoji: { fontSize: 12 },
  summaryCount: { color: colors.muted, fontSize: 12.5, fontWeight: "700", fontVariant: ["tabular-nums"] },
});
