// Open a Gate: name, description, emblem + color (shared curated catalog),
// and the visibility tier — OPEN / SEALED (authorized posters) / HIDDEN
// (invisible, entry by request).
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
import { api, type GateVisibility } from "../../src/api";
import {
  GUILD_COLORS,
  GUILD_EMBLEMS,
  GuildEmblem,
} from "../../src/components/GuildCrest";
import { colors, fonts } from "../../src/theme";

const VISIBILITIES: { key: GateVisibility; label: string; hint: string }[] = [
  {
    key: "open",
    label: "OPEN GATE",
    hint: "Anyone can look inside, enter, and post.",
  },
  {
    key: "restricted",
    label: "SEALED GATE",
    hint: "Anyone can look inside and enter — only raiders you authorize can post.",
  },
  {
    key: "private",
    label: "HIDDEN GATE",
    hint: "Invisible to outsiders. Readers request entry; wardens approve.",
  },
];

export default function CreateGateScreen() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [emblemKey, setEmblemKey] = useState<string>(GUILD_EMBLEMS[0]);
  const [primaryColor, setPrimaryColor] = useState(GUILD_COLORS[0]);
  const [visibility, setVisibility] = useState<GateVisibility>("open");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = name.trim().length >= 3;

  const submit = async () => {
    setError("");
    setBusy(true);
    try {
      const res = await api.createGate({
        name: name.trim(),
        description: description.trim() || null,
        emblemKey,
        primaryColor,
        visibility,
      });
      await queryClient.invalidateQueries({ queryKey: ["gates"] });
      await queryClient.invalidateQueries({ queryKey: ["myGates"] });
      router.replace({ pathname: "/gate/[id]", params: { id: res.id } });
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
      <Stack.Screen options={{ title: "Open a Gate" }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.preview}>
          <GuildEmblem emblemKey={emblemKey} primaryColor={primaryColor} size={84} />
          <Text style={styles.previewName}>⛩ {name.trim() || "Gate name"}</Text>
        </View>

        <Text style={styles.label}>NAME</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Solo Leveling Theorycraft"
          placeholderTextColor={colors.muted}
          maxLength={30}
        />

        <Text style={styles.label}>DESCRIPTION · OPTIONAL</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={description}
          onChangeText={setDescription}
          placeholder="What happens inside this gate?"
          placeholderTextColor={colors.muted}
          maxLength={500}
          multiline
        />

        <Text style={styles.label}>VISIBILITY</Text>
        {VISIBILITIES.map((v) => (
          <Pressable
            key={v.key}
            style={[styles.visRow, visibility === v.key && styles.visRowOn]}
            onPress={() => setVisibility(v.key)}
            accessibilityRole="radio"
            accessibilityState={{ selected: visibility === v.key }}
          >
            <Text style={[styles.visRadio, visibility === v.key && { color: colors.accentSoft }]}>
              {visibility === v.key ? "◆" : "◇"}
            </Text>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.visLabel, visibility === v.key && { color: colors.accentSoft }]}>
                {v.label}
              </Text>
              <Text style={styles.visHint}>{v.hint}</Text>
            </View>
          </Pressable>
        ))}

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

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={[styles.submit, (!canSubmit || busy) && { opacity: 0.4 }]}
          disabled={!canSubmit || busy}
          onPress={submit}
        >
          {busy ? (
            <ActivityIndicator color={colors.accentSoft} />
          ) : (
            <Text style={styles.submitText}>OPEN GATE</Text>
          )}
        </Pressable>
        <Text style={styles.hint}>
          You'll be the Gatekeeper. You can join as many gates as you like. Opening a gate
          unlocks at Hunter LV 5.
        </Text>
        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 8 },
  preview: { alignItems: "center", gap: 10, paddingVertical: 12 },
  previewName: { color: colors.text, fontFamily: fonts.display, fontSize: 20 },
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
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
  },
  multiline: { minHeight: 72, textAlignVertical: "top" },
  visRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    marginTop: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    backgroundColor: colors.card,
  },
  visRowOn: { borderColor: colors.accentLine, backgroundColor: colors.accentGhost },
  visRadio: { color: colors.muted, fontSize: 13, marginTop: 1 },
  visLabel: { color: colors.text, fontSize: 12, fontWeight: "900", letterSpacing: 1.1 },
  visHint: { color: colors.muted, fontSize: 11.5, lineHeight: 16 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4 },
  emblemCell: {
    padding: 8,
    borderRadius: 4,
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
    borderRadius: 4,
    paddingVertical: 14,
    alignItems: "center",
  },
  submitText: { color: colors.accentSoft, fontWeight: "900", fontSize: 13, letterSpacing: 1.6 },
  hint: { color: colors.muted, fontSize: 11, textAlign: "center", marginTop: 10 },
});
