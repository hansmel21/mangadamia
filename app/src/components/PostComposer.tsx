// Shared post composer (new post, or reply) — the System Protocol "NEW RECORD"
// bottom sheet. Kind tiles across the top, an auto-tagged series row from the
// reader's last read position, spoiler shield toggle, char counter, and a
// gradient PUBLISH RECORD key. On success, celebrates badges/levels.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Image as ExpoImage } from "expo-image";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { EyeOff, ImagePlus, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import {
  api,
  resolveMediaUrl,
  type MyGate,
  type PostGateInfo,
  type PostInfo,
  type PostKind,
  type UnifiedCard,
} from "../api";
import { celebrateBadges } from "../badges";
import { POST_KINDS } from "../ranks";
import { colors } from "../theme";
import { showExpGain } from "./ExpToast";
import { GifPicker } from "./GifPicker";
import { showLevelUp } from "./LevelUp";
import { showQuestCompletions } from "./QuestToast";
import { ReviewRating } from "./ReviewRating";
import { SystemKey } from "./SystemUI";
import { SystemSheet } from "./SystemSheet";
import { TermsAcceptance } from "./TermsAcceptance";

const KIND_ORDER: PostKind[] = ["theory", "record", "review", "poll", "spoiler_intel"];
// Short tile labels — the full POST_KINDS labels don't fit five-across.
const KIND_TILE: Record<PostKind, string> = {
  record: "RECORD",
  theory: "THEORY",
  review: "REVIEW",
  poll: "POLL",
  spoiler_intel: "INTEL",
  // Never rendered — announcements are authored by THE SYSTEM, not readers.
  announcement: "NOTICE",
};

