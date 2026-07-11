import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { api, type ModerationNotice } from "../src/api";
import { SystemModal } from "../src/components/SystemModal";
import { colors } from "../src/theme";

export default function AppealsScreen() {
  const queryClient = useQueryClient();
  const notices = useQuery({ queryKey: ["moderationNotices"], queryFn: api.moderationNotices });
  const [selected, setSelected] = useState<ModerationNotice | null>(null);
  const [message, setMessage] = useState("");
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.intro}>Warnings and decisions require acknowledgment. You may submit one in-app appeal per decision.</Text>
      {(notices.data ?? []).length === 0 ? <Text style={styles.empty}>No moderation notices.</Text> : null}
      {(notices.data ?? []).map((notice) => (
        <View key={notice.id} style={styles.card}>
          <Text style={styles.kind}>{notice.kind.replaceAll("_", " ").toUpperCase()}</Text>
          <Text style={styles.message}>{notice.message}</Text>
          <Text style={styles.reason}>{notice.moderationAction?.reasonCode.replaceAll("_", " ")}</Text>
          <View style={styles.actions}>
            {!notice.acknowledgedAt ? (
              <Pressable style={styles.button} onPress={async () => {
                await api.acknowledgeNotice(notice.id);
                await Promise.all([
                  queryClient.invalidateQueries({ queryKey: ["moderationNotices"] }),
                  queryClient.invalidateQueries({ queryKey: ["me"] }),
                ]);
              }}><Text style={styles.buttonText}>ACKNOWLEDGE</Text></Pressable>
            ) : null}
            {notice.moderationAction ? (
              <Pressable style={styles.button} onPress={() => setSelected(notice)}><Text style={styles.buttonText}>APPEAL</Text></Pressable>
            ) : null}
          </View>
        </View>
      ))}
      <SystemModal visible={!!selected} onClose={() => setSelected(null)} title="Submit appeal">
        <Text style={styles.intro}>Explain why this decision should be reviewed. Minimum 20 characters.</Text>
        <TextInput style={styles.input} value={message} onChangeText={setMessage} multiline maxLength={2000} />
        <Pressable style={[styles.submit, message.trim().length < 20 && { opacity: 0.4 }]} disabled={message.trim().length < 20} onPress={async () => {
          if (!selected) return;
          try {
            await api.appealNotice(selected.id, message.trim());
            setSelected(null);
            setMessage("");
            Alert.alert("Appeal submitted");
          } catch (error) {
            Alert.alert("Appeal", (error as Error).message);
          }
        }}><Text style={styles.submitText}>SUBMIT APPEAL</Text></Pressable>
      </SystemModal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 18, gap: 12 },
  intro: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  empty: { color: colors.muted, textAlign: "center", marginTop: 48 },
  card: { borderWidth: 1, borderColor: colors.danger, backgroundColor: colors.card, padding: 14 },
  kind: { color: colors.danger, fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
  message: { color: colors.text, lineHeight: 19, marginTop: 8 },
  reason: { color: colors.muted, fontSize: 10, marginTop: 5, textTransform: "uppercase" },
  actions: { flexDirection: "row", gap: 8, marginTop: 12 },
  button: { borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 8 },
  buttonText: { color: colors.accentSoft, fontSize: 9, fontWeight: "900" },
  input: { color: colors.text, backgroundColor: colors.card, minHeight: 120, padding: 10, marginTop: 12, textAlignVertical: "top" },
  submit: { backgroundColor: colors.accent, padding: 12, alignItems: "center", marginTop: 12 },
  submitText: { color: colors.accentText, fontWeight: "900" },
});
