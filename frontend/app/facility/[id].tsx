import { useEffect, useState, useCallback } from "react";
import {
  ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View, Modal,
  KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";

import { useAuth } from "@/src/auth";
import { useI18n } from "@/src/i18n";
import { colors, font, radius, spacing, shadow } from "@/src/theme";

export default function FacilityDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { apiFetch } = useAuth();
  const { t } = useI18n();

  const [data, setData] = useState<any>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [stockModal, setStockModal] = useState(false);
  const [medicine, setMedicine] = useState("");
  const [stockSent, setStockSent] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [f, r] = await Promise.all([
        apiFetch(`/facilities/${id}`),
        apiFetch(`/reviews/${id}`),
      ]);
      setData(f); setReviews(r || []);
    } finally { setLoading(false); }
  }, [id, apiFetch]);

  useEffect(() => { load(); }, [load]);

  const sendStock = async () => {
    if (!medicine.trim()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    try {
      await apiFetch(`/stock-requests`, {
        method: "POST",
        body: JSON.stringify({ facility_id: id, medicine: medicine.trim() }),
      });
      setStockSent(true);
      setTimeout(() => { setStockModal(false); setStockSent(false); setMedicine(""); }, 1200);
    } catch {}
  };

  if (loading || !data) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  const ir = data.inspector_ratings;
  const isPharmacy = data.type === "pharmacy";

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="facility-detail">
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={styles.heroWrap}>
          <Image
            source={{ uri: data.image_url || "https://images.pexels.com/photos/6473188/pexels-photo-6473188.jpeg" }}
            style={styles.heroImg}
            resizeMode="cover"
          />
          <LinearGradient
            colors={["transparent", "rgba(28,32,29,0.85)"]}
            style={StyleSheet.absoluteFill}
          />
          <SafeAreaView edges={["top"]} style={styles.heroSafe}>
            <Pressable testID="back-button" onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
            </Pressable>
          </SafeAreaView>
          <View style={styles.heroBottom}>
            {data.verified ? (
              <View style={styles.verifiedPill} testID="verified-badge">
                <Ionicons name="shield-checkmark" size={13} color={colors.onBrand} />
                <Text style={styles.verifiedText}>{t("verified")}</Text>
              </View>
            ) : (
              <View style={styles.unverifiedPill}>
                <Ionicons name="time" size={13} color={colors.onSurface} />
                <Text style={styles.unverifiedText}>Pending inspection</Text>
              </View>
            )}
            <Text style={styles.heroName}>{data.name}</Text>
            <Text style={styles.heroAddr}>{data.address}, {data.city}</Text>
          </View>
        </View>

        {data.student_friendly ? (
          <View style={styles.studentBanner} testID="student-banner">
            <Ionicons name="school" size={18} color={colors.warning} />
            <Text style={styles.studentBannerText}>
              {data.student_discount_pct}% student discount
            </Text>
          </View>
        ) : null}

        {/* Inspector ratings */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="ribbon" size={16} color={colors.brand} />
            <Text style={styles.sectionTitle}>{t("inspector_ratings")}</Text>
          </View>
          {ir ? (
            <View style={styles.card}>
              <RatingBar label={t("cleanliness")} value={ir.cleanliness} />
              <RatingBar label={t("price_transparency")} value={ir.price_transparency} />
              <RatingBar label={t("equipment")} value={ir.equipment} />
              {ir.notes ? <Text style={styles.inspectorNote}>“{ir.notes}”</Text> : null}
            </View>
          ) : (
            <View style={[styles.card, { alignItems: "center" }]}>
              <Text style={{ color: colors.muted }}>No inspection yet</Text>
            </View>
          )}
        </View>

        {/* User reviews */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="star" size={16} color={colors.warning} />
            <Text style={styles.sectionTitle}>{t("user_reviews")} ({reviews.length})</Text>
          </View>
          {reviews.length === 0 ? (
            <View style={[styles.card, { alignItems: "center" }]}>
              <Text style={{ color: colors.muted }}>Be the first to review!</Text>
            </View>
          ) : (
            reviews.map((r) => (
              <View key={r.id} style={styles.reviewCard}>
                <View style={styles.reviewHead}>
                  <Text style={styles.reviewer}>{r.user_name}</Text>
                  <View style={{ flexDirection: "row" }}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Ionicons key={i} name="star" size={12}
                        color={i < r.rating ? colors.warning : colors.border} />
                    ))}
                  </View>
                </View>
                {r.text ? <Text style={styles.reviewText}>{r.text}</Text> : null}
              </View>
            ))
          )}
        </View>

        {isPharmacy && data.medicines?.length ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="medical" size={16} color={colors.brand} />
              <Text style={styles.sectionTitle}>Stocked medicines</Text>
            </View>
            <View style={[styles.card, { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }]}>
              {data.medicines.map((m: string) => (
                <View key={m} style={styles.medPill}><Text style={styles.medText}>{m}</Text></View>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>

      {/* Sticky CTA */}
      <View style={[styles.cta, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Pressable
          testID="primary-action-button"
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            if (isPharmacy) setStockModal(true);
          }}
          style={styles.ctaBtn}
        >
          <Ionicons name={isPharmacy ? "search" : "call"} size={18} color={colors.onBrand} />
          <Text style={styles.ctaText}>{isPharmacy ? t("stock_check") : t("call_to_book")}</Text>
        </Pressable>
      </View>

      <Modal visible={stockModal} animationType="slide" transparent onRequestClose={() => setStockModal(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalRoot}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setStockModal(false)} />
          <View style={styles.modalCard} testID="stock-modal">
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{t("stock_check")}</Text>
            <Text style={styles.modalSub}>Ask the pharmacy if the medicine is available.</Text>
            <TextInput
              testID="stock-medicine-input"
              placeholder="e.g. Crocin"
              placeholderTextColor={colors.muted}
              value={medicine}
              onChangeText={setMedicine}
              style={styles.modalInput}
            />
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
              <Pressable testID="stock-cancel" onPress={() => setStockModal(false)} style={[styles.modalBtn, styles.modalBtnGhost]}>
                <Text style={styles.modalBtnGhostText}>{t("cancel")}</Text>
              </Pressable>
              <Pressable testID="stock-send-button" onPress={sendStock} style={[styles.modalBtn, styles.modalBtnPrimary]}>
                <Text style={styles.modalBtnPrimaryText}>
                  {stockSent ? "✓ Sent" : t("send")}
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const RatingBar = ({ label, value }: { label: string; value: number }) => {
  const pct = Math.min(100, (value / 5) * 100);
  return (
    <View style={{ marginVertical: spacing.xs }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ color: colors.onSurfaceTertiary, fontWeight: "600", fontSize: font.sm }}>{label}</Text>
        <Text style={{ color: colors.brand, fontWeight: "700", fontSize: font.sm }}>{value}/5</Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pct}%` }]} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  heroWrap: { height: 280, backgroundColor: colors.surfaceTertiary, overflow: "hidden" },
  heroImg: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  heroSafe: { padding: spacing.md, flexDirection: "row" },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center", justifyContent: "center",
  },
  heroBottom: { position: "absolute", left: spacing.lg, right: spacing.lg, bottom: spacing.lg, gap: 6 },
  heroName: { color: "#fff", fontSize: font["2xl"], fontWeight: "800" },
  heroAddr: { color: "rgba(255,255,255,0.85)", fontSize: font.sm },
  verifiedPill: {
    alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: colors.brand, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill,
  },
  verifiedText: { color: colors.onBrand, fontWeight: "700", fontSize: font.sm },
  unverifiedPill: {
    alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(255,255,255,0.9)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill,
  },
  unverifiedText: { color: colors.onSurface, fontWeight: "700", fontSize: font.sm },

  studentBanner: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    margin: spacing.lg, padding: spacing.md, borderRadius: radius.md,
    backgroundColor: "#FCEFE0", borderLeftWidth: 4, borderLeftColor: colors.warning,
  },
  studentBannerText: { color: colors.warning, fontWeight: "700" },

  section: { paddingHorizontal: spacing.lg, marginTop: spacing.md },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.sm },
  sectionTitle: { fontSize: font.lg, fontWeight: "800", color: colors.onSurface },
  card: { padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, ...shadow.card },
  barTrack: { marginTop: 6, height: 8, backgroundColor: colors.surfaceTertiary, borderRadius: 4, overflow: "hidden" },
  barFill: { height: 8, backgroundColor: colors.brand },
  inspectorNote: { marginTop: spacing.sm, color: colors.muted, fontStyle: "italic" },

  reviewCard: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, ...shadow.card,
  },
  reviewHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  reviewer: { fontWeight: "700", color: colors.onSurface },
  reviewText: { color: colors.onSurfaceTertiary, marginTop: 4 },

  medPill: { backgroundColor: colors.brandTertiary, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill },
  medText: { color: colors.brand, fontWeight: "600", fontSize: font.sm },

  cta: {
    position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.md,
    backgroundColor: colors.surfaceSecondary, borderTopWidth: 1, borderTopColor: colors.divider,
  },
  ctaBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: colors.brand, paddingVertical: 16, borderRadius: radius.md,
  },
  ctaText: { color: colors.onBrand, fontSize: font.lg, fontWeight: "700" },

  modalRoot: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
  modalCard: {
    backgroundColor: colors.surfaceSecondary, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: spacing.lg, gap: spacing.sm,
  },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: "center" },
  modalTitle: { fontSize: font.xl, fontWeight: "800", color: colors.onSurface, marginTop: spacing.sm },
  modalSub: { color: colors.muted, fontSize: font.sm },
  modalInput: {
    marginTop: spacing.sm, paddingVertical: spacing.md, paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, color: colors.onSurface, fontSize: font.lg,
  },
  modalBtn: { flex: 1, paddingVertical: 14, borderRadius: radius.md, alignItems: "center" },
  modalBtnGhost: { backgroundColor: colors.surfaceTertiary },
  modalBtnGhostText: { color: colors.onSurface, fontWeight: "700" },
  modalBtnPrimary: { backgroundColor: colors.brand },
  modalBtnPrimaryText: { color: colors.onBrand, fontWeight: "700" },
});
