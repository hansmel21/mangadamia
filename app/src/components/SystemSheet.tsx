// Bottom-anchored System sheet with the CRT choreography — the composer and
// other "trays" slide up as a window whose top border carries corner ticks and
// the diamond-! title, mirroring SystemModal's open/close feel but pinned to
// the bottom edge (per the System Protocol composer spec, §3).
import { X } from "lucide-react-native";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme";

export function SystemSheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const [rendered, setRendered] = useState(visible);
  const sy = useRef(new Animated.Value(0.045)).current;
  const op = useRef(new Animated.Value(0)).current;
  const backdrop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setRendered(true);
      sy.setValue(0.045);
      op.setValue(0);
      backdrop.setValue(0);
      Animated.parallel([
        Animated.timing(backdrop, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(op, { toValue: 1, duration: 90, useNativeDriver: true }),
          Animated.spring(sy, { toValue: 1, damping: 14, stiffness: 170, useNativeDriver: true }),
        ]),
      ]).start();
    } else if (rendered) {
      Animated.parallel([
        Animated.timing(backdrop, { toValue: 0, duration: 260, useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(sy, {
            toValue: 0.045,
            duration: 170,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(op, { toValue: 0, duration: 120, useNativeDriver: true }),
        ]),
      ]).start(() => setRendered(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!rendered) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[styles.backdrop, { opacity: backdrop }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <KeyboardAvoidingView
          style={styles.fill}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          pointerEvents="box-none"
        >
          <Animated.View
            style={[
              styles.sheet,
              { paddingBottom: Math.max(insets.bottom, 14) + 12 },
              // Sheets stretch open from the bottom edge.
              { opacity: op, transform: [{ scaleY: sy }], transformOrigin: "bottom" },
            ]}
          >
            <View style={[styles.tick, styles.tickL]} pointerEvents="none" />
            <View style={[styles.tick, styles.tickR]} pointerEvents="none" />
            <View style={styles.headRow}>
              <View style={styles.diamond}>
                <Text style={styles.diamondMark}>!</Text>
              </View>
              <Text style={styles.headTitle}>{title ?? "SYSTEM"}</Text>
              <Pressable style={styles.close} hitSlop={10} onPress={onClose} accessibilityLabel="Close">
                <X color={colors.muted} size={18} strokeWidth={2} />
              </Pressable>
            </View>
            <View style={styles.rule} />
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={styles.scroll}
            >
              {children}
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)" },
  fill: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "rgba(13,15,20,0.98)",
    borderTopWidth: 1.5,
    borderTopColor: "rgba(124,92,255,0.65)",
    paddingHorizontal: 16,
    paddingTop: 18,
    shadowColor: colors.accent,
    shadowOpacity: 0.25,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: -6 },
    elevation: 16,
  },
  scroll: { flexGrow: 0 },
  tick: { position: "absolute", width: 11, height: 11, borderColor: colors.accentBright },
  tickL: { top: -2, left: 14, borderTopWidth: 2.5, borderLeftWidth: 2.5 },
  tickR: { top: -2, right: 14, borderTopWidth: 2.5, borderRightWidth: 2.5 },
  headRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  diamond: {
    width: 15,
    height: 15,
    borderWidth: 1.5,
    borderColor: colors.accentBright,
    transform: [{ rotate: "45deg" }],
    alignItems: "center",
    justifyContent: "center",
  },
  diamondMark: {
    color: colors.accentBright,
    fontSize: 9,
    fontWeight: "900",
    transform: [{ rotate: "-45deg" }],
  },
  headTitle: {
    color: colors.accentBright,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 3.5,
  },
  close: { position: "absolute", right: 0 },
  rule: { height: 1, backgroundColor: "rgba(124,92,255,0.35)", marginVertical: 13 },
});
