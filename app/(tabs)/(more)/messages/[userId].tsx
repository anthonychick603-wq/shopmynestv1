import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";

import { nest, type NestMessageRaw } from "@/src/api/nest";
import { colors, radius, shadows, spacing } from "@/src/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { toast } from "@/src/components/Toast";
import { decodeEntities } from "@/src/utils/html";
import { useAuth } from "@/src/context/AuthContext";

// Format a MySQL UTC timestamp as a friendly time-of-day / date line above a
// message bubble ("Today 3:14 PM", "Yesterday 11:02 AM", "Mar 4 3:14 PM").
function formatBubbleTime(iso: string): string {
  const utc = iso.includes("T") ? iso : iso.replace(" ", "T") + "Z";
  const d = new Date(utc);
  if (Number.isNaN(d.getTime())) return "";
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return `Today ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${time}`;
}

// Auto-link any http(s) URL inside a message body so tapped links open naturally
// in the system browser (bubble stays a plain <Text> so long-press-to-copy works).
function renderBody(body: string) {
  const parts = body.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((p, i) => {
    if (/^https?:\/\//.test(p)) {
      return (
        <Text
          key={i}
          style={styles.linkText}
          onPress={async () => {
            try {
              const WB = await import("expo-web-browser");
              await WB.openBrowserAsync(p);
            } catch {}
          }}
        >
          {p}
        </Text>
      );
    }
    return <Text key={i}>{p}</Text>;
  });
}

export default function MessageThread() {
  const router = useRouter();
  const params = useLocalSearchParams<{ userId: string; name?: string; productId?: string; draft?: string }>();
  const { user } = useAuth();

  const otherId = Number(params.userId);
  const productId = params.productId ? Number(params.productId) : 0;
  const headerName = decodeEntities(params.name || "Shop");

  const [messages, setMessages] = useState<NestMessageRaw[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<string>(typeof params.draft === "string" ? params.draft : "");
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<NestMessageRaw>>(null);

  const load = useCallback(async () => {
    if (!user || !otherId) return;
    try {
      const rows = await nest.getConversation(otherId, 200);
      setMessages(Array.isArray(rows) ? rows : []);
    } catch (e: any) {
      toast.error(e?.friendly || "Could not load conversation.");
    } finally {
      setLoading(false);
    }
  }, [user, otherId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!loading && messages.length && listRef.current) {
      // Wait a tick for layout so scrollToEnd lands on the newest bubble.
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 40);
    }
  }, [loading, messages.length]);

  const onSend = async () => {
    const body = draft.trim();
    if (!body || sending || !otherId) return;
    setSending(true);
    // Optimistic bubble so the thread feels instant. If the send fails we swap it
    // for an error line so the user knows to retry.
    const tempId = -Date.now();
    const optimistic: NestMessageRaw = {
      id: tempId,
      sender_id: user!.id,
      recipient_id: otherId,
      message: body,
      is_read: false,
      created_at: new Date().toISOString().slice(0, 19).replace("T", " "),
    };
    setMessages((prev) => [...prev, optimistic]);
    setDraft("");
    try {
      await nest.sendMessage({ recipient_id: otherId, message: body, product_id: productId || undefined });
      // Reload to get the server-authoritative row (server may prepend product context).
      await load();
    } catch (e: any) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      toast.error(e?.friendly || "Message could not be sent.");
      setDraft(body);
    } finally {
      setSending(false);
    }
  };

  const canSend = useMemo(() => !!draft.trim() && !sending, [draft, sending]);

  if (!user) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.top}>
          <TouchableOpacity onPress={() => router.back()} style={styles.topBtn} testID="thread-back">
            <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
          </TouchableOpacity>
          <Text style={styles.topTitle} numberOfLines={1}>{headerName}</Text>
          <View style={styles.topBtn} />
        </View>
        <EmptyState icon="chatbubble-ellipses-outline" title="Sign in to send messages" message="Sign in to talk to shops on MyNest." testID="thread-signin" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.top}>
        <TouchableOpacity onPress={() => router.back()} style={styles.topBtn} testID="thread-back">
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <TouchableOpacity
          style={{ flex: 1 }}
          onPress={() => router.push({ pathname: "/seller/[id]", params: { id: String(otherId) } })}
          testID="thread-open-shop"
        >
          <Text style={styles.topTitle} numberOfLines={1}>{headerName}</Text>
          <Text style={styles.topSubtitle} numberOfLines={1}>Tap to view shop</Text>
        </TouchableOpacity>
        <View style={styles.topBtn} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        {loading ? (
          <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => String(m.id)}
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
            renderItem={({ item, index }) => {
              const mine = item.sender_id === user.id;
              const prev = index > 0 ? messages[index - 1] : null;
              // Show a timestamp header every ~15 minutes or when speakers switch.
              const showTime =
                !prev ||
                Math.abs(new Date(item.created_at.replace(" ", "T") + "Z").getTime() -
                  new Date(prev.created_at.replace(" ", "T") + "Z").getTime()) > 15 * 60 * 1000;
              return (
                <View>
                  {showTime ? <Text style={styles.timeLabel}>{formatBubbleTime(item.created_at)}</Text> : null}
                  <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                    <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]} selectable>
                      {renderBody(item.message)}
                    </Text>
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={
              <EmptyState
                icon="chatbubble-ellipses-outline"
                title="Say hi"
                message={`Start a conversation with ${headerName}. They'll be notified.`}
                testID="thread-empty"
              />
            }
          />
        )}

        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="Write a message…"
            placeholderTextColor={colors.onSurfaceMuted}
            multiline
            maxLength={5000}
            editable={!sending}
            testID="thread-input"
          />
          <TouchableOpacity
            style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
            onPress={onSend}
            disabled={!canSend}
            testID="thread-send"
          >
            {sending ? (
              <ActivityIndicator color={colors.onBrand} />
            ) : (
              <Ionicons name="send" size={18} color={colors.onBrand} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  top: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.md },
  topBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, ...shadows.card },
  topTitle: { fontSize: 16, fontWeight: "800", color: colors.onSurface, textAlign: "center" },
  topSubtitle: { fontSize: 11, color: colors.onSurfaceMuted, textAlign: "center", marginTop: 2 },
  bubble: { maxWidth: "82%", paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.md, borderRadius: radius.md },
  bubbleTheirs: { alignSelf: "flex-start", backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 4 },
  bubbleMine: { alignSelf: "flex-end", backgroundColor: colors.brand, borderBottomRightRadius: 4 },
  bubbleText: { fontSize: 14.5, color: colors.onSurface, lineHeight: 20 },
  bubbleTextMine: { color: colors.onBrand },
  linkText: { textDecorationLine: "underline" },
  timeLabel: { fontSize: 11, color: colors.onSurfaceMuted, textAlign: "center", marginTop: spacing.sm, marginBottom: 2 },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.surface },
  input: { flex: 1, minHeight: 40, maxHeight: 140, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, color: colors.onSurface, fontSize: 15 },
  sendBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.brand },
  sendBtnDisabled: { opacity: 0.5 },
});
