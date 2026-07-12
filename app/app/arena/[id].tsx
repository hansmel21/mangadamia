// Quiz runner — one question at a time with a countdown, answers locked on
// tap, one submission per reader. The answer key never reaches the device
// until the entry is locked, so results (✓/✗ review) render only after
// submission or once the event has ended.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, type ArenaQuizDetail } from "../../src/api";
import { showExpGain } from "../../src/components/ExpToast";
import { showLevelUp } from "../../src/components/LevelUp";
import { showQuestCompletions } from "../../src/components/QuestToast";
import { ScreenTitle, SystemKey } from "../../src/components/SystemUI";
import { colors, fonts } from "../../src/theme";

export default function QuizRunnerScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const event = useQuery({
    queryKey: ["arenaEvent", id],
    queryFn: () => api.arenaEvent(id),
    enabled: !!id,
  });
  const quiz = event.data?.kind === "quiz" ? (event.data as ArenaQuizDetail) : null;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable hitSlop={10} onPress={() => router.back()} accessibilityLabel="Back">
          <ArrowLeft color={colors.text} size={22} strokeWidth={2} />
        </Pressable>
        <ScreenTitle tone="foil" size={16}>
          WEEKLY QUIZ
        </ScreenTitle>
      </View>
      {event.isLoading ? (
        <ActivityIndicator color={colors.foil} style={{ marginTop: 48 }} />
      ) : !quiz ? (
        <Text style={styles.missing}>This event is no longer available.</Text>
      ) : quiz.entered || quiz.status === "ended" ? (
        <ResultsView quiz={quiz} />
      ) : quiz.status === "upcoming" ? (
        <Text style={styles.missing}>This quiz hasn't opened yet.</Text>
      ) : (
        <Runner
          quiz={quiz}
          onSubmitted={() => {
            void queryClient.invalidateQueries({ queryKey: ["arenaEvent", id] });
            void queryClient.invalidateQueries({ queryKey: ["arenaEvents"] });
            void queryClient.invalidateQueries({ queryKey: ["weeklyBoard"] });
          }}
        />
      )}
    </View>
  );
}

