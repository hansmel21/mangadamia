// Shared post composer (new post, or reply). System-styled modal. Optionally
// carries a series/chapter context chip. On success, celebrates badges/levels.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { EyeOff } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { api, type PostInfo, type UnifiedCard } from "../api";
import { celebrateBadges } from "../badges";
import { showExpGain } from "./ExpToast";
import { showLevelUp } from "./LevelUp";
import { showQuestCompletions } from "./QuestToast";
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
  const [seriesQuery, setSeriesQuery] = useState("");
  const [selectedSeries, setSelectedSeries] = useState<UnifiedCard[]>([]);
  const queryClient = useQueryClient();
  const seriesResults = useQuery({
    queryKey: ["composerSeries", seriesQuery],
    queryFn: () => api.searchAll(seriesQuery.trim(), 1),
    enabled: visible && !replyTo && !context && seriesQuery.trim().length >= 2,
    staleTime: 60_000,
  });

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
        seriesTags:
          !replyTo && !context
            ? selectedSeries
                .filter((series) => !!series.canonicalId)
                .map((series) => ({ canonicalId: series.canonicalId! }))
            : undefined,
      });
      showExpGain(created.xpAwarded);
      celebrateBadges(created.newBadges);
      showQuestCompletions(created.completedQuests);
      if (created.levelUp) showLevelUp(created.levelUp);
      setBody("");
      setSpoiler(false);
      setSelectedSeries([]);
      setSeriesQuery("");
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
      {!replyTo && !context ? (
        <View style={styles.seriesPicker}>
          <TextInput
            style={styles.seriesInput}
            value={seriesQuery}
            onChangeText={setSeriesQuery}
            placeholder="Tag up to 5 manga (optional)"
            placeholderTextColor={colors.muted}
          />
          {selectedSeries.length > 0 ? (
            <View style={styles.selectedSeries}>
              {selectedSeries.map((series) => (
                <Pressable key={series.canonicalId} style={styles.selectedChip} onPress={() => setSelectedSeries((old) => old.filter((item) => item.canonicalId !== series.canonicalId))}>
                  <Text style={styles.selectedChipText} numberOfLines={1}>{series.title} ×</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {seriesQuery.trim().length >= 2 ? (
            <View style={styles.results}>
              {(seriesResults.data ?? []).filter((series) => series.canonicalId && !selectedSeries.some((item) => item.canonicalId === series.canonicalId)).slice(0, 4).map((series) => (
                <Pressable key={series.canonicalId} style={styles.result} disabled={selectedSeries.length >= 5} onPress={() => {
                  setSelectedSeries((old) => [...old, series]);
                  setSeriesQuery("");
                }}>
                  <Text style={styles.resultText} numberOfLines={1}>+ {series.title}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
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
  seriesPicker: { marginBottom: 10 },
  seriesInput: { color: colors.text, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 8, fontSize: 12 },
  selectedSeries: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 6 },
  selectedChip: { borderWidth: 1, borderColor: colors.accent, paddingHorizontal: 6, paddingVertical: 3, maxWidth: "48%" },
  selectedChipText: { color: colors.accentSoft, fontSize: 9.5 },
  results: { borderWidth: 1, borderColor: colors.border, marginTop: 4 },
  result: { paddingHorizontal: 8, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  resultText: { color: colors.text, fontSize: 11 },
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
