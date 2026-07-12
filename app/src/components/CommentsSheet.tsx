// Bottom-sheet modal with the comment thread for one chapter (keyed by the
// series' canonical id + chapter number, so it's shared across servers).
// Single-level threading: replies render indented under top-level comments.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState, useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { api, type CommentInfo } from "../api";
import { celebrateBadges } from "../badges";
import { getSessionUser, subscribeSession } from "../session";
import { colors } from "../theme";
import { UserIdentity } from "./UserIdentity";
import { showExpGain } from "./ExpToast";
import { showLevelUp } from "./LevelUp";
import { TermsAcceptance } from "./TermsAcceptance";
import { EyeOff, Flag } from "lucide-react-native";
import { LinkedText } from "./LinkedText";
import { ReportModal, type ReportTarget } from "./ReportModal";
import { showQuestCompletions } from "./QuestToast";

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

// Apply fn to the comment with the given id, wherever it is in the tree
function patchTree(
  list: CommentInfo[],
  id: string,
  fn: (c: CommentInfo) => CommentInfo,
): CommentInfo[] {
  return list.map((c) =>
    c.id === id
      ? fn(c)
      : c.replies?.length
        ? { ...c, replies: patchTree(c.replies, id, fn) }
        : c,
  );
}

function removeFromTree(list: CommentInfo[], id: string): CommentInfo[] {
  return list
    .filter((c) => c.id !== id)
    .map((c) => (c.replies?.length ? { ...c, replies: removeFromTree(c.replies, id) } : c));
}

