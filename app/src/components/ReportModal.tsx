import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text } from "react-native";
import { api } from "../api";
import { colors } from "../theme";
import { SystemModal } from "./SystemModal";

const REASONS = [
  "Spam or manipulation",
  "Harassment or hate",
  "Sexual or exploitative content",
  "Child safety concern",
  "Copyright infringement",
  "Spoiler not marked",
  "Other policy violation",
];

export interface ReportTarget {
  type: "post" | "comment" | "user";
  id: string;
  username?: string;
}

export function ReportModal({
  target,
  onClose,
}: {
  target: ReportTarget | null;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();

  const submit = async (reason: string, block: boolean) => {
    if (!target || busy) return;
    setBusy(true);
    try {
      await api.report(target.type, target.id, reason);
      if (block && target.username) await api.toggleBlock(target.username);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["feed"] }),
        queryClient.invalidateQueries({ queryKey: ["comments"] }),
      ]);
      onClose();
      Alert.alert(
        "Thanks",
        block && target.username
          ? `Reported and @${target.username} blocked.`
          : "Report submitted for moderation review.",
      );
    } catch (e) {
      Alert.alert("Error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SystemModal visible={!!target} onClose={onClose} title={`Report ${target?.type ?? "content"}`}>
      <Text style={styles.sub}>Why are you reporting this?</Text>
      {REASONS.map((reason) => (
        <Pressable
          key={reason}
          style={(state) => [styles.reason, { opacity: state.pressed || busy ? 0.6 : 1 }]}
          disabled={busy}
          onPress={() => submit(reason, false)}
        >
          <Text style={styles.reasonText}>{reason}</Text>
        </Pressable>
      ))}
      {target?.username ? (
        <Pressable
          style={(state) => [styles.block, { opacity: state.pressed || busy ? 0.6 : 1 }]}
          disabled={busy}
          onPress={() => submit("Reported and blocked", true)}
        >
          <Text style={styles.blockText}>REPORT & BLOCK @{target.username}</Text>
        </Pressable>
      ) : null}
      <Pressable style={styles.cancel} onPress={onClose}>
        <Text style={styles.cancelText}>CANCEL</Text>
      </Pressable>
    </SystemModal>
  );
}

const styles = StyleSheet.create({
  sub: { color: colors.muted, fontSize: 13, marginBottom: 10 },
  reason: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 7,
  },
  reasonText: { color: colors.text, fontSize: 13.5, fontWeight: "600" },
  block: {
    borderWidth: 1.5,
    borderColor: "rgba(229,72,77,0.5)",
    borderRadius: 4,
    paddingVertical: 11,
    alignItems: "center",
    marginTop: 4,
  },
  blockText: { color: colors.danger, fontSize: 11.5, fontWeight: "800", letterSpacing: 1.2 },
  cancel: { alignItems: "center", paddingVertical: 12, marginTop: 4 },
  cancelText: { color: colors.muted, fontSize: 12, fontWeight: "800", letterSpacing: 1.6 },
});
