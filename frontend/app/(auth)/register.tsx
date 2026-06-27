import { useState } from "react";
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useAuth, type Role } from "@/src/auth";
import { useI18n } from "@/src/i18n";
import { colors, font, radius, spacing, shadow } from "@/src/theme";

export default function Register() {
  const { signUp } = useAuth();
  const router = useRouter();
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("patient");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    if (!name.trim() || !email.trim() || !password.trim()) {
      setErr("All fields required"); return;
    }
    setBusy(true);
    try {
      await signUp(name.trim(), email.trim(), password, role);
      router.replace("/");
    } catch (e: any) {
      setErr(e.message || "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} testID="register-screen">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Pressable testID="register-back" onPress={() => router.back()} style={styles.back}>
            <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.h1}>{t("register")}</Text>

          <View style={styles.card}>
            <Text style={styles.label}>{t("role")}</Text>
            <View style={styles.roleRow}>
              {(["patient", "clinic_owner"] as Role[]).map((r) => (
                <Pressable
                  key={r}
                  testID={`register-role-${r}`}
                  onPress={() => setRole(r)}
                  style={[styles.roleChip, role === r && styles.roleChipActive]}
                >
                  <Text style={[styles.roleText, role === r && styles.roleTextActive]}>{t(r as any)}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.label, { marginTop: spacing.md }]}>{t("name")}</Text>
            <TextInput testID="register-name" value={name} onChangeText={setName}
              placeholder="Anjali" placeholderTextColor={colors.muted} style={styles.input} />

            <Text style={[styles.label, { marginTop: spacing.md }]}>{t("email")}</Text>
            <TextInput testID="register-email" value={email} onChangeText={setEmail} autoCapitalize="none"
              keyboardType="email-address" placeholder="you@email.com" placeholderTextColor={colors.muted}
              style={styles.input} />

            <Text style={[styles.label, { marginTop: spacing.md }]}>{t("password")}</Text>
            <TextInput testID="register-password" value={password} onChangeText={setPassword} secureTextEntry
              placeholder="••••••••" placeholderTextColor={colors.muted} style={styles.input} />

            {err ? <Text style={styles.err} testID="register-error">{err}</Text> : null}

            <Pressable
              testID="register-submit-button" onPress={submit} disabled={busy}
              style={({ pressed }) => [styles.primaryBtn, (pressed || busy) && { opacity: 0.85 }]}
            >
              <Text style={styles.primaryBtnText}>{busy ? "…" : t("register")}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.lg },
  back: { padding: spacing.sm, alignSelf: "flex-start" },
  h1: { fontSize: font["2xl"], fontWeight: "800", color: colors.onSurface, marginVertical: spacing.lg },
  card: { backgroundColor: colors.surfaceSecondary, padding: spacing.lg, borderRadius: radius.lg, ...shadow.card },
  label: { fontSize: font.sm, fontWeight: "600", color: colors.onSurfaceTertiary },
  input: {
    marginTop: spacing.xs, paddingVertical: spacing.md, paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, color: colors.onSurface, fontSize: font.lg,
  },
  roleRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  roleChip: {
    flex: 1, paddingVertical: spacing.md, paddingHorizontal: spacing.md,
    borderRadius: radius.md, backgroundColor: colors.surfaceTertiary, alignItems: "center",
    borderWidth: 1, borderColor: colors.border,
  },
  roleChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  roleText: { color: colors.onSurfaceTertiary, fontWeight: "600" },
  roleTextActive: { color: colors.onBrand, fontWeight: "700" },
  err: { color: colors.error, marginTop: spacing.md, fontSize: font.sm },
  primaryBtn: { marginTop: spacing.lg, backgroundColor: colors.brand, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: "center" },
  primaryBtnText: { color: colors.onBrand, fontSize: font.lg, fontWeight: "700" },
});
