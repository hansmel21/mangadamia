// Raiders inside a gate — roster with role chips. Gatekeeper promotes/demotes
// wardens; wardens authorize posters (sealed gates), kick raiders, and answer
// entry requests (hidden gates).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { api, type GateMemberInfo } from "../../../src/api";
import { UserIdentity } from "../../../src/components/UserIdentity";
import { getSessionUser, subscribeSession } from "../../../src/session";
import { colors } from "../../../src/theme";

export default function GateMembersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const gateId = String(id);
  const user = useSyncExternalStore(subscribeSession, getSessionUser);
  const queryClient = useQueryClient();

  const gate = useQuery({
    queryKey: ["gate", gateId],
    queryFn: () => api.gate(gateId),
    staleTime: 15_000,
  });
  const members = useQuery({
    queryKey: ["gateMembers", gateId],
    queryFn: () => api.gateMembers(gateId),
    staleTime: 15_000,
  });
  const canManage = !!gate.data?.canManage;
  const isGatekeeper = gate.data?.myRole === "gatekeeper";
  const sealed = gate.data?.visibility === "restricted";
  const hidden = gate.data?.visibility === "private";

  const requests = useQuery({
    queryKey: ["gateRequests", gateId],
    queryFn: () => api.gateRequests(gateId),
    enabled: canManage && hidden,
    staleTime: 10_000,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["gateMembers", gateId] });
    void queryClient.invalidateQueries({ queryKey: ["gateRequests", gateId] });
    void queryClient.invalidateQueries({ queryKey: ["gate", gateId] });
  };

  const answerRequest = useMutation({
    mutationFn: ({ userId, action }: { userId: string; action: "accept" | "reject" }) =>
      api.answerGateRequest(gateId, userId, action),
    onSuccess: refresh,
  });
  const setRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: "warden" | "member" }) =>
      api.setGateRole(gateId, userId, role),
    onSuccess: refresh,
  });
  const setApproved = useMutation({
    mutationFn: ({ userId, approved }: { userId: string; approved: boolean }) =>
      api.setGateApprovedPoster(gateId, userId, approved),
    onSuccess: refresh,
  });
  const kick = useMutation({
    mutationFn: (userId: string) => api.kickGateMember(gateId, userId),
    onSuccess: refresh,
  });

  const confirmKick = (m: GateMemberInfo) => {
    Alert.alert(`Remove @${m.identity?.username ?? "this raider"}?`, "They can re-enter later.", [
      { text: "Cancel", style: "cancel" },
      { text: "REMOVE", style: "destructive", onPress: () => kick.mutate(m.userId) },
    ]);
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: gate.data ? `⛩ ${gate.data.name}` : "" }} />
      <FlatList
        data={members.data ?? []}
        keyExtractor={(m) => m.userId}
        contentContainerStyle={{ paddingBottom: 60 }}
        ListHeaderComponent={
          <View>
            {canManage && hidden && (requests.data?.length ?? 0) > 0 ? (
              <View style={styles.requestsBox}>
                <Text style={styles.sectionLabel}>ENTRY REQUESTS</Text>
                {(requests.data ?? []).map((r) => (
                  <View key={r.userId} style={styles.requestRow}>
                    <View style={{ flex: 1 }}>
                      {r.identity ? (
                        <UserIdentity identity={r.identity} compact />
                      ) : (
                        <Text style={styles.removedReader}>Removed Reader</Text>
                      )}
                    </View>
                    <Pressable
                      style={styles.acceptKey}
                      onPress={() => answerRequest.mutate({ userId: r.userId, action: "accept" })}
                    >
                      <Text style={styles.acceptKeyText}>ADMIT</Text>
                    </Pressable>
                    <Pressable
                      style={styles.rejectKey}
                      onPress={() => answerRequest.mutate({ userId: r.userId, action: "reject" })}
                    >
                      <Text style={styles.rejectKeyText}>DENY</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}
            <Text style={styles.sectionLabel}>
              RAIDERS · {gate.data?.memberCount ?? members.data?.length ?? 0}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const self = item.userId === user?.id;
          const roleColor =
            item.role === "gatekeeper"
              ? colors.foil
              : item.role === "warden"
                ? colors.accentSoft
                : colors.muted;
          return (
            <View style={styles.memberRow}>
              <View style={{ flex: 1, gap: 3 }}>
                {item.identity ? (
                  <UserIdentity identity={item.identity} />
                ) : (
                  <Text style={styles.removedReader}>Removed Reader</Text>
                )}
                <View style={styles.chipLine}>
                  <Text style={[styles.roleChip, { color: roleColor, borderColor: roleColor + "77" }]}>
                    {item.role.toUpperCase()}
                  </Text>
                  {sealed && item.approvedPoster && item.role === "member" ? (
                    <Text style={styles.authorizedChip}>AUTHORIZED</Text>
                  ) : null}
                </View>
              </View>
              {canManage && !self && item.role !== "gatekeeper" ? (
                <View style={styles.actions}>
                  {isGatekeeper ? (
                    <Pressable
                      style={styles.actionKey}
                      onPress={() =>
                        setRole.mutate({
                          userId: item.userId,
                          role: item.role === "warden" ? "member" : "warden",
                        })
                      }
                    >
                      <Text style={styles.actionKeyText}>
                        {item.role === "warden" ? "DEMOTE" : "MAKE WARDEN"}
                      </Text>
                    </Pressable>
                  ) : null}
                  {sealed && item.role === "member" ? (
                    <Pressable
                      style={styles.actionKey}
                      onPress={() =>
                        setApproved.mutate({ userId: item.userId, approved: !item.approvedPoster })
                      }
                    >
                      <Text style={styles.actionKeyText}>
                        {item.approvedPoster ? "REVOKE" : "AUTHORIZE"}
                      </Text>
                    </Pressable>
                  ) : null}
                  {item.role === "member" || isGatekeeper ? (
                    <Pressable style={styles.actionKey} onPress={() => confirmKick(item)}>
                      <Text style={[styles.actionKeyText, { color: colors.danger }]}>KICK</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        }}
        ListEmptyComponent={
          members.isLoading ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
          ) : (
            <Text style={styles.empty}>No raiders inside.</Text>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  sectionLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.6,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 6,
  },
  requestsBox: {
    marginHorizontal: 12,
    marginTop: 12,
    paddingBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(205,164,94,0.4)",
    borderRadius: 4,
    backgroundColor: "rgba(205,164,94,0.05)",
  },
  requestRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  acceptKey: {
    borderWidth: 1,
    borderColor: "rgba(86,168,123,0.6)",
    borderRadius: 3,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  acceptKeyText: { color: colors.fresh, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  rejectKey: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 3,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  rejectKeyText: { color: colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    backgroundColor: colors.card,
  },
  chipLine: { flexDirection: "row", alignItems: "center", gap: 6, marginLeft: 42 },
  roleChip: {
    fontSize: 7.5,
    fontWeight: "900",
    letterSpacing: 0.8,
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  authorizedChip: {
    color: colors.fresh,
    fontSize: 7.5,
    fontWeight: "900",
    letterSpacing: 0.8,
    borderWidth: 1,
    borderColor: "rgba(86,168,123,0.5)",
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  actions: { gap: 6, alignItems: "flex-end" },
  actionKey: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 3,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  actionKeyText: { color: colors.accentSoft, fontSize: 8.5, fontWeight: "900", letterSpacing: 0.9 },
  removedReader: { color: colors.muted, fontSize: 13 },
  empty: { color: colors.muted, textAlign: "center", marginTop: 50 },
});
