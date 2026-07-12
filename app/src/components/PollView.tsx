// Poll options for a poll record. Before you vote, options are plain tappable
// buttons; once you (or anyone) has voted, each option shows a result bar with
// its share, and your pick is highlighted. Tap another option to change it.
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { PollInfo } from "../api";
import { colors } from "../theme";

export function PollView({
  poll,
  onVote,
  disabled,
}: {
  poll: PollInfo;
  onVote: (optionId: string) => void;
  disabled?: boolean;
}) {
  const voted = poll.myVote != null || poll.totalVotes > 0;
  return (
    <View style={styles.wrap}>
      {poll.options.map((o) => {
        const pct = poll.totalVotes > 0 ? Math.round((o.votes / poll.totalVotes) * 100) : 0;
        const mine = poll.myVote === o.id;
        return (
          <Pressable
            key={o.id}
            style={({ pressed }) => [styles.option, pressed && !disabled && styles.optionPressed]}
            onPress={() => !disabled && onVote(o.id)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={`Vote ${o.text}`}
          >
            {voted ? (
              <View style={[styles.fill, mine && styles.fillMine, { width: `${pct}%` }]} />
            ) : null}
            <View style={styles.optionRow}>
              <Text style={[styles.optionText, mine && styles.optionTextMine]} numberOfLines={2}>
                {mine ? "✓ " : ""}
                {o.text}
              </Text>
              {voted ? (
                <Text style={[styles.pct, mine && styles.optionTextMine]}>{pct}%</Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}
      <Text style={styles.total}>
        {poll.totalVotes} {poll.totalVotes === 1 ? "vote" : "votes"}
        {poll.myVote != null ? " · tap to change" : disabled ? "" : " · tap an option"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 12, gap: 8 },
  option: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: colors.bg,
    justifyContent: "center",
    minHeight: 42,
  },
  optionPressed: { borderColor: "rgba(124,92,255,0.6)" },
  fill: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(124,92,255,0.2)",
  },
  fillMine: { backgroundColor: "rgba(76,195,138,0.22)" },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 8,
  },
  optionText: { color: colors.text, fontSize: 14, fontWeight: "700", flexShrink: 1 },
  optionTextMine: { color: colors.fresh },
  pct: { color: colors.muted, fontSize: 12.5, fontWeight: "800", fontVariant: ["tabular-nums"] },
  total: { color: colors.muted, fontSize: 11 },
});
