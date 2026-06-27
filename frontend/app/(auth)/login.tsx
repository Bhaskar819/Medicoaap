import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "@/src/auth";
import { useI18n, LANGUAGES, type Lang } from "@/src/i18n";
import { colors, font, radius, spacing, shadow } from "@/src/theme";

export default function Login() {
  const { signIn } = useAuth();
  const router = useRouter();
  const { t, lang, setLang } = useI18n();
  const [email, setEmail] = useState("patient@aarogya.in");
  const [password, setPassword] = useState("Password@123");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    setBusy(true);
    try {
      await signIn(email.trim(), password);
      router.replace("/");
    } catch (e: any) {
      setErr(e.message || "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} testID="login-screen">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.logoWrap}>
            <View style={styles.logo}>
              <Ionicons name="medkit" size={28} color={colors.onBrand} />
            </View>
            <Text style={styles.appName}>{t("app_name")}</Text>
            <Text style={styles.tagline}>{t("tagline")}</Text>
          </View>

          <View style={styles.langRow}>
            {LANGUAGES.map((l) => (
              <Pressable
                key={l.code}
                onPress={() => setLang(l.code as Lang)}
                testID={`lang-${l.code}`}
                style={[styles.langChip, lang === l.code && styles.langChipActive]}
              >
                <Text style={[styles.langText, lang === l.code && styles.langTextActive]}>{l.native}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>{t("email")}</Text>
            <TextInput
              testID="login-email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="you@email.com"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
            <Text style={[styles.label, { marginTop: spacing.md }]}>{t("password")}</Text>
            <TextInput
              testID="login-password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
            {err ? <Text style={styles.err} testID="login-error">{err}</Text> : null}
            <Pressable
              testID="login-submit-button"
              onPress={submit}
              disabled={busy}
              style={({ pressed }) => [styles.primaryBtn, (pressed || busy) && { opacity: 0.85 }]}
            >
              <Text style={styles.primaryBtnText}>{busy ? "…" : t("login")}</Text>
            </Pressable>
            <Link href="/(auth)/register" asChild>
              <Pressable testID="goto-register" style={styles.linkBtn}>
                <Text style={styles.linkText}>{t("register")} →</Text>
              </Pressable>
            </Link>
          </View>

          <View style={styles.hintBox} testID="demo-credentials">
            <Text style={styles.hintTitle}>Demo accounts</Text>
            <Text style={styles.hintText}>patient@aarogya.in</Text>
            <Text style={styles.hintText}>clinic@aarogya.in</Text>
            <Text style={styles.hintText}>admin@aarogya.in</Text>
            <Text style={[styles.hintText, { marginTop: 4 }]}>Password: Password@123</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  scroll: { flexGrow: 1, padding: spacing.lg, paddingBottom: spacing["2xl"] },
  logoWrap: { alignItems: "center", marginTop: spacing.xl, marginBottom: spacing.lg },
  logo: {
    width: 56, height: 56, borderRadius: radius.lg, backgroundColor: colors.brand,
    alignItems: "center", justifyContent: "center", ...shadow.card,
  },
  appName: { fontSize: font["2xl"], fontWeight: "800", color: colors.onSurface, marginTop: spacing.md },
  tagline: { fontSize: font.base, color: colors.muted, marginTop: 4 },
  langRow: {
    flexDirection: "row", flexWrap: "wrap", justifyContent: "center",
    gap: spacing.sm, marginVertical: spacing.lg,
  },
  langChip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary,
    borderWidth: 1, borderColor: colors.border,
  },
  langChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  langText: { color: colors.onSurface, fontSize: font.sm, fontWeight: "500" },
  langTextActive: { color: colors.onBrand, fontWeight: "700" },
  card: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
    padding: spacing.lg, ...shadow.card, marginTop: spacing.sm,
  },
  label: { fontSize: font.sm, fontWeight: "600", color: colors.onSurfaceTertiary },
  input: {
    marginTop: spacing.xs, paddingVertical: spacing.md, paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, color: colors.onSurface,
    fontSize: font.lg,
  },
  err: { color: colors.error, marginTop: spacing.md, fontSize: font.sm },
  primaryBtn: {
    marginTop: spacing.lg, backgroundColor: colors.brand, paddingVertical: spacing.md,
    borderRadius: radius.md, alignItems: "center",
  },
  primaryBtnText: { color: colors.onBrand, fontSize: font.lg, fontWeight: "700" },
  linkBtn: { marginTop: spacing.md, alignItems: "center" },
  linkText: { color: colors.brand, fontWeight: "600" },
  hintBox: {
    marginTop: spacing.lg, padding: spacing.md, borderRadius: radius.md,
    backgroundColor: colors.brandTertiary,
  },
  hintTitle: { fontSize: font.sm, color: colors.brand, fontWeight: "700", marginBottom: 4 },
  hintText: { fontSize: font.sm, color: colors.onSurfaceTertiary },
});
