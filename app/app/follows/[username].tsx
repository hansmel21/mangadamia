import { useQuery } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { FlatList, StyleSheet, Text } from "react-native";
import { api } from "../../src/api";
import { UserIdentity } from "../../src/components/UserIdentity";
import { colors } from "../../src/theme";

export default function FollowListScreen() {
  const { username, direction = "followers" } = useLocalSearchParams<{ username: string; direction?: "followers" | "following" }>();
  const list = useQuery({ queryKey: ["follows", username, direction], queryFn: () => api.followList(username, direction) });
  return (
    <>
      <Stack.Screen options={{ title: `${username} · ${direction}` }} />
      <FlatList
        style={styles.screen}
        data={list.data ?? []}
        keyExtractor={(item) => item.id ?? item.username}
        ListEmptyComponent={<Text style={styles.empty}>{list.isError ? (list.error as Error).message : `No ${direction}.`}</Text>}
        renderItem={({ item }) => (
          <UserIdentity
            identity={item}
            onPress={() => item.id && router.push({ pathname: "/user/[username]", params: { username: item.username } })}
          />
        )}
        contentContainerStyle={styles.content}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 16 },
  empty: { color: colors.muted, textAlign: "center", marginTop: 48 },
});
