import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import type { QuestCompletion } from "../api";
import { colors } from "../theme";
import { SystemWindow } from "./SystemWindow";

let deliver: ((quests: QuestCompletion[]) => void) | null = null;

export function showQuestCompletions(quests?: QuestCompletion[]) {
  if (quests?.length) deliver?.(quests);
}

export function QuestToastHost() {
  const [quest, setQuest] = useState<QuestCompletion | null>(null);
  const queue = useRef<QuestCompletion[]>([]);
  const y = useRef(new Animated.Value(-150)).current;

  useEffect(() => {
    deliver = (quests) => {
      queue.current.push(...quests);
      setQuest((current) => current ?? queue.current.shift() ?? null);
    };
    return () => {
      deliver = null;
    };
  }, []);

  useEffect(() => {
    if (!quest) return;
    y.setValue(-150);
    Animated.sequence([
      Animated.spring(y, { toValue: 0, useNativeDriver: true, damping: 14 }),
      Animated.delay(2800),
      Animated.timing(y, { toValue: -150, duration: 240, useNativeDriver: true }),
    ]).start(() => setQuest(queue.current.shift() ?? null));
  }, [quest, y]);

  if (!quest) return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.host, { transform: [{ translateY: y }] }]}>
      <SystemWindow title="Quest Complete" compact translucent>
        <Text style={styles.name}>{quest.name}</Text>
        <Text style={styles.rewards}>{quest.rewards.map((reward) => reward.name).join(" · ")}</Text>
      </SystemWindow>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: { position: "absolute", top: 52, left: 18, right: 18, zIndex: 1000 },
  name: { color: colors.foil, fontSize: 15, fontWeight: "900" },
  rewards: { color: colors.text, fontSize: 12, marginTop: 4 },
});
