import { router } from "expo-router";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../api";
import { TERMS_VERSION } from "../legal";
import { getSessionUser, subscribeSession, updateSessionUser } from "../session";
import { colors } from "../theme";

export function TermsAcceptance({ children }: { children: ReactNode }) {
  const user = useSyncExternalStore(subscribeSession, getSessionUser);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!user || user.acceptedTermsVersion === TERMS_VERSION) return <>{children}</>;

  const accept = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await api.acceptTerms(TERMS_VERSION);
      updateSessionUser({ acceptedTermsVersion: result.acceptedTermsVersion });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Accept community terms</Text>
      <Text style={styles.body}>
        Before posting, review and accept the current Terms of Use and Community Guidelines.
      </Text>
      <View style={styles.links}>
        <Pressable onPress={() => router.push("/legal/terms")}>
          <Text style={styles.link}>Terms of Use</Text>
        </Pressable>
        <Pressable onPress={() => router.push("/legal/community")}>
          <Text style={styles.link}>Community Guidelines</Text>
        </Pressable>
        <Pressable onPress={() => router.push("/legal/privacy")}>
          <Text style={styles.link}>Privacy Policy</Text>
        </Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={[styles.accept, busy && { opacity: 0.5 }]} disabled={busy} onPress={accept}>
        {busy ? (
          <ActivityIndicator color={colors.accentSoft} />
        ) : (
          <Text style={styles.acceptText}>I AGREE</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  title: { color: colors.text, fontSize: 18, fontWeight: "800" },
  body: { color: colors.muted, lineHeight: 20 },
  links: { gap: 8, marginVertical: 4 },
  link: { color: colors.accentSoft, textDecorationLine: "underline", fontWeight: "700" },
  error: { color: colors.danger },
  accept: {
    borderWidth: 1.5,
    borderColor: colors.accent,
    backgroundColor: "rgba(124,92,255,0.18)",
    borderRadius: 4,
    paddingVertical: 11,
    alignItems: "center",
  },
  acceptText: { color: colors.accentSoft, fontWeight: "800", letterSpacing: 1.6 },
});
