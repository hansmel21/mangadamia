// "The System" window — the manhwa status-window frame (glowing border,
// corner brackets, diamond-! header). Used for modals, toasts, and the
// profile status panel to give the whole app its leveling-system feel.
import type { ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { colors } from "../theme";

export function SystemWindow({
  title,
  children,
  style,
  compact = false,
  dim = false,
  translucent = false,
}: {
  title?: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
  // Quieter treatment for windows that live permanently on a screen
  dim?: boolean;
  // See-through treatment for reward pops so they don't cover what you're reading
  translucent?: boolean;
}) {
  return (
    <View
      style={[
        styles.window,
        compact && styles.windowCompact,
        dim && styles.windowDim,
        translucent && styles.windowTranslucent,
        style,
      ]}
    >
      <View style={[styles.corner, styles.tl]} />
      <View style={[styles.corner, styles.tr]} />
      <View style={[styles.corner, styles.bl]} />
      <View style={[styles.corner, styles.br]} />
      {title ? (
        <>
          <View style={styles.header}>
            <View style={styles.diamond}>
              <Text style={styles.diamondText}>!</Text>
            </View>
            <Text style={styles.headerText}>{title}</Text>
          </View>
          <View style={styles.divider} />
        </>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  window: {
    backgroundColor: "rgba(13,15,20,0.97)",
    borderWidth: 1.5,
    borderColor: "rgba(124,92,255,0.65)",
    borderRadius: 6,
    padding: 20,
    shadowColor: colors.accent,
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  windowCompact: { padding: 14 },
  windowDim: {
    borderColor: "rgba(124,92,255,0.35)",
    shadowOpacity: 0.18,
    shadowRadius: 9,
    elevation: 4,
  },
  windowTranslucent: {
    backgroundColor: "rgba(13,15,20,0.66)",
    borderColor: "rgba(124,92,255,0.45)",
    shadowOpacity: 0.28,
  },
  corner: {
    position: "absolute",
    width: 13,
    height: 13,
    borderColor: colors.accentSoft,
  },
  tl: { top: -2, left: -2, borderTopWidth: 2.5, borderLeftWidth: 2.5 },
  tr: { top: -2, right: -2, borderTopWidth: 2.5, borderRightWidth: 2.5 },
  bl: { bottom: -2, left: -2, borderBottomWidth: 2.5, borderLeftWidth: 2.5 },
  br: { bottom: -2, right: -2, borderBottomWidth: 2.5, borderRightWidth: 2.5 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  diamond: {
    width: 16,
    height: 16,
    borderWidth: 1.5,
    borderColor: colors.accentSoft,
    transform: [{ rotate: "45deg" }],
    alignItems: "center",
    justifyContent: "center",
  },
  diamondText: {
    color: colors.accentSoft,
    fontSize: 10,
    fontWeight: "900",
    transform: [{ rotate: "-45deg" }],
    lineHeight: 12,
  },
  headerText: {
    color: colors.accentSoft,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 3.5,
    textTransform: "uppercase",
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(124,92,255,0.35)",
    marginVertical: 13,
    alignSelf: "stretch",
  },
});