function Runner({ quiz, onSubmitted }: { quiz: ArenaQuizDetail; onSubmitted: () => void }) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [secondsLeft, setSecondsLeft] = useState(quiz.durationSec);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ score: number; total: number } | null>(null);
  const startedAt = useRef(Date.now());
  const answersRef = useRef<number[]>([]);
  const submittedRef = useRef(false);

  const submit = async (finalAnswers: number[]) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    try {
      // Unanswered questions submit as -1 (never correct).
      const padded = Array.from(
        { length: quiz.questionCount },
        (_, i) => finalAnswers[i] ?? -1,
      );
      const res = await api.arenaQuizEntry(quiz.id, padded, Date.now() - startedAt.current);
      showExpGain(res.xpAwarded);
      showQuestCompletions(res.completedQuests);
      if (res.levelUp) showLevelUp(res.levelUp);
      setResult({ score: res.score, total: res.total });
      onSubmitted();
    } catch {
      // Entry rejected (e.g. window closed) — surface via the results refetch.
      onSubmitted();
    } finally {
      setSubmitting(false);
    }
  };

  // Countdown — when it hits zero the run auto-submits what's answered.
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(timer);
          void submit(answersRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = (option: number) => {
    if (submittedRef.current) return;
    const next = [...answers];
    next[index] = option;
    setAnswers(next);
    answersRef.current = next;
    if (index + 1 >= quiz.questionCount) {
      void submit(next);
    } else {
      setIndex(index + 1);
    }
  };

  if (result) {
    return (
      <View style={styles.completeWrap}>
        <View style={styles.complete}>
          <View style={[styles.tick, styles.tickTL]} pointerEvents="none" />
          <View style={[styles.tick, styles.tickTR]} pointerEvents="none" />
          <View style={[styles.tick, styles.tickBL]} pointerEvents="none" />
          <View style={[styles.tick, styles.tickBR]} pointerEvents="none" />
          <Text style={styles.completeEyebrow}>! QUIZ COMPLETE</Text>
          <Text style={styles.completeScore}>
            {result.score} / {result.total}
          </Text>
          <Text style={styles.completeSub}>Rank pending — ties broken by speed</Text>
          <SystemKey label="BACK TO ARENA" onPress={() => router.back()} style={{ marginTop: 16 }} />
        </View>
      </View>
    );
  }
  if (submitting) {
    return <ActivityIndicator color={colors.foil} style={{ marginTop: 64 }} />;
  }

  const question = quiz.questions[index];
  const pct = (index / quiz.questionCount) * 100;
  return (
    <ScrollView contentContainerStyle={styles.runnerBody}>
      <View style={styles.progressRow}>
        <Text style={styles.progressLabel}>
          Q {index + 1} / {quiz.questionCount}
        </Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${pct}%` }]} />
        </View>
        <Text style={[styles.timer, secondsLeft <= 10 && { color: colors.danger }]}>
          {secondsLeft}s
        </Text>
      </View>
      <View style={styles.questionCard}>
        <View style={[styles.tick, styles.tickTL]} pointerEvents="none" />
        <View style={[styles.tick, styles.tickBR]} pointerEvents="none" />
        <Text style={styles.questionText}>{question.q}</Text>
      </View>
      <View style={styles.options}>
        {question.options.map((option, i) => (
          <Pressable
            key={i}
            style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
            onPress={() => pick(i)}
          >
            <Text style={styles.optionText}>{option}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.hint}>
        {quiz.durationSec}s total · one shot · ties broken by speed
      </Text>
    </ScrollView>
  );
}

// Post-entry (or post-close) review: score + per-question ✓/✗ against the key.
function ResultsView({ quiz }: { quiz: ArenaQuizDetail }) {
  return (
    <ScrollView contentContainerStyle={styles.runnerBody}>
      <View style={styles.complete}>
        <View style={[styles.tick, styles.tickTL]} pointerEvents="none" />
        <View style={[styles.tick, styles.tickTR]} pointerEvents="none" />
        <View style={[styles.tick, styles.tickBL]} pointerEvents="none" />
        <View style={[styles.tick, styles.tickBR]} pointerEvents="none" />
        <Text style={styles.completeEyebrow}>
          {quiz.entered ? "! YOUR RUN" : "! QUIZ CLOSED"}
        </Text>
        {quiz.entered ? (
          <Text style={styles.completeScore}>
            {quiz.myScore ?? 0} / {quiz.questionCount}
          </Text>
        ) : (
          <Text style={styles.completeSub}>You didn't enter this one.</Text>
        )}
        <Text style={styles.completeSub}>
          {quiz.entryCount} {quiz.entryCount === 1 ? "hunter" : "hunters"} entered
        </Text>
      </View>
      {quiz.answers
        ? quiz.questions.map((question, i) => {
            const mine = quiz.myAnswers?.[i];
            const correct = quiz.answers![i];
            const right = mine === correct;
            return (
              <View key={i} style={styles.reviewCard}>
                <Text style={styles.reviewQ}>
                  {i + 1}. {question.q}
                </Text>
                <Text style={[styles.reviewA, { color: colors.fresh }]}>
                  ✓ {question.options[correct]}
                </Text>
                {quiz.entered && mine != null && mine >= 0 && !right ? (
                  <Text style={[styles.reviewA, { color: colors.danger }]}>
                    ✗ you picked: {question.options[mine] ?? "—"}
                  </Text>
                ) : null}
              </View>
            );
          })
        : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  missing: { color: colors.muted, textAlign: "center", marginTop: 60, lineHeight: 22 },
  runnerBody: { padding: 16, paddingBottom: 48 },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  progressLabel: { color: colors.accentBright, fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
  progressTrack: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.card,
    overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: colors.accent },
  timer: {
    color: colors.foilSoft,
    fontSize: 11,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
    width: 34,
    textAlign: "right",
  },
  questionCard: {
    position: "relative",
    marginTop: 14,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: "rgba(124,92,255,0.5)",
    borderRadius: 4,
    paddingVertical: 18,
    paddingHorizontal: 16,
  },
  tick: { position: "absolute", width: 9, height: 9, borderColor: colors.accentBright },
  tickTL: { top: -2, left: -2, borderTopWidth: 2, borderLeftWidth: 2 },
  tickTR: { top: -2, right: -2, borderTopWidth: 2, borderRightWidth: 2 },
  tickBL: { bottom: -2, left: -2, borderBottomWidth: 2, borderLeftWidth: 2 },
  tickBR: { bottom: -2, right: -2, borderBottomWidth: 2, borderRightWidth: 2 },
  questionText: {
    color: colors.text,
    fontFamily: fonts.display,
    fontSize: 19,
    lineHeight: 24,
  },
  options: { marginTop: 12, gap: 8 },
  option: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 3,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  optionPressed: {
    borderColor: "rgba(124,92,255,0.7)",
    backgroundColor: colors.accentGhost,
    transform: [{ scale: 0.98 }],
  },
  optionText: { color: colors.text, fontSize: 13.5, fontWeight: "700" },
  hint: { color: colors.muted, fontSize: 10, textAlign: "center", marginTop: 14 },
  completeWrap: { flex: 1, justifyContent: "center", padding: 24 },
  complete: {
    position: "relative",
    backgroundColor: "rgba(13,15,20,0.97)",
    borderWidth: 1.5,
    borderColor: "rgba(245,184,76,0.6)",
    borderRadius: 4,
    padding: 24,
    alignItems: "center",
    shadowColor: colors.foil,
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
    marginBottom: 12,
  },
  completeEyebrow: { color: colors.foilSoft, fontSize: 10, fontWeight: "900", letterSpacing: 2.5 },
  completeScore: {
    color: colors.text,
    fontFamily: fonts.display,
    fontSize: 34,
    marginTop: 10,
  },
  completeSub: { color: colors.muted, fontSize: 12, marginTop: 6, textAlign: "center" },
  reviewCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 3,
    padding: 12,
    marginTop: 8,
  },
  reviewQ: { color: colors.text, fontSize: 12.5, fontWeight: "700", lineHeight: 17 },
  reviewA: { fontSize: 11.5, marginTop: 5, fontWeight: "600" },
});
