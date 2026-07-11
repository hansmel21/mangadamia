// Full-screen "LEVEL UP" System moment — springs in over everything when
// the reader crosses an XP threshold. Tap anywhere (or wait) to dismiss.
// Mount <LevelUpHost /> once (root layout); trigger with showLevelUp(level).
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text } from "react-native";
import { colors, fonts } from "../theme";
import { SystemWindow } from "./SystemWindow";

let pushToHost: ((level: number) => void) | null = null;

export function showLevelUp(level: number) {
  pushToHost?.(level);
}

export function LevelUpHost() {
  const [level, setLevel] = useState<number | null>(null);
  const backdrop = useRef(new Animated.Value(0)).current;
  const sx = useRef(new Animated.Value(0.08)).current;
  const sy = useRef(new Animated.Value(0.045)).current;
  const op = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    pushToHost = (lv) => setLevel(lv);
    return () => {
      pushToHost = null;
    };
  }, []);

  useEffect(() => {
    if (level === null) return;
    backdrop.setValue(0);
    sx.setValue(0.08);
    sy.setValue(0.045);
    op.setValue(0);
    Animated.parallel([
      Animated.timing(backdrop, { toValue: 1, duration: 200, useNativeDriver: true }),
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
        Animated.spring(sy, { toValue: 1, damping: 12, stiffness: 150, useNativeDriver: true }),
      ]),
    ]).start();
    timer.current = setTimeout(dismiss, 4200);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level]);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(backdrop, { toValue: 0, duration: 320, useNativeDriver: true }),
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
      ]),
    ]).start(() => setLevel(null));
  };

  if (level === null) return null;

  return (
    <Animated.View style={[styles.backdrop, { opacity: backdrop }]}>
      <Pressable style={styles.fill} onPress={dismiss}>
        <Animated.View
          style={{
            width: "100%",
            maxWidth: 320,
            opacity: op,
            transform: [{ scaleX: sx }, { scaleY: sy }],
          }}
        >
          <SystemWindow title="Notification">
            <Text style={styles.headline}>LEVEL UP</Text>
            <Text style={styles.level}>LV. {level}</Text>
            <Text style={styles.flavor}>Your power grows, reader.</Text>
            <Text style={styles.hint}>TAP TO CONTINUE</Text>
          </SystemWindow>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(5,6,10,0.82)",
    zIndex: 200,
  },
  fill: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  headline: {
    color: colors.accentSoft,
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 6,
    textAlign: "center",
  },
  level: {
    color: colors.foil,
    fontFamily: fonts.display,
    fontSize: 58,
    textAlign: "center",
    marginTop: 6,
    textShadowColor: "rgba(245,184,76,0.55)",
    textShadowRadius: 18,
    textShadowOffset: { width: 0, height: 0 },
  },
  flavor: { color: colors.muted, textAlign: "center", marginTop: 8, fontSize: 13 },
  hint: {
    color: colors.muted,
    textAlign: "center",
    marginTop: 16,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 2,
  },
});
