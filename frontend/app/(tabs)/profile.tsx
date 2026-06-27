import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "@/src/auth";
import { useI18n, LANGUAGES, type Lang } from "@/src/i18n";
import { colors, font, radius, spacing, shadow } from "@/src/theme";

export default function Profile() {
  const { session, signOut } = useAuth();
  const router = useRouter();
  const { t, lang, setLang } = useI18n();

  return (
    <SafeAreaView style={styles.safe} testID="profile-screen">
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing["3xl"] }}>
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={28} color={colors.onBrand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{session?.user?.name}</Text>
            <Text style={styles.email}>{session?.user?.email}</Text>
            <Text style={styles.roleTag}>{session?.user?.role}</Text>
          </View>
        </View>

        <Text style={styles.section}>{t("language")}</Text>
        <View style={styles.langGrid}>
          {LANGUAGES.map((l) => (
            <Pressable
              key={l.code}
              testID={`profile-lang-${l.code}`}
              onPress={() => setLang(l.code as Lang)}
              style={[styles.langCell, lang === l.code && styles.langCellActive]}
            >
              <Text style={[styles.langCellText, lang === l.code && styles.langCellTextActive]}>{l.native}</Text>
              <Text style={[styles.langCellSub, lang === l.code && { color: colors.onBrand }]}>{l.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.section, { marginTop: spacing.xl }]}>My health</Text>
        <View style={styles.card}>
          <Row label="Blood group" value={session?.user?.medical_info?.blood_group || "—"} />
          <Row label="Allergies" value={session?.user?.medical_info?.allergies || "—"} />
          <Row label="Conditions" value={session?.user?.medical_info?.chronic_conditions || "—"} />
          <Row label="Emergency" value={session?.user?.medical_info?.emergency_contact || "—"} />
        </View>

        <Pressable testID="logout-button" onPress={signOut} style={styles.logout}>
          <Ionicons name="log-out-outline" size={18} color={colors.error} />
          <Text style={styles.logoutText}>{t("logout")}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.row}>
    <Text style={styles.rowLabel}>{label}</Text>
    <Text style={styles.rowValue} numberOfLines={1}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    padding: spacing.lg, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, ...shadow.card,
  },
  avatar: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: colors.brand,
    alignItems: "center", justifyContent: "center",
  },
  name: { fontSize: font.xl, fontWeight: "800", color: colors.onSurface },
  email: { fontSize: font.sm, color: colors.muted, marginTop: 2 },
  roleTag: {
    alignSelf: "flex-start", marginTop: 6, backgroundColor: colors.brandTertiary,
    color: colors.brand, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill,
    fontSize: font.sm - 1, fontWeight: "700", overflow: "hidden",
  },
  section: { marginTop: spacing.lg, marginBottom: spacing.sm, fontSize: font.lg, fontWeight: "700", color: colors.onSurface },
  langGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  langCell: {
    width: "48%", padding: spacing.md, borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border,
  },
  langCellActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  langCellText: { fontSize: font.lg, fontWeight: "700", color: colors.onSurface },
  langCellTextActive: { color: colors.onBrand },
  langCellSub: { fontSize: font.sm, color: colors.muted, marginTop: 2 },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.md, ...shadow.card },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowLabel: { color: colors.muted, fontSize: font.sm, fontWeight: "600" },
  rowValue: { color: colors.onSurface, fontSize: font.base, fontWeight: "600", maxWidth: "60%" },
  logout: {
    marginTop: spacing.xl, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: "#FEEBEB",
  },
  logoutText: { color: colors.error, fontWeight: "700" },
});
