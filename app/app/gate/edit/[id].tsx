// Gate settings — the first client UI for PATCH /gates/:id. Wardens with the
// edit_info permission edit description/emblem/color; the gatekeeper also
// renames, changes visibility, and flips the WARDEN PERMISSIONS switches.
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
import { api, type GatePermKey, type GateVisibility } from "../../../src/api";
import {
  GUILD_COLORS,
  GUILD_EMBLEMS,
  GuildEmblem,
} from "../../../src/components/GuildCrest";
import { colors, fonts } from "../../../src/theme";

const VISIBILITIES: { key: GateVisibility; label: string; hint: string }[] = [
  { key: "open", label: "OPEN GATE", hint: "Anyone can look inside, enter, and post" },
  { key: "restricted", label: "SEALED GATE", hint: "Anyone enters; only authorized raiders post" },
  { key: "private", label: "HIDDEN GATE", hint: "Invisible; entry by request" },
];

const WARDEN_PERMS: { key: GatePermKey; label: string; hint: string }[] = [
  { key: "entry_requests", label: "Answer entry requests", hint: "Admit or deny hidden-gate requests" },
  { key: "authorize_posters", label: "Authorize posters", hint: "Grant posting rights in a sealed gate" },
  { key: "kick", label: "Kick raiders", hint: "Remove members (wardens stay GK-only)" },
  { key: "edit_info", label: "Edit gate info", hint: "Description, emblem, colors" },
  { key: "pin", label: "Pin records", hint: "Pin and unpin in the gate feed" },
  { key: "remove_posts", label: "Remove records", hint: "Take down posts inside the gate" },
];

