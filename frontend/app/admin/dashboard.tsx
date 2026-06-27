import { useCallback, useState } from "react";
import {
  ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";

import { useAuth } from "@/src/auth";
import { useI18n } from "@/src/i18n";
import { colors, font, radius, spacing, shadow } from "@/src/theme";

export default function AdminDashboard() {
  const { apiFetch, signOut, session } = useAuth();
  const { t } = useI18n();
  const [all, setAll] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [c, setC] = useState(4); const [p, setP] = useState(4); const [e, setE] = useState(4);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/admin/all");
      setAll(data || []);
    } finally { setLoading(false); }
  }, [apiFetch]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const submit = async (grant: boolean) => {
    if (!selected) return;
    setBusy(true);
    try {
      await apiFetch("/admin/inspect", {
        method: "POST",
        body: JSON.stringify({
          facility_id: selected.id, cleanliness: c, price_transparency: p, equipment: e,
          notes, grant_verified: grant,
        }),
      });
      setSelected(null); setNotes(""); setC(4); setP(4); setE(4);
      load();
    } finally { setBusy(false); }
  };

  const pending = all.filter((f) => !f.verified);
  const verified = all.filter((f) => f.verified);

  return (
    <SafeAreaView style={styles.safe} testID="admin-dashboard">
      <View style={styles.header}>
        <View>
          <Text style={styles.greet}>Inspector</Text>
          <Text style={styles.name}>{session?.user?.name}</Text>
        </View>
        <Pressable testID="admin-logout" onPress={signOut} style={styles.iconBtn}>
          <Ionicons name="log-out-outline" size={20} color={colors.error} />
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.xl }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 80 }}>
          <View style={styles.statsRow}>
            <Stat label="Pending" value={pending.length} color={colors.warning} />
            <Stat label="Verified" value={verified.length} color={colors.brand} />
            <Stat label="Total" value={all.length} color={colors.info} />
          </View>

          <Text style={styles.section}>{t("pending_inspections")}</Text>
          {pending.length === 0 ? <Text style={styles.empty}>All facilities have been inspected!</Text> :
            pending.map((f) => (
              <Pressable key={f.id} testID={`pending-${f.id}`} onPress={() => setSelected(f)} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName}>{f.name}</Text>
                  <Text style={styles.rowMeta}>{f.type} · {f.city}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </Pressable>
            ))
          }

          <Text style={[styles.section, { marginTop: spacing.lg }]}>Verified</Text>
          {verified.map((f) => (
            <Pressable key={f.id} testID={`verified-row-${f.id}`} onPress={() => setSelected(f)} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{f.name}</Text>
                <Text style={styles.rowMeta}>
                  {f.type} · {f.city} · Inspector: {f.inspector_ratings?.overall || "—"}/5
                </Text>
              </View>
              <View style={styles.vpill}><Ionicons name="shield-checkmark" size={11} color={colors.onBrand} />
                <Text style={styles.vpillText}> {t("verified")}</Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <Modal visible={!!selected} animationType="slide" transparent onRequestClose={() => setSelected(null)}>
        <KeyboardAvoidingView style={{ flex: 1, justifyContent: "flex-end" }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSelected(null)} />
          <View style={styles.sheet} testID="inspection-modal">
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>{selected?.name}</Text>
            <Text style={styles.sheetSub}>{selected?.address}</Text>

            <Slider label={t("cleanliness")} value={c} onChange={setC} />
            <Slider label={t("price_transparency")} value={p} onChange={setP} />
            <Slider label={t("equipment")} value={e} onChange={setE} />

            <Text style={styles.label}>Inspector notes</Text>
            <TextInput
              testID="inspector-notes"
              value={notes} onChangeText={setNotes} multiline
              placeholder="Observations…" placeholderTextColor={colors.muted}
              style={styles.notesInput}
            />

            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
              <Pressable testID="grant-revoke-button" disabled={busy} onPress={() => submit(false)} style={[styles.actionBtn, { backgroundColor: colors.surfaceTertiary }]}>
                <Text style={{ color: colors.onSurface, fontWeight: "700" }}>Revoke / decline</Text>
              </Pressable>
              <Pressable testID="grant-verified-button" disabled={busy} onPress={() => submit(true)} style={[styles.actionBtn, { backgroundColor: colors.brand }]}>
                <Text style={{ color: colors.onBrand, fontWeight: "700" }}>{busy ? "…" : t("verify")}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const Stat = ({ label, value, color }: { label: string; value: number; color: string }) => (
  <View style={[styles.stat, { borderColor: color }]}>
    <Text style={[styles.statNum, { color }]}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const Slider = ({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) => (
  <View style={{ marginTop: spacing.md }}>
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.label, { color: colors.brand, fontWeight: "800" }]}>{value}/5</Text>
    </View>
    <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} onPress={() => onChange(n)} testID={`${label.toLowerCase().replace(/\s/g, "-")}-${n}`}
          style={[styles.stepCell, n <= value && { backgroundColor: colors.brand, borderColor: colors.brand }]}>
          <Text style={[styles.stepText, n <= value && { color: colors.onBrand }]}>{n}</Text>
        </Pressable>
      ))}
    </View>
  </View>
);

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg },
  greet: { fontSize: font.sm, color: colors.muted, fontWeight: "600" },
  name: { fontSize: font.xl, fontWeight: "800", color: colors.onSurface },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "#FEEBEB" },
  statsRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg },
  stat: { flex: 1, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surfaceSecondary, borderLeftWidth: 4, ...shadow.card },
  statNum: { fontSize: font["2xl"], fontWeight: "800" },
  statLabel: { fontSize: font.sm, color: colors.muted, marginTop: 2, fontWeight: "600" },
  section: { fontSize: font.lg, fontWeight: "800", color: colors.onSurface, marginBottom: spacing.sm },
  empty: { color: colors.muted, paddingVertical: spacing.sm },
  row: {
    flexDirection: "row", alignItems: "center", padding: spacing.md,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, marginBottom: spacing.sm, ...shadow.card,
  },
  rowName: { fontSize: font.lg, fontWeight: "700", color: colors.onSurface },
  rowMeta: { color: colors.muted, fontSize: font.sm, marginTop: 2 },
  vpill: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.brand },
  vpillText: { color: colors.onBrand, fontSize: font.sm - 1, fontWeight: "700" },

  sheet: { backgroundColor: colors.surfaceSecondary, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, gap: 4 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: "center", marginBottom: spacing.md },
  sheetTitle: { fontSize: font.xl, fontWeight: "800", color: colors.onSurface },
  sheetSub: { color: colors.muted, fontSize: font.sm, marginBottom: spacing.sm },
  label: { fontSize: font.sm, color: colors.onSurfaceTertiary, fontWeight: "700" },
  stepCell: {
    flex: 1, height: 40, alignItems: "center", justifyContent: "center",
    borderRadius: radius.md, backgroundColor: colors.surfaceTertiary,
    borderWidth: 1, borderColor: colors.border,
  },
  stepText: { fontWeight: "700", color: colors.onSurface },
  notesInput: {
    marginTop: 6, padding: spacing.md, borderRadius: radius.md, minHeight: 80, textAlignVertical: "top",
    backgroundColor: colors.surfaceTertiary, color: colors.onSurface,
  },
  actionBtn: { flex: 1, paddingVertical: 14, borderRadius: radius.md, alignItems: "center" },
});
