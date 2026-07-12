// Shared "System Record" card for the Dungeons feed, series Walls, and post
// threads. Two modes:
//   • preview (feed/wall): the whole card is tappable and opens the full
//     conversation; replies are summarised, not expanded inline.
//   • thread (post detail): replies render nested beneath the post.
// Renders the record type, the author's hunter rank, review ratings, the
// reaction bar, spoiler shields, and reply / delete / report.
import { router } from "expo-router";
import { EyeOff, Flag, MessageSquare, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { pressFx } from "../anim";
import type { PostInfo, ReactionType } from "../api";
import { POST_KINDS } from "../ranks";
import { colors } from "../theme";
import { ReactionBar } from "./ReactionBar";
import { ReviewRating } from "./ReviewRating";
import { SeriesEmbed } from "./SeriesEmbed";
import { UserIdentity } from "./UserIdentity";

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

export function PostCard({
  post,
  isReply,
  onReact,
  onReply,
  onDelete,
  onReport,
  viewerSignedIn = false,
  threadRevealed,
  onRevealThread,
  preview = false,
  onOpen,
  depth = 0,
  hideReplies = false,
}: {
  post: PostInfo;
  isReply?: boolean;
  onReact: (p: PostInfo, type: ReactionType) => void;
  onReply?: (p: PostInfo) => void;
  onDelete: (p: PostInfo) => void;
  onReport: (p: PostInfo) => void;
  viewerSignedIn?: boolean;
  threadRevealed?: boolean;
  onRevealThread?: () => void;
  // Feed/wall list item: the whole card opens the thread instead of expanding.
  preview?: boolean;
  onOpen?: (p: PostInfo) => void;
  // Nesting level in a thread; caps how far replies keep indenting.
  depth?: number;
  // The post detail renders top-level comments separately, so the root post
  // suppresses its own nested replies.
  hideReplies?: boolean;
}) {
  const [localRevealed, setLocalRevealed] = useState(false);
  const revealed = threadRevealed ?? localRevealed;
  const revealThread = onRevealThread ?? (() => setLocalRevealed(true));
  const shielded = viewerSignedIn && !post.mine && post.isSpoiler && !revealed;
  const threadCount = post.commentCount ?? post.replies.length;
  const directReplies = post.replies.length;
  const canReply = !preview && !!onReply;
  const kindMeta = POST_KINDS[post.kind] ?? POST_KINDS.record;

  const seriesChips =
    post.seriesTags.length > 0
      ? post.seriesTags
      : post.series
        ? [{ ...post.series, chapterNumber: post.chapterNumber }]
        : [];

  const inner = (
    <>
      {!isReply && post.kind !== "record" ? (
        <View style={styles.banner}>
          <Text style={[styles.bannerText, { color: kindMeta.color }]}>
            {kindMeta.icon} {kindMeta.label}
          </Text>
        </View>
      ) : null}

      <View style={styles.headerRow}>
        {post.author ? (
          <UserIdentity
            identity={post.author}
            compact
            onPress={() => post.author?.id && openProfile(post.author.username)}
          />
        ) : null}
        <Text style={styles.time}>· {timeAgo(post.createdAt)}</Text>
        <View style={styles.headerActions}>
          {post.mine ? (
            <Pressable hitSlop={10} onPress={() => onDelete(post)}>
              <Trash2 color={colors.danger} size={16} strokeWidth={1.8} />
            </Pressable>
          ) : (
            <Pressable hitSlop={10} onPress={() => onReport(post)}>
              <Flag color={colors.muted} size={15} strokeWidth={1.8} />
            </Pressable>
          )}
        </View>
      </View>

      {seriesChips.map((series) => (
        <SeriesEmbed
          key={series.canonicalId}
          canonicalId={series.canonicalId}
          title={series.title}
          coverUrl={series.coverUrl}
          chapterNumber={series.chapterNumber}
        />
      ))}

      {post.kind === "review" && post.rating ? (
        <View style={styles.reviewRow}>
          <ReviewRating value={post.rating} size={16} />
          <Text style={styles.reviewLabel}>rated this series</Text>
        </View>
      ) : null}

      {shielded ? (
        <Pressable style={styles.shield} onPress={revealThread}>
          <EyeOff color={colors.accentSoft} size={18} strokeWidth={1.8} />
          <Text style={styles.shieldTitle}>SPOILER SHIELD</Text>
          <Text style={styles.shieldSub}>
            Marked as a spoiler. Revealing shows this entire thread.
          </Text>
          <Text style={styles.shieldReveal}>TAP TO REVEAL</Text>
        </Pressable>
      ) : (
        <Text style={styles.body} numberOfLines={preview && !isReply ? 8 : undefined}>
          {post.body}
        </Text>
      )}

      <View style={styles.reactionRow}>
        <ReactionBar
          reactions={post.reactions}
          myReaction={post.myReaction}
          onReact={(type) => onReact(post, type)}
          disabled={!viewerSignedIn}
        />
      </View>

      {preview && !isReply ? (
        <View style={styles.replyRow}>
          <Pressable
            style={(s) => [styles.actionPill, pressFx(s)]}
            onPress={() => onOpen?.(post)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Open thread"
          >
            <MessageSquare color={colors.muted} size={16} strokeWidth={1.9} />
            <Text style={styles.actionText}>{threadCount > 0 ? threadCount : "Reply"}</Text>
          </Pressable>
          <Text style={styles.openHint}>
            {threadCount > 0
              ? `${threadCount} ${threadCount === 1 ? "comment" : "comments"} ›`
              : "Comment ›"}
          </Text>
        </View>
      ) : canReply ? (
        <View style={styles.replyRow}>
          <Pressable
            style={(s) => [styles.actionPill, pressFx(s)]}
            onPress={() => onReply?.(post)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Reply"
          >
            <MessageSquare color={colors.muted} size={16} strokeWidth={1.9} />
            <Text style={styles.actionText}>
              {directReplies > 0 ? `${directReplies} · Reply` : "Reply"}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {!preview && !hideReplies
        ? post.replies.map((r) => (
            <PostCard
              key={r.id}
              post={r}
              isReply
              depth={depth + 1}
              onReact={onReact}
              onReply={onReply}
              onDelete={onDelete}
              onReport={onReport}
              viewerSignedIn={viewerSignedIn}
              threadRevealed={revealed}
              onRevealThread={revealThread}
            />
          ))
        : null}
    </>
  );

  if (isReply) {
    // Nested replies indent with a left rail; a top-level comment (depth 0,
    // rendered on its own by the thread screen) stays flush. Deep replies stop
    // stepping right so the thread stays readable.
    return (
      <View
        style={[
          styles.replyBase,
          depth > 0 && styles.replyIndent,
          depth > 5 && styles.replyIndentFlat,
        ]}
      >
        {inner}
      </View>
    );
  }

  if (preview) {
    return (
      <Pressable
        onPress={() => onOpen?.(post)}
        style={({ pressed }) => [
          styles.card,
          { borderLeftWidth: 3, borderLeftColor: kindMeta.color },
          pressed && styles.cardPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Open post thread"
      >
        {inner}
      </Pressable>
    );
  }

  return (
    <View style={[styles.card, { borderLeftWidth: 3, borderLeftColor: kindMeta.color }]}>{inner}</View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 15,
    paddingVertical: 13,
    marginHorizontal: 12,
    marginTop: 10,
  },
  cardPressed: { borderColor: "rgba(124,92,255,0.5)", opacity: 0.95 },
  replyBase: { marginTop: 12 },
  replyIndent: {
    borderLeftWidth: 2,
    borderLeftColor: "rgba(124,92,255,0.3)",
    paddingLeft: 12,
  },
  replyIndentFlat: { paddingLeft: 6, borderLeftColor: "rgba(124,92,255,0.15)" },
  banner: { flexDirection: "row", alignItems: "center", marginBottom: 9 },
  bannerText: { fontSize: 10.5, fontWeight: "900", letterSpacing: 1.8 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  time: { color: colors.muted, fontSize: 12 },
  headerActions: { marginLeft: "auto", paddingLeft: 8 },
  reviewRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  reviewLabel: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  body: { color: colors.text, fontSize: 15, lineHeight: 21, marginTop: 10 },
  shield: {
    marginTop: 10,
    borderWidth: 1.5,
    borderColor: "rgba(124,92,255,0.5)",
    borderStyle: "dashed",
    borderRadius: 8,
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
  reactionRow: { marginTop: 12 },
  replyRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  actionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionText: {
    color: colors.muted,
    fontSize: 12.5,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  openHint: {
    marginLeft: "auto",
    color: colors.accentSoft,
    fontSize: 11.5,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
});
