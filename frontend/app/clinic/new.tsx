import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text,
  TextInput, View, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";

import { useAuth } from "@/src/auth";
import { useI18n } from "@/src/i18n";
import { colors, font, radius, spacing, shadow } from "@/src/theme";

type FType = "clinic" | "pharmacy";

export default function NewFacility() {
  const router = useRouter();
  const { apiFetch } = useAuth();
  const { t } = useI18n();

  const [type, setType] = useState<FType>("clinic");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [phone, setPhone] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [openHours, setOpenHours] = useState("9:00 AM - 9:00 PM");
  const [coords, setCoords] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });
  const [locating, setLocating] = useState(false);
  const [studentFriendly, setStudentFriendly] = useState(false);
  const [discountPct, setDiscountPct] = useState("0");
  const [tags, setTags] = useState(""); // services (clinic) or medicines (pharmacy)
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    // Try to prefill with current location on mount
    pickCurrentLocation(true);
  }, []);

  const pickCurrentLocation = async (silent = false) => {
    if (!silent) Haptics.selectionAsync().catch(() => {});
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        if (!silent) setErr("Location permission denied");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      // Reverse geocode for nicer address prefill
      try {
        const places = await Location.reverseGeocodeAsync(loc.coords);
        const p = places?.[0];
        if (p) {
          if (!address) {
            const parts = [p.name, p.street, p.district].filter(Boolean);
            setAddress(parts.join(", "));
          }
          if (!city && p.city) setCity(p.city);
          if (!state && p.region) setState(p.region);
        }
      } catch {}
    } catch {
      if (!silent) setErr("Could not fetch location");
    } finally {
      setLocating(false);
    }
  };

  const submit = async () => {
    setErr(null);
    if (!name.trim()) return setErr("Name is required");
    if (!address.trim() || !city.trim() || !state.trim()) return setErr("Address, City and State are required");
    if (coords.lat == null || coords.lng == null) return setErr("Tap 'Use my current location' to set coordinates");
    setBusy(true);
    try {
      const tagList = tags
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const body = {
        name: name.trim(),
        type,
        address: address.trim(),
        city: city.trim(),
        state: state.trim(),
        latitude: coords.lat,
        longitude: coords.lng,
        phone: phone.trim() || null,
        image_url: imageUrl.trim() || null,
        open_hours: openHours.trim() || "9:00 AM - 9:00 PM",
        student_friendly: studentFriendly,
        student_discount_pct: Math.max(0, Math.min(99, parseInt(discountPct || "0", 10) || 0)),
        services: type === "clinic" ? tagList : [],
        medicines: type === "pharmacy" ? tagList : [],
      };
      await apiFetch("/facilities", { method: "POST", body: JSON.stringify(body) });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.back();
    } catch (e: any) {
      setErr(e.message || "Failed to create facility");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="new-facility-screen">
      <View style={styles.header}>
        <Pressable testID="new-back" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.h1}>List your facility</Text>
          <Text style={styles.sub}>It'll go live as "Unverified" until our inspector visits.</Text>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Type selector */}
          <Text style={styles.label}>Type</Text>
          <View style={styles.row}>
            {(["clinic", "pharmacy"] as FType[]).map((k) => (
              <Pressable
                key={k}
                testID={`type-${k}`}
                onPress={() => { Haptics.selectionAsync().catch(() => {}); setType(k); }}
                style={[styles.typeChip, type === k && styles.typeChipActive]}
              >
                <Ionicons
                  name={k === "clinic" ? "medkit" : "leaf"}
                  size={16}
                  color={type === k ? colors.onBrand : colors.onSurfaceTertiary}
                />
                <Text style={[styles.typeChipText, type === k && { color: colors.onBrand }]}>
                  {k === "clinic" ? t("clinics") : t("pharmacies")}
                </Text>
              </Pressable>
            ))}
          </View>

          <Field
            label="Facility name *"
            value={name}
            onChange={setName}
            placeholder={type === "clinic" ? "e.g. Medant Medi Clinic" : "e.g. Verma Chemist"}
            testID="field-name"
          />
          <Field
            label="Street address *"
            value={address}
            onChange={setAddress}
            placeholder="House #, Street, Sector / Society"
            testID="field-address"
            multiline
          />
          <View style={styles.rowEqual}>
            <View style={{ flex: 1 }}>
              <Field label="City *" value={city} onChange={setCity} placeholder="Gurugram" testID="field-city" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="State *" value={state} onChange={setState} placeholder="Haryana" testID="field-state" />
            </View>
          </View>
          <Field
            label="Phone (optional)"
            value={phone}
            onChange={setPhone}
            placeholder="+91…"
            keyboardType="phone-pad"
            testID="field-phone"
          />
          <Field
            label="Open hours"
            value={openHours}
            onChange={setOpenHours}
            placeholder="9:00 AM - 9:00 PM"
            testID="field-hours"
          />
          <Field
            label="Image URL (optional)"
            value={imageUrl}
            onChange={setImageUrl}
            placeholder="https://…"
            autoCapitalize="none"
            testID="field-image"
          />

          {/* Location card */}
          <Text style={[styles.label, { marginTop: spacing.md }]}>Location *</Text>
          <View style={styles.locCard}>
            <View style={{ flex: 1 }}>
              {coords.lat != null && coords.lng != null ? (
                <>
                  <Text style={styles.locTitle}>
                    {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                  </Text>
                  <Text style={styles.locSub}>Pinned at your current GPS</Text>
                </>
              ) : (
                <>
                  <Text style={styles.locTitle}>Not set</Text>
                  <Text style={styles.locSub}>Tap to use your current location</Text>
                </>
              )}
            </View>
            <Pressable
              testID="use-location-button"
              onPress={() => pickCurrentLocation()}
              style={styles.locBtn}
              disabled={locating}
            >
              {locating ? (
                <ActivityIndicator color={colors.onBrand} />
              ) : (
                <>
                  <Ionicons name="locate" size={14} color={colors.onBrand} />
                  <Text style={styles.locBtnText}>Use my location</Text>
                </>
              )}
            </Pressable>
          </View>

          {/* Student friendly toggle */}
          <View style={[styles.studentCard, studentFriendly && styles.studentCardOn]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{t("student_friendly")}</Text>
              <Text style={styles.sub}>Show your facility to students with a special discount.</Text>
            </View>
            <Switch
              testID="student-switch"
              value={studentFriendly}
              onValueChange={(v) => { Haptics.selectionAsync().catch(() => {}); setStudentFriendly(v); }}
              trackColor={{ true: colors.warning, false: colors.borderStrong }}
              thumbColor="#fff"
            />
          </View>
          {studentFriendly ? (
            <Field
              label="Discount %"
              value={discountPct}
              onChange={setDiscountPct}
              keyboardType="number-pad"
              placeholder="10"
              testID="field-discount"
            />
          ) : null}

          {/* Services / medicines */}
          <Field
            label={type === "clinic" ? "Services offered (comma-separated)" : "Medicines in stock (comma-separated)"}
            value={tags}
            onChange={setTags}
            placeholder={type === "clinic"
              ? "General Consult, Vaccination, Lab Tests"
              : "Paracetamol, Crocin, Insulin, Cetirizine"}
            multiline
            testID="field-tags"
          />

          {err ? <Text style={styles.err} testID="new-error">{err}</Text> : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={styles.cta}>
        <Pressable
          testID="submit-facility-button"
          onPress={submit}
          disabled={busy}
          style={[styles.submitBtn, busy && { opacity: 0.7 }]}
        >
          {busy ? (
            <ActivityIndicator color={colors.onBrand} />
          ) : (
            <>
              <Ionicons name="add-circle" size={18} color={colors.onBrand} />
              <Text style={styles.submitText}>Submit for inspection</Text>
            </>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const Field = ({
  label, value, onChange, placeholder, testID, multiline, keyboardType, autoCapitalize,
}: {
  label: string; value: string; onChange: (s: string) => void; placeholder?: string; testID?: string;
  multiline?: boolean; keyboardType?: any; autoCapitalize?: any;
}) => (
  <View style={{ marginTop: spacing.md }}>
    <Text style={styles.label}>{label}</Text>
    <TextInput
      testID={testID}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={colors.muted}
      style={[styles.input, multiline && { minHeight: 64, textAlignVertical: "top" }]}
      multiline={multiline}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize}
    />
  </View>
);

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
    flexDirection: "row", alignItems: "flex-start", gap: spacing.sm,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.surfaceSecondary, ...shadow.card,
  },
  h1: { fontSize: font.xl, fontWeight: "800", color: colors.onSurface, marginTop: 4 },
  sub: { fontSize: font.sm, color: colors.muted, marginTop: 2 },
  label: { fontSize: font.sm, color: colors.onSurfaceTertiary, fontWeight: "700" },

  row: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  rowEqual: { flexDirection: "row", gap: spacing.sm },
  typeChip: {
    flex: 1, height: 48, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary,
    borderWidth: 1, borderColor: colors.border,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
  },
  typeChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  typeChipText: { fontWeight: "700", color: colors.onSurfaceTertiary },

  input: {
    marginTop: 6, paddingVertical: spacing.md, paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, color: colors.onSurface, fontSize: font.lg,
  },

  locCard: {
    marginTop: 6, padding: spacing.md, borderRadius: radius.md,
    backgroundColor: colors.brandTertiary, borderWidth: 1, borderColor: colors.brandSecondary,
    flexDirection: "row", alignItems: "center", gap: spacing.md,
  },
  locTitle: { fontWeight: "800", color: colors.brand, fontSize: font.lg },
  locSub: { color: colors.onSurfaceTertiary, fontSize: font.sm, marginTop: 2 },
  locBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: 10,
    backgroundColor: colors.brand, borderRadius: radius.pill,
  },
  locBtnText: { color: colors.onBrand, fontWeight: "700", fontSize: font.sm },

  studentCard: {
    marginTop: spacing.lg, padding: spacing.md, borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border,
    flexDirection: "row", alignItems: "center", gap: spacing.md,
  },
  studentCardOn: { backgroundColor: "#FCEFE0", borderColor: colors.warning },

  err: { color: colors.error, marginTop: spacing.md, fontSize: font.sm, fontWeight: "600" },

  cta: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    padding: spacing.md, backgroundColor: colors.surfaceSecondary,
    borderTopWidth: 1, borderTopColor: colors.divider,
  },
  submitBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: colors.brand, paddingVertical: 16, borderRadius: radius.md,
  },
  submitText: { color: colors.onBrand, fontSize: font.lg, fontWeight: "700" },
});
