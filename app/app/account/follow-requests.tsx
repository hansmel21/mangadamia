import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../../src/api";
import { UserIdentity } from "../../src/components/UserIdentity";
import { colors } from "../../src/theme";

export default function FollowRequestsScreen() {
  const queryClient = useQueryClient();
  const requests = useQuery({ queryKey: ["followRequests"], queryFn: api.followRequests });
  const answer = async (userId: string, action: "accept" | "reject") => {
    await api.answerFollowRequest(userId, action);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["followRequests"] }),
      queryClient.invalidateQueries({ queryKey: ["me"] }),
    ]);
  };
  return (
    <FlatList
      style={styles.screen}
      data={requests.data ?? []}
      keyExtractor={(item) => item.user.id ?? item.user.username}
      ListEmptyComponent={<Text style={styles.empty}>No pending follow requests.</Text>}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <UserIdentity identity={item.user} onPress={() => router.push({ pathname: "/user/[username]", params: { username: item.user.username } })} />
          <View style={styles.actions}>
            <Pressable style={styles.accept} onPress={() => item.user.id && answer(item.user.id, "accept")}><Text style={styles.acceptText}>ACCEPT</Text></Pressable>
            <Pressable style={styles.reject} onPress={() => item.user.id && answer(item.user.id, "reject")}><Text style={styles.rejectText}>×</Text></Pressable>
          </View>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  actions: { flexDirection: "row", alignItems: "center", gap: 7 },
  accept: { backgroundColor: colors.accent, paddingHorizontal: 9, paddingVertical: 7 },
  acceptText: { color: colors.accentText, fontSize: 9, fontWeight: "900" },
  reject: { borderWidth: 1, borderColor: colors.border, width: 30, height: 30, alignItems: "center", justifyContent: "center" },
  rejectText: { color: colors.muted, fontSize: 18 },
  empty: { color: colors.muted, textAlign: "center", marginTop: 48 },
});
