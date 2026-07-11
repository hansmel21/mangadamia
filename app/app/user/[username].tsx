// Public reader profile: Title, level, badge collection, stats, recent posts.
// Reachable by tapping any username in the feed or comments.
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { pressFx } from "../../src/anim";
import { api } from "../../src/api";
import { BadgeMedallion } from "../../src/components/BadgeMedallion";
import { SystemWindow } from "../../src/components/SystemWindow";
import { colors, fonts } from "../../src/theme";
import { ReportModal, type ReportTarget } from "../../src/components/ReportModal";

function formatNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export default function UserProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const [blocking, setBlocking] = useState<boolean | null>(null);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);

  const profile = useQuery({
    queryKey: ["profile", username],
    queryFn: () => api.userProfile(username),
  });

  const p = profile.data;
  const blocked = blocking ?? p?.blockedByMe ?? false;

  const toggleBlock = async () => {
    try {
      const res = await api.toggleBlock(username);
      setBlocking(res.blocked);
      Alert.alert(res.blocked ? `Blocked @${username}` : `Unblocked @${username}`);
    } catch (e) {
      Alert.alert("Error", (e as Error).message);
    }
  };

  return (
    <ScrollView style={styles.screen}>
      <Stack.Screen options={{ title: username }} />

      {profile.isLoading ? (
        <Text style={styles.loading}>Loading…</Text>
      ) : !p ? (
        <Text style={styles.loading}>{(profile.error as Error)?.message ?? "Not found"}</Text>
      ) : (
        <>
          <View style={styles.header}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{p.username[0]?.toUpperCase() ?? "?"}</Text>
            </View>
            <Text style={styles.username}>{p.username}</Text>
            {p.title ? (
              <View style={styles.titleRow}>
                <BadgeMedallion badgeId={p.title.id} fallbackIcon={p.title.icon} size={18} glow />
                <Text style={styles.titleText}>{p.title.name}</Text>
              </View>
            ) : null}
            <Text style={styles.levelLine}>
              LV. {p.level} · Member {p.memberDays}d
            </Text>
          </View>

          <SystemWindow title="Status" dim style={styles.status}>
            <View style={styles.statsRow}>
              {(
                [
                  [p.stats.posts, "Posts"],
                  [p.stats.comments, "Comments"],
                  [p.stats.likesReceived, "Likes"],
                  [p.stats.chaptersRead, "Read"],
                ] as const
              ).map(([n, label]) => (
                <View key={label} style={styles.stat}>
                  <Text style={styles.statNum}>{n}</Text>
                  <Text style={styles.statLabel}>{label}</Text>
                </View>
              ))}
            </View>
          </SystemWindow>

          {p.badges.length > 0 ? (
            <>
              <Text style={styles.section}>◆ Badges ({p.badges.length})</Text>
              <View style={styles.badgeRow}>
                {p.badges.map((b) => (
                  <View key={b.id} style={styles.badgeCell}>
                    <BadgeMedallion badgeId={b.id} fallbackIcon={b.icon} size={44} glow />
                  </View>
                ))}
              </View>
            </>
          ) : null}

          <Text style={styles.section}>◆ Recent Posts</Text>
          {p.recentPosts.length === 0 ? (
            <Text style={styles.empty}>No posts yet.</Text>
          ) : (
            p.recentPosts.map((post) => (
              <View key={post.id} style={styles.postRow}>
                {post.series ? (
                  <Pressable
                    style={(s) => [styles.ctxChip, pressFx(s)]}
                    onPress={() =>
                      post.series &&
                      router.push({
                        pathname: "/series/[src]/[id]",
                        params: {
                          src: "",
                          id: "",
                          title: post.series.title,
                          canonicalOnly: post.series.canonicalId,
                        },
                      })
                    }
                  >
                    <Text style={styles.ctxText} numberOfLines={1}>
                      {post.series.title}
                      {post.chapterNumber != null ? ` · Ch. ${formatNum(post.chapterNumber)}` : ""}
                    </Text>
                  </Pressable>
                ) : null}
                <Text style={styles.postBody}>
                  {post.isSpoiler ? "⚠ [spoiler] " : ""}
                  {post.body}
                </Text>
                <Text style={styles.postMeta}>
                  ♥ {post.likeCount} · 💬 {post.replyCount}
                </Text>
              </View>
            ))
          )}

          {!p.isMe ? (
            <View style={styles.safetyActions}>
              <Pressable style={(s) => [styles.blockBtn, pressFx(s)]} onPress={toggleBlock}>
                <Text style={styles.blockText}>{blocked ? "UNBLOCK" : "BLOCK"} @{p.username}</Text>
              </Pressable>
              <Pressable
                style={(s) => [styles.reportBtn, pressFx(s)]}
                onPress={() =>
                  setReportTarget({ type: "user", id: p.id, username: p.username })
                }
              >
                <Text style={styles.reportText}>REPORT @{p.username}</Text>
              </Pressable>
            </View>
          ) : null}
          <ReportModal target={reportTarget} onClose={() => setReportTarget(null)} />
          <View style={{ height: 40 }} />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  loading: { color: colors.muted, textAlign: "center", marginTop: 48 },
  header: { alignItems: "center", paddingTop: 24, gap: 6 },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  avatarText: { color: colors.accentText, fontSize: 32, fontWeight: "800" },
  username: { color: colors.text, fontSize: 22, fontFamily: fonts.display },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  titleText: { color: colors.foil, fontWeight: "700", fontSize: 13 },
  levelLine: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  status: { marginHorizontal: 20, marginTop: 18 },
  statsRow: { flexDirection: "row", justifyContent: "space-between" },
  stat: { alignItems: "center", flex: 1 },
  statNum: { color: colors.text, fontSize: 18, fontFamily: fonts.display },
  statLabel: { color: colors.muted, fontSize: 10.5, marginTop: 2, letterSpacing: 0.5 },
  section: {
    color: colors.accentSoft,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 2,
    textTransform: "uppercase",
    paddingHorizontal: 20,
    marginTop: 24,
    marginBottom: 10,
  },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 14, paddingHorizontal: 20 },
  badgeCell: {},
  empty: { color: colors.muted, paddingHorizontal: 20 },
  postRow: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  ctxChip: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "rgba(124,92,255,0.4)",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 6,
    maxWidth: "100%",
  },
  ctxText: { color: colors.accentSoft, fontSize: 11, fontWeight: "700" },
  postBody: { color: colors.text, fontSize: 14, lineHeight: 19 },
  postMeta: { color: colors.muted, fontSize: 11, marginTop: 5, fontVariant: ["tabular-nums"] },
  blockBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: "rgba(229,72,77,0.5)",
    borderRadius: 4,
    paddingVertical: 12,
    alignItems: "center",
  },
  blockText: { color: colors.danger, fontSize: 12, fontWeight: "800", letterSpacing: 1.4 },
  safetyActions: { flexDirection: "row", gap: 10, marginHorizontal: 20, marginTop: 28 },
  reportBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 4,
    paddingVertical: 12,
    alignItems: "center",
  },
  reportText: { color: colors.muted, fontSize: 12, fontWeight: "800", letterSpacing: 1.2 },
});
