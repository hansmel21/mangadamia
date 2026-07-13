// Edit guild (officers): name, tag, emblem, color, motto, description, and
// join policy — the UI for the long-existing PATCH /guilds/:id. Emblems and
// colors stay the curated app-owned set (no uploads).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { api, type GuildJoinPolicy } from "../../../src/api";
import {
  GUILD_COLORS,
  GUILD_DECOR,
  GUILD_EMBLEMS,
  GuildEmblem,
} from "../../../src/components/GuildCrest";
import { colors, fonts } from "../../../src/theme";

const POLICIES: { key: GuildJoinPolicy; label: string; hint: string }[] = [
  { key: "open", label: "OPEN", hint: "Anyone joins instantly" },
  { key: "request", label: "REQUEST", hint: "Officers approve requests" },
  { key: "invite", label: "INVITE-ONLY", hint: "Members join by invitation" },
];

export default function EditGuildScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const guildQ = useQuery({ queryKey: ["guild", id], queryFn: () => api.guild(id), enabled: !!id });
  const guild = guildQ.data;

  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [motto, setMotto] = useState("");
  const [description, setDescription] = useState("");
  const [emblemKey, setEmblemKey] = useState<string>(GUILD_EMBLEMS[0]);
  const [primaryColor, setPrimaryColor] = useState(GUILD_COLORS[0]);
  const [joinPolicy, setJoinPolicy] = useState<GuildJoinPolicy>("open");
  const [decorationKey, setDecorationKey] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Prefill once from the loaded guild; edits after that are the user's.
  useEffect(() => {
    if (!guild || loaded) return;
    setName(guild.name);
    setTag(guild.tag);
    setMotto(guild.motto ?? "");
    setDescription(guild.description ?? "");
    setEmblemKey(guild.emblemKey);
    setPrimaryColor(guild.primaryColor);
    setJoinPolicy(guild.joinPolicy);
    setDecorationKey(guild.decorationKey);
    setLoaded(true);
  }, [guild, loaded]);

  const canManage = guild?.myRole === "guildmaster" || guild?.myRole === "officer";
  const canSubmit = name.trim().length >= 3 && /^[a-zA-Z0-9]{2,5}$/.test(tag.trim());

  const submit = async () => {
    setError("");
    setBusy(true);
    try {
      await api.updateGuild(id, {
        name: name.trim(),
        tag: tag.trim(),
        emblemKey,
        primaryColor,
        motto: motto.trim() || null,
        description: description.trim() || null,
        joinPolicy,
        decorationKey,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["guild", id] }),
        queryClient.invalidateQueries({ queryKey: ["guilds"] }),
        queryClient.invalidateQueries({ queryKey: ["myGuild"] }),
        // The crest renders next to usernames everywhere.
        queryClient.invalidateQueries({ queryKey: ["me"] }),
      ]);
      router.back();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Stack.Screen options={{ title: "Edit Guild" }} />
      {guildQ.isLoading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 48 }} />
      ) : !guild || !canManage ? (
        <Text style={styles.gate}>Only guild officers can edit the guild.</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.preview}>
            <GuildEmblem emblemKey={emblemKey} primaryColor={primaryColor} size={84} />
            <View style={styles.previewNameRow}>
              <Text style={styles.previewName}>{name.trim() || "Guild name"}</Text>
              <Text style={[styles.previewTag, { color: primaryColor }]}>
                [{tag.trim().toUpperCase() || "TAG"}]
              </Text>
            </View>
          </View>

          <Text style={styles.label}>NAME</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="The Obsidian Reapers"
            placeholderTextColor={colors.muted}
            maxLength={30}
          />

          <Text style={styles.label}>TAG · 2–5 LETTERS/NUMBERS</Text>
          <TextInput
            style={styles.input}
            value={tag}
            onChangeText={(t) => setTag(t.replace(/[^a-zA-Z0-9]/g, "").slice(0, 5))}
            placeholder="OBSD"
            placeholderTextColor={colors.muted}
            autoCapitalize="characters"
          />

          <Text style={styles.label}>EMBLEM</Text>
          <View style={styles.grid}>
            {GUILD_EMBLEMS.map((key) => (
              <Pressable
                key={key}
                style={[styles.emblemCell, emblemKey === key && styles.emblemCellOn]}
                onPress={() => setEmblemKey(key)}
              >
                <GuildEmblem emblemKey={key} primaryColor={primaryColor} size={40} />
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>COLOR</Text>
          <View style={styles.grid}>
            {GUILD_COLORS.map((c) => (
              <Pressable
                key={c}
                style={[
                  styles.swatch,
                  { backgroundColor: c },
                  primaryColor === c && styles.swatchOn,
                ]}
                onPress={() => setPrimaryColor(c)}
              />
            ))}
          </View>

          <Text style={styles.label}>HALL DECORATION · UNLOCKS BY GUILD LEVEL</Text>
          <View style={styles.grid}>
            <Pressable
              style={[styles.decorCell, decorationKey === null && styles.decorCellOn]}
              onPress={() => setDecorationKey(null)}
            >
              <Text style={styles.decorNone}>NONE</Text>
            </Pressable>
            {guild.decorations.map((d) => {
              const meta = GUILD_DECOR[d.key];
              const on = decorationKey === d.key;
              return (
                <Pressable
                  key={d.key}
                  style={[
                    styles.decorCell,
                    on && [styles.decorCellOn, meta && { borderColor: meta.color }],
                    !d.unlocked && { opacity: 0.4 },
                  ]}
                  disabled={!d.unlocked}
                  onPress={() => setDecorationKey(d.key)}
                >
                  <Text style={[styles.decorIcon, meta && { color: meta.color }]}>
                    {meta?.icon ?? "◆"}
                  </Text>
                  <Text style={styles.decorCellName}>{d.name}</Text>
                  <Text style={styles.decorCellLevel}>
                    {d.unlocked ? `LV ${d.minLevel} ✓` : `🔒 LV ${d.minLevel}`}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>JOIN POLICY</Text>
          <View style={{ gap: 8 }}>
            {POLICIES.map((p) => (
              <Pressable
                key={p.key}
                style={[styles.policyRow, joinPolicy === p.key && styles.policyRowOn]}
                onPress={() => setJoinPolicy(p.key)}
              >
                <Text
                  style={[styles.policyLabel, joinPolicy === p.key && { color: colors.accentSoft }]}
                >
                  {p.label}
                </Text>
                <Text style={styles.policyHint}>{p.hint}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>MOTTO · OPTIONAL</Text>
          <TextInput
            style={styles.input}
            value={motto}
            onChangeText={setMotto}
            placeholder="Every legend starts at the lowest rank."
            placeholderTextColor={colors.muted}
            maxLength={80}
          />

          <Text style={styles.label}>DESCRIPTION · OPTIONAL</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={description}
            onChangeText={setDescription}
            placeholder="What this guild is about, who you're recruiting…"
            placeholderTextColor={colors.muted}
            maxLength={500}
            multiline
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.submit, (!canSubmit || busy) && { opacity: 0.4 }]}
            disabled={!canSubmit || busy}
            onPress={submit}
          >
            {busy ? (
              <ActivityIndicator color={colors.accentSoft} />
            ) : (
              <Text style={styles.submitText}>SAVE CHANGES</Text>
            )}
          </Pressable>
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  gate: { color: colors.muted, textAlign: "center", marginTop: 48, paddingHorizontal: 24 },
  content: { padding: 20, gap: 8 },
  preview: { alignItems: "center", gap: 10, paddingVertical: 12 },
  previewNameRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "center" },
  previewName: { color: colors.text, fontFamily: fonts.display, fontSize: 22 },
  previewTag: { fontSize: 14, fontWeight: "900" },
  label: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.4,
    marginTop: 14,
    marginBottom: 2,
  },
  input: {
    backgroundColor: colors.card,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
  },
  multiline: { minHeight: 84, textAlignVertical: "top" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4 },
  emblemCell: {
    padding: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  emblemCellOn: { borderColor: colors.accent, backgroundColor: "rgba(107,94,204,0.12)" },
  swatch: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: "transparent" },
  swatchOn: { borderColor: colors.text },
  decorCell: {
    minWidth: 96,
    alignItems: "center",
    gap: 3,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  decorCellOn: { borderColor: colors.accent, backgroundColor: "rgba(107,94,204,0.12)" },
  decorNone: { color: colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1, paddingVertical: 12 },
  decorIcon: { fontSize: 18, fontWeight: "900" },
  decorCellName: { color: colors.text, fontSize: 10, fontWeight: "800" },
  decorCellLevel: { color: colors.muted, fontSize: 8.5, fontWeight: "900", letterSpacing: 0.5 },
  policyRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "baseline",
    gap: 10,
  },
  policyRowOn: { borderColor: "rgba(107,94,204,0.65)", backgroundColor: "rgba(107,94,204,0.08)" },
  policyLabel: { color: colors.text, fontSize: 11, fontWeight: "900", letterSpacing: 1.2 },
  policyHint: { color: colors.muted, fontSize: 12, flexShrink: 1 },
  error: { color: colors.danger, marginTop: 10 },
  submit: {
    marginTop: 20,
    backgroundColor: "rgba(107,94,204,0.18)",
    borderWidth: 1.5,
    borderColor: "rgba(107,94,204,0.65)",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  submitText: { color: colors.accentSoft, fontWeight: "900", fontSize: 13, letterSpacing: 1.6 },
});
