// Inside a Gate — header window (emblem, name, visibility, raider count,
// ENTER/WITHDRAW key), HOT/NEW/TOP feed of the gate's records with pinned
// rows first, and warden controls (pin / remove) on each card.
// Hidden gates show a masked "request entry" shell to outsiders.
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { Pin, Plus, Trash2, Users } from "lucide-react-native";
import { useState, useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { api, type GateRole, type PostInfo, type ReactionType } from "../../src/api";
import { GateVisibilityBadge } from "../../src/components/GateDirectory";
import { GuildEmblem } from "../../src/components/GuildCrest";
import { PostCard } from "../../src/components/PostCard";
import { PostComposer } from "../../src/components/PostComposer";
import { ReportModal, type ReportTarget } from "../../src/components/ReportModal";
import { SystemKey } from "../../src/components/SystemUI";
import { getSessionUser, subscribeSession } from "../../src/session";
import { colors, fonts } from "../../src/theme";

const SORT_ORDER = ["hot", "new", "top"] as const;
type GateSort = (typeof SORT_ORDER)[number];

type GatePost = PostInfo & { pinned?: boolean; authorRole?: GateRole | null };

export default function GateScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const gateId = String(id);
  const user = useSyncExternalStore(subscribeSession, getSessionUser);
  const queryClient = useQueryClient();
  const [sort, setSort] = useState<GateSort>("hot");
  const [composerOpen, setComposerOpen] = useState(false);
  const [quoteTarget, setQuoteTarget] = useState<PostInfo | null>(null);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);

  const gate = useQuery({
    queryKey: ["gate", gateId],
    queryFn: () => api.gate(gateId),
    staleTime: 15_000,
  });

  const postsKey = ["gatePosts", gateId, sort] as const;
  const posts = useInfiniteQuery({
    queryKey: postsKey,
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api.gatePosts(gateId, pageParam, sort),
    getNextPageParam: (last, pages) => (last.length > 0 ? pages.length + 1 : undefined),
    enabled: !!gate.data && !gate.data.masked,
  });
  const rows: GatePost[] = posts.data?.pages.flat() ?? [];

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["gate", gateId] });
    void queryClient.invalidateQueries({ queryKey: ["gates"] });
    void queryClient.invalidateQueries({ queryKey: ["myGates"] });
  };

  const join = useMutation({
    mutationFn: () => api.joinGate(gateId),
    onSuccess: invalidate,
  });
  const leave = useMutation({
    mutationFn: () => api.leaveGate(gateId),
    onSuccess: (res) => {
      invalidate();
      if (res.status === "dissolved") router.back();
    },
  });

  const patch = (postId: string, fn: (p: GatePost) => GatePost) => {
    queryClient.setQueryData<{ pages: GatePost[][]; pageParams: unknown[] }>(postsKey, (old) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((page) => page.map((p) => (p.id === postId ? fn(p) : p))),
      };
    });
  };
  const removeRow = (postId: string) => {
    queryClient.setQueryData<{ pages: GatePost[][]; pageParams: unknown[] }>(postsKey, (old) => {
      if (!old) return old;
      return { ...old, pages: old.pages.map((page) => page.filter((p) => p.id !== postId)) };
    });
  };

  const react = async (p: PostInfo, type: ReactionType) => {
    if (!user) return;
    try {
      const res = await api.reactToPost(p.id, type);
      patch(p.id, (x) => ({ ...x, reactions: res.reactions, myReaction: res.myReaction }));
    } catch {
      /* ignore */
    }
  };
  const vote = async (p: PostInfo, optionId: string) => {
    if (!user) return;
    try {
      const poll = await api.votePoll(p.id, optionId);
      patch(p.id, (x) => ({ ...x, poll }));
    } catch {
      /* ignore */
    }
  };
  const remove = async (p: PostInfo) => {
    try {
      await api.deletePost(p.id);
      removeRow(p.id);
    } catch {
      /* ignore */
    }
  };
  const setTier = async (p: GatePost, tier: "normal" | "pinned" | "announcement") => {
    try {
      const res = await api.setPostTier(p.id, tier);
      patch(p.id, (x) => ({ ...x, pinned: res.pinned, announcement: res.announcement }));
      void queryClient.invalidateQueries({ queryKey: postsKey });
    } catch {
      /* ignore */
    }
  };
  const wardenRemove = (p: GatePost) => {
    Alert.alert("Remove this record?", "It disappears from the gate for everyone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "REMOVE",
        style: "destructive",
        onPress: async () => {
          try {
            await api.gateRemovePost(p.id);
            removeRow(p.id);
          } catch {
            /* ignore */
          }
        },
      },
    ]);
  };

  const detail = gate.data;
  const isMember = !!detail?.myRole;
  const canManage = !!detail?.canManage;
  // Mirrors the server rule: open = anyone, sealed = authorized raiders and
  // wardens, hidden = any raider inside.
  const canPost = !detail
    ? false
    : detail.visibility === "open"
      ? true
      : detail.visibility === "restricted"
        ? isMember && (detail.approvedPoster || canManage)
        : isMember;

  const cycleSort = () =>
    setSort(SORT_ORDER[(SORT_ORDER.indexOf(sort) + 1) % SORT_ORDER.length]);

  if (gate.isLoading || !detail) {
    return (
      <View style={styles.screen}>
        <Stack.Screen options={{ title: "" }} />
        <ActivityIndicator color={colors.accent} style={{ marginTop: 60 }} />
      </View>
    );
  }

  // Masked shell: a hidden gate the viewer hasn't entered.
  if (detail.masked) {
    return (
      <View style={styles.screen}>
        <Stack.Screen options={{ title: "" }} />
        <View style={styles.maskedWrap}>
          <Text style={styles.maskedGlyph}>⛩</Text>
          <Text style={styles.maskedName}>{detail.name}</Text>
          <Text style={styles.maskedHint}>
            A HIDDEN GATE{"\n"}Only raiders inside can see what happens here.
          </Text>
          {user ? (
            detail.hasRequested ? (
              <Text style={styles.requestedChip}>ENTRY REQUESTED — awaiting a warden</Text>
            ) : (
              <Pressable
                style={styles.requestKey}
                disabled={join.isPending}
                onPress={() => join.mutate()}
              >
                <Text style={styles.requestKeyText}>
                  {join.isPending ? "…" : "REQUEST ENTRY"}
                </Text>
              </Pressable>
            )
          ) : (
            <Text style={styles.maskedHint}>Sign in from the Status tab to request entry.</Text>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: "" }} />
      <FlatList
        data={rows}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingBottom: 110 }}
        ListHeaderComponent={
          <View>
            {/* header window */}
            <View style={[styles.headerWindow, { borderColor: (detail.primaryColor ?? colors.accent) + "77" }]}>
              <View style={styles.headerTop}>
                <GuildEmblem
                  emblemKey={detail.emblemKey ?? "crest"}
                  primaryColor={detail.primaryColor ?? colors.accent}
                  secondaryColor={detail.secondaryColor}
                  size={52}
                />
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name} numberOfLines={1}>
                      ⛩ {detail.name}
                    </Text>
                    <GateVisibilityBadge visibility={detail.visibility} />
                  </View>
                  <View style={styles.metaRow}>
                    <Users color={colors.muted} size={12} strokeWidth={2} />
                    <Text style={styles.metaText}>
                      {detail.memberCount} RAIDERS INSIDE
                      {detail.myRole ? ` · YOU'RE ${detail.myRole.toUpperCase()}` : ""}
                    </Text>
                  </View>
                </View>
              </View>
              {detail.description ? (
                <Text style={styles.description}>{detail.description}</Text>
              ) : null}
              <View style={styles.keyRow}>
                {user && !isMember ? (
                  <Pressable
                    style={styles.enterKey}
                    disabled={join.isPending}
                    onPress={() => join.mutate()}
                  >
                    <Text style={styles.enterKeyText}>{join.isPending ? "…" : "ENTER"}</Text>
                  </Pressable>
                ) : null}
                {user && isMember ? (
                  <Pressable
                    style={styles.withdrawKey}
                    disabled={leave.isPending}
                    onPress={() =>
                      Alert.alert(
                        "Withdraw from this gate?",
                        detail.myRole === "gatekeeper"
                          ? "The gate passes to the next raider — or closes if you're the last one."
                          : undefined,
                        [
                          { text: "Cancel", style: "cancel" },
                          { text: "WITHDRAW", style: "destructive", onPress: () => leave.mutate() },
                        ],
                      )
                    }
                  >
                    <Text style={styles.withdrawKeyText}>WITHDRAW</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  style={styles.membersKey}
                  onPress={() =>
                    router.push({ pathname: "/gate/members/[id]", params: { id: gateId } })
                  }
                >
                  <Text style={styles.membersKeyText}>
                    {canManage ? "MANAGE" : "RAIDERS"} ▸
                    {canManage && (detail.pendingRequestCount ?? 0) > 0
                      ? `  ${detail.pendingRequestCount} WAITING`
                      : ""}
                  </Text>
                </Pressable>
                {detail.can?.edit_info ? (
                  <Pressable
                    style={styles.membersKey}
                    onPress={() =>
                      router.push({ pathname: "/gate/edit/[id]", params: { id: gateId } })
                    }
                  >
                    <Text style={styles.membersKeyText}>⚙ SETTINGS</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            {/* sort row */}
            <View style={styles.sortRow}>
              <Text style={styles.sortLabel}>RECORDS INSIDE</Text>
              <Pressable style={styles.sortKey} onPress={cycleSort}>
                <Text style={styles.sortKeyText}>{sort.toUpperCase()} ▾</Text>
              </Pressable>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <View>
            {item.pinned || item.announcement || canManage ? (
              <View style={styles.modRow}>
                {item.pinned ? <Text style={styles.pinnedChip}>📌 PINNED</Text> : null}
                <View style={{ flex: 1 }} />
                {canManage ? (
                  <>
                    <Pressable
                      style={styles.modKey}
                      onPress={() => setTier(item, item.pinned ? "normal" : "pinned")}
                      hitSlop={6}
                    >
                      <Pin color={colors.foilSoft} size={11} strokeWidth={2.2} />
                      <Text style={styles.modKeyText}>{item.pinned ? "UNPIN" : "PIN"}</Text>
                    </Pressable>
                    <Pressable
                      style={styles.modKey}
                      onPress={() => setTier(item, item.announcement ? "normal" : "announcement")}
                      hitSlop={6}
                    >
                      <Text style={styles.modKeyText}>
                        {item.announcement ? "⚑ UNNOTICE" : "⚑ NOTICE"}
                      </Text>
                    </Pressable>
                    {!item.mine ? (
                      <Pressable
                        style={styles.modKey}
                        onPress={() => wardenRemove(item)}
                        hitSlop={6}
                      >
                        <Trash2 color={colors.danger} size={11} strokeWidth={2.2} />
                        <Text style={[styles.modKeyText, { color: colors.danger }]}>REMOVE</Text>
                      </Pressable>
                    ) : null}
                  </>
                ) : null}
              </View>
            ) : null}
            <PostCard
              post={item}
              preview
              showGateChip={false}
              onOpen={(p) => router.push({ pathname: "/post/[id]", params: { id: p.id } })}
              onReact={react}
              onVote={vote}
              onQuote={
                detail.visibility === "private"
                  ? undefined
                  : (p) => {
                      setQuoteTarget(p);
                      setComposerOpen(true);
                    }
              }
              onDelete={remove}
              onReport={(p) => setReportTarget({ type: "post", id: p.id, username: p.username })}
              viewerSignedIn={!!user}
            />
          </View>
        )}
        onEndReached={() => {
          if (posts.hasNextPage && !posts.isFetchingNextPage) posts.fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        refreshing={posts.isRefetching && !posts.isFetchingNextPage}
        onRefresh={() => posts.refetch()}
        ListEmptyComponent={
          posts.isLoading ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
          ) : (
            <Text style={styles.empty}>
              Nothing has happened inside this gate yet.{"\n"}File the first record.
            </Text>
          )
        }
      />

      {user && canPost ? (
        <SystemKey
          label="NEW RECORD"
          icon={<Plus color="#fff" size={15} strokeWidth={2.4} />}
          arrow={false}
          onPress={() => {
            setQuoteTarget(null);
            setComposerOpen(true);
          }}
          style={styles.fab}
        />
      ) : user && detail.visibility === "restricted" && !canPost ? (
        <View style={styles.sealedBar}>
          <Text style={styles.sealedBarText}>
            SEALED — a warden must authorize you before you can post here.
          </Text>
        </View>
      ) : null}

      <PostComposer
        visible={composerOpen}
        quote={quoteTarget ?? undefined}
        gate={
          quoteTarget
            ? undefined
            : {
                id: detail.id,
                name: detail.name,
                emblemKey: detail.emblemKey ?? "crest",
                primaryColor: detail.primaryColor ?? colors.accent,
                visibility: detail.visibility,
              }
        }
        onClose={() => {
          setComposerOpen(false);
          setQuoteTarget(null);
        }}
        onPosted={() => void queryClient.invalidateQueries({ queryKey: postsKey })}
      />
      <ReportModal target={reportTarget} onClose={() => setReportTarget(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  maskedWrap: { alignItems: "center", paddingTop: 90, paddingHorizontal: 32, gap: 14 },
  maskedGlyph: { fontSize: 44 },
  maskedName: { color: colors.text, fontFamily: fonts.display, fontSize: 24 },
  maskedHint: { color: colors.muted, fontSize: 13, textAlign: "center", lineHeight: 20 },
  requestKey: {
    marginTop: 10,
    borderWidth: 1.5,
    borderColor: "rgba(107,94,204,0.65)",
    backgroundColor: "rgba(107,94,204,0.14)",
    borderRadius: 4,
    paddingHorizontal: 26,
    paddingVertical: 12,
  },
  requestKeyText: { color: colors.accentSoft, fontWeight: "900", fontSize: 12, letterSpacing: 1.4 },
  requestedChip: {
    color: colors.foilSoft,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    marginTop: 10,
  },
  headerWindow: {
    margin: 16,
    marginBottom: 6,
    padding: 14,
    borderWidth: 1,
    borderRadius: 4,
    backgroundColor: colors.card,
    gap: 10,
  },
  headerTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 7, flexWrap: "wrap" },
  name: { color: colors.text, fontFamily: fonts.display, fontSize: 19, flexShrink: 1 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText: { color: colors.muted, fontSize: 9.5, fontWeight: "800", letterSpacing: 0.8 },
  description: { color: colors.mutedStrong, fontSize: 13, lineHeight: 19 },
  keyRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  enterKey: {
    borderWidth: 1.5,
    borderColor: "rgba(86,168,123,0.6)",
    backgroundColor: "rgba(86,168,123,0.12)",
    borderRadius: 4,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  enterKeyText: { color: colors.fresh, fontWeight: "900", fontSize: 11, letterSpacing: 1.4 },
  withdrawKey: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  withdrawKeyText: { color: colors.muted, fontWeight: "900", fontSize: 10, letterSpacing: 1.2 },
  membersKey: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  membersKeyText: { color: colors.accentSoft, fontWeight: "900", fontSize: 10, letterSpacing: 1.2 },
  sortRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 4,
  },
  sortLabel: { color: colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.6 },
  sortKey: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  sortKeyText: { color: colors.accentBright, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  modRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: -6,
  },
  pinnedChip: { color: colors.foilSoft, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  modKey: { flexDirection: "row", alignItems: "center", gap: 4 },
  modKeyText: { color: colors.foilSoft, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  empty: { color: colors.muted, textAlign: "center", marginTop: 50, lineHeight: 22 },
  fab: { position: "absolute", right: 16, bottom: 24 },
  sealedBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: "rgba(205,164,94,0.4)",
    padding: 13,
  },
  sealedBarText: { color: colors.foilSoft, textAlign: "center", fontSize: 11.5 },
});
