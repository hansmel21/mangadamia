// Foil toast for badge unlocks: slides in from the top, holds, slides out.
// Mount <BadgeToastHost /> once (root layout); trigger with showBadgeToast().
import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BadgeMini } from "../api";
import { colors, fonts } from "../theme";
import { BadgeMedallion } from "./BadgeMedallion";
import { SystemWindow } from "./SystemWindow";

let pushToHost: ((badges: BadgeMini[]) => void) | null = null;

export function showBadgeToast(badges: BadgeMini[]) {
  if (badges.length === 0) return;
  pushToHost?.(badges);
}

export function BadgeToastHost() {
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState<BadgeMini[] | null>(null);
  const queue = useRef<BadgeMini[][]>([]);
  const slide = useRef(new Animated.Value(-140)).current;

  useEffect(() => {
    pushToHost = (badges) => {
      queue.current.push(badges);
      setCurrent((c) => c ?? queue.current.shift() ?? null);
    };
    return () => {
      pushToHost = null;
    };
  }, []);

  useEffect(() => {
    if (!current) return;
    Animated.sequence([
      Animated.spring(slide, { toValue: 0, useNativeDriver: true, damping: 16 }),
      Animated.delay(3200),
      Animated.timing(slide, { toValue: -140, duration: 260, useNativeDriver: true }),
    ]).start(() => {
      setCurrent(queue.current.shift() ?? null);
    });
  }, [current, slide]);

  if (!current) return null;
  const first = current[0];

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.wrap, { top: insets.top + 8, transform: [{ translateY: slide }] }]}
    >
      <SystemWindow title="Notification" compact translucent style={styles.toast}>
        <View style={styles.row}>
          <BadgeMedallion badgeId={first.id} fallbackIcon={first.icon} size={40} glow />
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>You have earned a badge</Text>
            <Text style={styles.name} numberOfLines={1}>
              {current.length > 1 ? `${first.name} +${current.length - 1} more` : first.name}
            </Text>
          </View>
        </View>
      </SystemWindow>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 16, right: 16, zIndex: 100, alignItems: "center" },
  toast: { minWidth: 260, maxWidth: 420 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  label: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  name: { color: colors.foil, fontSize: 17, fontFamily: fonts.display, marginTop: 1 },
});
