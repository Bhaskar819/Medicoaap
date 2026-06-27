import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, FlatList, Platform, Pressable, StyleSheet, Text, View, ScrollView,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { BlurView } from "expo-blur";

import { AppMap } from "@/src/AppMap";
import { useAuth } from "@/src/auth";
import { useI18n } from "@/src/i18n";
import { colors, font, radius, spacing, shadow } from "@/src/theme";

type Facility = {
  id: string; name: string; type: "clinic" | "pharmacy"; latitude: number; longitude: number;
  address: string; verified: boolean; student_friendly: boolean; student_discount_pct: number;
  distance_m?: number | null; avg_user_rating: number; user_review_count: number;
  image_url?: string;
};

const RADII = [500, 1000, 2000, 5000, 10000];

export default function PatientHome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { apiFetch, session } = useAuth();
  const { t } = useI18n();

  // Default to Bengaluru Koramangala (so seeded facilities are visible on web fallback).
  const [coords, setCoords] = useState<{ latitude: number; longitude: number }>({
    latitude: 12.9352, longitude: 77.6245,
  });
  const [radius, setRadius] = useState(2000);
  const [type, setType] = useState<"all" | "clinic" | "pharmacy">("all");
  const [studentOnly, setStudentOnly] = useState(false);
  const [items, setItems] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const mapRef = useRef<any>(null);

  // Geolocate user
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        }
      } catch {}
    })();
  }, []);

  // Animate native map when coords change
  useEffect(() => {
    if (Platform.OS !== "web" && mapRef.current?.animateToRegion) {
      mapRef.current.animateToRegion(
        { latitude: coords.latitude, longitude: coords.longitude, latitudeDelta: 0.03, longitudeDelta: 0.03 },
        600
      );
    }
  }, [coords]);

  const fetchNearby = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        lat: String(coords.latitude),
        lng: String(coords.longitude),
        radius_m: String(radius),
      });
      if (type !== "all") params.set("type", type);
      if (studentOnly) params.set("student_only", "true");
      const [verified, discovered] = await Promise.all([
        apiFetch(`/facilities/nearby?${params.toString()}`).catch(() => []),
        studentOnly
          ? Promise.resolve([])
          : apiFetch(`/facilities/discover?${params.toString()}`).catch(() => []),
      ]);
      // Tag and merge: verified ones first, then discovered (OSM) sorted by distance
      const v = (verified || []).map((f: any) => ({ ...f, source: "db" }));
      const d = (discovered || []).map((f: any) => ({ ...f, source: "osm" }));
      // Deduplicate by id
      const seen = new Set(v.map((x: any) => x.id));
      const merged = [...v, ...d.filter((x: any) => !seen.has(x.id))];
      merged.sort((a, b) => (a.distance_m ?? 0) - (b.distance_m ?? 0));
      setItems(merged);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, coords, radius, type, studentOnly]);

  useEffect(() => { fetchNearby(); }, [fetchNearby]);

  const region = useMemo(() => ({
    latitude: coords.latitude, longitude: coords.longitude, latitudeDelta: 0.03, longitudeDelta: 0.03,
  }), [coords]);

  const openDetail = (id: string) => {
    Haptics.selectionAsync().catch(() => {});
    router.push(`/facility/${id}`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="patient-home">
      <AppMap ref={mapRef} region={region} facilities={items} onSelect={openDetail} userLocation={coords} />

      {/* Floating header */}
      <SafeAreaView edges={["top"]} style={styles.headerWrap} pointerEvents="box-none">
        <View style={styles.headerCard}>
          <BlurView intensity={Platform.OS === "ios" ? 50 : 30} tint="light" style={StyleSheet.absoluteFill} />
          <View style={styles.headerInner}>
            <View style={styles.headerTopRow}>
              <View style={styles.greetWrap}>
                <Text style={styles.greetHi}>{t("near_me")}</Text>
                <Text style={styles.greetName} numberOfLines={1}>
                  {session?.user?.name || "Patient"}
                </Text>
              </View>
              <Pressable
                testID="recenter-button"
                onPress={async () => {
                  Haptics.selectionAsync().catch(() => {});
                  const { status } = await Location.requestForegroundPermissionsAsync();
                  if (status === "granted") {
                    const loc = await Location.getCurrentPositionAsync({});
                    setCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
                  }
                }}
                style={styles.recenterBtn}
              >
                <Ionicons name="locate" size={20} color={colors.brand} />
              </Pressable>
            </View>

            {/* Type chips */}
            <ScrollView
              horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
              testID="type-filter-row"
            >
              {(["all", "clinic", "pharmacy"] as const).map((k) => (
                <Pressable
                  key={k}
                  testID={`type-chip-${k}`}
                  onPress={() => { Haptics.selectionAsync().catch(() => {}); setType(k); }}
                  style={[styles.chip, type === k && styles.chipActive]}
                >
                  <Ionicons
                    name={k === "clinic" ? "medkit" : k === "pharmacy" ? "leaf" : "grid"}
                    size={14}
                    color={type === k ? colors.onBrand : colors.onSurfaceTertiary}
                  />
                  <Text style={[styles.chipText, type === k && styles.chipTextActive]}>
                    {k === "all" ? t("all") : k === "clinic" ? t("clinics") : t("pharmacies")}
                  </Text>
                </Pressable>
              ))}
              <Pressable
                testID="student-toggle"
                onPress={() => { Haptics.selectionAsync().catch(() => {}); setStudentOnly((s) => !s); }}
                style={[styles.chip, studentOnly && styles.chipStudent]}
              >
                <Ionicons name="school" size={14} color={studentOnly ? "#fff" : colors.warning} />
                <Text style={[styles.chipText, studentOnly && { color: "#fff" }]}>{t("student_friendly")}</Text>
              </Pressable>
            </ScrollView>

            {/* Radius chips */}
            <ScrollView
              horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
              testID="radius-filter-row"
            >
              {RADII.map((r) => (
                <Pressable
                  key={r}
                  testID={`radius-chip-${r}`}
                  onPress={() => { Haptics.selectionAsync().catch(() => {}); setRadius(r); }}
                  style={[styles.chip, radius === r && styles.chipActive]}
                >
                  <Text style={[styles.chipText, radius === r && styles.chipTextActive]}>
                    {r < 1000 ? `${r}m` : `${r / 1000}km`}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </SafeAreaView>

      {/* Bottom results sheet */}
      <View
        style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 8) + 70 }]}
        testID="results-sheet"
      >
        <View style={styles.sheetHandleWrap}><View style={styles.sheetHandle} /></View>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>
            {loading ? t("loading") : `${items.length} ${items.length === 1 ? "place" : "places"}`}
          </Text>
        </View>
        {loading ? (
          <View style={{ paddingVertical: spacing.lg }}><ActivityIndicator color={colors.brand} /></View>
        ) : items.length === 0 ? (
          <Text style={styles.empty} testID="empty-results">{t("no_results")}</Text>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(i) => i.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.md }}
            renderItem={({ item }) => (
              <Pressable
                testID={`facility-card-${item.id}`}
                onPress={() => openDetail(item.id)}
                style={styles.card}
              >
                <View style={styles.cardHeader}>
                  <View
                    style={[
                      styles.typeBadge,
                      { backgroundColor: item.type === "clinic" ? colors.brandTertiary : "#FCEFE0" },
                    ]}
                  >
                    <Ionicons
                      name={item.type === "clinic" ? "medkit" : "leaf"}
                      size={12}
                      color={item.type === "clinic" ? colors.brand : colors.warning}
                    />
                    <Text style={[styles.typeBadgeText,
                      { color: item.type === "clinic" ? colors.brand : colors.warning }]}>
                      {item.type === "clinic" ? t("clinics") : t("pharmacies")}
                    </Text>
                  </View>
                  {item.verified ? (
                    <View style={styles.verifiedPill} testID={`verified-${item.id}`}>
                      <Ionicons name="shield-checkmark" size={11} color={colors.onBrand} />
                      <Text style={styles.verifiedText}>{t("verified")}</Text>
                    </View>
                  ) : (item as any).source === "osm" ? (
                    <View style={styles.unverifiedPill} testID={`osm-${item.id}`}>
                      <Ionicons name="map" size={10} color={colors.info} />
                      <Text style={styles.unverifiedText}>OSM</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.cardAddress} numberOfLines={1}>{item.address}</Text>
                <View style={styles.cardFooter}>
                  <View style={styles.starRow}>
                    <Ionicons name="star" size={12} color={colors.warning} />
                    <Text style={styles.starText}>
                      {item.avg_user_rating > 0 ? item.avg_user_rating.toFixed(1) : "—"}
                      <Text style={{ color: colors.muted }}> ({item.user_review_count})</Text>
                    </Text>
                  </View>
                  <Text style={styles.distance}>
                    {item.distance_m != null
                      ? item.distance_m < 1000
                        ? `${Math.round(item.distance_m)}m`
                        : `${(item.distance_m / 1000).toFixed(1)}km`
                      : ""}
                  </Text>
                </View>
                {item.student_friendly ? (
                  <View style={styles.studentTag} testID={`student-tag-${item.id}`}>
                    <Ionicons name="school" size={11} color={colors.warning} />
                    <Text style={styles.studentTagText}>{item.student_discount_pct}% off</Text>
                  </View>
                ) : null}
              </Pressable>
            )}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerWrap: { position: "absolute", top: 0, left: 0, right: 0, padding: spacing.md },
  headerCard: {
    borderRadius: radius.lg, overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.85)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.6)",
    ...shadow.floating,
  },
  headerInner: { padding: spacing.md, gap: spacing.sm },
  headerTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  greetWrap: { flex: 1 },
  greetHi: { fontSize: font.sm, color: colors.muted, fontWeight: "500" },
  greetName: { fontSize: font.lg, color: colors.onSurface, fontWeight: "800" },
  recenterBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceSecondary,
    alignItems: "center", justifyContent: "center", ...shadow.card,
  },
  chipRow: { gap: spacing.sm, paddingVertical: 2, paddingRight: spacing.sm },
  chip: {
    flexShrink: 0, height: 36, paddingHorizontal: spacing.md, borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border,
    flexDirection: "row", alignItems: "center", gap: 6,
  },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipStudent: { backgroundColor: colors.warning, borderColor: colors.warning },
  chipText: { color: colors.onSurfaceTertiary, fontWeight: "600", fontSize: font.sm },
  chipTextActive: { color: colors.onBrand },

  sheet: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    backgroundColor: colors.surfaceSecondary,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 6, ...shadow.floating,
  },
  sheetHandleWrap: { alignItems: "center", paddingVertical: spacing.xs },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong },
  sheetHeader: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  sheetTitle: { fontSize: font.lg, fontWeight: "700", color: colors.onSurface },
  empty: { padding: spacing.lg, color: colors.muted, fontSize: font.sm },

  card: {
    width: 240, padding: spacing.md, backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, gap: spacing.xs,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  typeBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill },
  typeBadgeText: { fontSize: font.sm - 1, fontWeight: "700" },
  verifiedPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: colors.brand, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill,
  },
  verifiedText: { color: colors.onBrand, fontSize: font.sm - 2, fontWeight: "700" },
  unverifiedPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: colors.surfaceTertiary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill,
  },
  unverifiedText: { color: colors.info, fontSize: font.sm - 2, fontWeight: "700" },
  cardName: { fontSize: font.lg, fontWeight: "700", color: colors.onSurface, marginTop: 4 },
  cardAddress: { fontSize: font.sm, color: colors.muted },
  cardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.xs },
  starRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  starText: { fontSize: font.sm, color: colors.onSurface, fontWeight: "600" },
  distance: { fontSize: font.sm, color: colors.brand, fontWeight: "700" },
  studentTag: {
    alignSelf: "flex-start", marginTop: 4, flexDirection: "row", alignItems: "center",
    gap: 4, backgroundColor: "#FCEFE0", paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill,
  },
  studentTagText: { color: colors.warning, fontWeight: "700", fontSize: font.sm - 1 },
});