export function CommentsSheet({
  visible,
  onClose,
  canonicalId,
  chapterNumber,
  chapterLabel,
}: {
  visible: boolean;
  onClose: () => void;
  canonicalId: string;
  chapterNumber: number;
  chapterLabel: string;
}) {
  const user = useSyncExternalStore(subscribeSession, getSessionUser);
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<CommentInfo | null>(null);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [spoiler, setSpoiler] = useState(false);
  const [revealedThreads, setRevealedThreads] = useState<Set<string>>(() => new Set());

  const queryKey = ["comments", canonicalId, chapterNumber];
  const comments = useQuery({
    queryKey,
    queryFn: () => api.comments(canonicalId, chapterNumber),
    enabled: visible,
    staleTime: 30_000,
  });

  const post = async () => {
    const body = draft.trim();
    if (!body) return;
    setPosting(true);
    setError("");
    try {
      const created = await api.postComment(
        canonicalId,
        chapterNumber,
        body,
        replyTo?.id,
        spoiler,
      );
      setDraft("");
      setReplyTo(null);
      setSpoiler(false);
      showExpGain(created.xpAwarded);
      celebrateBadges(created.newBadges);
      showQuestCompletions(created.completedQuests);
      if (created.levelUp) showLevelUp(created.levelUp);
      queryClient.setQueryData<CommentInfo[]>(queryKey, (old) => {
        if (!created.parentId) return [created, ...(old ?? [])];
        return patchTree(old ?? [], created.parentId, (parent) => ({
          ...parent,
          replies: [...(parent.replies ?? []), created],
        }));
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPosting(false);
    }
  };

  const toggleLike = async (comment: CommentInfo) => {
    try {
      const res = await api.toggleLike(comment.id);
      queryClient.setQueryData<CommentInfo[]>(queryKey, (old) =>
        patchTree(old ?? [], comment.id, (c) => ({
          ...c,
          likedByMe: res.liked,
          likeCount: res.likeCount,
        })),
      );
    } catch {
      // leave as-is; next refetch corrects it
    }
  };

  const remove = async (comment: CommentInfo) => {
    try {
      await api.deleteComment(comment.id);
      queryClient.setQueryData<CommentInfo[]>(queryKey, (old) =>
        removeFromTree(old ?? [], comment.id),
      );
    } catch {
      // ignored — comment stays until refetch
    }
  };

  const CommentRow = ({
    item,
    isReply,
    threadId = item.id,
  }: {
    item: CommentInfo;
    isReply?: boolean;
    threadId?: string;
  }) => (
    <View style={[styles.comment, isReply && styles.reply]}>
      <View style={styles.commentTop}>
        <View style={styles.userRow}>
          {item.author ? (
            <UserIdentity
              identity={item.author}
              compact
              onPress={() =>
                item.author?.id &&
                router.push({ pathname: "/user/[username]", params: { username: item.author.username } })
              }
            />
          ) : null}
          <Text style={styles.commentWhen}>{timeAgo(item.createdAt)}</Text>
        </View>
        {item.mine ? (
          <Pressable onPress={() => remove(item)} hitSlop={8}>
            <Text style={styles.delete}>Delete</Text>
          </Pressable>
        ) : user ? (
          <Pressable
            onPress={() =>
              setReportTarget({ type: "comment", id: item.id, username: item.username })
            }
            hitSlop={8}
            accessibilityLabel={`Report comment by ${item.username}`}
          >
            <Flag color={colors.muted} size={14} strokeWidth={1.8} />
          </Pressable>
        ) : null}
      </View>
      {user && !item.mine && item.isSpoiler && !revealedThreads.has(threadId) ? (
        <Pressable
          style={styles.spoilerShield}
          onPress={() => setRevealedThreads((old) => new Set(old).add(threadId))}
        >
          <EyeOff color={colors.accentSoft} size={15} />
          <Text style={styles.spoilerText}>SPOILER · TAP TO REVEAL THREAD</Text>
        </Pressable>
      ) : (
        <LinkedText style={styles.commentBody}>{item.body}</LinkedText>
      )}
      <View style={styles.actionsRow}>
        <Pressable
          style={styles.likeBtn}
          onPress={() => (user ? toggleLike(item) : undefined)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={item.likedByMe ? "Unlike comment" : "Like comment"}
        >
          <Text style={[styles.likeText, item.likedByMe && styles.likedText]}>
            {item.likedByMe ? "♥" : "♡"}
          </Text>
          {item.likeCount > 0 ? (
            <Text style={[styles.likeCount, item.likedByMe && styles.likedText]}>
              {item.likeCount}
            </Text>
          ) : null}
        </Pressable>
        {user && (
          <Pressable style={styles.replyBtnWrap} onPress={() => setReplyTo(item)} hitSlop={12}>
            <Text style={styles.replyBtn}>Reply</Text>
          </Pressable>
        )}
      </View>
      {(item.replies ?? []).map((r) => (
        <CommentRow key={r.id} item={r} isReply threadId={threadId} />
      ))}
    </View>
  );

  return (
    <>
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.sheetWrap}
        pointerEvents="box-none"
      >
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Comments · {chapterLabel}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>

          {comments.isLoading ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: 30 }} />
          ) : (
            <FlatList
              data={comments.data ?? []}
              keyExtractor={(c) => c.id}
              style={styles.list}
              ListEmptyComponent={
                <Text style={styles.empty}>No comments yet — be the first.</Text>
              }
              renderItem={({ item }) => <CommentRow item={item} />}
            />
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {user ? (
            <TermsAcceptance><View>
              {replyTo && (
                <View style={styles.replyingBar}>
                  <Text style={styles.replyingText} numberOfLines={1}>
                    Replying to @{replyTo.username}
                  </Text>
                  <Pressable onPress={() => setReplyTo(null)} hitSlop={10}>
                    <Text style={styles.close}>✕</Text>
                  </Pressable>
                </View>
              )}
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  placeholder={replyTo ? `Reply to @${replyTo.username}…` : "Add a comment…"}
                  placeholderTextColor={colors.muted}
                  value={draft}
                  onChangeText={setDraft}
                  multiline
                  maxLength={1000}
                />
                <Pressable
                  style={[styles.sendBtn, (!draft.trim() || posting) && { opacity: 0.4 }]}
                  disabled={!draft.trim() || posting}
                  onPress={post}
                >
                  <Text style={styles.sendText}>{posting ? "…" : "Send"}</Text>
                </Pressable>
              </View>
              <Pressable style={styles.spoilerToggle} onPress={() => setSpoiler((value) => !value)}>
                <View style={[styles.spoilerCheck, spoiler && styles.spoilerCheckOn]}>
                  {spoiler ? <EyeOff color={colors.accentText} size={11} /> : null}
                </View>
                <Text style={styles.spoilerToggleText}>Mark as spoiler</Text>
              </Pressable>
            </View></TermsAcceptance>
          ) : (
            <Text style={styles.signInHint}>
              Sign in from the Account tab to join the conversation.
            </Text>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
    <ReportModal target={reportTarget} onClose={() => setReportTarget(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  sheetWrap: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: "72%",
    minHeight: "45%",
    paddingBottom: 24,
    borderTopWidth: 1.5,
    borderColor: "rgba(124,92,255,0.55)",
    shadowColor: colors.accent,
    shadowOpacity: 0.4,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: -2 },
    elevation: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    color: colors.accentSoft,
    fontWeight: "800",
    fontSize: 12,
    letterSpacing: 2.5,
    textTransform: "uppercase",
  },
  close: { color: colors.muted, fontSize: 18 },
  list: { paddingHorizontal: 16 },
  empty: { color: colors.muted, textAlign: "center", marginTop: 28 },
  comment: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  reply: {
    borderBottomWidth: 0,
    borderLeftWidth: 2,
    borderLeftColor: colors.border,
    paddingLeft: 12,
    marginLeft: 4,
    marginTop: 8,
    paddingVertical: 0,
  },
  commentTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  userRow: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  commentWhen: { color: colors.muted, fontWeight: "400", fontSize: 12 },
  delete: { color: colors.danger, fontSize: 12 },
  commentBody: { color: colors.text, marginTop: 5, lineHeight: 20, fontSize: 14.5 },
  actionsRow: { flexDirection: "row", gap: 8, marginTop: 8, alignItems: "center" },
  likeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  likeText: { color: colors.muted, fontSize: 16, lineHeight: 18 },
  likeCount: { color: colors.muted, fontSize: 12.5, fontWeight: "700", fontVariant: ["tabular-nums"] },
  likedText: { color: colors.danger },
  replyBtnWrap: { paddingVertical: 5, paddingHorizontal: 10 },
  replyBtn: { color: colors.accentSoft, fontSize: 13, fontWeight: "700" },
  error: { color: colors.danger, paddingHorizontal: 16, paddingTop: 6 },
  replyingBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  replyingText: { color: colors.muted, fontSize: 13, flex: 1 },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  input: {
    flex: 1,
    backgroundColor: colors.card,
    color: colors.text,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    maxHeight: 90,
    fontSize: 14,
  },
  sendBtn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sendText: { color: colors.accentText, fontWeight: "700" },
  signInHint: { color: colors.muted, textAlign: "center", paddingTop: 12, paddingHorizontal: 24 },
  spoilerShield: {
    marginTop: 6,
    padding: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.accent,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  spoilerText: { color: colors.accentSoft, fontSize: 9.5, fontWeight: "800", letterSpacing: 1 },
  spoilerToggle: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingTop: 8 },
  spoilerCheck: { width: 18, height: 18, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  spoilerCheckOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  spoilerToggleText: { color: colors.muted, fontSize: 12 },
});
