// ARENA — the scheduled weekly layer on top of Dungeons (System Protocol §7,
// ARENA_PLAN.md phase 1). Live quiz card → quiz runner, prediction pools with
// one-tap stakes, the weekly EXP board (podium + your pinned rank), and past
// results. Week + countdown mirror the server's Monday-anchored UTC weeks.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePulseGlow } from "../../src/anim";
import {
  api,
  type ArenaEventSummary,
  type ArenaPollDetail,
  type PublicIdentity,
} from "../../src/api";
import { showExpGain } from "../../src/components/ExpToast";
import { HunterAvatar } from "../../src/components/HunterAvatar";
import { ScreenTitle, SystemKey } from "../../src/components/SystemUI";
import { getSessionUser, subscribeSession } from "../../src/session";
import { colors, fonts } from "../../src/theme";

function endsIn(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "NOW";
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  return d > 0 ? `${d}D ${h}H` : `${h}H ${Math.floor((ms % 3_600_000) / 60_000)}M`;
}

export default function ArenaScreen() {
  const insets = useSafeAreaInsets();
  const user = useSyncExternalStore(subscribeSession, getSessionUser);
  const hub = useQuery({ queryKey: ["arenaEvents"], queryFn: api.arenaEvents, staleTime: 60_000 });
  const board = useQuery({ queryKey: ["weeklyBoard"], queryFn: api.weeklyBoard, staleTime: 60_000 });

  const events = hub.data?.events ?? [];
  const liveQuiz = events.find((e) => e.kind === "quiz" && e.status === "live");
  const livePolls = events.filter((e) => e.kind === "poll" && e.status === "live");
  const past = events.filter((e) => e.status === "ended");

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable hitSlop={10} onPress={() => router.back()} accessibilityLabel="Back">
          <ArrowLeft color={colors.text} size={22} strokeWidth={2} />
        </Pressable>
        <ScreenTitle tone="foil">ARENA</ScreenTitle>
        {hub.data ? (
          <Text style={styles.weekLabel}>
            WEEK {hub.data.weekNo} · ENDS {endsIn(hub.data.weekEndsAt)}
          </Text>
        ) : null}
      </View>

      {hub.isLoading ? (
        <ActivityIndicator color={colors.foil} style={{ marginTop: 48 }} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.body}
          refreshControl={
            <RefreshControl
              refreshing={hub.isRefetching || board.isRefetching}
              onRefresh={() => {
                void hub.refetch();
                void board.refetch();
              }}
              tintColor={colors.muted}
            />
          }
        >
          {/* live quiz hero */}
          {liveQuiz ? (
            <QuizCard quiz={liveQuiz} signedIn={!!user} />
          ) : (
            <View style={styles.quiet}>
              <Text style={styles.quietText}>
                No live quiz this week — check back when the next gate opens.
              </Text>
            </View>
          )}

          {/* prediction pools */}
          {livePolls.map((poll) => (
            <PoolCard key={poll.id} summary={poll} signedIn={!!user} />
          ))}

          {/* weekly EXP board */}
          <View style={styles.boardBox}>
            <Text style={styles.sectionLabel}>WEEKLY EXP BOARD</Text>
            {board.isLoading ? (
              <ActivityIndicator color={colors.accent} style={{ marginVertical: 16 }} />
            ) : (board.data?.rows.length ?? 0) === 0 ? (
              <Text style={[styles.quietText, { marginTop: 10 }]}>
                The board is empty — this week's XP starts counting now.
              </Text>
            ) : (
              <>
                <Podium rows={board.data!.rows} />
                {board.data!.rows.slice(3).map((row) => (
                  <View key={row.rank} style={styles.boardRow}>
                    <Text style={styles.boardRank}>#{row.rank}</Text>
                    {row.identity ? (
                      <HunterAvatar identity={row.identity} size={26} showRank={false} />
                    ) : null}
                    <Text style={styles.boardName} numberOfLines={1}>
                      {row.identity?.username ?? "Removed Reader"}
                    </Text>
                    <Text style={styles.boardXp}>{row.xp.toLocaleString()} XP</Text>
                  </View>
                ))}
                {board.data!.me ? (
                  <View style={styles.meRow}>
                    <Text style={styles.meRank}>#{board.data!.me.rank}</Text>
                    <Text style={styles.meName}>you</Text>
                    <Text style={styles.meXp}>
                      {board.data!.me.xp.toLocaleString()} XP this week
                    </Text>
                  </View>
                ) : user ? (
                  <Text style={styles.meHint}>Earn XP this week to take a rank.</Text>
                ) : null}
              </>
            )}
          </View>

          {/* past results */}
          {past.length > 0 ? (
            <View style={styles.pastBox}>
              <Text style={styles.sectionLabel}>PAST RESULTS</Text>
              {past.map((event) => (
                <Pressable
                  key={event.id}
                  style={styles.pastRow}
                  onPress={() =>
                    event.kind === "quiz"
                      ? router.push({ pathname: "/arena/[id]", params: { id: event.id } })
                      : undefined
                  }
                >
                  <Text style={styles.pastKind}>{event.kind.toUpperCase()}</Text>
                  <Text style={styles.pastTitle} numberOfLines={1}>
                    {event.title}
                  </Text>
                  <Text style={styles.pastMeta}>
                    {event.entered && event.myScore != null
                      ? `SCORE ${event.myScore}`
                      : `${event.entryCount} entries`}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

// The featured live quiz — LIVE pulse chip, entries count, ENTER key.
function QuizCard({ quiz, signedIn }: { quiz: ArenaEventSummary; signedIn: boolean }) {
  const pulse = usePulseGlow(1600);
  return (
    <View style={styles.quizCard}>
      <View style={[styles.quizTick, styles.quizTickTL]} pointerEvents="none" />
      <View style={[styles.quizTick, styles.quizTickTR]} pointerEvents="none" />
      <View style={[styles.quizTick, styles.quizTickBL]} pointerEvents="none" />
      <View style={[styles.quizTick, styles.quizTickBR]} pointerEvents="none" />
      <View style={styles.quizHead}>
        <View style={styles.liveChip}>
          <Animated.View style={[styles.liveDot, pulse]} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
        <Text style={styles.quizEyebrow}>WEEKLY QUIZ</Text>
        <Text style={styles.quizEntries}>
          {quiz.entryCount} {quiz.entryCount === 1 ? "entry" : "entries"}
        </Text>
      </View>
      <Text style={styles.quizTitle}>{quiz.title}</Text>
      {quiz.description ? <Text style={styles.quizDesc}>{quiz.description}</Text> : null}
      <View style={styles.quizKeys}>
        {quiz.entered ? (
          <SystemKey
            label={`ENTERED — SCORE ${quiz.myScore ?? 0}`}
            variant="outline"
            tone="foil"
            arrow={false}
            onPress={() => router.push({ pathname: "/arena/[id]", params: { id: quiz.id } })}
            style={styles.grow}
          />
        ) : (
          <SystemKey
            label="ENTER QUIZ"
            disabled={!signedIn}
            onPress={() => router.push({ pathname: "/arena/[id]", params: { id: quiz.id } })}
            style={styles.grow}
          />
        )}
      </View>
      {!signedIn ? (
        <Text style={styles.signInHint}>Sign in from the Status tab to enter.</Text>
      ) : null}
    </View>
  );
}

// A prediction pool — one-tap stake, live percentages, majority payout.
function PoolCard({ summary, signedIn }: { summary: ArenaEventSummary; signedIn: boolean }) {
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: ["arenaEvent", summary.id],
    queryFn: () => api.arenaEvent(summary.id),
  });
  const poll = detail.data?.kind === "poll" ? (detail.data as ArenaPollDetail) : null;

  const vote = async (option: number) => {
    if (!signedIn) return;
    try {
      const res = await api.arenaPollVote(summary.id, option);
      if (res.xpAwarded > 0) showExpGain(res.xpAwarded);
      await queryClient.invalidateQueries({ queryKey: ["arenaEvent", summary.id] });
      await queryClient.invalidateQueries({ queryKey: ["arenaEvents"] });
    } catch {
      /* ignore */
    }
  };

  return (
    <View style={styles.poolBox}>
      <View style={styles.poolHead}>
        <Text style={styles.sectionLabel}>PREDICTION POOL</Text>
        <Text style={styles.poolMeta}>
          closes {endsIn(summary.endsAt)} · {poll?.totalVotes ?? summary.entryCount} votes
        </Text>
      </View>
      <Text style={styles.poolTitle}>{summary.title}</Text>
      {poll ? (
        <View style={styles.poolOptions}>
          {poll.options.map((option, i) => {
            const total = Math.max(1, poll.totalVotes);
            const pct = Math.round(((poll.votes[i] ?? 0) / total) * 100);
            const mine = poll.myVote === i;
            return (
              <Pressable
                key={i}
                style={({ pressed }) => [
                  styles.poolOption,
                  mine && styles.poolOptionMine,
                  pressed && { opacity: 0.8 },
                ]}
                onPress={() => vote(i)}
                disabled={!signedIn}
              >
                <Text style={[styles.poolOptionText, mine && { color: colors.fresh }]}>
                  {mine ? "✓ " : ""}
                  {option}
                  {poll.totalVotes > 0 ? ` · ${pct}%` : ""}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <ActivityIndicator color={colors.accent} style={{ marginVertical: 10 }} />
      )}
      <Text style={styles.poolHint}>majority side takes +20 XP at close</Text>
    </View>
  );
}

type BoardRow = { rank: number; xp: number; identity: PublicIdentity | null };

// Top three on pedestals — champion centered with the crown.
function Podium({ rows }: { rows: BoardRow[] }) {
  const [first, second, third] = rows;
  return (
    <View style={styles.podium}>
      <Pedestal row={second} height={34} tone="#C7CDD8" />
      <Pedestal row={first} height={50} tone={colors.foil} crown />
      <Pedestal row={third} height={26} tone="#d0a06a" />
    </View>
  );
}

function Pedestal({
  row,
  height,
  tone,
  crown,
}: {
  row?: BoardRow;
  height: number;
  tone: string;
  crown?: boolean;
}) {
  if (!row) return <View style={styles.pedestalWrap} />;
  return (
    <View style={styles.pedestalWrap}>
      {crown ? <Text style={styles.crown}>♛</Text> : null}
      {row.identity ? (
        <HunterAvatar identity={row.identity} size={crown ? 46 : 40} showRank={false} />
      ) : null}
      <Text style={styles.pedestalName} numberOfLines={1}>
        {row.identity?.username ?? "?"}
      </Text>
      <View
        style={[
          styles.pedestal,
          { height, borderColor: tone + "70", backgroundColor: tone + "22" },
        ]}
      >
        <Text style={[styles.pedestalRank, { color: tone }]}>{row.rank}</Text>
      </View>
      <Text style={styles.pedestalXp}>{row.xp.toLocaleString()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  weekLabel: {
    marginLeft: "auto",
    color: colors.muted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  body: { padding: 16, gap: 12, paddingBottom: 48 },
  sectionLabel: { color: colors.muted, fontSize: 9.5, fontWeight: "900", letterSpacing: 1.6 },
  quiet: {
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
    borderRadius: 4,
    padding: 14,
  },
  quietText: { color: colors.muted, fontSize: 12, lineHeight: 17 },

  quizCard: {
    position: "relative",
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: "rgba(124,92,255,0.6)",
    borderRadius: 4,
    padding: 15,
    shadowColor: colors.accent,
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  quizTick: { position: "absolute", width: 11, height: 11, borderColor: colors.accentBright },
  quizTickTL: { top: -2, left: -2, borderTopWidth: 2.5, borderLeftWidth: 2.5 },
  quizTickTR: { top: -2, right: -2, borderTopWidth: 2.5, borderRightWidth: 2.5 },
  quizTickBL: { bottom: -2, left: -2, borderBottomWidth: 2.5, borderLeftWidth: 2.5 },
  quizTickBR: { bottom: -2, right: -2, borderBottomWidth: 2.5, borderRightWidth: 2.5 },
  quizHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  liveChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(76,195,138,0.14)",
    borderWidth: 1,
    borderColor: "rgba(76,195,138,0.5)",
    borderRadius: 3,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.fresh },
  liveText: { color: colors.fresh, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  quizEyebrow: { color: colors.muted, fontSize: 9.5, fontWeight: "900", letterSpacing: 1.6 },
  quizEntries: { marginLeft: "auto", color: colors.muted, fontSize: 10 },
  quizTitle: {
    color: colors.text,
    fontFamily: fonts.display,
    fontSize: 20,
    lineHeight: 25,
    marginTop: 10,
  },
  quizDesc: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 6 },
  quizKeys: { flexDirection: "row", gap: 8, marginTop: 14 },
  grow: { flex: 1 },
  signInHint: { color: colors.muted, fontSize: 10.5, textAlign: "center", marginTop: 8 },

  poolBox: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 4,
    padding: 14,
  },
  poolHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  poolMeta: { color: colors.muted, fontSize: 10 },
  poolTitle: { color: colors.text, fontSize: 14, fontWeight: "700", marginTop: 7 },
  poolOptions: { flexDirection: "row", gap: 8, marginTop: 9, flexWrap: "wrap" },
  poolOption: {
    flexGrow: 1,
    flexBasis: "45%",
    alignItems: "center",
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 3,
  },
  poolOptionMine: {
    borderWidth: 1.5,
    borderColor: "rgba(76,195,138,0.55)",
    backgroundColor: "rgba(76,195,138,0.1)",
  },
  poolOptionText: { color: colors.muted, fontSize: 11, fontWeight: "900", letterSpacing: 0.5 },
  poolHint: { color: colors.muted, fontSize: 10, marginTop: 8 },

  boardBox: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 4,
    padding: 14,
  },
  podium: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 10,
    marginTop: 12,
  },
  pedestalWrap: { alignItems: "center", gap: 4, width: 76 },
  crown: { color: colors.foilSoft, fontSize: 14 },
  pedestalName: { color: colors.text, fontSize: 10.5, fontWeight: "700", maxWidth: 74 },
  pedestal: {
    width: 64,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  pedestalRank: { fontFamily: fonts.display, fontSize: 16, fontWeight: "800" },
  pedestalXp: { color: colors.muted, fontSize: 9.5 },
  boardRow: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 10 },
  boardRank: { color: colors.muted, fontSize: 10.5, fontWeight: "900", width: 28 },
  boardName: { color: colors.text, fontSize: 12.5, fontWeight: "700", flex: 1 },
  boardXp: { color: colors.muted, fontSize: 10.5, fontVariant: ["tabular-nums"] },
  meRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    backgroundColor: colors.accentGhost,
    borderWidth: 1,
    borderColor: colors.accentLine,
    borderRadius: 3,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  meRank: { color: colors.accentBright, fontSize: 10, fontWeight: "900" },
  meName: { color: colors.text, fontSize: 11.5, fontWeight: "700" },
  meXp: { marginLeft: "auto", color: colors.muted, fontSize: 10.5 },
  meHint: { color: colors.muted, fontSize: 10.5, marginTop: 10 },

  pastBox: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 4,
    padding: 14,
  },
  pastRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  pastKind: { color: colors.muted, fontSize: 8.5, fontWeight: "900", letterSpacing: 1, width: 36 },
  pastTitle: { color: colors.mutedStrong, fontSize: 12, fontWeight: "600", flex: 1 },
  pastMeta: { color: colors.muted, fontSize: 10 },
});
