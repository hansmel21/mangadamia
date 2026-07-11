import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { api, type AdminReport } from "../../src/api";
import { SystemModal } from "../../src/components/SystemModal";
import { getSessionUser } from "../../src/session";
import { colors } from "../../src/theme";
import { UserIdentity } from "../../src/components/UserIdentity";

type Action = "dismiss" | "correct_spoiler" | "remove_content" | "warn" | "suspend_7d" | "suspend_30d" | "ban";

export default function ModerationScreen() {
  const user = getSessionUser();
  const queryClient = useQueryClient();
  const reports = useQuery({ queryKey: ["admin", "reports"], queryFn: () => api.adminReports() });
  const [selected, setSelected] = useState<AdminReport | null>(null);
  const [reason, setReason] = useState("");
  const [reasonCode, setReasonCode] = useState("other");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!user?.capabilities?.includes("view_reports")) {
    return <Text style={styles.denied}>Moderator access required.</Text>;
  }

  const act = async (action: Action) => {
    if (!selected || reason.trim().length < 3) return;
    setBusy(true);
    setError("");
    try {
      await api.moderateReport(selected.id, action, reasonCode, reason.trim(), action === "correct_spoiler" ? true : undefined);
      setSelected(null);
      setReason("");
      await queryClient.invalidateQueries({ queryKey: ["admin", "reports"] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (reports.isLoading) return <ActivityIndicator color={colors.accent} style={{ marginTop: 48 }} />;

  return (
    <View style={styles.screen}>
      <FlatList
        data={reports.data?.reports ?? []}
        keyExtractor={(report) => report.id}
        refreshing={reports.isRefetching}
        onRefresh={() => reports.refetch()}
        ListEmptyComponent={<Text style={styles.denied}>No pending reports.</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.report} onPress={() => setSelected(item)}>
            <Text style={styles.type}>{item.targetType.toUpperCase()} · {item.reason}</Text>
            {item.reporter.identity ? <UserIdentity identity={item.reporter.identity} compact onPress={() => router.push({ pathname: "/user/[username]", params: { username: item.reporter.identity!.username } })} /> : null}
            <Text style={styles.meta}>Reported this content</Text>
            {item.targetIdentity ? <UserIdentity identity={item.targetIdentity} compact onPress={() => router.push({ pathname: "/user/[username]", params: { username: item.targetIdentity!.username } })} /> : null}
            <Text style={styles.body} numberOfLines={4}>
              {item.target?.body ?? item.target?.username ?? "Target is no longer available"}
            </Text>
          </Pressable>
        )}
      />

      <SystemModal visible={!!selected} onClose={() => setSelected(null)} title="Moderation action">
        <Text style={styles.body}>{selected?.target?.body ?? selected?.target?.username}</Text>
        <TextInput
          style={styles.input}
          value={reason}
          onChangeText={setReason}
          placeholder="Required moderator reason"
          placeholderTextColor={colors.muted}
          multiline
          maxLength={500}
        />
        <View style={styles.reasonCodes}>
          {(["spoiler", "spam", "harassment", "hate", "sexual_content", "child_safety", "copyright", "impersonation", "fraud", "other"] as const).map((code) => (
            <Pressable key={code} style={[styles.reasonCode, reasonCode === code && styles.reasonCodeActive]} onPress={() => setReasonCode(code)}>
              <Text style={styles.reasonCodeText}>{code.replaceAll("_", " ")}</Text>
            </Pressable>
          ))}
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.actions}>
          {(["dismiss", "correct_spoiler", "remove_content", "warn", "suspend_7d", "suspend_30d", "ban"] as Action[]).filter((action) => {
            const required: Record<Action, string> = { dismiss: "view_reports", correct_spoiler: "correct_spoilers", remove_content: "remove_content", warn: "warn_users", suspend_7d: "suspend_users", suspend_30d: "suspend_users", ban: "ban_users" };
            return reports.data?.capabilities.includes(required[action]);
          }).map(
            (action) => (
              <Pressable
                key={action}
                style={[styles.action, (busy || reason.trim().length < 3) && { opacity: 0.4 }]}
                disabled={busy || reason.trim().length < 3}
                onPress={() => act(action)}
              >
                <Text style={styles.actionText}>{action.replaceAll("_", " ").toUpperCase()}</Text>
              </Pressable>
            ),
          )}
        </View>
      </SystemModal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  denied: { color: colors.muted, textAlign: "center", marginTop: 48 },
  report: { padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  type: { color: colors.accentSoft, fontWeight: "800", fontSize: 12 },
  meta: { color: colors.muted, fontSize: 11, marginTop: 3 },
  body: { color: colors.text, lineHeight: 19, marginTop: 8 },
  input: { backgroundColor: colors.card, color: colors.text, minHeight: 80, padding: 10, marginTop: 14 },
  error: { color: colors.danger, marginTop: 8 },
  actions: { gap: 8, marginTop: 12 },
  action: { borderWidth: 1, borderColor: colors.border, padding: 10, alignItems: "center" },
  actionText: { color: colors.accentSoft, fontSize: 11, fontWeight: "800" },
  reasonCodes: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 10 },
  reasonCode: { borderWidth: 1, borderColor: colors.border, paddingHorizontal: 6, paddingVertical: 4 },
  reasonCodeActive: { borderColor: colors.accent, backgroundColor: "rgba(124,92,255,0.12)" },
  reasonCodeText: { color: colors.muted, fontSize: 9, textTransform: "uppercase" },
});
