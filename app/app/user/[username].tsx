import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState, useSyncExternalStore } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../../src/api";
import { BadgeMedallion } from "../../src/components/BadgeMedallion";
import { ReportModal, type ReportTarget } from "../../src/components/ReportModal";
import { SystemWindow } from "../../src/components/SystemWindow";
import { UserIdentity } from "../../src/components/UserIdentity";
import { getSessionUser, subscribeSession } from "../../src/session";
import { colors } from "../../src/theme";

export default function UserProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const viewer = useSyncExternalStore(subscribeSession, getSessionUser);
  const queryClient = useQueryClient();
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  const profile = useQuery({ queryKey: ["profile", username], queryFn: () => api.userProfile(username) });
  const p = profile.data;

  const refreshSocial = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["profile", username] }),
      queryClient.invalidateQueries({ queryKey: ["feed"] }),
      queryClient.invalidateQueries({ queryKey: ["wall"] }),
    ]);
  };

  const toggleFollow = async () => {
    if (!p) return;
    try {
      if (p.followStatus) await api.unfollow(username);
      else await api.follow(username);
      await refreshSocial();
    } catch (error) {
      Alert.alert("Follow", (error as Error).message);
    }
  };

  const toggleBlock = async () => {
    try {
      const result = await api.toggleBlock(username);
      Alert.alert(result.blocked ? `Blocked @${username}` : `Unblocked @${username}`);
      await refreshSocial();
    } catch (error) {
      Alert.alert("Block", (error as Error).message);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: username }} />
      {profile.isLoading ? <Text style={styles.center}>Loading…</Text> : null}
      {!profile.isLoading && !p ? (
        <Text style={styles.center}>{(profile.error as Error)?.message ?? "Reader not found"}</Text>
      ) : null}
      {p?.unavailable ? (
        <SystemWindow title="Profile unavailable" dim>
          <View style={styles.unavailable}>
            <View style={styles.grayAvatar} />
            <Text style={styles.grayName}>@{p.username}</Text>
            <Text style={styles.center}>
              {p.unavailable === "removed"
                ? "This account is no longer available."
                : "Profiles and content are hidden while either reader has blocked the other."}
            </Text>
            {p.blockedByMe ? (
              <Pressable style={styles.secondaryBtn} onPress={toggleBlock}>
                <Text style={styles.secondaryText}>UNBLOCK</Text>
              </Pressable>
            ) : null}
          </View>
        </SystemWindow>
      ) : p?.identity ? (
        <>
          <View style={styles.header}>
            <UserIdentity identity={p.identity} profile />
            {p.bio ? <Text style={styles.bio}>{p.bio}</Text> : null}
            {p.memberDays != null ? <Text style={styles.member}>MEMBER {p.memberDays} DAYS</Text> : null}
            {p.followerCount != null ? (
              <View style={styles.followCounts}>
                <Pressable onPress={() => router.push({ pathname: "/follows/[username]", params: { username: p.username, direction: "followers" } })}>
                  <Text style={styles.followCount}>{p.followerCount} followers</Text>
                </Pressable>
                <Pressable onPress={() => router.push({ pathname: "/follows/[username]", params: { username: p.username, direction: "following" } })}>
                  <Text style={styles.followCount}>{p.followingCount ?? 0} following</Text>
                </Pressable>
              </View>
            ) : null}
            {!p.isMe && viewer ? (
              <Pressable style={styles.primaryBtn} onPress={toggleFollow}>
                <Text style={styles.primaryText}>
                  {p.followStatus === "pending"
                    ? "REQUESTED"
                    : p.followStatus === "accepted"
                      ? "FOLLOWING"
                      : "FOLLOW"}
                </Text>
              </Pressable>
            ) : null}
          </View>

          {p.private ? (
            <SystemWindow title="Private Reader" dim>
              <Text style={styles.center}>Follow this reader to see their collection and posts.</Text>
            </SystemWindow>
          ) : (
            <>
              {p.stats ? (
                <SystemWindow title="Status" dim>
                  <View style={styles.statsRow}>
                    {([
                      [p.stats.posts, "Posts"],
                      [p.stats.comments, "Comments"],
                      [p.stats.likesReceived, "Likes"],
                      [p.stats.chaptersRead, "Read"],
                    ] as const).map(([value, label]) => (
                      <View key={label} style={styles.stat}>
                        <Text style={styles.statNum}>{value}</Text>
                        <Text style={styles.statLabel}>{label}</Text>
                      </View>
                    ))}
                  </View>
                </SystemWindow>
              ) : null}

              {p.badges.length > 0 ? (
                <SystemWindow title={`Earned Badges · ${p.badges.length}`}>
                  <View style={styles.badgeCase}>
                    {p.badges.map((badge) => (
                      <View key={badge.id} style={styles.badgePedestal}>
                        <BadgeMedallion badgeId={badge.id} fallbackIcon={badge.icon} size={52} glow />
                        <Text style={styles.badgeName} numberOfLines={2}>{badge.name}</Text>
                      </View>
                    ))}
                  </View>
                </SystemWindow>
              ) : null}

              {p.recentPosts.length > 0 ? (
                <SystemWindow title="Recent Posts">
                  {p.recentPosts.map((post) => {
                    const shield = !!viewer && post.isSpoiler && !revealed.has(post.id);
                    return (
                      <View key={post.id} style={styles.post}>
                        {post.series ? <Text style={styles.series}>{post.series.title}</Text> : null}
                        {shield ? (
                          <Pressable onPress={() => setRevealed((old) => new Set(old).add(post.id))}>
                            <Text style={styles.spoiler}>SPOILER SHIELD · TAP TO REVEAL</Text>
                          </Pressable>
                        ) : <Text style={styles.postBody}>{post.body}</Text>}
                        <Text style={styles.meta}>♥ {post.likeCount} · ◇ {post.replyCount}</Text>
                      </View>
                    );
                  })}
                </SystemWindow>
              ) : null}

              {p.favorites.length > 0 ? (
                <SystemWindow title="Favorites">
                  <View style={styles.chips}>{p.favorites.map((item) => (
                    <Pressable
                      key={item.canonicalId}
                      style={styles.chip}
                      onPress={() => router.push({ pathname: "/series/[src]/[id]", params: { src: "", id: "", title: item.title, canonicalOnly: item.canonicalId } })}
                    >
                      <Text style={styles.chipText}>{item.title}</Text>
                    </Pressable>
                  ))}</View>
                </SystemWindow>
              ) : null}
            </>
          )}

          {!p.isMe && viewer ? (
            <View style={styles.safety}>
              <Pressable style={styles.secondaryBtn} onPress={toggleBlock}>
                <Text style={styles.secondaryText}>{p.blockedByMe ? "UNBLOCK" : "BLOCK"}</Text>
              </Pressable>
              <Pressable
                style={styles.secondaryBtn}
                onPress={() => p.id && setReportTarget({ type: "user", id: p.id, username: p.username })}
              >
                <Text style={styles.secondaryText}>REPORT</Text>
              </Pressable>
            </View>
          ) : null}
        </>
      ) : null}
      <ReportModal target={reportTarget} onClose={() => setReportTarget(null)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 18, paddingBottom: 48 },
  center: { color: colors.muted, textAlign: "center", lineHeight: 20 },
  header: { alignItems: "center", gap: 10, paddingTop: 8 },
  bio: { color: colors.text, textAlign: "center", lineHeight: 19, maxWidth: 320 },
  member: { color: colors.muted, fontSize: 9, fontWeight: "800", letterSpacing: 1.5 },
  followCounts: { flexDirection: "row", gap: 18 },
  followCount: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  primaryBtn: { backgroundColor: colors.accent, paddingHorizontal: 34, paddingVertical: 10, borderRadius: 4 },
  primaryText: { color: colors.accentText, fontWeight: "900", fontSize: 11, letterSpacing: 1.3 },
  statsRow: { flexDirection: "row" },
  stat: { flex: 1, alignItems: "center" },
  statNum: { color: colors.text, fontSize: 18, fontWeight: "900" },
  statLabel: { color: colors.muted, fontSize: 10, marginTop: 2 },
  badgeCase: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  badgePedestal: { width: "30%", alignItems: "center", padding: 9, borderWidth: 1, borderColor: "rgba(205,164,94,0.25)", backgroundColor: "rgba(205,164,94,0.05)" },
  badgeName: { color: colors.text, textAlign: "center", fontSize: 9.5, marginTop: 6, fontWeight: "700" },
  post: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  series: { color: colors.accentSoft, fontSize: 10, fontWeight: "800", marginBottom: 5 },
  postBody: { color: colors.text, lineHeight: 19 },
  spoiler: { color: colors.accentSoft, borderWidth: 1, borderStyle: "dashed", borderColor: colors.accent, padding: 12, textAlign: "center", fontSize: 10, fontWeight: "800" },
  meta: { color: colors.muted, fontSize: 10, marginTop: 5 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: { borderWidth: 1, borderColor: colors.border, paddingHorizontal: 8, paddingVertical: 5 },
  chipText: { color: colors.accentSoft, fontSize: 11 },
  safety: { flexDirection: "row", gap: 10 },
  secondaryBtn: { flex: 1, borderWidth: 1, borderColor: colors.border, padding: 10, alignItems: "center" },
  secondaryText: { color: colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  unavailable: { alignItems: "center", gap: 12 },
  grayAvatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: "#3A3D45", opacity: 0.55 },
  grayName: { color: colors.muted, fontWeight: "800" },
});
