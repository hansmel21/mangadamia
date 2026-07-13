// Found a guild: pick a name, tag, emblem, and colors. Emblems + colors are a
// curated app-owned set (no uploads).
import { useQueryClient } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import { useState } from "react";
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
import { api } from "../../src/api";
import {
  GUILD_COLORS,
  GUILD_EMBLEMS,
  GuildEmblem,
} from "../../src/components/GuildCrest";
import { colors, fonts } from "../../src/theme";

export default function CreateGuildScreen() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [motto, setMotto] = useState("");
  const [emblemKey, setEmblemKey] = useState<string>(GUILD_EMBLEMS[0]);
  const [primaryColor, setPrimaryColor] = useState(GUILD_COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = name.trim().length >= 3 && /^[a-zA-Z0-9]{2,5}$/.test(tag.trim());

  const submit = async () => {
    setError("");
    setBusy(true);
    try {
      const res = await api.createGuild({
        name: name.trim(),
        tag: tag.trim(),
        emblemKey,
        primaryColor,
        motto: motto.trim() || null,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["myGuild"] }),
        queryClient.invalidateQueries({ queryKey: ["guilds"] }),
        queryClient.invalidateQueries({ queryKey: ["me"] }),
      ]);
      router.replace({ pathname: "/guild/[id]", params: { id: res.id } });
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
      <Stack.Screen options={{ title: "Found a Guild" }} />
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

        <Text style={styles.label}>MOTTO · OPTIONAL</Text>
        <TextInput
          style={styles.input}
          value={motto}
          onChangeText={setMotto}
          placeholder="Every legend starts at the lowest rank."
          placeholderTextColor={colors.muted}
          maxLength={80}
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
            <Text style={styles.submitText}>FOUND GUILD</Text>
          )}
        </Pressable>
        <Text style={styles.hint}>You'll be the Guildmaster. You can leave to disband it.</Text>
        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
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
  hint: { color: colors.muted, fontSize: 11, textAlign: "center", marginTop: 10 },
});
