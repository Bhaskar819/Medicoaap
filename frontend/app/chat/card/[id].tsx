import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View,
  Platform,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";

import { useAuth } from "@/src/auth";
import { colors, font, radius, spacing, shadow } from "@/src/theme";

type Card = {
  id: string;
  patient_name: string;
  patient_phone?: string;
  primary_symptom: string;
  duration: string;
  severity: number;
  related_symptoms: string[];
  urgency: "low" | "medium" | "high" | string;
  suggested_specialty: string;
  patient_note: string;
  red_flag_warnings: string[];
  created_at: string;
};

const URGENCY_COLOR: Record<string, string> = {
  low: "#128256",
  medium: "#D97726",
  high: "#B83A3A",
};

export default function CardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { apiFetch } = useAuth();
  const [card, setCard] = useState<Card | null>(null);
  const [loading, setLoading] = useState(true);
  const [shareOpen, setShareOpen] = useState(false);
  const [nearby, setNearby] = useState<any[]>([]);
  const [loadingNearby, setLoadingNearby] = useState(false);
  const [shareDone, setShareDone] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    apiFetch(`/symptom-cards/${id}`).then(setCard).finally(() => setLoading(false));
  }, [id, apiFetch]);

  const openShare = useCallback(async () => {
    setShareOpen(true);
    setLoadingNearby(true);
    try {
      let lat = 12.9352, lng = 77.6245;
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const loc = await Location.getCurrentPositionAsync({});
        lat = loc.coords.latitude; lng = loc.coords.longitude;
      }
      const [verified, discovered] = await Promise.all([
        apiFetch(`/facilities/nearby?lat=${lat}&lng=${lng}&radius_m=5000&type=clinic`).catch(() => []),
        apiFetch(`/facilities/discover?lat=${lat}&lng=${lng}&radius_m=5000&type=clinic`).catch(() => []),
      ]);
      setNearby([...(verified || []), ...(discovered || [])].slice(0, 30));
    } finally {
      setLoadingNearby(false);
    }
  }, [apiFetch]);

  const share = async (facilityId: string, facilityName: string) => {
    if (!card) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    try {
      await apiFetch("/symptom-cards/share", {
        method: "POST",
        body: JSON.stringify({ card_id: card.id, facility_id: facilityId }),
      });
      setShareDone(facilityName);
      setTimeout(() => { setShareOpen(false); setShareDone(null); }, 1400);
    } catch {}
  };

  if (loading || !card) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  const urgColor = URGENCY_COLOR[card.urgency] || colors.info;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="card-screen">
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable testID="card-back" onPress={() => router.replace("/")} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Symptom card</Text>
        <View style={{ width: 36 }} />
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }}>
        <View style={[styles.urgencyPill, { backgroundColor: urgColor }]}>
          <Ionicons name="pulse" size={14} color="#fff" />
          <Text style={styles.urgencyText}>{card.urgency.toUpperCase()} urgency</Text>
        </View>

        <Text style={styles.hero}>{card.primary_symptom}</Text>
        <Text style={styles.heroSub}>{card.duration} · severity {card.severity}/10</Text>

        <View style={styles.noteCard}>
          <Text style={styles.noteLabel}>Note for reception</Text>
          <Text style={styles.note}>{card.patient_note}</Text>
        </View>

        {card.related_symptoms?.length ? (
          <>
            <Text style={styles.sectionTitle}>Related symptoms</Text>
            <View style={styles.chipWrap}>
              {card.related_symptoms.map((s, i) => (
                <View key={i} style={styles.chip}><Text style={styles.chipText}>{s}</Text></View>
              ))}
            </View>
          </>
        ) : null}

        <Text style={styles.sectionTitle}>Suggested specialty</Text>
        <View style={styles.specRow}>
          <Ionicons name="medkit" size={16} color={colors.brand} />
          <Text style={styles.specText}>{card.suggested_specialty}</Text>
        </View>

        {card.red_flag_warnings?.length ? (
          <View style={styles.warnCard}>
            <Ionicons name="warning" size={16} color={colors.error} />
            <View style={{ flex: 1 }}>
              <Text style={styles.warnTitle}>Watch out for</Text>
              {card.red_flag_warnings.map((w, i) => (
                <Text key={i} style={styles.warnText}>• {w}</Text>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.metaCard}>
          <Text style={styles.metaLabel}>Patient</Text>
          <Text style={styles.metaValue}>{card.patient_name}</Text>
          {card.patient_phone ? <Text style={styles.metaPhone}>{card.patient_phone}</Text> : null}
        </View>

        <Text style={styles.disclaimer}>
          This card was generated by an AI assistant from your inputs. It is not a medical diagnosis. Always consult a doctor.
        </Text>
      </ScrollView>

      <View style={[styles.cta, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Pressable testID="share-card-button" onPress={openShare} style={styles.shareBtn}>
          <Ionicons name="share-social" size={18} color={colors.onBrand} />
          <Text style={styles.shareText}>Share with a clinic</Text>
        </Pressable>
      </View>

      <Modal visible={shareOpen} animationType="slide" transparent onRequestClose={() => setShareOpen(false)}>
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShareOpen(false)} />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]} testID="share-sheet">
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Send this card to…</Text>
            <Text style={styles.sheetSub}>Reception will see it before you arrive.</Text>
            {loadingNearby ? (
              <ActivityIndicator color={colors.brand} style={{ marginVertical: spacing.lg }} />
            ) : (
              <FlatList
                data={nearby}
                keyExtractor={(i) => i.id}
                style={{ maxHeight: 360 }}
                renderItem={({ item }) => (
                  <Pressable
                    testID={`share-to-${item.id}`}
                    onPress={() => share(item.id, item.name)}
                    style={styles.shareRow}
                  >
                    <Ionicons
                      name="medkit"
                      size={18}
                      color={item.verified ? colors.brand : colors.muted}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.shareRowName} numberOfLines={1}>{item.name}</Text>
                      <Text style={styles.shareRowMeta}>
                        {item.verified ? "Verified · " : ""}
                        {item.distance_m
                          ? item.distance_m < 1000
                            ? `${Math.round(item.distance_m)}m`
                            : `${(item.distance_m / 1000).toFixed(1)}km`
                          : ""}
                      </Text>
                    </View>
                    <Ionicons name="send" size={16} color={colors.brand} />
                  </Pressable>
                )}
                ListEmptyComponent={
                  <Text style={{ padding: spacing.lg, color: colors.muted }}>
                    No clinics nearby. Move closer to find one.
                  </Text>
                }
              />
            )}
            {shareDone ? (
              <View style={styles.toast} testID="share-toast">
                <Ionicons name="checkmark-circle" size={16} color="#fff" />
                <Text style={styles.toastText}>Sent to {shareDone}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.surfaceSecondary, ...shadow.card,
  },
  title: { fontSize: font.lg, fontWeight: "800", color: colors.onSurface },
  urgencyPill: {
    alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill,
  },
  urgencyText: { color: "#fff", fontWeight: "800", fontSize: font.sm - 1, letterSpacing: 0.5 },
  hero: { fontSize: font["2xl"], fontWeight: "800", color: colors.onSurface, marginTop: spacing.md },
  heroSub: { fontSize: font.base, color: colors.muted, marginTop: 4 },
  noteCard: {
    marginTop: spacing.lg, padding: spacing.md, borderRadius: radius.lg,
    backgroundColor: colors.brandTertiary, borderLeftWidth: 4, borderLeftColor: colors.brand,
  },
  noteLabel: { color: colors.brand, fontWeight: "800", fontSize: font.sm },
  note: { fontSize: font.lg, color: colors.onSurface, marginTop: 4, lineHeight: 22 },
  sectionTitle: { fontSize: font.lg, fontWeight: "800", color: colors.onSurface, marginTop: spacing.lg },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: spacing.sm },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  chipText: { fontSize: font.sm, color: colors.onSurface, fontWeight: "600" },
  specRow: { marginTop: spacing.sm, flexDirection: "row", alignItems: "center", gap: 6 },
  specText: { fontSize: font.lg, fontWeight: "700", color: colors.brand },
  warnCard: {
    marginTop: spacing.lg, padding: spacing.md, borderRadius: radius.md,
    backgroundColor: "#FEEBEB", flexDirection: "row", gap: spacing.sm,
  },
  warnTitle: { color: colors.error, fontWeight: "800" },
  warnText: { color: colors.error, fontSize: font.sm, marginTop: 2 },
  metaCard: { marginTop: spacing.lg, padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, ...shadow.card },
  metaLabel: { fontSize: font.sm, color: colors.muted, fontWeight: "700" },
  metaValue: { fontSize: font.lg, fontWeight: "800", color: colors.onSurface, marginTop: 2 },
  metaPhone: { fontSize: font.base, color: colors.muted, marginTop: 2 },
  disclaimer: { marginTop: spacing.xl, fontSize: font.sm - 1, color: colors.muted, fontStyle: "italic", lineHeight: 16 },

  cta: {
    position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.md,
    backgroundColor: colors.surfaceSecondary, borderTopWidth: 1, borderTopColor: colors.divider,
  },
  shareBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: colors.brand, paddingVertical: 16, borderRadius: radius.md,
  },
  shareText: { color: colors.onBrand, fontSize: font.lg, fontWeight: "700" },

  sheet: {
    backgroundColor: colors.surfaceSecondary, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md,
  },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: "center" },
  sheetTitle: { fontSize: font.xl, fontWeight: "800", color: colors.onSurface, marginTop: spacing.md },
  sheetSub: { color: colors.muted, fontSize: font.sm, marginBottom: spacing.md },
  shareRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  shareRowName: { fontWeight: "700", color: colors.onSurface, fontSize: font.base },
  shareRowMeta: { color: colors.muted, fontSize: font.sm, marginTop: 2 },
  toast: {
    flexDirection: "row", alignItems: "center", gap: 6,
    alignSelf: "center", marginVertical: spacing.md,
    paddingHorizontal: spacing.md, paddingVertical: 10,
    backgroundColor: colors.brand, borderRadius: radius.pill,
  },
  toastText: { color: "#fff", fontWeight: "700" },
});
