// The Arena — hub for weekly games, leaderboards, and community pools.
// This is a laid-out placeholder: the navigation, segmented sections, and card
// shells exist so the shape is real, but the data is stubbed "coming soon"
// until the ArenaEvent backend lands. See ARENA_PLAN.md for the full plan.
import { Swords, Trophy, Vote } from "lucide-react-native";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SystemWindow } from "../src/components/SystemWindow";
import { colors } from "../src/theme";

type Section = "games" | "leaderboards" | "pools";

const SECTIONS: { key: Section; label: string }[] = [
  { key: "games", label: "GAMES" },
  { key: "leaderboards", label: "BOARDS" },
  { key: "pools", label: "POOLS" },
];

export default function ArenaScreen() {
  const [section, setSection] = useState<Section>("games");
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <SystemWindow title="The Arena" dim>
        <Text style={styles.blurb}>
          Weekly games, rank leaderboards, and community pools. New challenges drop every week —
          earn EXP, titles, and cosmetics from the same reward system as quests.
        </Text>
      </SystemWindow>

      <View style={styles.segment}>
        {SECTIONS.map((s) => (
          <Text
            key={s.key}
            onPress={() => setSection(s.key)}
            style={[styles.segmentTab, section === s.key && styles.segmentTabActive]}
          >
            {s.label}
          </Text>
        ))}
      </View>

      {section === "games" ? <GamesSection /> : null}
      {section === "leaderboards" ? <LeaderboardsSection /> : null}
      {section === "pools" ? <PoolsSection /> : null}
    </ScrollView>
  );
}

function ComingSoon({
  icon,
  title,
  lines,
}: {
  icon: React.ReactNode;
  title: string;
  lines: string[];
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        {icon}
        <Text style={styles.cardTitle}>{title}</Text>
        <View style={styles.soonPill}>
          <Text style={styles.soonText}>SOON</Text>
        </View>
      </View>
      {lines.map((line) => (
        <View key={line} style={styles.bulletRow}>
          <Text style={styles.bulletDot}>◆</Text>
          <Text style={styles.bulletText}>{line}</Text>
        </View>
      ))}
    </View>
  );
}

function GamesSection() {
  return (
    <>
      <ComingSoon
        icon={<Swords color={colors.accentSoft} size={18} strokeWidth={2} />}
        title="Weekly Quiz"
        lines={[
          "Timed multiple-choice about a featured series.",
          "Score by correct answers, ties broken by speed.",
          "Top scorers earn EXP and a weekly title.",
        ]}
      />
      <ComingSoon
        icon={<Vote color={colors.accentSoft} size={18} strokeWidth={2} />}
        title="Draw Competition"
        lines={[
          "Submit fan art in a themed weekly prompt.",
          "Community voting window picks the winners.",
          "Winning art shows a badge on your profile.",
        ]}
      />
    </>
  );
}

function LeaderboardsSection() {
  return (
    <>
      <ComingSoon
        icon={<Trophy color={colors.foil} size={18} strokeWidth={2} />}
        title="Weekly EXP"
        lines={[
          "Ranks readers by EXP earned this week.",
          "Your own rank is pinned so you can chase it.",
          "Resets every Monday at 00:00 UTC.",
        ]}
      />
      <ComingSoon
        icon={<Trophy color={colors.foil} size={18} strokeWidth={2} />}
        title="Series Boards"
        lines={[
          "Per-series rankings for the most active readers.",
          "Comment, post, and complete chapters to climb.",
          "Frozen into a history snapshot each week.",
        ]}
      />
    </>
  );
}

function PoolsSection() {
  return (
    <ComingSoon
      icon={<Vote color={colors.accentSoft} size={18} strokeWidth={2} />}
      title="Prediction Pools"
      lines={[
        "Vote on what happens next in a hyped chapter.",
        "One tap, one vote, closes on a deadline.",
        "Closest calls split a small EXP reward.",
      ]}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 14, paddingBottom: 48 },
  blurb: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  segment: {
    flexDirection: "row",
    gap: 6,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 4,
  },
  segmentTab: {
    flex: 1,
    textAlign: "center",
    paddingVertical: 9,
    color: colors.muted,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.4,
    borderRadius: 7,
    overflow: "hidden",
  },
  segmentTabActive: { backgroundColor: "rgba(124,92,255,0.18)", color: colors.accentSoft },
  card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 15, gap: 9 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 9 },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: "900", flexShrink: 1 },
  soonPill: {
    marginLeft: "auto",
    borderWidth: 1,
    borderColor: "rgba(124,92,255,0.5)",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  soonText: { color: colors.accentSoft, fontSize: 9, fontWeight: "900", letterSpacing: 1.5 },
  bulletRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  bulletDot: { color: colors.accentSoft, fontSize: 10, lineHeight: 19 },
  bulletText: { color: colors.muted, fontSize: 13, lineHeight: 19, flexShrink: 1 },
});
