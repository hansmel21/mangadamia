import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { colors, fonts, radii } from "../theme";

// Semantic tone → color used across System chrome (titles, keys, corners).
type Tone = "accent" | "foil" | "fresh" | "danger" | "data" | "info";
const toneColor: Record<Tone, string> = {
  accent: colors.accentBright,
  foil: colors.foil,
  fresh: colors.fresh,
  danger: colors.danger,
  data: colors.data,
  info: colors.info,
};
const toneBorder: Record<Tone, string> = {
  accent: "rgba(124,92,255,0.65)",
  foil: "rgba(245,184,76,0.65)",
  fresh: "rgba(76,195,138,0.6)",
  danger: "rgba(229,72,77,0.6)",
  data: "rgba(84,214,255,0.6)",
  info: "rgba(75,163,255,0.6)",
};

/**
 * Bracketed page title — a 1.5px bordered label with two corner ticks and the
 * Bricolage display face. Replaces the native header title (set
 * `headerShown: false` and render this in-screen). Tone recolors border+ticks:
 * accent (default), foil (Arena/Quests), danger (Roster/War).
 */
export function ScreenTitle({
  children,
  tone = "accent",
  color,
  size = 18,
  style,
}: {
  children: ReactNode;
  tone?: Tone;
  /** Raw hex override for border + ticks (e.g. a post-kind color). */
  color?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const tick = color ?? toneColor[tone];
  const border = color ? color + "A6" : toneBorder[tone];
  return (
    <View style={[styles.screenTitle, { borderColor: border }, style]}>
      <View style={[styles.titleTick, styles.titleTickTL, { borderTopColor: tick, borderLeftColor: tick }]} />
      <View style={[styles.titleTick, styles.titleTickBR, { borderBottomColor: tick, borderRightColor: tick }]} />
      <Text style={[styles.screenTitleText, { fontSize: size }]}>{children}</Text>
    </View>
  );
}

export function SystemCorners({ tone = "accent" }: { tone?: "accent" | "foil" | "fresh" }) {
  const color = tone === "foil" ? colors.foil : tone === "fresh" ? colors.fresh : colors.accentBright;
  return (
    <>
      <View pointerEvents="none" style={[styles.corner, styles.tl, { borderColor: color }]} />
      <View pointerEvents="none" style={[styles.corner, styles.tr, { borderColor: color }]} />
      <View pointerEvents="none" style={[styles.corner, styles.bl, { borderColor: color }]} />
      <View pointerEvents="none" style={[styles.corner, styles.br, { borderColor: color }]} />
    </>
  );
}

export function SystemPanel({
  children,
  style,
  tone = "accent",
  raised = false,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: "accent" | "foil" | "fresh" | "quiet";
  raised?: boolean;
}) {
  const borderColor =
    tone === "foil"
      ? "rgba(245,184,76,0.48)"
      : tone === "fresh"
        ? "rgba(76,195,138,0.42)"
        : tone === "quiet"
          ? colors.border
          : colors.accentLine;
  return (
    <LinearGradient
      colors={raised ? [colors.panelRaised, colors.card] : [colors.card, colors.panel]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.panel, { borderColor }, style]}
    >
      {tone !== "quiet" ? <SystemCorners tone={tone} /> : null}
      {children}
    </LinearGradient>
  );
}

