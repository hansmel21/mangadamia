// Shared animation helpers — the app-wide "smoothness" layer.
// (No LayoutAnimation here: it's a silent no-op under the New Architecture,
// so everything uses the core Animated API instead.)
import { useEffect, useRef } from "react";
import { Animated } from "react-native";

/** Pressed-state feedback for Pressable `style` functions: subtle sink. */
export const pressFx = ({ pressed }: { pressed: boolean }) =>
  pressed ? { opacity: 0.6, transform: [{ scale: 0.97 }] } : null;

/**
 * Cross-fade + rise whenever `dep` changes — wrap the switching content in
 * an Animated.View with this style:
 *   const fade = useSwitchFade(mode);
 *   <Animated.View style={[{ flex: 1 }, fade]}>…</Animated.View>
 */
export function useSwitchFade(dep: unknown) {
  const v = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    v.setValue(0);
    Animated.spring(v, { toValue: 1, damping: 16, stiffness: 140, useNativeDriver: true }).start();
  }, [dep, v]);
  return {
    opacity: v,
    transform: [
      { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) },
    ],
  };
}
