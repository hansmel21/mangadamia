// GATES directory — embedded as the Dungeon's GATES tab. Search-as-you-type,
// POPULAR/NEW ordering, your joined gates on top, and the OPEN A GATE key.
// Visibility: ⛩ open · SEALED (view all, authorized posters only) · HIDDEN
// (invisible to outsiders — shows masked in name search only).
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Plus, Search, Users } from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { api, type GateSummary } from "../api";
import { GuildEmblem } from "./GuildCrest";
import { rankColors } from "../ranks";
import { colors, fonts } from "../theme";

function openGate(id: string) {
  router.push({ pathname: "/gate/[id]", params: { id } });
}

export function GateDirectory({ signedIn }: { signedIn: boolean }) {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [sort, setSort] = useState<"popular" | "new">("popular");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const gates = useQuery({
    queryKey: ["gates", sort, debouncedQ],
    queryFn: () => api.gates(sort, debouncedQ || undefined),
    staleTime: 15_000,
  });
  const joined = useQuery({
    queryKey: ["gates", "joined"],
    queryFn: () => api.gates("popular", undefined, true),
    enabled: signedIn,
    staleTime: 15_000,
  });

  const joinedIds = new Set((joined.data ?? []).map((g) => g.id));
  // While searching, show one merged list; otherwise joined gates get their
  // own section and drop out of the general listing.
  const searching = debouncedQ.length > 0;
  const listed = searching
    ? (gates.data ?? [])
    : (gates.data ?? []).filter((g) => !joinedIds.has(g.id));

  return (
    <View style={styles.wrap}>
      <FlatList
        data={listed}
        keyExtractor={(g) => g.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 110 }}
        ListHeaderComponent={
          <View>
            <View style={styles.searchRow}>
              <Search color={colors.muted} size={15} strokeWidth={2} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search gates"
                placeholderTextColor={colors.muted}
                value={q}
                onChangeText={setQ}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {!searching && signedIn && (joined.data?.length ?? 0) > 0 ? (
              <>
                <Text style={styles.sectionLabel}>YOUR GATES</Text>
                {(joined.data ?? []).map((g) => (
                  <GateRow key={g.id} gate={g} />
                ))}
              </>
            ) : null}

            <View style={styles.sortRow}>
              <Text style={styles.sectionLabelInline}>
                {searching ? "RESULTS" : "ALL GATES"}
              </Text>
              <View style={styles.sortKeys}>
                {(["popular", "new"] as const).map((s) => (
                  <Pressable
                    key={s}
                    style={[styles.sortKey, sort === s && styles.sortKeyOn]}
                    onPress={() => setSort(s)}
                  >
                    <Text style={[styles.sortKeyText, sort === s && { color: colors.accentSoft }]}>
                      {s.toUpperCase()}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        }
        renderItem={({ item }) => <GateRow gate={item} />}
        ListEmptyComponent={
          gates.isLoading ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
          ) : (
            <Text style={styles.empty}>
              {searching
                ? "No gates match that name."
                : "No gates are open yet.\nBe the first to open one."}
            </Text>
          )
        }
      />

      {signedIn ? (
        <Pressable style={styles.fab} onPress={() => router.push("/gate/create")}>
          <Plus color={colors.accentText} size={20} strokeWidth={2.6} />
          <Text style={styles.fabText}>OPEN A GATE</Text>
        </Pressable>
      ) : (
        <View style={styles.signedOut}>
          <Text style={styles.signedOutText}>Sign in from the Status tab to enter gates.</Text>
        </View>
      )}
    </View>
  );
}

export function GateVisibilityBadge({ visibility }: { visibility: string }) {
  if (visibility === "restricted") return <Text style={styles.sealedChip}>SEALED</Text>;
  if (visibility === "private") return <Text style={styles.hiddenChip}>HIDDEN</Text>;
  return null;
}

// Weekly-activity rank sigil (E→S) — the hotter the gate, the higher the letter.
export function GateRankSigil({ rank, size = 16 }: { rank: keyof typeof rankColors; size?: number }) {
  const color = rankColors[rank];
  return (
    <View
      style={[
        styles.rankSigil,
        {
          width: size,
          height: size,
          borderRadius: size * 0.28,
          borderColor: color,
          backgroundColor: color + "1A",
        },
      ]}
    >
      <Text style={{ color, fontSize: size * 0.62, fontWeight: "900" }}>{rank}</Text>
    </View>
  );
}

function GateRow({ gate }: { gate: GateSummary }) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        gate.myRole && styles.rowMine,
        pressed && { opacity: 0.9 },
      ]}
      onPress={() => openGate(gate.id)}
    >
      {gate.masked ? (
        <View style={styles.maskedEmblem}>
          <Text style={styles.maskedEmblemText}>?</Text>
        </View>
      ) : (
        <GuildEmblem
          emblemKey={gate.emblemKey ?? "crest"}
          primaryColor={gate.primaryColor ?? colors.accent}
          secondaryColor={gate.secondaryColor}
          size={40}
        />
      )}
      <View style={styles.rowBody}>
        <View style={styles.rowNameLine}>
          {gate.rank ? <GateRankSigil rank={gate.rank} /> : null}
          <Text style={styles.rowName} numberOfLines={1}>
            ⛩ {gate.name}
          </Text>
          <GateVisibilityBadge visibility={gate.visibility} />
          {gate.myRole === "gatekeeper" ? (
            <Text style={styles.roleChip}>GATEKEEPER</Text>
          ) : gate.myRole === "warden" ? (
            <Text style={styles.roleChip}>WARDEN</Text>
          ) : null}
        </View>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {gate.masked
            ? "A hidden gate. Request entry to see inside."
            : gate.description || `${gate.memberCount} raiders inside`}
        </Text>
      </View>
      <View style={styles.rowStats}>
        <View style={styles.rowMembers}>
          <Users color={colors.muted} size={11} strokeWidth={2} />
          <Text style={styles.rowMembersText}>{gate.memberCount}</Text>
        </View>
        {gate.hasRequested ? <Text style={styles.requestedText}>REQUESTED</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
  },
  searchInput: { flex: 1, color: colors.text, paddingVertical: 9, fontSize: 14 },
  sectionLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.6,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 6,
  },
  sectionLabelInline: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.6,
  },
  sortRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 6,
  },
  sortKeys: { flexDirection: "row", gap: 6 },
  sortKey: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  sortKeyOn: { borderColor: colors.accentLine, backgroundColor: colors.accentGhost },
  sortKeyText: { color: colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 12,
    borderRadius: 4,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowMine: { borderColor: "rgba(107,94,204,0.5)" },
  maskedEmblem: {
    width: 40,
    height: 40,
    borderRadius: 11,
    borderWidth: 1.2,
    borderColor: colors.border,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  maskedEmblemText: { color: colors.muted, fontFamily: fonts.display, fontSize: 18 },
  rowBody: { flex: 1, gap: 2 },
  rankSigil: { alignItems: "center", justifyContent: "center", borderWidth: 1.2 },
  rowNameLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  rowName: { color: colors.text, fontSize: 14.5, fontWeight: "800", flexShrink: 1 },
  rowMeta: { color: colors.muted, fontSize: 12 },
  rowStats: { alignItems: "flex-end", gap: 4 },
  rowMembers: { flexDirection: "row", alignItems: "center", gap: 3 },
  rowMembersText: { color: colors.muted, fontSize: 11, fontVariant: ["tabular-nums"] },
  requestedText: { color: colors.foilSoft, fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  sealedChip: {
    color: colors.foilSoft,
    fontSize: 7.5,
    fontWeight: "900",
    letterSpacing: 0.8,
    borderWidth: 1,
    borderColor: "rgba(205,164,94,0.5)",
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  hiddenChip: {
    color: colors.muted,
    fontSize: 7.5,
    fontWeight: "900",
    letterSpacing: 0.8,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  roleChip: {
    color: colors.accentSoft,
    fontSize: 7.5,
    fontWeight: "900",
    letterSpacing: 0.8,
    borderWidth: 1,
    borderColor: "rgba(107,94,204,0.5)",
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  empty: { color: colors.muted, textAlign: "center", marginTop: 50, lineHeight: 22 },
  fab: {
    position: "absolute",
    right: 16,
    bottom: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.accent,
    borderRadius: 26,
    paddingHorizontal: 18,
    paddingVertical: 13,
    shadowColor: colors.accent,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 10,
  },
  fabText: { color: colors.accentText, fontWeight: "900", fontSize: 12, letterSpacing: 1 },
  signedOut: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: 14,
  },
  signedOutText: { color: colors.muted, textAlign: "center", fontSize: 13 },
});