export default function EditGateScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const gateId = String(id);
  const queryClient = useQueryClient();
  const gateQ = useQuery({
    queryKey: ["gate", gateId],
    queryFn: () => api.gate(gateId),
    enabled: !!gateId,
  });
  const gate = gateQ.data;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [emblemKey, setEmblemKey] = useState<string>(GUILD_EMBLEMS[0]);
  const [primaryColor, setPrimaryColor] = useState(GUILD_COLORS[0]);
  const [visibility, setVisibility] = useState<GateVisibility>("open");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [wardenPerms, setWardenPerms] = useState<Record<GatePermKey, boolean> | null>(null);
  const [permBusy, setPermBusy] = useState(false);

  useEffect(() => {
    if (!gate || gate.masked || loaded) return;
    setName(gate.name);
    setDescription(gate.description ?? "");
    setEmblemKey(gate.emblemKey ?? GUILD_EMBLEMS[0]);
    setPrimaryColor(gate.primaryColor ?? GUILD_COLORS[0]);
    setVisibility(gate.visibility);
    if (gate.wardenPermissions) setWardenPerms(gate.wardenPermissions);
    setLoaded(true);
  }, [gate, loaded]);

  const isGatekeeper = gate?.myRole === "gatekeeper";
  const canEdit = !!gate?.can?.edit_info;
  const canSubmit = name.trim().length >= 3;

  const flipPerm = async (key: GatePermKey) => {
    if (!wardenPerms || permBusy) return;
    const next = { ...wardenPerms, [key]: !wardenPerms[key] };
    setWardenPerms(next);
    setPermBusy(true);
    try {
      await api.setGatePermissions(gateId, next);
      await queryClient.invalidateQueries({ queryKey: ["gate", gateId] });
    } catch (e) {
      setWardenPerms(wardenPerms); // revert on failure
      setError((e as Error).message);
    } finally {
      setPermBusy(false);
    }
  };

  const submit = async () => {
    setError("");
    setBusy(true);
    try {
      await api.updateGate(gateId, {
        // Renaming + visibility are gatekeeper-only server-side; wardens only
        // send the fields they may change.
        ...(isGatekeeper ? { name: name.trim(), visibility } : {}),
        description: description.trim() || null,
        emblemKey,
        primaryColor,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["gate", gateId] }),
        queryClient.invalidateQueries({ queryKey: ["gates"] }),
        queryClient.invalidateQueries({ queryKey: ["myGates"] }),
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
      <Stack.Screen options={{ title: "Gate Settings" }} />
      {gateQ.isLoading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 48 }} />
      ) : !gate || gate.masked || !canEdit ? (
        <Text style={styles.gate}>Only wardens with edit rights can change this gate.</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.preview}>
            <GuildEmblem emblemKey={emblemKey} primaryColor={primaryColor} size={84} />
            <Text style={styles.previewName}>⛩ {name.trim() || "Gate name"}</Text>
          </View>

          {isGatekeeper ? (
            <>
              <Text style={styles.label}>NAME</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Solo Leveling Theorycraft"
                placeholderTextColor={colors.muted}
                maxLength={30}
              />
            </>
          ) : null}

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

          {isGatekeeper ? (
            <>
              <Text style={styles.label}>VISIBILITY</Text>
              {VISIBILITIES.map((v) => (
                <Pressable
                  key={v.key}
                  style={[styles.visRow, visibility === v.key && styles.visRowOn]}
                  onPress={() => setVisibility(v.key)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: visibility === v.key }}
                >
                  <Text
                    style={[styles.visRadio, visibility === v.key && { color: colors.accentSoft }]}
                  >
                    {visibility === v.key ? "◆" : "◇"}
                  </Text>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text
                      style={[styles.visLabel, visibility === v.key && { color: colors.accentSoft }]}
                    >
                      {v.label}
                    </Text>
                    <Text style={styles.visHint}>{v.hint}</Text>
                  </View>
                </Pressable>
              ))}
            </>
          ) : null}

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

          {isGatekeeper && wardenPerms ? (
            <>
              <Text style={styles.label}>WARDEN PERMISSIONS</Text>
              <View style={{ gap: 8 }}>
                {WARDEN_PERMS.map((p) => {
                  const on = wardenPerms[p.key];
                  return (
                    <Pressable
                      key={p.key}
                      style={[styles.permRow, on && styles.permRowOn]}
                      onPress={() => void flipPerm(p.key)}
                      accessibilityRole="switch"
                      accessibilityState={{ checked: on }}
                    >
                      <View style={{ flex: 1, gap: 1 }}>
                        <Text style={[styles.permLabel, on && { color: colors.text }]}>
                          {p.label}
                        </Text>
                        <Text style={styles.permHint}>{p.hint}</Text>
                      </View>
                      <View style={[styles.permTrack, on && styles.permTrackOn]}>
                        <View style={[styles.permKnob, on && styles.permKnobOn]} />
                      </View>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.permFootnote}>Applies to every warden. Saved instantly.</Text>
            </>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.submit, (!canSubmit || busy) && { opacity: 0.4 }]}
            disabled={!canSubmit || busy}
            onPress={submit}
          >
            {busy ? (
              <ActivityIndicator color={colors.accentSoft} />
            ) : (
              <Text style={styles.submitText}>SAVE GATE</Text>
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
  content: { padding: 20, gap: 8 },
  gate: { color: colors.muted, textAlign: "center", marginTop: 60, paddingHorizontal: 30 },
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
  permRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.card,
  },
  permRowOn: { borderColor: "rgba(107,94,204,0.45)" },
  permLabel: { color: colors.mutedStrong, fontSize: 13, fontWeight: "800" },
  permHint: { color: colors.muted, fontSize: 10.5 },
  permTrack: {
    width: 36,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.border,
    padding: 2,
    justifyContent: "center",
  },
  permTrackOn: { backgroundColor: "rgba(107,94,204,0.7)" },
  permKnob: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.muted },
  permKnobOn: { alignSelf: "flex-end", backgroundColor: "#fff" },
  permFootnote: { color: colors.muted, fontSize: 10.5, marginTop: 6 },
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
});