export function SystemSectionTitle({
  children,
  action,
  onAction,
  tone = "accent",
}: {
  children: ReactNode;
  action?: string;
  onAction?: () => void;
  tone?: "accent" | "foil";
}) {
  return (
    <View style={styles.sectionRow}>
      <View style={[styles.sectionMark, tone === "foil" && { borderColor: colors.foil }]} />
      <Text style={[styles.sectionTitle, tone === "foil" && { color: colors.foilSoft }]}>
        {children}
      </Text>
      <View style={styles.sectionLine} />
      {action ? (
        <Pressable onPress={onAction} hitSlop={8} disabled={!onAction}>
          <Text style={styles.sectionAction}>{action} ›</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function SystemChip({
  label,
  active = false,
  tone = "accent",
  style,
}: {
  label: string;
  active?: boolean;
  tone?: "accent" | "foil" | "fresh" | "muted";
  style?: StyleProp<ViewStyle>;
}) {
  const color =
    tone === "foil"
      ? colors.foil
      : tone === "fresh"
        ? colors.fresh
        : tone === "muted"
          ? colors.muted
          : colors.accentSoft;
  return (
    <View
      style={[
        styles.chip,
        { borderColor: active ? color : colors.border },
        active && { backgroundColor: tone === "foil" ? colors.foilGhost : colors.accentGhost },
        style,
      ]}
    >
      <Text style={[styles.chipText, { color }]}>{label}</Text>
    </View>
  );
}

export function SystemButton({
  label,
  icon,
  tone = "accent",
  compact = false,
  style,
  disabled,
  ...props
}: Omit<PressableProps, "style" | "children"> & {
  label: string;
  icon?: ReactNode;
  tone?: "accent" | "foil" | "quiet";
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const borderColor = tone === "foil" ? colors.foil : tone === "quiet" ? colors.borderStrong : colors.accentBright;
  const textColor = tone === "foil" ? colors.foilSoft : tone === "quiet" ? colors.mutedStrong : colors.accentSoft;
  return (
    <Pressable
      {...props}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        { borderColor },
        tone === "foil" && { backgroundColor: colors.foilGhost },
        tone === "quiet" && { backgroundColor: colors.panel },
        pressed && styles.buttonPressed,
        disabled && styles.buttonDisabled,
        style,
      ]}
    >
      <View style={styles.buttonFlare} />
      {icon}
      <Text style={[styles.buttonText, { color: textColor }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * The System button. Three variants:
 *  - "primary"  gradient fill + glow, white `▸ LABEL` (main CTA)
 *  - "outline"  1px tone/quiet border, muted-or-tone label
 *  - "chip"     filter pill; when `active` gets tint + 1.5px border + ◆ prefix
 * Replaces one-off Pressable buttons across the app.
 */
export function SystemKey({
  label,
  onPress,
  variant = "primary",
  tone = "accent",
  icon,
  arrow = variant === "primary",
  active = false,
  compact = false,
  disabled,
  style,
  textStyle,
}: {
  label: string;
  onPress?: () => void;
  variant?: "primary" | "outline" | "chip";
  tone?: Tone;
  icon?: ReactNode;
  arrow?: boolean;
  active?: boolean;
  compact?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}) {
  const color = toneColor[tone];

  if (variant === "primary") {
    const grad =
      tone === "foil"
        ? ["#f5b84c", "#d69433"]
        : tone === "danger"
          ? ["#e5484d", "#b23539"]
          : tone === "fresh"
            ? ["#4cc38a", "#2f9668"]
            : [colors.accent, colors.accentDeep];
    return (
      <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [pressed && styles.keyPressed, disabled && styles.keyDisabled, style]}>
        <LinearGradient
          colors={grad as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.keyBase, compact && styles.keyCompact, styles.keyPrimary, { shadowColor: color }]}
        >
          {icon}
          <Text style={[styles.keyPrimaryText, textStyle]}>
            {arrow ? "▸ " : ""}
            {label}
          </Text>
        </LinearGradient>
      </Pressable>
    );
  }

  if (variant === "chip") {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [
          styles.keyBase,
          styles.keyChip,
          {
            borderWidth: active ? 1.5 : 1,
            borderColor: active ? toneBorder[tone] : colors.border,
            backgroundColor: active ? colors.accentGhost : "transparent",
          },
          active && tone === "accent" && styles.keyChipGlow,
          pressed && styles.keyPressed,
          style,
        ]}
      >
        {icon}
        <Text style={[styles.keyChipText, { color: active ? colors.text : colors.muted }, textStyle]}>
          {active ? "◆ " : ""}
          {label}
        </Text>
      </Pressable>
    );
  }

  // outline
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.keyBase,
        compact && styles.keyCompact,
        styles.keyOutline,
        { borderColor: tone === "accent" ? colors.borderStrong : toneBorder[tone] },
        pressed && styles.keyPressed,
        disabled && styles.keyDisabled,
        style,
      ]}
    >
      {icon}
      <Text style={[styles.keyOutlineText, { color: tone === "accent" ? colors.mutedStrong : color }, textStyle]}>
        {arrow ? "▸ " : ""}
        {label}
      </Text>
    </Pressable>
  );
}

