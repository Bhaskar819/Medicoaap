import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";

import { useAuth } from "@/src/auth";
import { useI18n } from "@/src/i18n";
import { colors, font, radius, spacing, shadow } from "@/src/theme";

export default function ClinicDashboard() {
  const { apiFetch, signOut, session } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [facilities, setFacilities] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [incomingCards, setIncomingCards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const my = await apiFetch("/facilities/owner/mine");
      setFacilities(my || []);
      const [reqs, cards] = await Promise.all([
        Promise.all((my || []).map((f: any) => apiFetch(`/stock-requests/facility/${f.id}`))).then((r) => r.flat()),
        Promise.all((my || []).map((f: any) => apiFetch(`/symptom-cards/facility/${f.id}`))).then((r) => r.flat()),
      ]);
      setRequests(reqs);
      setIncomingCards(cards);
    } finally { setLoading(false); }
  }, [apiFetch]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const respond = async (rid: string, inStock: boolean) => {
    await apiFetch(`/stock-requests/${rid}/respond`, {
      method: "POST", body: JSON.stringify({ in_stock: inStock }),
    });
    load();
  };

  const toggleStudent = async (f: any) => {
    await apiFetch(`/facilities/${f.id}`, {
      method: "PUT",
      body: JSON.stringify({ ...f, student_friendly: !f.student_friendly }),
    });
    load();
  };

  return (
    <SafeAreaView style={styles.safe} testID="clinic-dashboard">
      <View style={styles.header}>
        <View>
          <Text style={styles.greet}>{t("dashboard")}</Text>
          <Text style={styles.name}>{session?.user?.name}</Text>
        </View>
        <Pressable testID="clinic-logout" onPress={signOut} style={styles.iconBtn}>
          <Ionicons name="log-out-outline" size={20} color={colors.error} />
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.xl }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}>
          <Text style={styles.section}>My facilities</Text>
          {facilities.length === 0 ? (
            <Text style={styles.empty}>No facilities yet — contact admin.</Text>
          ) : facilities.map((f) => (
            <View key={f.id} style={styles.facCard} testID={`my-facility-${f.id}`}>
              <View style={styles.facRow}>
                <Text style={styles.facName}>{f.name}</Text>
                {f.verified ? (
                  <View style={styles.vpill}><Text style={styles.vpillText}>{t("verified")}</Text></View>
                ) : (
                  <View style={styles.pendingPill}><Text style={styles.pendingPillText}>Pending</Text></View>
                )}
              </View>
              <Text style={styles.facAddr}>{f.address}</Text>
              <Pressable
                testID={`toggle-student-${f.id}`}
                onPress={() => toggleStudent(f)}
                style={[styles.studentBtn, f.student_friendly && styles.studentBtnActive]}
              >
                <Ionicons name="school" size={14} color={f.student_friendly ? colors.onBrand : colors.warning} />
                <Text style={[styles.studentBtnText, f.student_friendly && { color: colors.onBrand }]}>
                  {f.student_friendly ? "Student friendly ON" : "Set student friendly"}
                </Text>
              </Pressable>
            </View>
          ))}

          <Text style={[styles.section, { marginTop: spacing.xl }]}>Incoming patient symptom cards</Text>
          {incomingCards.length === 0 ? (
            <Text style={styles.empty}>No patient cards shared yet.</Text>
          ) : incomingCards.map((s) => (
            <View key={s.id} style={styles.reqCard} testID={`incoming-card-${s.id}`}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={styles.reqMed}>{s.card?.primary_symptom || "Symptoms"}</Text>
                <View style={[styles.urgPill, {
                  backgroundColor: s.card?.urgency === "high" ? colors.error
                    : s.card?.urgency === "medium" ? colors.warning : colors.brand
                }]}>
                  <Text style={styles.urgPillText}>{(s.card?.urgency || "low").toUpperCase()}</Text>
                </View>
              </View>
              <Text style={styles.reqMeta}>
                {s.patient_name} · {s.patient_phone || "no phone"} · {s.card?.duration || ""} · severity {s.card?.severity || "?"}/10
              </Text>
              {s.card?.patient_note ? (
                <Text style={styles.cardNote}>"{s.card.patient_note}"</Text>
              ) : null}
              {s.card?.suggested_specialty ? (
                <Text style={styles.reqMeta}>Specialty: {s.card.suggested_specialty}</Text>
              ) : null}
            </View>
          ))}

          <Text style={[styles.section, { marginTop: spacing.xl }]}>{t("stock_requests")}</Text>
          {requests.length === 0 ? (
            <Text style={styles.empty}>No stock requests yet.</Text>
          ) : requests.map((r) => (
            <View key={r.id} style={styles.reqCard} testID={`stock-req-${r.id}`}>
              <Text style={styles.reqMed}>{r.medicine}</Text>
              <Text style={styles.reqMeta}>{r.patient_name} · {r.patient_phone || "no phone"}</Text>
              {r.status === "pending" ? (
                <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
                  <Pressable testID={`req-yes-${r.id}`} onPress={() => respond(r.id, true)} style={[styles.respBtn, { backgroundColor: colors.brand }]}>
                    <Text style={{ color: colors.onBrand, fontWeight: "700" }}>{t("in_stock")}</Text>
                  </Pressable>
                  <Pressable testID={`req-no-${r.id}`} onPress={() => respond(r.id, false)} style={[styles.respBtn, { backgroundColor: colors.error }]}>
                    <Text style={{ color: "#fff", fontWeight: "700" }}>{t("out_of_stock")}</Text>
                  </Pressable>
                </View>
              ) : (
                <Text style={[styles.reqMeta, { color: r.in_stock ? colors.brand : colors.error, marginTop: 6, fontWeight: "700" }]}>
                  {r.in_stock ? t("in_stock") : t("out_of_stock")}
                </Text>
              )}
            </View>
          ))}
        </ScrollView>
      )}

      <Pressable
        testID="add-facility-fab"
        onPress={() => router.push("/clinic/new")}
        style={[styles.fab, { bottom: Math.max(insets.bottom, 12) + 16 }]}
      >
        <Ionicons name="add" size={22} color={colors.onBrand} />
        <Text style={styles.fabText}>Add facility</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg },
  greet: { fontSize: font.sm, color: colors.muted, fontWeight: "600" },
  name: { fontSize: font.xl, fontWeight: "800", color: colors.onSurface },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "#FEEBEB" },
  section: { fontSize: font.lg, fontWeight: "800", color: colors.onSurface, marginBottom: spacing.sm },
  empty: { color: colors.muted, paddingVertical: spacing.md },
  facCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, ...shadow.card },
  facRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  facName: { fontSize: font.lg, fontWeight: "700", color: colors.onSurface, flex: 1, marginRight: 8 },
  facAddr: { color: colors.muted, marginTop: 2 },
  vpill: { backgroundColor: colors.brand, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  vpillText: { color: colors.onBrand, fontSize: font.sm - 1, fontWeight: "700" },
  pendingPill: { backgroundColor: colors.surfaceTertiary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  pendingPillText: { color: colors.muted, fontSize: font.sm - 1, fontWeight: "700" },
  studentBtn: {
    marginTop: spacing.sm, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill,
    backgroundColor: "#FCEFE0", borderWidth: 1, borderColor: colors.warning,
  },
  studentBtnActive: { backgroundColor: colors.warning },
  studentBtnText: { color: colors.warning, fontWeight: "700", fontSize: font.sm },
  reqCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, ...shadow.card },
  reqMed: { fontSize: font.lg, fontWeight: "800", color: colors.onSurface },
  reqMeta: { color: colors.muted, fontSize: font.sm, marginTop: 2 },
  respBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.md, alignItems: "center" },
  urgPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  urgPillText: { color: "#fff", fontWeight: "800", fontSize: font.sm - 2, letterSpacing: 0.5 },
  cardNote: { marginTop: 6, fontStyle: "italic", color: colors.onSurfaceTertiary, fontSize: font.sm, lineHeight: 18 },
  fab: {
    position: "absolute", right: spacing.lg,
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 18, paddingVertical: 14, borderRadius: radius.pill,
    backgroundColor: colors.brand, ...shadow.floating,
  },
  fabText: { color: colors.onBrand, fontWeight: "800", fontSize: font.base },
});
