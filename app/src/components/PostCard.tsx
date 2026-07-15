// Shared "System Record" card for the Dungeons feed, series Walls, and post
// threads. Two modes:
//   • preview (feed/wall): the whole card is tappable and opens the full
//     conversation; replies are summarised, not expanded inline.
//   • thread (post detail): replies render nested beneath the post.
// Renders the record type, the author's hunter rank, review ratings, the
// reaction bar, spoiler shields, and reply / delete / report.
import { router } from "expo-router";
import { Image as ExpoImage } from "expo-image";
import { EyeOff, Flag, MessageSquare, Repeat2, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { pressFx } from "../anim";
import { resolveMediaUrl, type PostInfo, type ReactionType } from "../api";
import { POST_KINDS } from "../ranks";
import { colors } from "../theme";
import { GateChip } from "./GateChip";
import { LinkedText } from "./LinkedText";
import { PollView } from "./PollView";
import { QuotedPost } from "./QuotedPost";
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

// Everything beneath a node, for the "▾ N MORE REPLIES" collapse label.
function countDescendants(p: PostInfo): number {
  return p.replies.reduce((n, r) => n + 1 + countDescendants(r), 0);
}

export function PostCard({
  post,
  isReply,
  onReact,
  onVote,
  onReply,
  onQuote,
  onDelete,
  onReport,
  viewerSignedIn = false,
  threadRevealed,
  onRevealThread,
  preview = false,
  onOpen,
  depth = 0,
  hideReplies = false,
  root = false,
  showGateChip = true,
}: {
  post: PostInfo;
  isReply?: boolean;
  onReact: (p: PostInfo, type: ReactionType) => void;
  onVote?: (p: PostInfo, optionId: string) => void;
  onReply?: (p: PostInfo) => void;
  onQuote?: (p: PostInfo) => void;
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
  // Thread root: full System window with 4 corner brackets + glow.
  root?: boolean;
  // ⛩ chip linking to the post's gate; the gate's own feed hides it.
  showGateChip?: boolean;
}) {
  const [localRevealed, setLocalRevealed] = useState(false);
  // Replies deeper than one indent level collapse behind "▾ N MORE REPLIES".
  const [deepExpanded, setDeepExpanded] = useState(false);
  const revealed = threadRevealed ?? localRevealed;
  const revealThread = onRevealThread ?? (() => setLocalRevealed(true));
  const shielded = viewerSignedIn && !post.mine && post.isSpoiler && !revealed;
  const threadCount = post.commentCount ?? post.replies.length;
  const directReplies = post.replies.length;
  const canReply = !preview && !!onReply;
  const official = !!post.official;
  const kindMeta = POST_KINDS[post.kind] ?? POST_KINDS.record;

  const seriesChips =
    post.seriesTags.length > 0
      ? post.seriesTags
      : post.series
        ? [{ ...post.series, chapterNumber: post.chapterNumber }]
        : [];

  const inner = (
    <>
      {!isReply ? (
        <>
          {/* Kind notch breaking the top border + corner ticks — the mini
              System-window treatment; the thread root gets all four. */}
          <View
            style={[styles.notch, { borderColor: official ? colors.data : kindMeta.color }]}
            pointerEvents="none"
          >
            <Text style={[styles.notchText, { color: official ? colors.data : kindMeta.color }]}>
              {official ? "⚙ THE SYSTEM" : `${kindMeta.icon} ${kindMeta.label}`}
            </Text>
          </View>
          <View style={[styles.tick, styles.tickTL, official && styles.tickOfficial]} pointerEvents="none" />
          <View style={[styles.tick, styles.tickTR, official && styles.tickOfficial]} pointerEvents="none" />
          {root || official ? (
            <>
              <View style={[styles.tick, styles.tickBL, official && styles.tickOfficial]} pointerEvents="none" />
              <View style={[styles.tick, styles.tickBR, official && styles.tickOfficial]} pointerEvents="none" />
            </>
          ) : null}
        </>
      ) : null}

      <View style={[styles.headerRow, !isReply && styles.headerRowNotched]}>
        {official ? (
          <Text style={styles.systemWordmark}>⟐ THE SYSTEM</Text>
        ) : post.author ? (
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

      {post.gate && showGateChip && !isReply ? (
        <View style={styles.gateChipRow}>
          <GateChip gate={post.gate} />
        </View>
      ) : null}

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
        isReply ? (
          // Shielded replies collapse to a one-line dashed chip.
          <Pressable style={styles.shieldChip} onPress={revealThread}>
            <EyeOff color={colors.accentSoft} size={13} strokeWidth={1.8} />
            <Text style={styles.shieldChipText}>SPOILER SHIELD — TAP TO REVEAL</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.shield} onPress={revealThread}>
            <EyeOff color={colors.accentSoft} size={18} strokeWidth={1.8} />
            <Text style={styles.shieldTitle}>SPOILER SHIELD</Text>
            <Text style={styles.shieldSub}>
              Marked as a spoiler. Revealing shows this entire thread.
            </Text>
            <Text style={styles.shieldReveal}>TAP TO REVEAL</Text>
          </Pressable>
        )
      ) : (
        <>
          {post.title && !isReply ? (
            <Text style={styles.postTitle} numberOfLines={preview ? 2 : undefined}>
              {post.title}
            </Text>
          ) : null}
          <LinkedText style={styles.body} numberOfLines={preview && !isReply ? 8 : undefined}>
            {post.body}
          </LinkedText>
        </>
      )}

      {!shielded && post.gifUrl ? (
        <ExpoImage
          source={{ uri: post.gifUrl }}
          style={styles.gif}
          contentFit="cover"
          transition={140}
          accessibilityLabel="Attached GIF"
        />
      ) : null}

      {!shielded && post.imageUrls.length > 0 ? (
        post.imageUrls.length === 1 ? (
          <ExpoImage
            source={{ uri: resolveMediaUrl(post.imageUrls[0]) }}
            style={styles.photoSingle}
            contentFit="cover"
            transition={140}
            accessibilityLabel="Attached photo"
          />
        ) : (
          <View style={styles.photoGrid}>
            {post.imageUrls.map((url) => (
              <ExpoImage
                key={url}
                source={{ uri: resolveMediaUrl(url) }}
                style={styles.photoCell}
                contentFit="cover"
                transition={140}
                accessibilityLabel="Attached photo"
              />
            ))}
          </View>
        )
      ) : null}

      {post.kind === "poll" && post.poll ? (
        <PollView
          poll={post.poll}
          onVote={(optionId) => onVote?.(post, optionId)}
          disabled={!viewerSignedIn}
        />
      ) : null}

      {post.quotedPost ? <QuotedPost quoted={post.quotedPost} /> : null}

      {/* One quiet footer row: react · reply · quote · open — no stacking. */}
      <View style={styles.footerRow}>
        <ReactionBar
          reactions={post.reactions}
          myReaction={post.myReaction}
          onReact={(type) => onReact(post, type)}
          disabled={!viewerSignedIn}
        />
        {preview && !isReply ? (
          <>
            <Pressable
              style={(s) => [styles.actionPill, pressFx(s)]}
              onPress={() => onOpen?.(post)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Open thread"
            >
              <MessageSquare color={colors.muted} size={14} strokeWidth={1.9} />
              {threadCount > 0 ? <Text style={styles.actionText}>{threadCount}</Text> : null}
            </Pressable>
            {onQuote ? (
              <Pressable
                style={(s) => [styles.actionPill, pressFx(s)]}
                onPress={() => onQuote(post)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Quote"
              >
                <Repeat2 color={colors.muted} size={14} strokeWidth={1.9} />
              </Pressable>
            ) : null}
            <Text style={styles.openHint}>OPEN ▸</Text>
          </>
        ) : canReply ? (
          <>
            <Pressable
              style={(s) => [styles.actionPill, pressFx(s)]}
              onPress={() => onReply?.(post)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Reply"
            >
              <MessageSquare color={colors.muted} size={14} strokeWidth={1.9} />
              <Text style={styles.actionText}>
                {directReplies > 0 ? `${directReplies} · Reply` : "Reply"}
              </Text>
            </Pressable>
            {onQuote ? (
              <Pressable
                style={(s) => [styles.actionPill, pressFx(s)]}
                onPress={() => onQuote(post)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Quote"
              >
                <Repeat2 color={colors.muted} size={14} strokeWidth={1.9} />
              </Pressable>
            ) : null}
          </>
        ) : null}
      </View>

      {!preview && !hideReplies ? (
        depth >= 1 && post.replies.length > 0 && !deepExpanded ? (
          // Deeper levels collapse behind ▾ N MORE REPLIES (design: only one
          // visible indent level; the rest expand flat on demand).
          <Pressable
            style={styles.moreReplies}
            onPress={() => setDeepExpanded(true)}
            accessibilityRole="button"
            accessibilityLabel="Show more replies"
          >
            <Text style={styles.moreRepliesText}>
              ▾ {countDescendants(post)} MORE {countDescendants(post) === 1 ? "REPLY" : "REPLIES"}
            </Text>
          </Pressable>
        ) : (
          post.replies.map((r) => (
            <PostCard
              key={r.id}
              post={r}
              isReply
              depth={depth + 1}
              onReact={onReact}
              onVote={onVote}
              onReply={onReply}
              onDelete={onDelete}
              onReport={onReport}
              viewerSignedIn={viewerSignedIn}
              threadRevealed={revealed}
              onRevealThread={revealThread}
            />
          ))
        )
      ) : null}
    </>
  );

  if (isReply) {
    // One visible indent level with the purple rail; anything deeper renders
    // flat (those replies arrive via the ▾ MORE REPLIES expander).
    return (
      <View
        style={[
          styles.replyBase,
          depth > 0 && styles.replyIndent,
          depth > 1 && styles.replyIndentFlat,
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
          official && styles.cardOfficial,
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
    <View style={[styles.card, root && styles.cardRoot, official && styles.cardOfficial]}>
      {inner}
    </View>
  );
}

const styles = StyleSheet.create({
  gateChipRow: { flexDirection: "row", marginBottom: 7 },
  card: {
    position: "relative",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.accentLine,
    borderRadius: 4,
    paddingHorizontal: 15,
    paddingVertical: 14,
    marginHorizontal: 16,
    marginTop: 16,
  },
  cardPressed: { borderColor: "rgba(107,94,204,0.7)", opacity: 0.96 },
  cardOfficial: {
    borderWidth: 1.5,
    borderColor: "rgba(111,174,201,0.55)",
    shadowColor: colors.data,
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
  tickOfficial: { borderColor: colors.data },
  systemWordmark: {
    color: colors.data,
    fontSize: 12.5,
    fontWeight: "900",
    letterSpacing: 2,
  },
  cardRoot: {
    borderWidth: 1.5,
    borderColor: "rgba(107,94,204,0.55)",
    shadowColor: colors.accent,
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  replyBase: { marginTop: 12 },
  replyIndent: {
    borderLeftWidth: 2,
    borderLeftColor: "rgba(107,94,204,0.3)",
    paddingLeft: 12,
  },
  replyIndentFlat: { paddingLeft: 6, borderLeftColor: "rgba(107,94,204,0.15)" },
  notch: {
    position: "absolute",
    top: -9,
    left: 14,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderRadius: 2,
    paddingHorizontal: 8,
    paddingVertical: 1,
    zIndex: 2,
  },
  notchText: { fontSize: 9, fontWeight: "900", letterSpacing: 1.6 },
  tick: { position: "absolute", width: 9, height: 9 },
  tickTL: { top: -1.5, left: -1.5, borderTopWidth: 2, borderLeftWidth: 2, borderColor: colors.accentBright },
  tickTR: { top: -1.5, right: -1.5, borderTopWidth: 2, borderRightWidth: 2, borderColor: colors.accentBright },
  tickBL: { bottom: -1.5, left: -1.5, borderBottomWidth: 2, borderLeftWidth: 2, borderColor: colors.accentBright },
  tickBR: { bottom: -1.5, right: -1.5, borderBottomWidth: 2, borderRightWidth: 2, borderColor: colors.accentBright },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  headerRowNotched: { marginTop: 4 },
  time: { color: colors.muted, fontSize: 12 },
  headerActions: { marginLeft: "auto", paddingLeft: 8 },
  reviewRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  reviewLabel: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  postTitle: {
    color: colors.text,
    fontSize: 15.5,
    fontWeight: "800",
    lineHeight: 20,
    marginTop: 10,
  },
  body: { color: colors.text, fontSize: 13.5, lineHeight: 19.5, marginTop: 10 },
  gif: {
    width: "100%",
    aspectRatio: 16 / 9,
    marginTop: 11,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  photoSingle: {
    width: "100%",
    aspectRatio: 4 / 3,
    marginTop: 11,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 11 },
  photoCell: {
    width: "48.9%",
    aspectRatio: 1,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  shield: {
    marginTop: 10,
    borderWidth: 1.5,
    borderColor: "rgba(107,94,204,0.5)",
    borderStyle: "dashed",
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(107,94,204,0.06)",
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
  shieldChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "rgba(107,94,204,0.5)",
    borderStyle: "dashed",
    borderRadius: 3,
    paddingVertical: 7,
    paddingHorizontal: 10,
    backgroundColor: "rgba(107,94,204,0.06)",
    alignSelf: "flex-start",
  },
  shieldChipText: {
    color: colors.accentSoft,
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  moreReplies: {
    marginTop: 10,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 3,
    paddingVertical: 6,
    paddingHorizontal: 11,
  },
  moreRepliesText: {
    color: colors.accentBright,
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  footerRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 11 },
  actionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  actionText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  openHint: {
    marginLeft: "auto",
    color: colors.data,
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
});