export function SystemProgress({
  value,
  tone = "accent",
  height = 7,
}: {
  value: number;
  tone?: "accent" | "foil" | "fresh";
  height?: number;
}) {
  const color = tone === "foil" ? colors.foil : tone === "fresh" ? colors.fresh : colors.accentBright;
  return (
    <View style={[styles.track, { height }]}>
      <View style={[styles.progress, { width: `${Math.max(0, Math.min(100, value))}%`, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: "relative",
    borderWidth: 1,
    borderRadius: radii.panel,
    overflow: "hidden",
    shadowColor: colors.accent,
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  corner: { position: "absolute", width: 12, height: 12 },
  tl: { top: -1, left: -1, borderTopWidth: 2, borderLeftWidth: 2 },
  tr: { top: -1, right: -1, borderTopWidth: 2, borderRightWidth: 2 },
  bl: { bottom: -1, left: -1, borderBottomWidth: 2, borderLeftWidth: 2 },
  br: { bottom: -1, right: -1, borderBottomWidth: 2, borderRightWidth: 2 },
  screenTitle: {
    position: "relative",
    alignSelf: "flex-start",
    borderWidth: 1.5,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  screenTitleText: {
    color: colors.text,
    fontFamily: fonts.display,
    fontWeight: "800",
    letterSpacing: 1,
  },
  titleTick: { position: "absolute", width: 7, height: 7 },
  titleTickTL: { top: -2, left: -2, borderTopWidth: 2, borderLeftWidth: 2 },
  titleTickBR: { bottom: -2, right: -2, borderBottomWidth: 2, borderRightWidth: 2 },
  keyBase: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: radii.control,
    paddingHorizontal: 16,
    minHeight: 44,
  },
  keyCompact: { minHeight: 36, paddingHorizontal: 12 },
  keyPrimary: {
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  keyPrimaryText: { color: "#fff", fontSize: 12, fontWeight: "900", letterSpacing: 1.6 },
  keyOutline: { backgroundColor: "transparent", borderWidth: 1 },
  keyOutlineText: { fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  keyChip: { minHeight: 0, paddingHorizontal: 11, paddingVertical: 8, gap: 5 },
  keyChipGlow: {
    shadowColor: colors.accent,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  keyChipText: { fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  keyPressed: { opacity: 0.85, transform: [{ scale: 0.96 }] },
  keyDisabled: { opacity: 0.4 },
  sectionRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionMark: { width: 8, height: 8, borderWidth: 1.5, borderColor: colors.accentBright, transform: [{ rotate: "45deg" }] },
  sectionTitle: { color: colors.accentSoft, fontFamily: fonts.displayBold, fontSize: 12, letterSpacing: 1.8, textTransform: "uppercase" },
  sectionLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  sectionAction: { color: colors.muted, fontSize: 9, fontWeight: "800", letterSpacing: 1.1 },
  chip: { borderWidth: 1, borderRadius: radii.chip, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: colors.panel },
  chipText: { fontSize: 9, fontWeight: "900", letterSpacing: 0.7, textTransform: "uppercase" },
  button: { minHeight: 44, borderWidth: 1.5, borderRadius: radii.control, backgroundColor: colors.accentGhost, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 16, overflow: "hidden" },
  buttonCompact: { minHeight: 34, paddingHorizontal: 12 },
  buttonPressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  buttonDisabled: { opacity: 0.35 },
  buttonFlare: { position: "absolute", top: 0, bottom: 0, left: 0, width: 3, backgroundColor: colors.accentBright },
  buttonText: { fontSize: 11, fontWeight: "900", letterSpacing: 1.7, textTransform: "uppercase" },
  track: { width: "100%", borderRadius: 2, backgroundColor: colors.bg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: "hidden" },
  progress: { height: "100%", borderRadius: 2, shadowColor: colors.accentBright, shadowOpacity: 0.8, shadowRadius: 5, shadowOffset: { width: 0, height: 0 } },
});
