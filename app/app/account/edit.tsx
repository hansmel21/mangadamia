import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { api, type ProfilePrivacy } from "../../src/api";
import { updateSessionUser } from "../../src/session";
import { colors } from "../../src/theme";

export default function EditProfileScreen() {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [privacy, setPrivacy] = useState<ProfilePrivacy | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!me.data) return;
    setUsername(me.data.user.username);
    setBio(me.data.bio ?? "");
    setPrivacy(me.data.privacy);
  }, [me.data]);

  const save = async () => {
    if (!privacy) return;
    setSaving(true);
    try {
      const result = await api.updateProfile({ username: username.trim(), bio: bio.trim() || null });
      await api.updatePrivacy(privacy);
      updateSessionUser({ username: result.user.username });
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      Alert.alert("Profile saved");
    } catch (error) {
      Alert.alert("Could not save", (error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!privacy) return <Text style={styles.loading}>Loading profile…</Text>;
  const settings: { key: keyof ProfilePrivacy; label: string; detail: string }[] = [
    { key: "showLevel", label: "Show level", detail: "Display your level beside your username." },
    { key: "showTitle", label: "Show title", detail: "Display your equipped flair." },
    { key: "showBadges", label: "Show earned badges", detail: "Locked badges are never public." },
    { key: "showStats", label: "Show status numbers", detail: "Posts, comments, likes and chapters read." },
    { key: "showPosts", label: "Show posts on profile", detail: "This does not delete posts from public walls." },
    { key: "showFavorites", label: "Show favorites", detail: "Uses your followed manga collection." },
    { key: "showReadingHistory", label: "Show reading history", detail: "Off by default for privacy and spoilers." },
    { key: "showFollows", label: "Show follow lists", detail: "Follower and following totals and lists." },
    { key: "showJoinDate", label: "Show membership age", detail: "How many days you have been a member." },
  ];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.label}>USERNAME</Text>
      <TextInput style={styles.input} value={username} onChangeText={setUsername} autoCapitalize="none" maxLength={20} />
      <Text style={styles.hint}>{me.data?.usernameChangesLeft ?? 0} username change remaining. Administrators can grant another.</Text>
      <Text style={styles.label}>BIO</Text>
      <TextInput style={[styles.input, styles.bio]} value={bio} onChangeText={setBio} multiline maxLength={240} />

      <View style={styles.visibility}>
        <View style={{ flex: 1 }}>
          <Text style={styles.settingLabel}>Private profile</Text>
          <Text style={styles.detail}>New follows become requests. Your identity and bio remain visible.</Text>
        </View>
        <Switch
          value={privacy.profileVisibility === "private"}
          onValueChange={(value) => setPrivacy({ ...privacy, profileVisibility: value ? "private" : "public" })}
          trackColor={{ false: colors.card, true: colors.accent }}
        />
      </View>

      <Text style={styles.label}>PROFILE VISIBILITY</Text>
      {settings.map((setting) => (
        <View key={setting.key} style={styles.setting}>
          <View style={{ flex: 1 }}>
            <Text style={styles.settingLabel}>{setting.label}</Text>
            <Text style={styles.detail}>{setting.detail}</Text>
          </View>
          <Switch
            value={privacy[setting.key] as boolean}
            onValueChange={(value) => setPrivacy({ ...privacy, [setting.key]: value })}
            trackColor={{ false: colors.card, true: colors.accent }}
          />
        </View>
      ))}
      <Text style={styles.notice}>Email and moderation account status are never public.</Text>
      <Pressable style={[styles.save, saving && { opacity: 0.5 }]} disabled={saving} onPress={save}>
        <Text style={styles.saveText}>{saving ? "SAVING…" : "SAVE PROFILE"}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 10, paddingBottom: 48 },
  loading: { color: colors.muted, textAlign: "center", marginTop: 48 },
  label: { color: colors.accentSoft, fontSize: 10, fontWeight: "900", letterSpacing: 1.5, marginTop: 10 },
  input: { backgroundColor: colors.card, color: colors.text, borderWidth: 1, borderColor: colors.border, padding: 12 },
  bio: { minHeight: 90, textAlignVertical: "top" },
  hint: { color: colors.muted, fontSize: 10 },
  visibility: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: colors.accent, padding: 12, marginTop: 12 },
  setting: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  settingLabel: { color: colors.text, fontWeight: "700", fontSize: 13 },
  detail: { color: colors.muted, fontSize: 10.5, lineHeight: 15, marginTop: 2 },
  notice: { color: colors.muted, fontSize: 11, marginTop: 10, fontStyle: "italic" },
  save: { backgroundColor: colors.accent, padding: 13, alignItems: "center", marginTop: 18 },
  saveText: { color: colors.accentText, fontWeight: "900", letterSpacing: 1.5 },
});
