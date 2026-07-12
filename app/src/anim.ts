// Shared animation helpers — the app-wide "smoothness" layer.
// (No LayoutAnimation here: it's a silent no-op under the New Architecture,
// so everything uses the core Animated API instead.)
import { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";

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

/**
 * CRT "line-stretch → spring" open used across every System window, sheet and
 * tray (mirrors SystemModal's choreography as a reusable style). Mount an
 * Animated.View with the returned style:
 *   const crt = useCrtOpen();
 *   <Animated.View style={crt}>…</Animated.View>
 */
export function useCrtOpen(enabled = true) {
  const sy = useRef(new Animated.Value(enabled ? 0.04 : 1)).current;
  const op = useRef(new Animated.Value(enabled ? 0 : 1)).current;
  useEffect(() => {
    if (!enabled) return;
    sy.setValue(0.04);
    op.setValue(0);
    Animated.sequence([
      Animated.timing(op, { toValue: 1, duration: 90, useNativeDriver: true }),
      Animated.spring(sy, { toValue: 1, damping: 14, stiffness: 170, useNativeDriver: true }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
  return { opacity: op, transform: [{ scaleY: sy }] };
}

/**
 * Slow breathing glow for online dots and LIVE chips (2s opacity .55↔1).
 * Returns a style object; the caller owns layout.
 */
export function usePulseGlow(period = 2000) {
  const v = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 0.55, duration: period / 2, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 1, duration: period / 2, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [period, v]);
  return { opacity: v };
}

/**
 * Grows a progress bar's width from 0 → `pct`% on mount (400ms ease-out).
 * Wrap the fill in an Animated.View and spread the returned style:
 *   const grow = useProgressGrow(74);
 *   <Animated.View style={[fill, grow]} />
 */
export function useProgressGrow(pct: number, duration = 400) {
  const v = useRef(new Animated.Value(0)).current;
  const target = Math.max(0, Math.min(100, pct));
  useEffect(() => {
    Animated.timing(v, {
      toValue: target,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [target, duration, v]);
  return { width: v.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }) };
}
