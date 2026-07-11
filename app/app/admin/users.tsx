import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { api, type AdminUser, type AuthResponse } from "../../src/api";
import { SystemModal } from "../../src/components/SystemModal";
import { UserIdentity } from "../../src/components/UserIdentity";
import { getSessionUser } from "../../src/session";
import { colors } from "../../src/theme";

const roles: AuthResponse["user"]["role"][] = [
  "user",
  "community_moderator",
  "moderator",
  "senior_moderator",
  "admin",
  "owner",
];

export default function UserAdministrationScreen() {
  const session = getSessionUser();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [role, setRole] = useState<AuthResponse["user"]["role"]>("user");
  const [password, setPassword] = useState("");
  const users = useQuery({ queryKey: ["adminUsers", query], queryFn: () => api.adminUsers(query), staleTime: 10_000 });
  const titleCatalog = useQuery({ queryKey: ["adminTitles"], queryFn: api.adminTitles });

  if (!session?.capabilities?.includes("manage_rewards")) {
    return <Text style={styles.empty}>Administrator access required.</Text>;
  }

  const choose = (user: AdminUser) => {
    setSelected(user);
    setRole(user.role);
    setPassword("");
  };

  return (
    <View style={styles.screen}>
      <TextInput style={styles.search} value={query} onChangeText={setQuery} placeholder="Search username or email" placeholderTextColor={colors.muted} autoCapitalize="none" />
      <FlatList
        data={users.data ?? []}
        keyExtractor={(user) => user.id}
        refreshing={users.isRefetching}
        onRefresh={() => users.refetch()}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => choose(item)}>
            {item.identity ? <UserIdentity identity={item.identity} compact /> : <Text style={styles.name}>@{item.username}</Text>}
            <View style={styles.meta}>
              <Text style={styles.role}>{item.role.replaceAll("_", " ").toUpperCase()}</Text>
              <Text style={styles.status}>{item.status.toUpperCase()}</Text>
            </View>
          </Pressable>
        )}
      />
      <SystemModal visible={!!selected} onClose={() => setSelected(null)} title="User administration">
        <Text style={styles.name}>@{selected?.username}</Text>
        <Text style={styles.email}>{selected?.email}</Text>
        <Text style={styles.note}>Titles and staff markers are presentation only. Role capabilities control authority.</Text>
        <Text style={styles.sectionLabel}>TITLES</Text>
        <View style={styles.roles}>
          {(titleCatalog.data ?? []).map((title) => {
            const owned = !!selected?.titles.some((item) => item.titleId === title.id);
            return (
              <Pressable key={title.id} style={[styles.roleChoice, owned && styles.roleChoiceActive]} onPress={async () => {
                if (!selected) return;
                if (owned) await api.revokeTitle(selected.id, title.id);
                else await api.grantTitle(selected.id, title.id);
                await queryClient.invalidateQueries({ queryKey: ["adminUsers"] });
                const refreshed = await api.adminUsers(query);
                setSelected(refreshed.find((user) => user.id === selected.id) ?? null);
              }}>
                <Text style={styles.roleChoiceText}>{owned ? "✓ " : "+ "}{title.name}</Text>
              </Pressable>
            );
          })}
        </View>
        {session.capabilities.includes("manage_roles") ? (
          <>
            <View style={styles.roles}>
              {roles.map((item) => (
                <Pressable key={item} style={[styles.roleChoice, role === item && styles.roleChoiceActive]} onPress={() => setRole(item)}>
                  <Text style={styles.roleChoiceText}>{item.replaceAll("_", " ")}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput style={styles.password} value={password} onChangeText={setPassword} secureTextEntry placeholder="Owner password required" placeholderTextColor={colors.muted} />
            <Pressable style={[styles.save, !password && { opacity: 0.4 }]} disabled={!password} onPress={async () => {
              if (!selected) return;
              try {
                await api.changeUserRole(selected.id, role, password);
                setSelected(null);
                await queryClient.invalidateQueries({ queryKey: ["adminUsers"] });
              } catch (error) {
                Alert.alert("Role change", (error as Error).message);
              }
            }}><Text style={styles.saveText}>CHANGE ROLE</Text></Pressable>
          </>
        ) : null}
        <Pressable style={styles.secondary} onPress={async () => {
          if (!selected) return;
          await api.grantUsernameChange(selected.id);
          Alert.alert("Granted", "One additional username change was granted.");
          setSelected(null);
          await queryClient.invalidateQueries({ queryKey: ["adminUsers"] });
        }}><Text style={styles.secondaryText}>GRANT USERNAME CHANGE</Text></Pressable>
      </SystemModal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  search: { margin: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, color: colors.text, padding: 11 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  meta: { alignItems: "flex-end", gap: 3 },
  role: { color: colors.accentSoft, fontSize: 8.5, fontWeight: "900" },
  status: { color: colors.muted, fontSize: 8 },
  empty: { color: colors.muted, textAlign: "center", marginTop: 48 },
  name: { color: colors.text, fontSize: 16, fontWeight: "900" },
  email: { color: colors.muted, fontSize: 11, marginTop: 3 },
  note: { color: colors.muted, lineHeight: 17, fontSize: 11, marginTop: 10 },
  sectionLabel: { color: colors.accentSoft, fontSize: 9, fontWeight: "900", letterSpacing: 1.3, marginTop: 12 },
  roles: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 },
  roleChoice: { borderWidth: 1, borderColor: colors.border, paddingHorizontal: 7, paddingVertical: 5 },
  roleChoiceActive: { borderColor: colors.accent, backgroundColor: "rgba(124,92,255,0.14)" },
  roleChoiceText: { color: colors.text, fontSize: 9, textTransform: "uppercase" },
  password: { color: colors.text, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, padding: 10, marginTop: 12 },
  save: { backgroundColor: colors.accent, padding: 11, alignItems: "center", marginTop: 8 },
  saveText: { color: colors.accentText, fontWeight: "900", fontSize: 10 },
  secondary: { borderWidth: 1, borderColor: colors.border, padding: 10, alignItems: "center", marginTop: 10 },
  secondaryText: { color: colors.accentSoft, fontWeight: "900", fontSize: 9 },
});
