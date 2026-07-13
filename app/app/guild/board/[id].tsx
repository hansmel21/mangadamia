// GUILD BOARD — the members-only wall. Lightweight chatter rows (pinned notes
// float to the top), an inline composer bar, and officer pin controls. Tapping
// a note opens its thread (the thread screen enforces membership server-side).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { ArrowLeft, Pin, Send } from "lucide-react-native";
import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../../src/api";
import { HunterAvatar } from "../../../src/components/HunterAvatar";
import { ScreenTitle } from "../../../src/components/SystemUI";
import { colors } from "../../../src/theme";

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export default function GuildBoardScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const guild = useQuery({ queryKey: ["guild", id], queryFn: () => api.guild(id), enabled: !!id });
  const board = useQuery({
    queryKey: ["guildBoard", id, 1],
    queryFn: () => api.guildBoard(id, 1),
    enabled: !!id,
  });
  const canPin = guild.data?.myRole === "guildmaster" || guild.data?.myRole === "officer";

  const publish = async () => {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      await api.createGuildPost(id, body);
      setDraft("");
      await queryClient.invalidateQueries({ queryKey: ["guildBoard", id] });
    } catch {
      /* board write failed — keep the draft so nothing is lost */
    } finally {
      setBusy(false);
    }
  };

  const togglePin = async (postId: string) => {
    try {
      await api.pinGuildPost(postId);
      await queryClient.invalidateQueries({ queryKey: ["guildBoard", id] });
    } catch {
      /* officers only; ignore */
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { paddingTop: insets.top + 8 }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable hitSlop={10} onPress={() => router.back()} accessibilityLabel="Back">
          <ArrowLeft color={colors.text} size={22} strokeWidth={2} />
        </Pressable>
        <ScreenTitle tone="danger" size={16}>
          {guild.data ? `${guild.data.tag} · BOARD` : "BOARD"}
        </ScreenTitle>
      </View>

      {board.isLoading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 48 }} />
      ) : board.isError ? (
        <Text style={styles.empty}>
          The board is members-only.{"\n"}Join this guild to read it.
        </Text>
      ) : (
        <FlatList
          data={board.data ?? []}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingBottom: 16 }}
          refreshing={board.isRefetching}
          onRefresh={() => board.refetch()}
          ListEmptyComponent={
            <Text style={styles.empty}>The board is quiet.{"\n"}Leave the first note.</Text>
          }
          renderItem={({ item: p }) => (
            <Pressable
              style={({ pressed }) => [
                styles.row,
                p.pinned && styles.rowPinned,
                pressed && { borderColor: colors.accentLine },
              ]}
              onPress={() => router.push({ pathname: "/post/[id]", params: { id: p.id } })}
            >
              {p.author ? <HunterAvatar identity={p.author} size={30} showRank={false} /> : null}
              <View style={styles.rowBody}>
                <View style={styles.rowHead}>
                  <Text style={styles.user} numberOfLines={1}>
                    {p.username}
                  </Text>
                  {p.authorRole === "guildmaster" ? (
                    <Text style={styles.roleGm}>GUILDMASTER</Text>
                  ) : p.authorRole === "officer" ? (
                    <Text style={styles.roleOfficer}>OFFICER</Text>
                  ) : null}
                  <Text style={styles.time}>{timeAgo(p.createdAt)}</Text>
                  {canPin ? (
                    <Pressable hitSlop={8} onPress={() => togglePin(p.id)} accessibilityLabel="Pin">
                      <Pin
                        color={p.pinned ? colors.foil : colors.muted}
                        size={13}
                        strokeWidth={2}
                        fill={p.pinned ? colors.foil : "none"}
                      />
                    </Pressable>
                  ) : p.pinned ? (
                    <Pin color={colors.foil} size={13} strokeWidth={2} fill={colors.foil} />
                  ) : null}
                </View>
                <Text style={styles.body}>{p.isSpoiler ? "⚠ Spoiler — open to reveal" : p.body}</Text>
                {p.commentCount ? (
                  <Text style={styles.replies}>
                    {p.commentCount} {p.commentCount === 1 ? "reply" : "replies"} ▸
                  </Text>
                ) : null}
              </View>
            </Pressable>
          )}
        />
      )}

      {/* inline composer */}
      {guild.data?.myRole ? (
        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 10) + 4 }]}>
          <TextInput
            style={styles.input}
            placeholder="Post to the board…"
            placeholderTextColor={colors.muted}
            value={draft}
            onChangeText={setDraft}
            maxLength={1000}
            multiline
          />
          <Pressable
            style={({ pressed }) => [
              styles.sendKey,
              (!draft.trim() || busy) && { opacity: 0.4 },
              pressed && { transform: [{ scale: 0.94 }] },
            ]}
            disabled={!draft.trim() || busy}
            onPress={publish}
            accessibilityRole="button"
            accessibilityLabel="Post to board"
          >
            {busy ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Send color="#fff" size={16} strokeWidth={2} />
            )}
          </Pressable>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  empty: { color: colors.muted, textAlign: "center", marginTop: 48, lineHeight: 22 },
  row: {
    flexDirection: "row",
    gap: 10,
    marginHorizontal: 16,
    marginTop: 10,
    padding: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 3,
  },
  rowPinned: { borderColor: "rgba(205,164,94,0.45)" },
  rowBody: { flex: 1 },
  rowHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  user: { color: colors.text, fontSize: 13, fontWeight: "800", flexShrink: 1 },
  roleGm: { color: colors.foil, fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  roleOfficer: { color: colors.accentBright, fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  time: { color: colors.muted, fontSize: 10, marginLeft: "auto", marginRight: 6 },
  body: { color: colors.mutedStrong, fontSize: 13, lineHeight: 18, marginTop: 4 },
  replies: { color: colors.data, fontSize: 9, fontWeight: "900", letterSpacing: 1, marginTop: 7 },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 9,
    backgroundColor: colors.panel,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  input: {
    flex: 1,
    color: colors.text,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: "rgba(107,94,204,0.4)",
    borderRadius: 3,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    maxHeight: 110,
  },
  sendKey: {
    width: 38,
    height: 38,
    borderRadius: 3,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.accent,
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
});
