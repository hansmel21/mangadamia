// Guilds hub — your guild (if any), a "found a guild" CTA, and the guild
// leaderboard ranked by level. Tap a guild to open its Hall.
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Plus, Search, Users } from "lucide-react-native";
import { useState, useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { api, type GuildSummary } from "../src/api";
import { GuildEmblem } from "../src/components/GuildCrest";
import { getSessionUser, subscribeSession } from "../src/session";
import { colors, fonts } from "../src/theme";

function openGuild(id: string) {
  router.push({ pathname: "/guild/[id]", params: { id } });
}

export default function GuildsScreen() {
  const user = useSyncExternalStore(subscribeSession, getSessionUser);
  const [q, setQ] = useState("");
  const guilds = useQuery({
    queryKey: ["guilds", "level", q.trim()],
    queryFn: () => api.guilds("level", q.trim() || undefined),
    staleTime: 15_000,
  });
  const mine = useQuery({ queryKey: ["myGuild"], queryFn: api.myGuild, enabled: !!user });
  const myGuildId = mine.data?.guildId ?? null;

  return (
    <View style={styles.screen}>
      <FlatList
        data={guilds.data ?? []}
        keyExtractor={(g) => g.id}
        contentContainerStyle={{ paddingBottom: 100 }}
        ListHeaderComponent={
          <View>
            {user && myGuildId ? (
              <Pressable style={styles.mineBtn} onPress={() => openGuild(myGuildId)}>
                <Text style={styles.mineText}>◆ OPEN YOUR GUILD HALL ▸</Text>
              </Pressable>
            ) : null}
            <View style={styles.searchRow}>
              <Search color={colors.muted} size={16} strokeWidth={2} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search guilds by name or tag"
                placeholderTextColor={colors.muted}
                value={q}
                onChangeText={setQ}
                autoCapitalize="none"
              />
            </View>
            <Text style={styles.sectionLabel}>LEADERBOARD · BY LEVEL</Text>
          </View>
        }
        renderItem={({ item }) => <GuildRow guild={item} />}
        ListEmptyComponent={
          guilds.isLoading ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
          ) : (
            <Text style={styles.empty}>
              No guilds yet.{"\n"}Found the first one and start a community.
            </Text>
          )
        }
      />

      {user && !myGuildId ? (
        <Pressable style={styles.fab} onPress={() => router.push("/guild/create")}>
          <Plus color={colors.accentText} size={22} strokeWidth={2.6} />
          <Text style={styles.fabText}>FOUND A GUILD</Text>
        </Pressable>
      ) : !user ? (
        <View style={styles.signedOut}>
          <Text style={styles.signedOutText}>Sign in from the Account tab to join a guild.</Text>
        </View>
      ) : null}
    </View>
  );
}

function GuildRow({ guild }: { guild: GuildSummary }) {
  const champion = guild.rank === 1;
  const recruiting = guild.joinPolicy === "open" && guild.memberCount < guild.memberCap;
  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        guild.mine && styles.rowMine,
        champion && styles.rowChampion,
        pressed && styles.rowPressed,
      ]}
      onPress={() => openGuild(guild.id)}
    >
      <Text style={[styles.rank, champion && { color: colors.foil }]}>
        {guild.rank != null ? `#${guild.rank}` : ""}
      </Text>
      <GuildEmblem
        emblemKey={guild.emblemKey}
        primaryColor={guild.primaryColor}
        secondaryColor={guild.secondaryColor}
        size={40}
      />
      <View style={styles.rowBody}>
        <View style={styles.rowNameLine}>
          <Text style={styles.rowName} numberOfLines={1}>
            {guild.name}
          </Text>
          <Text style={[styles.rowTag, { color: guild.primaryColor }]}>[{guild.tag}]</Text>
          {guild.atWar ? <Text style={styles.warChip}>AT WAR</Text> : null}
          {recruiting ? <Text style={styles.recruitChip}>RECRUITING</Text> : null}
        </View>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {guild.motto || `${guild.memberCount}/${guild.memberCap} members`}
        </Text>
      </View>
      <View style={styles.rowStats}>
        <Text style={styles.rowLevel}>LV {guild.level}</Text>
        <View style={styles.rowMembers}>
          <Users color={colors.muted} size={11} strokeWidth={2} />
          <Text style={styles.rowMembersText}>{guild.memberCount}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  mineBtn: {
    margin: 16,
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: "rgba(107,94,204,0.6)",
    backgroundColor: "rgba(107,94,204,0.12)",
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
  },
  mineText: { color: colors.accentSoft, fontWeight: "900", fontSize: 11, letterSpacing: 1.4 },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
  },
  searchInput: { flex: 1, color: colors.text, paddingVertical: 10, fontSize: 14 },
  sectionLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.6,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 6,
  },
  warChip: {
    color: colors.danger,
    fontSize: 7.5,
    fontWeight: "900",
    letterSpacing: 0.8,
    borderWidth: 1,
    borderColor: "rgba(206,81,83,0.55)",
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  recruitChip: {
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
  rowChampion: {
    borderWidth: 1.5,
    borderColor: "rgba(205,164,94,0.55)",
    backgroundColor: "rgba(205,164,94,0.05)",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowMine: { borderColor: "rgba(107,94,204,0.5)" },
  rowPressed: { opacity: 0.9 },
  rank: {
    color: colors.foil,
    fontFamily: fonts.display,
    fontSize: 14,
    width: 30,
    textAlign: "center",
  },
  rowBody: { flex: 1, gap: 2 },
  rowNameLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  rowName: { color: colors.text, fontSize: 15, fontWeight: "800", flexShrink: 1 },
  rowTag: { fontSize: 11, fontWeight: "900" },
  rowMeta: { color: colors.muted, fontSize: 12 },
  rowStats: { alignItems: "flex-end", gap: 4 },
  rowLevel: { color: colors.accentSoft, fontSize: 12, fontWeight: "900" },
  rowMembers: { flexDirection: "row", alignItems: "center", gap: 3 },
  rowMembersText: { color: colors.muted, fontSize: 11, fontVariant: ["tabular-nums"] },
  empty: { color: colors.muted, textAlign: "center", marginTop: 50, lineHeight: 22 },
  fab: {
    position: "absolute",
    right: 16,
    bottom: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.accent,
    borderRadius: 26,
    paddingHorizontal: 18,
    paddingVertical: 14,
    shadowColor: colors.accent,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    elevation: 10,
  },
  fabText: { color: colors.accentText, fontWeight: "900", fontSize: 12, letterSpacing: 1 },
  signedOut: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: 14,
  },
  signedOutText: { color: colors.muted, textAlign: "center", fontSize: 13 },
});
