// Centered System modal with the CRT choreography:
//   open  — a line of light stretches across, then the window springs open
//   close — the window squeezes flat into a line, contracts, and puffs out
// The close animation plays BEFORE unmount, so dismissals feel deliberate.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, Modal, Pressable, StyleSheet } from "react-native";
import { SystemWindow } from "./SystemWindow";

export function SystemModal({
  visible,
  onClose,
  title,
  children,
  maxWidth = 340,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  maxWidth?: number;
}) {
  const [rendered, setRendered] = useState(visible);
  const sx = useRef(new Animated.Value(0.08)).current;
  const sy = useRef(new Animated.Value(0.045)).current;
  const op = useRef(new Animated.Value(0)).current;
  const backdrop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setRendered(true);
      sx.setValue(0.08);
      sy.setValue(0.045);
      op.setValue(0);
      backdrop.setValue(0);
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
          Animated.spring(sy, {
            toValue: 1,
            damping: 13,
            stiffness: 160,
            useNativeDriver: true,
          }),
        ]),
      ]).start();
    } else if (rendered) {
      Animated.parallel([
        Animated.timing(backdrop, { toValue: 0, duration: 300, useNativeDriver: true }),
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
      ]).start(() => setRendered(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!rendered) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.backdrop, { opacity: backdrop }]}>
        <Pressable style={styles.fill} onPress={onClose}>
          <Animated.View
            style={{
              width: "100%",
              maxWidth,
              opacity: op,
              transform: [{ scaleX: sx }, { scaleY: sy }],
            }}
          >
            <Pressable onPress={() => undefined}>
              <SystemWindow title={title}>{children}</SystemWindow>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)" },
  fill: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28 },
});
