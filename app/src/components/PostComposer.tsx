// Shared post composer (new post, or reply). System-styled modal. Optionally
// carries a series/chapter context chip. On success, celebrates badges/levels.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { EyeOff } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { api, type PostInfo, type PostKind, type UnifiedCard } from "../api";
import { celebrateBadges } from "../badges";
import { POST_KINDS } from "../ranks";
import { showExpGain } from "./ExpToast";
import { showLevelUp } from "./LevelUp";
import { showQuestCompletions } from "./QuestToast";
import { ReviewRating } from "./ReviewRating";
import { SystemModal } from "./SystemModal";
import { TermsAcceptance } from "./TermsAcceptance";
import { colors } from "../theme";

const KIND_ORDER: PostKind[] = ["record", "theory", "review", "poll", "spoiler_intel"];

export function PostComposer({
  visible,
  onClose,
  context,
  replyTo,
  quote,
  initialKind,
  onPosted,
}: {
  visible: boolean;
  onClose: () => void;
  // Attach a series/chapter to a brand-new post
  context?: { canonicalId: string; title: string; chapterNumber?: number };
  // Or reply to an existing post
  replyTo?: PostInfo;
  // Or quote-repost an existing post (a top-level record with your take on top)
  quote?: PostInfo;
  // Open on a specific record type (e.g. Review from the series screen)
  initialKind?: PostKind;
  onPosted?: (post: PostInfo) => void;
}) {
  const [body, setBody] = useState("");
  const [spoiler, setSpoiler] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [seriesQuery, setSeriesQuery] = useState("");
  const [selectedSeries, setSelectedSeries] = useState<UnifiedCard[]>([]);
  const [kind, setKind] = useState<PostKind>("record");
  const [rating, setRating] = useState(0);
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const queryClient = useQueryClient();

  // Reset the type/rating/poll each time the composer opens.
  useEffect(() => {
    if (visible) {
      setKind(replyTo ? "record" : (initialKind ?? "record"));
      setRating(0);
      setPollOptions(["", ""]);
    }
  }, [visible, replyTo, initialKind]);

  const isQuote = !!quote && !replyTo;
  const isReview = kind === "review" && !replyTo && !isQuote;
  const isPoll = kind === "poll" && !replyTo && !isQuote;
  const seriesResults = useQuery({
    queryKey: ["composerSeries", seriesQuery],
    queryFn: () => api.searchAll(seriesQuery.trim(), 1),
    enabled: visible && !replyTo && !context && seriesQuery.trim().length >= 2,
    staleTime: 60_000,
  });

  const submit = async () => {
    const text = body.trim();
    if (!text) return;
    // A review needs one series (from context or the picker) and a rating.
    const reviewSeries = context?.canonicalId ?? selectedSeries[0]?.canonicalId;
    if (isReview && !reviewSeries) {
      setError("Pick one series to review.");
      return;
    }
    if (isReview && !rating) {
      setError("Add a 1–5 rating for your review.");
      return;
    }
    const cleanPollOptions = pollOptions.map((o) => o.trim()).filter(Boolean);
    if (isPoll && cleanPollOptions.length < 2) {
      setError("A poll needs at least 2 options.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const created = await api.createPost(text, {
        canonicalId: replyTo || isQuote ? undefined : context?.canonicalId,
        chapterNumber: replyTo || isQuote ? undefined : context?.chapterNumber,
        parentId: replyTo?.id,
        isSpoiler: kind === "spoiler_intel" ? true : spoiler,
        kind: replyTo || isQuote ? undefined : kind,
        rating: isReview ? rating : undefined,
        pollOptions: isPoll ? cleanPollOptions : undefined,
        quotedPostId: isQuote ? quote.id : undefined,
        seriesTags: replyTo
          ? undefined
          : isReview
            ? context
              ? undefined
              : [{ canonicalId: reviewSeries! }]
            : !context
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
      setRating(0);
      setPollOptions(["", ""]);
      queryClient.invalidateQueries({ queryKey: ["feed"] });
      onPosted?.(created);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const title = replyTo
    ? "Reply"
    : isQuote
      ? "Quote"
      : isReview
        ? "File a Review"
        : isPoll
          ? "Create a Poll"
          : "File a Record";
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
      {isQuote ? (
        <View style={styles.quoteBox}>
          <Text style={styles.quoteLabel}>QUOTING @{quote.username}</Text>
          <Text style={styles.quoteBody} numberOfLines={3}>
            {quote.isSpoiler ? "⚠ Spoiler" : quote.body}
          </Text>
        </View>
      ) : null}
      {!replyTo && !isQuote ? (
        <View style={styles.typeRow}>
          {KIND_ORDER.map((k) => (
            <Pressable
              key={k}
              style={[styles.typeChip, kind === k && styles.typeChipOn]}
              onPress={() => setKind(k)}
            >
              <Text style={[styles.typeChipText, kind === k && { color: POST_KINDS[k].color }]}>
                {POST_KINDS[k].label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {isReview ? (
        <View style={styles.ratingRow}>
          <Text style={styles.ratingLabel}>YOUR RATING</Text>
          <ReviewRating value={rating} onChange={setRating} size={28} />
        </View>
      ) : null}
      {isPoll ? (
        <View style={styles.pollBox}>
          <Text style={styles.pollLabel}>POLL OPTIONS</Text>
          {pollOptions.map((opt, i) => (
            <View key={i} style={styles.pollRow}>
              <TextInput
                style={styles.pollInput}
                value={opt}
                onChangeText={(t) =>
                  setPollOptions((prev) => prev.map((o, j) => (j === i ? t : o)))
                }
                placeholder={`Option ${i + 1}`}
                placeholderTextColor={colors.muted}
                maxLength={80}
              />
              {pollOptions.length > 2 ? (
                <Pressable
                  hitSlop={8}
                  onPress={() => setPollOptions((prev) => prev.filter((_, j) => j !== i))}
                >
                  <Text style={styles.pollRemove}>×</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
          {pollOptions.length < 6 ? (
            <Pressable onPress={() => setPollOptions((prev) => [...prev, ""])}>
              <Text style={styles.pollAdd}>+ Add option</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {!replyTo && !context && !isQuote ? (
        <View style={styles.seriesPicker}>
          <TextInput
            style={styles.seriesInput}
            value={seriesQuery}
            onChangeText={setSeriesQuery}
            placeholder={isReview ? "Search the series you're reviewing" : "Tag up to 5 manga (optional)"}
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
        placeholder={
          replyTo
            ? "Write a reply…"
            : isQuote
              ? "Add your take…"
              : isPoll
                ? "Ask a question…"
                : "Share a thought…"
        }
        placeholderTextColor={colors.muted}
        value={body}
        onChangeText={setBody}
        multiline
        autoFocus
        maxLength={1000}
      />
      {kind === "spoiler_intel" ? (
        <View style={styles.spoilerToggle}>
          <EyeOff color={colors.danger} size={13} strokeWidth={2.5} />
          <Text style={[styles.spoilerText, { color: colors.danger }]}>
            Spoiler Intel is shielded automatically
          </Text>
        </View>
      ) : (
        <Pressable
          style={(s) => [styles.spoilerToggle, { opacity: s.pressed ? 0.6 : 1 }]}
          onPress={() => setSpoiler((v) => !v)}
        >
          <View style={[styles.checkbox, spoiler && styles.checkboxOn]}>
            {spoiler ? <EyeOff color={colors.accentText} size={11} strokeWidth={2.5} /> : null}
          </View>
          <Text style={styles.spoilerText}>Mark as spoiler</Text>
        </Pressable>
      )}
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
  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  typeChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  typeChipOn: { borderColor: "rgba(124,92,255,0.7)", backgroundColor: "rgba(124,92,255,0.12)" },
  typeChipText: { color: colors.muted, fontSize: 9.5, fontWeight: "900", letterSpacing: 0.8 },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  ratingLabel: { color: colors.accentSoft, fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
  pollBox: { gap: 7, marginBottom: 10 },
  pollLabel: { color: colors.accentSoft, fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
  pollRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  pollInput: {
    flex: 1,
    color: colors.text,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
  },
  pollRemove: { color: colors.muted, fontSize: 20, fontWeight: "800", paddingHorizontal: 4 },
  pollAdd: { color: colors.accentSoft, fontSize: 12, fontWeight: "800", paddingVertical: 2 },
  quoteBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    gap: 4,
    backgroundColor: colors.card,
  },
  quoteLabel: { color: colors.accentSoft, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  quoteBody: { color: colors.muted, fontSize: 13, lineHeight: 18 },
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
