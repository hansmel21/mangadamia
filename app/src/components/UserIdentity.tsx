import { Pressable, StyleSheet, Text, View } from "react-native";
import type { PublicIdentity } from "../api";
import { colors, fonts } from "../theme";
import { GuildCrest } from "./GuildCrest";
import { ReaderAvatar } from "./ReaderAvatar";
import { TitleFlair } from "./TitleFlair";

export function UserIdentity({
  identity,
  onPress,
  compact = false,
  profile = false,
}: {
  identity: PublicIdentity;
  onPress?: () => void;
  compact?: boolean;
  profile?: boolean;
}) {
  const content = (
    <View style={[styles.wrap, profile && styles.profileWrap]}>
      <ReaderAvatar identity={identity} size={profile ? 78 : compact ? 30 : 38} />
      <View style={[styles.copy, profile && styles.profileCopy]}>
        <View style={styles.nameRow}>
          <Text style={[styles.name, profile && styles.profileName]} numberOfLines={1}>
            {identity.username}
          </Text>
          {identity.level != null ? <Text style={styles.level}>LV {identity.level}</Text> : null}
        </View>
        {identity.guild ? (
          <GuildCrest guild={identity.guild} size={profile ? 20 : 16} />
        ) : null}
        {identity.title ? <TitleFlair title={identity.title} compact={compact} /> : null}
        {identity.staffMarker ? (
          <Text style={styles.staff}>◆ {identity.staffMarker.label.toUpperCase()}</Text>
        ) : null}
      </View>
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} disabled={identity.anonymized} style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}>
      {content}
    </Pressable>
  ) : (
    content
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: 9, flexShrink: 1 },
  profileWrap: { flexDirection: "column", alignItems: "center", gap: 10 },
  copy: { gap: 3, flexShrink: 1 },
  profileCopy: { alignItems: "center" },
  nameRow: { flexDirection: "row", alignItems: "baseline", gap: 7, flexShrink: 1 },
  name: { color: colors.text, fontSize: 14, fontWeight: "800", flexShrink: 1 },
  profileName: { fontFamily: fonts.display, fontSize: 23 },
  level: { color: colors.foil, fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
  staff: { color: colors.accentSoft, fontSize: 8.5, fontWeight: "900", letterSpacing: 0.8 },
});
