// Shared post composer (new post, or reply). System-styled modal. Optionally
// carries a series/chapter context chip. On success, celebrates badges/levels.
import { useQueryClient } from "@tanstack/react-query";
import { EyeOff } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { api, type PostInfo } from "../api";
import { celebrateBadges } from "../badges";
import { showLevelUp } from "./LevelUp";
import { SystemModal } from "./SystemModal";
import { TermsAcceptance } from "./TermsAcceptance";
import { colors } from "../theme";

export function PostComposer({
  visible,
  onClose,
  context,
  replyTo,
  onPosted,
}: {
  visible: boolean;
  onClose: () => void;
  // Attach a series/chapter to a brand-new post
  context?: { canonicalId: string; title: string; chapterNumber?: number };
  // Or reply to an existing post
  replyTo?: PostInfo;
  onPosted?: (post: PostInfo) => void;
}) {
  const [body, setBody] = useState("");
  const [spoiler, setSpoiler] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const queryClient = useQueryClient();

  const submit = async () => {
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    setError("");
    try {
      const created = await api.createPost(text, {
        canonicalId: replyTo ? undefined : context?.canonicalId,
        chapterNumber: replyTo ? undefined : context?.chapterNumber,
        parentId: replyTo?.id,
        isSpoiler: spoiler,
      });
      celebrateBadges(created.newBadges);
      if (created.levelUp) showLevelUp(created.levelUp);
      setBody("");
      setSpoiler(false);
      queryClient.invalidateQueries({ queryKey: ["feed"] });
      onPosted?.(created);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const title = replyTo ? "Reply" : "New Post";
  const chip = replyTo
    ? `Replying to @${replyTo.username}`
    : context
      ? `${context.title}${context.chapterNumber != null ? ` · Ch. ${context.chapterNumber}` : ""}`
      : null;

  return (
    <SystemModal visible={visible} onClose={onClose} title={title}>
      <TermsAcceptance>
      {chip ? (
        <View style={styles.chip}>
          <Text style={styles.chipText} numberOfLines={1}>
            ◆ {chip}
          </Text>
        </View>
      ) : null}
      <TextInput
        style={styles.input}
        placeholder={replyTo ? "Write a reply…" : "Share a thought…"}
        placeholderTextColor={colors.muted}
        value={body}
        onChangeText={setBody}
        multiline
        autoFocus
        maxLength={1000}
      />
      <Pressable
        style={(s) => [styles.spoilerToggle, { opacity: s.pressed ? 0.6 : 1 }]}
        onPress={() => setSpoiler((v) => !v)}
      >
        <View style={[styles.checkbox, spoiler && styles.checkboxOn]}>
          {spoiler ? <EyeOff color={colors.accentText} size={11} strokeWidth={2.5} /> : null}
        </View>
        <Text style={styles.spoilerText}>Mark as spoiler</Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}>
        <Pressable style={(s) => [styles.btnGhost, { opacity: s.pressed ? 0.6 : 1 }]} onPress={onClose}>
          <Text style={styles.btnGhostText}>CANCEL</Text>
        </Pressable>
        <Pressable
          style={(s) => [styles.btn, (!body.trim() || busy) && { opacity: 0.4 }, s.pressed && { opacity: 0.6 }]}
          disabled={!body.trim() || busy}
          onPress={submit}
        >
          {busy ? (
            <ActivityIndicator color={colors.accentSoft} />
          ) : (
            <Text style={styles.btnText}>POST</Text>
          )}
        </Pressable>
      </View>
      </TermsAcceptance>
    </SystemModal>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "rgba(124,92,255,0.5)",
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 10,
    maxWidth: "100%",
  },
  chipText: { color: colors.accentSoft, fontSize: 11, fontWeight: "700" },
  input: {
    backgroundColor: colors.card,
    color: colors.text,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 90,
    maxHeight: 200,
    fontSize: 15,
    textAlignVertical: "top",
  },
  spoilerToggle: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 3,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  spoilerText: { color: colors.muted, fontSize: 13 },
  error: { color: colors.danger, marginTop: 8, fontSize: 13 },
  actions: { flexDirection: "row", gap: 10, marginTop: 14 },
  btnGhost: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 4,
    paddingVertical: 11,
    alignItems: "center",
  },
  btnGhostText: { color: colors.muted, fontWeight: "800", letterSpacing: 1.6, fontSize: 12 },
  btn: {
    flex: 1,
    backgroundColor: "rgba(124,92,255,0.18)",
    borderWidth: 1.5,
    borderColor: "rgba(124,92,255,0.65)",
    borderRadius: 4,
    paddingVertical: 11,
    alignItems: "center",
  },
  btnText: { color: colors.accentSoft, fontWeight: "800", letterSpacing: 1.6, fontSize: 12 },
});
