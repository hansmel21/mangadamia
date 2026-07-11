// Shared post card for the Feed and series Walls. Handles:
//  - tappable username → public profile
//  - progress-aware spoiler shield: a post tagged to a chapter you haven't
//    reached (or flagged as a spoiler) is blurred until you tap to reveal
//  - like / reply / delete / report
import { Image } from "expo-image";
import { router } from "expo-router";
import { EyeOff, Flag, Heart, MessageSquare, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { pressFx } from "../anim";
import type { PostInfo } from "../api";
import { getCanonicalProgress } from "../library";
import { colors } from "../theme";
import { BadgeMedallion } from "./BadgeMedallion";

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function openProfile(username: string) {
  router.push({ pathname: "/user/[username]", params: { username } });
}

function openSeries(series: NonNullable<PostInfo["series"]>) {
  router.push({
    pathname: "/series/[src]/[id]",
    params: { src: "", id: "", title: series.title, canonicalOnly: series.canonicalId },
  });
}

// Should this post be shielded from the current reader?
// Yes if explicitly flagged, or it's tied to a chapter beyond their progress.
function isShielded(post: PostInfo): boolean {
  if (post.mine) return false;
  if (post.isSpoiler) return true;
  if (post.series && post.chapterNumber != null) {
    const prog = getCanonicalProgress(post.series.canonicalId);
    const reached = prog?.chapterNumber ?? -1;
    if (post.chapterNumber > reached) return true;
  }
  return false;
}

export function PostCard({
  post,
  isReply,
  onLike,
  onReply,
  onDelete,
  onReport,
}: {
  post: PostInfo;
  isReply?: boolean;
  onLike: (p: PostInfo) => void;
  onReply?: (p: PostInfo) => void;
  onDelete: (p: PostInfo) => void;
  onReport: (p: PostInfo) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const shielded = isShielded(post) && !revealed;

  return (
    <View style={[styles.card, isReply && styles.replyCard]}>
      <View style={styles.headerRow}>
        <Pressable
          style={(s) => [styles.userTap, pressFx(s)]}
          onPress={() => openProfile(post.username)}
        >
          {(post.badgeId || post.badgeIcon) && (
            <BadgeMedallion badgeId={post.badgeId} fallbackIcon={post.badgeIcon} size={22} glow />
          )}
          <Text style={styles.username}>{post.username}</Text>
          <Text style={styles.level}>LV {post.level}</Text>
        </Pressable>
        <Text style={styles.time}>· {timeAgo(post.createdAt)}</Text>
        <View style={styles.headerActions}>
          {post.mine ? (
            <Pressable hitSlop={8} onPress={() => onDelete(post)}>
              <Trash2 color={colors.danger} size={15} strokeWidth={1.8} />
            </Pressable>
          ) : (
            <Pressable hitSlop={8} onPress={() => onReport(post)}>
              <Flag color={colors.muted} size={14} strokeWidth={1.8} />
            </Pressable>
          )}
        </View>
      </View>

      {post.series ? (
        <Pressable
          style={(s) => [styles.ctxChip, pressFx(s)]}
          onPress={() => post.series && openSeries(post.series)}
        >
          {post.series.coverUrl ? (
            <Image source={{ uri: post.series.coverUrl }} style={styles.ctxCover} contentFit="cover" />
          ) : null}
          <Text style={styles.ctxText} numberOfLines={1}>
            {post.series.title}
            {post.chapterNumber != null ? ` · Ch. ${post.chapterNumber}` : ""}
          </Text>
        </Pressable>
      ) : null}

      {shielded ? (
        <Pressable style={styles.shield} onPress={() => setRevealed(true)}>
          <EyeOff color={colors.accentSoft} size={18} strokeWidth={1.8} />
          <Text style={styles.shieldTitle}>SPOILER SHIELD</Text>
          <Text style={styles.shieldSub}>
            {post.isSpoiler
              ? "Marked as a spoiler."
              : `Discusses Ch. ${post.chapterNumber} — past where you've read.`}
          </Text>
          <Text style={styles.shieldReveal}>TAP TO REVEAL</Text>
        </Pressable>
      ) : (
        <Text style={styles.body}>{post.body}</Text>
      )}

      <View style={styles.actionsRow}>
        <Pressable style={(s) => [styles.action, pressFx(s)]} onPress={() => onLike(post)}>
          <Heart
            color={post.likedByMe ? colors.danger : colors.muted}
            fill={post.likedByMe ? colors.danger : "transparent"}
            size={15}
            strokeWidth={1.8}
          />
          {post.likeCount > 0 ? <Text style={styles.actionText}>{post.likeCount}</Text> : null}
        </Pressable>
        {!isReply && onReply ? (
          <Pressable style={(s) => [styles.action, pressFx(s)]} onPress={() => onReply(post)}>
            <MessageSquare color={colors.muted} size={15} strokeWidth={1.8} />
            {post.replies.length > 0 ? (
              <Text style={styles.actionText}>{post.replies.length}</Text>
            ) : null}
          </Pressable>
        ) : null}
      </View>

      {post.replies.map((r) => (
        <PostCard
          key={r.id}
          post={r}
          isReply
          onLike={onLike}
          onDelete={onDelete}
          onReport={onReport}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  replyCard: {
    borderBottomWidth: 0,
    borderLeftWidth: 2,
    borderLeftColor: "rgba(124,92,255,0.3)",
    marginLeft: 8,
    marginTop: 10,
    paddingVertical: 6,
    paddingRight: 0,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  userTap: { flexDirection: "row", alignItems: "center", gap: 6 },
  username: { color: colors.text, fontWeight: "700", fontSize: 14 },
  level: { color: colors.foil, fontWeight: "800", fontSize: 10.5, letterSpacing: 0.5 },
  time: { color: colors.muted, fontSize: 12 },
  headerActions: { marginLeft: "auto" },
  ctxChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: "rgba(124,92,255,0.4)",
    borderRadius: 4,
    paddingRight: 10,
    marginTop: 8,
    alignSelf: "flex-start",
    maxWidth: "100%",
    overflow: "hidden",
  },
  ctxCover: { width: 26, height: 34 },
  ctxText: { color: colors.accentSoft, fontSize: 11.5, fontWeight: "700", flexShrink: 1 },
  body: { color: colors.text, fontSize: 14.5, lineHeight: 20, marginTop: 8 },
  shield: {
    marginTop: 8,
    borderWidth: 1.5,
    borderColor: "rgba(124,92,255,0.5)",
    borderStyle: "dashed",
    borderRadius: 6,
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(124,92,255,0.06)",
  },
  shieldTitle: {
    color: colors.accentSoft,
    fontWeight: "800",
    fontSize: 11,
    letterSpacing: 2,
    marginTop: 4,
  },
  shieldSub: { color: colors.muted, fontSize: 12, textAlign: "center" },
  shieldReveal: {
    color: colors.foil,
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 1.6,
    marginTop: 4,
  },
  actionsRow: { flexDirection: "row", gap: 20, marginTop: 10 },
  action: { flexDirection: "row", alignItems: "center", gap: 5 },
  actionText: { color: colors.muted, fontSize: 12, fontVariant: ["tabular-nums"] },
});