export function PostComposer({
  visible,
  onClose,
  context,
  replyTo,
  quote,
  gate,
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
  // Post straight into this gate (opened from a gate screen). When absent, a
  // bare composer offers a POST INTO picker over the reader's joined gates.
  gate?: PostGateInfo;
  // Open on a specific record type (e.g. Review from the series screen)
  initialKind?: PostKind;
  onPosted?: (post: PostInfo) => void;
}) {
  const [body, setBody] = useState("");
  const [postTitle, setPostTitle] = useState("");
  const [spoiler, setSpoiler] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [seriesQuery, setSeriesQuery] = useState("");
  const [selectedSeries, setSelectedSeries] = useState<UnifiedCard[]>([]);
  const [kind, setKind] = useState<PostKind>("record");
  const [rating, setRating] = useState(0);
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [gifUrl, setGifUrl] = useState("");
  const [gifPickerOpen, setGifPickerOpen] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  // "POST INTO" — bare composes can target one of the reader's gates.
  const [pickedGate, setPickedGate] = useState<MyGate | null>(null);
  const [gatePickerOpen, setGatePickerOpen] = useState(false);
  const queryClient = useQueryClient();

  const bareCompose = !replyTo && !quote && !gate;
  const myGates = useQuery({
    queryKey: ["myGates"],
    queryFn: api.myGates,
    enabled: visible && bareCompose,
    staleTime: 60_000,
  });
  // Sealed gates the reader isn't authorized in can't be posted into.
  const postableGates = (myGates.data ?? []).filter(
    (g) =>
      g.visibility !== "restricted" || g.approvedPoster || g.role !== "member",
  );

  // Reset the type/rating/poll each time the composer opens.
  useEffect(() => {
    if (visible) {
      setKind(replyTo ? "record" : (initialKind ?? "record"));
      setRating(0);
      setPollOptions(["", ""]);
      setGifUrl("");
      setImages([]);
      setPostTitle("");
      setPickedGate(null);
      setGatePickerOpen(false);
    }
  }, [visible, replyTo, quote, context, initialKind]);

  const isQuote = !!quote && !replyTo;
  const isReview = kind === "review" && !replyTo && !isQuote;
  const isPoll = kind === "poll" && !replyTo && !isQuote;
  const seriesResults = useQuery({
    queryKey: ["composerSeries", seriesQuery],
    queryFn: () => api.searchAll(seriesQuery.trim(), 1),
    enabled: visible && !replyTo && !context && seriesQuery.trim().length >= 2,
    staleTime: 60_000,
  });

  // Pick up to 4 photos; always re-encode to JPEG (iPhone HEIC → JPEG) and
  // downscale to ≤1600px wide before the raw-binary upload.
  const pickImages = async () => {
    if (images.length >= 4 || uploadingImages) return;
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: 4 - images.length,
      quality: 1,
    });
    if (picked.canceled) return;
    setUploadingImages(true);
    setError("");
    try {
      for (const asset of picked.assets.slice(0, 4 - images.length)) {
        const jpeg = await manipulateAsync(
          asset.uri,
          asset.width > 1600 ? [{ resize: { width: 1600 } }] : [],
          { compress: 0.8, format: SaveFormat.JPEG },
        );
        const { url } = await api.uploadImage(jpeg.uri);
        setImages((prev) => (prev.length < 4 ? [...prev, url] : prev));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploadingImages(false);
    }
  };

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
        title:
          !replyTo && !isQuote && postTitle.trim().length >= 3 ? postTitle.trim() : undefined,
        canonicalId: replyTo || isQuote ? undefined : context?.canonicalId,
        chapterNumber: replyTo || isQuote ? undefined : context?.chapterNumber,
        parentId: replyTo?.id,
        isSpoiler: kind === "spoiler_intel" ? true : spoiler,
        kind: replyTo || isQuote ? undefined : kind,
        rating: isReview ? rating : undefined,
        gifUrl: gifUrl.trim() || undefined,
        imageUrls: images.length > 0 ? images : undefined,
        pollOptions: isPoll ? cleanPollOptions : undefined,
        quotedPostId: isQuote ? quote.id : undefined,
        gateId:
          replyTo || isQuote ? undefined : (gate?.id ?? pickedGate?.id ?? undefined),
        seriesTags: replyTo
          ? undefined
          : isReview
            ? context
              ? undefined
              : [{ canonicalId: reviewSeries! }]
            : !context && selectedSeries.length > 0
              ? selectedSeries
                  .filter((series) => !!series.canonicalId)
                  .map((series) => ({ canonicalId: series.canonicalId! }))
              : undefined,
      });
      showExpGain(created.xpAwarded, created.xpBonus);
      celebrateBadges(created.newBadges);
      showQuestCompletions(created.completedQuests);
      if (created.levelUp) showLevelUp(created.levelUp);
      setBody("");
      setSpoiler(false);
      setSelectedSeries([]);
      setSeriesQuery("");
      setRating(0);
      setPollOptions(["", ""]);
      setGifUrl("");
      setImages([]);
      setPostTitle("");
      queryClient.invalidateQueries({ queryKey: ["feed"] });
      if (gate || pickedGate) {
        queryClient.invalidateQueries({ queryKey: ["gatePosts"] });
      }
      onPosted?.(created);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const title = replyTo ? "REPLY" : isQuote ? "QUOTE RECORD" : "NEW RECORD";
  const contextChip = replyTo
    ? `Replying to @${replyTo.username}`
    : context
      ? `${context.title}${context.chapterNumber != null ? ` · Ch. ${context.chapterNumber}` : ""}`
      : null;

  return (
    <SystemSheet visible={visible} onClose={onClose} title={title}>
      <TermsAcceptance>
        {contextChip ? (
          <View style={styles.chip}>
            <Text style={styles.chipText} numberOfLines={1}>
              ◆ {contextChip}
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

        {/* Posting straight into a gate (opened from its screen) */}
        {gate && !replyTo && !isQuote ? (
          <View style={[styles.chip, { borderColor: (gate.primaryColor || colors.accent) + "88" }]}>
            <Text
              style={[styles.chipText, { color: gate.primaryColor || colors.accentSoft }]}
              numberOfLines={1}
            >
              ⛩ POSTING INTO {gate.name.toUpperCase()}
            </Text>
          </View>
        ) : null}

        {/* POST INTO — bare composes pick the dungeon wall or one of my gates */}
        {bareCompose && postableGates.length > 0 ? (
          <View style={styles.gatePickWrap}>
            <Pressable
              style={styles.gatePickKey}
              onPress={() => setGatePickerOpen((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel="Choose where to post"
            >
              <Text
                style={[
                  styles.gatePickText,
                  pickedGate && { color: pickedGate.primaryColor || colors.accentSoft },
                ]}
                numberOfLines={1}
              >
                POST INTO · {pickedGate ? `⛩ ${pickedGate.name.toUpperCase()}` : "THE DUNGEON"}
              </Text>
              <Text style={styles.gatePickCaret}>{gatePickerOpen ? "▴" : "▾"}</Text>
            </Pressable>
            {gatePickerOpen ? (
              <View style={styles.gatePickMenu}>
                <Pressable
                  style={styles.gatePickOption}
                  onPress={() => {
                    setPickedGate(null);
                    setGatePickerOpen(false);
                  }}
                >
                  <Text
                    style={[styles.gatePickOptionText, !pickedGate && { color: colors.accentSoft }]}
                  >
                    {!pickedGate ? "◆ " : ""}THE DUNGEON
                  </Text>
                </Pressable>
                {postableGates.map((g) => (
                  <Pressable
                    key={g.id}
                    style={styles.gatePickOption}
                    onPress={() => {
                      setPickedGate(g);
                      setGatePickerOpen(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.gatePickOptionText,
                        pickedGate?.id === g.id && { color: g.primaryColor || colors.accentSoft },
                      ]}
                      numberOfLines={1}
                    >
                      {pickedGate?.id === g.id ? "◆ " : ""}⛩ {g.name.toUpperCase()}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Kind selector — 5 equal System tiles */}
        {!replyTo && !isQuote ? (
          <View style={styles.kindRow}>
            {KIND_ORDER.map((k) => {
              const meta = POST_KINDS[k];
              const on = kind === k;
              return (
                <Pressable
                  key={k}
                  style={[
                    styles.kindTile,
                    on && { borderColor: meta.color, borderWidth: 1.5, backgroundColor: colors.accentGhost },
                  ]}
                  onPress={() => setKind(k)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={styles.kindIcon}>{meta.icon}</Text>
                  <Text style={[styles.kindLabel, on && { color: meta.color }]}>{KIND_TILE[k]}</Text>
                </Pressable>
              );
            })}
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
        {!replyTo && !isQuote ? (
          <TextInput
            style={styles.titleInput}
            placeholder="Title (optional)"
            placeholderTextColor={colors.muted}
            value={postTitle}
            onChangeText={setPostTitle}
            maxLength={120}
          />
        ) : null}
        <TextInput
          style={styles.input}
          placeholder={
            replyTo
              ? "Add to the record…"
              : isQuote
                ? "Add your take…"
                : isPoll
                  ? "Ask a question…"
                  : "Log your record…"
          }
          placeholderTextColor={colors.muted}
          value={body}
          onChangeText={setBody}
          multiline
          autoFocus
          maxLength={1000}
        />

        {/* Series tagging sits under the record text (owner request — no
            auto-tag from the last read anymore; tagging is always deliberate). */}
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

        {gifUrl ? (
          <View style={styles.gifPreviewWrap}>
            <ExpoImage
              source={{ uri: gifUrl }}
              style={styles.gifPreview}
              contentFit="cover"
              transition={100}
              accessibilityLabel="Attached GIF"
            />
            <Pressable
              style={styles.gifPreviewRemove}
              hitSlop={8}
              onPress={() => setGifUrl("")}
              accessibilityLabel="Remove GIF"
            >
              <X color="#fff" size={14} strokeWidth={2.5} />
            </Pressable>
          </View>
        ) : null}

        {images.length > 0 || uploadingImages ? (
          <View style={styles.imageRow}>
            {images.map((url) => (
              <View key={url} style={styles.imageThumbWrap}>
                <ExpoImage
                  source={{ uri: resolveMediaUrl(url) }}
                  style={styles.imageThumb}
                  contentFit="cover"
                  transition={100}
                />
                <Pressable
                  style={styles.imageThumbRemove}
                  hitSlop={8}
                  onPress={() => setImages((prev) => prev.filter((u) => u !== url))}
                  accessibilityLabel="Remove photo"
                >
                  <X color="#fff" size={11} strokeWidth={2.5} />
                </Pressable>
              </View>
            ))}
            {uploadingImages ? (
              <View style={[styles.imageThumbWrap, styles.imageThumbLoading]}>
                <ActivityIndicator color={colors.accent} size="small" />
              </View>
            ) : null}
          </View>
        ) : null}

        {/* photo + GIF keys + spoiler shield toggle + char counter */}
        <View style={styles.metaRow}>
          <Pressable
            style={(s) => [
              styles.gifKey,
              { opacity: s.pressed || images.length >= 4 || uploadingImages ? 0.5 : 1 },
            ]}
            disabled={images.length >= 4 || uploadingImages}
            onPress={() => void pickImages()}
            accessibilityRole="button"
            accessibilityLabel="Add photos"
          >
            <ImagePlus color={colors.accentSoft} size={14} strokeWidth={2.2} />
          </Pressable>
          <Pressable
            style={(s) => [styles.gifKey, { opacity: s.pressed ? 0.6 : 1 }]}
            onPress={() => setGifPickerOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Add a GIF"
          >
            <Text style={styles.gifKeyText}>GIF</Text>
          </Pressable>
          {kind === "spoiler_intel" ? (
            <View style={styles.shieldPill}>
              <EyeOff color={colors.danger} size={13} strokeWidth={2.5} />
              <Text style={[styles.shieldLabel, { color: colors.danger }]}>AUTO-SHIELDED</Text>
            </View>
          ) : (
            <Pressable
              style={(s) => [styles.shieldPill, { opacity: s.pressed ? 0.6 : 1 }]}
              onPress={() => setSpoiler((v) => !v)}
              accessibilityRole="switch"
              accessibilityState={{ checked: spoiler }}
            >
              <Text style={styles.shieldLabel}>SPOILER SHIELD</Text>
              <View style={[styles.track, spoiler && styles.trackOn]}>
                <View style={[styles.knob, spoiler && styles.knobOn]} />
              </View>
            </Pressable>
          )}
          <Text style={styles.counter}>{body.length} / 1,000</Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <SystemKey
          label={replyTo ? "SEND REPLY" : "PUBLISH RECORD"}
          onPress={submit}
          disabled={!body.trim() || busy || uploadingImages}
          style={styles.publish}
          icon={busy ? <ActivityIndicator color="#fff" size="small" /> : undefined}
        />
        {!replyTo && !isQuote ? (
          <Text style={styles.xpHint}>+XP for your first record today · records feed your daily quests</Text>
        ) : null}
      </TermsAcceptance>
      <GifPicker
        visible={gifPickerOpen}
        onClose={() => setGifPickerOpen(false)}
        onSelect={(gif) => setGifUrl(gif.url)}
      />
    </SystemSheet>
  );
}

const styles = StyleSheet.create({
  kindRow: { flexDirection: "row", gap: 6, marginBottom: 12 },
  kindTile: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 9,
    gap: 2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 3,
  },
  kindIcon: { fontSize: 14 },
  kindLabel: { color: colors.muted, fontSize: 8.5, fontWeight: "900", letterSpacing: 1 },
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
    borderRadius: 3,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
  },
  pollRemove: { color: colors.muted, fontSize: 20, fontWeight: "800", paddingHorizontal: 4 },
  pollAdd: { color: colors.accentSoft, fontSize: 12, fontWeight: "800", paddingVertical: 2 },
  quoteBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 3,
    padding: 10,
    marginBottom: 10,
    gap: 4,
    backgroundColor: colors.card,
  },
  quoteLabel: { color: colors.accentSoft, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  quoteBody: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  seriesPicker: { marginTop: 10, marginBottom: 10 },
  seriesInput: {
    color: colors.text,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 3,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
  },
  selectedSeries: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 6 },
  selectedChip: { borderWidth: 1, borderColor: colors.accent, borderRadius: 3, paddingHorizontal: 6, paddingVertical: 3, maxWidth: "48%" },
  selectedChipText: { color: colors.accentSoft, fontSize: 9.5 },
  results: { borderWidth: 1, borderColor: colors.border, borderRadius: 3, marginTop: 4 },
  result: { paddingHorizontal: 8, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  resultText: { color: colors.text, fontSize: 11 },
  chip: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "rgba(107,94,204,0.5)",
    borderRadius: 3,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 10,
    maxWidth: "100%",
  },
  chipText: { color: colors.accentSoft, fontSize: 11, fontWeight: "700" },
  gatePickWrap: { marginBottom: 10, zIndex: 30 },
  gatePickKey: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 3,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: colors.card,
  },
  gatePickText: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
    flexShrink: 1,
  },
  gatePickCaret: { color: colors.muted, fontSize: 11, fontWeight: "900" },
  gatePickMenu: {
    marginTop: 4,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accentLine,
    borderRadius: 3,
    paddingVertical: 2,
  },
  gatePickOption: { paddingHorizontal: 12, paddingVertical: 9 },
  gatePickOptionText: {
    color: colors.mutedStrong,
    fontSize: 10.5,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  titleInput: {
    backgroundColor: colors.card,
    color: colors.text,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "rgba(107,94,204,0.4)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.card,
    color: colors.text,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 100,
    maxHeight: 200,
    fontSize: 14,
    lineHeight: 20,
    textAlignVertical: "top",
  },
  gifPreviewWrap: { marginTop: 10, borderRadius: 3, overflow: "hidden" },
  gifPreview: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 3,
    backgroundColor: colors.card,
  },
  gifPreviewRemove: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
  },
  gifKey: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 3,
    paddingHorizontal: 11,
    paddingVertical: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  imageRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  imageThumbWrap: { width: 64, height: 64, borderRadius: 3, overflow: "hidden" },
  imageThumb: {
    width: "100%",
    height: "100%",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 3,
    backgroundColor: colors.card,
  },
  imageThumbLoading: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  imageThumbRemove: {
    position: "absolute",
    top: 3,
    right: 3,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
  },
  gifKeyText: { color: colors.accentSoft, fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  shieldPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 3,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  shieldLabel: { color: colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  track: {
    width: 26,
    height: 15,
    borderRadius: 8,
    backgroundColor: colors.border,
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  trackOn: { backgroundColor: colors.accent },
  knob: { width: 11, height: 11, borderRadius: 6, backgroundColor: colors.text, alignSelf: "flex-start" },
  knobOn: { alignSelf: "flex-end" },
  counter: { marginLeft: "auto", color: colors.muted, fontSize: 10 },
  error: { color: colors.danger, marginTop: 8, fontSize: 13 },
  publish: { marginTop: 14 },
  xpHint: { color: colors.muted, fontSize: 10, textAlign: "center", marginTop: 9 },
});
