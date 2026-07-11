import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { LegalSection } from "../legal";
import { colors, fonts } from "../theme";

export function LegalDocument({
  title,
  effective,
  sections,
}: {
  title: string;
  effective: string;
  sections: readonly LegalSection[];
}) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.effective}>Effective {effective}</Text>
      {sections.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={styles.heading}>{section.title}</Text>
          <Text style={styles.body}>{section.body}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 48 },
  title: { color: colors.text, fontSize: 26, fontFamily: fonts.display },
  effective: { color: colors.muted, marginTop: 4, marginBottom: 18 },
  section: { marginBottom: 18 },
  heading: { color: colors.accentSoft, fontSize: 14, fontWeight: "800", marginBottom: 5 },
  body: { color: colors.text, fontSize: 14, lineHeight: 21 },
});
