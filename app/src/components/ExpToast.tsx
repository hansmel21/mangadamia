// Lightweight "+N EXP" pop for everyday actions (posting, replying,
// commenting). Deliberately small and translucent so it rewards the reader
// without covering what they're doing. Mount <ExpToastHost /> once in the root
// layout; trigger with showExpGain(amount).
import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fonts } from "../theme";
import { SystemWindow } from "./SystemWindow";

interface ExpPop {
  amount: number;
  bonus?: number;
}

let deliver: ((pop: ExpPop) => void) | null = null;

// `bonus` marks streak-boosted awards ("🔥 streak bonus" under the number).
export function showExpGain(amount?: number | null, bonus?: number | null) {
  if (amount && amount > 0) deliver?.({ amount, bonus: bonus ?? 0 });
}

export function ExpToastHost() {
  const insets = useSafeAreaInsets();
  const [amount, setAmount] = useState<ExpPop | null>(null);
  const queue = useRef<ExpPop[]>([]);
  const y = useRef(new Animated.Value(-120)).current;
  const op = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    deliver = (next) => {
      queue.current.push(next);
      setAmount((current) => current ?? queue.current.shift() ?? null);
    };
    return () => {
      deliver = null;
    };
  }, []);

  useEffect(() => {
    if (amount == null) return;
    y.setValue(-120);
    op.setValue(0);
    Animated.sequence([
      Animated.parallel([
        Animated.spring(y, { toValue: 0, useNativeDriver: true, damping: 15 }),
        Animated.timing(op, { toValue: 1, duration: 160, useNativeDriver: true }),
      ]),
      Animated.delay(1600),
      Animated.parallel([
        Animated.timing(y, { toValue: -120, duration: 240, useNativeDriver: true }),
        Animated.timing(op, { toValue: 0, duration: 240, useNativeDriver: true }),
      ]),
    ]).start(() => setAmount(queue.current.shift() ?? null));
  }, [amount, y, op]);

  if (amount == null) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.host, { top: insets.top + 6, opacity: op, transform: [{ translateY: y }] }]}
    >
      <SystemWindow compact translucent style={styles.window}>
        <View style={styles.row}>
          <Text style={styles.plus}>+{amount.amount}</Text>
          <Text style={styles.label}>EXP</Text>
        </View>
        {amount.bonus ? <Text style={styles.bonus}>🔥 streak bonus +{amount.bonus}</Text> : null}
      </SystemWindow>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: { position: "absolute", left: 0, right: 0, alignItems: "center", zIndex: 90 },
  window: { paddingVertical: 8, paddingHorizontal: 16 },
  row: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  plus: { color: colors.foil, fontFamily: fonts.display, fontSize: 20 },
  label: { color: colors.foil, fontSize: 11, fontWeight: "900", letterSpacing: 2 },
  bonus: { color: colors.foilSoft, fontSize: 9.5, fontWeight: "800", textAlign: "center", marginTop: 2 },
});
