import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable,
  StyleSheet, Text, TextInput, View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useAuth } from "@/src/auth";
import { useI18n } from "@/src/i18n";
import { colors, font, radius, spacing, shadow } from "@/src/theme";

type Msg = { role: "user" | "assistant"; text: string };

export default function ChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { apiFetch } = useAuth();
  const { lang } = useI18n();
  const listRef = useRef<FlatList<Msg>>(null);

  const [sid, setSid] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [redFlag, setRedFlag] = useState<string | null>(null);
  const [readyFinal, setReadyFinal] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch("/chat/start", {
          method: "POST",
          body: JSON.stringify({ language: lang }),
        });
        setSid(res.session_id);
        setMessages([{ role: "assistant", text: res.greeting }]);
      } catch (e: any) {
        setErr(e.message || "Could not start chat");
      }
    })();
  }, [apiFetch, lang]);

  const send = async () => {
    if (!sid || !draft.trim() || sending) return;
    const text = draft.trim();
    setDraft("");
    setMessages((m) => [...m, { role: "user", text }]);
    setSending(true);
    Haptics.selectionAsync().catch(() => {});
    try {
      const res = await apiFetch("/chat/message", {
        method: "POST",
        body: JSON.stringify({ session_id: sid, text }),
      });
      setMessages((m) => [...m, { role: "assistant", text: res.reply }]);
      setRedFlag(res.red_flag || null);
      setReadyFinal(!!res.ready_to_finalize);
    } catch (e: any) {
      setMessages((m) => [...m, { role: "assistant", text: "Sorry, please try again." }]);
    } finally {
      setSending(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    }
  };

  const finalize = async () => {
    if (!sid || finalizing) return;
    setFinalizing(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    try {
      const card = await apiFetch("/chat/finalize-card", {
        method: "POST",
        body: JSON.stringify({ session_id: sid }),
      });
      router.replace(`/chat/card/${card.id}`);
    } catch (e: any) {
      setErr(e.message || "Could not generate card");
    } finally {
      setFinalizing(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="chat-screen">
      <View style={styles.header}>
        <Pressable testID="chat-back" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Symptom assistant</Text>
          <Text style={styles.sub}>Not a doctor · helps you prep for a clinic visit</Text>
        </View>
        <View style={styles.aiPill}>
          <Ionicons name="sparkles" size={11} color={colors.brand} />
          <Text style={styles.aiPillText}>AI</Text>
        </View>
      </View>

      {redFlag ? (
        <View style={styles.redFlag} testID="red-flag-banner">
          <Ionicons name="warning" size={18} color="#fff" />
          <View style={{ flex: 1 }}>
            <Text style={styles.redFlagTitle}>This sounds urgent</Text>
            <Text style={styles.redFlagText}>Call 108 (ambulance) or go to the nearest ER now.</Text>
          </View>
        </View>
      ) : null}

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item, index }) => (
            <View
              style={[styles.bubble, item.role === "user" ? styles.bubbleUser : styles.bubbleAi]}
              testID={`msg-${index}`}
            >
              <Text style={[styles.bubbleText, item.role === "user" && { color: colors.onBrand }]}>{item.text}</Text>
            </View>
          )}
          ListFooterComponent={sending ? (
            <View style={[styles.bubble, styles.bubbleAi, { flexDirection: "row", alignItems: "center", gap: 8 }]}>
              <ActivityIndicator size="small" color={colors.brand} />
              <Text style={styles.bubbleText}>Thinking…</Text>
            </View>
          ) : null}
        />

        {readyFinal && !redFlag ? (
          <Pressable
            testID="finalize-button"
            disabled={finalizing}
            onPress={finalize}
            style={[styles.finalizeBtn, finalizing && { opacity: 0.6 }]}
          >
            {finalizing ? (
              <ActivityIndicator color={colors.onBrand} />
            ) : (
              <>
                <Ionicons name="document-text" size={18} color={colors.onBrand} />
                <Text style={styles.finalizeText}>Generate symptom card</Text>
              </>
            )}
          </Pressable>
        ) : null}

        <View style={[styles.inputRow, { paddingBottom: Math.max(insets.bottom, 8) + 6 }]}>
          <TextInput
            testID="chat-input"
            value={draft}
            onChangeText={setDraft}
            placeholder="Describe your symptom…"
            placeholderTextColor={colors.muted}
            style={styles.input}
            editable={!!sid && !sending && !redFlag}
            onSubmitEditing={send}
            returnKeyType="send"
            multiline
          />
          <Pressable
            testID="chat-send"
            onPress={send}
            disabled={!sid || sending || !draft.trim() || !!redFlag}
            style={[styles.sendBtn, (!sid || !draft.trim() || sending || !!redFlag) && { opacity: 0.4 }]}
          >
            <Ionicons name="arrow-up" size={20} color={colors.onBrand} />
          </Pressable>
        </View>

        {err ? <Text style={styles.err}>{err}</Text> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.surfaceSecondary, ...shadow.card,
  },
  title: { fontSize: font.lg, fontWeight: "800", color: colors.onSurface },
  sub: { fontSize: font.sm - 1, color: colors.muted, marginTop: 1 },
  aiPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
  },
  aiPillText: { color: colors.brand, fontWeight: "800", fontSize: font.sm - 1 },

  redFlag: {
    margin: spacing.lg, padding: spacing.md, borderRadius: radius.md,
    backgroundColor: colors.error, flexDirection: "row", alignItems: "center", gap: spacing.sm,
  },
  redFlagTitle: { color: "#fff", fontWeight: "800", fontSize: font.base },
  redFlagText: { color: "#fff", opacity: 0.9, fontSize: font.sm, marginTop: 2 },

  bubble: { maxWidth: "85%", padding: spacing.md, borderRadius: 18 },
  bubbleUser: { alignSelf: "flex-end", backgroundColor: colors.brand, borderTopRightRadius: 4 },
  bubbleAi: { alignSelf: "flex-start", backgroundColor: colors.surfaceSecondary, borderTopLeftRadius: 4, ...shadow.card },
  bubbleText: { fontSize: font.base, color: colors.onSurface, lineHeight: 20 },

  finalizeBtn: {
    marginHorizontal: spacing.lg, marginBottom: spacing.sm,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: colors.brand, paddingVertical: 14, borderRadius: radius.md,
  },
  finalizeText: { color: colors.onBrand, fontWeight: "800", fontSize: font.base },

  inputRow: {
    flexDirection: "row", alignItems: "flex-end", gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.divider,
    backgroundColor: colors.surfaceSecondary,
  },
  input: {
    flex: 1, maxHeight: 100, paddingHorizontal: spacing.md, paddingVertical: 10,
    backgroundColor: colors.surfaceTertiary, borderRadius: radius.lg, color: colors.onSurface, fontSize: font.base,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand,
    alignItems: "center", justifyContent: "center",
  },
  err: { color: colors.error, paddingHorizontal: spacing.lg, paddingVertical: 4, fontSize: font.sm },
});
