import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";

import { nest, ApiError, type NestPostCommentRaw } from "@/src/api/nest";
import { colors, radius, shadows, spacing } from "@/src/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { AppImage } from "@/src/components/AppImage";
import { toast } from "@/src/components/Toast";
import { useAuth } from "@/src/context/AuthContext";
import { safeBack } from "@/src/utils/nav";
import { haptics } from "@/src/utils/haptics";

const MAX_LENGTH = 2000;

function timeAgo(iso?: string): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w ago`;
  return new Date(then).toLocaleDateString();
}

export default function PostComments() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();

  const [comments, setComments] = useState<NestPostCommentRaw[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const res = await nest.getPostComments(id, { page: 1, per_page: 50 });
      setComments(res.comments || []);
    } catch (e) {
      setError(e instanceof ApiError ? e.friendly : "Could not load comments.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    const content = draft.trim();
    if (!content) return toast.error("Write a comment first.");
    if (content.length > MAX_LENGTH) return toast.error(`Comments can be up to ${MAX_LENGTH} characters.`);
    setSending(true);
    try {
      const created = await nest.addPostComment(id, content);
      setComments((prev) => [...prev, created]);
      setDraft("");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.friendly : "Could not post your comment.");
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Top onBack={() => safeBack(router, "/(tabs)")} />
      {/* v1.0.113 — behavior='height' on Android so the composer isn't hidden
          by the soft keyboard under edge-to-edge layout. */}
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        {loading ? (
          <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
        ) : error ? (
          <EmptyState icon="cloud-offline-outline" title="Couldn't load comments" message={error} actionLabel="Retry" onAction={load} testID="comments-error" />
        ) : (
          <FlatList
            testID="comments-list"
            data={comments}
            keyExtractor={(c) => String(c.id)}
            contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.lg, flexGrow: 1 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  load();
                }}
                tintColor={colors.brand}
                colors={[colors.brand]}
              />
            }
            renderItem={({ item }) => <CommentRow comment={item} />}
            ListEmptyComponent={
              <EmptyState
                icon="chatbubble-outline"
                title="No comments yet"
                message="Be the first to comment on this post."
                testID="comments-empty"
              />
            }
          />
        )}

        {user ? (
          <View style={[styles.composer, { paddingBottom: spacing.sm }]}>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder="Add a comment…"
              placeholderTextColor={colors.onSurfaceMuted}
              multiline
              maxLength={MAX_LENGTH}
              testID="comments-input"
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!draft.trim() || sending) && styles.sendBtnDisabled]}
              onPress={() => { haptics.press(); submit(); }}
              disabled={!draft.trim() || sending}
              testID="comments-send"
              accessibilityRole="button"
              accessibilityLabel="Send comment"
              accessibilityState={{ disabled: !draft.trim() || sending }}
            >
              {sending ? <ActivityIndicator color={colors.onBrand} size="small" /> : <Ionicons name="send" size={18} color={colors.onBrand} />}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.signIn, { paddingBottom: spacing.sm }]}>
            <Text style={styles.signInText}>Sign in to join the conversation.</Text>
            <TouchableOpacity style={styles.signInBtn} onPress={() => { haptics.tap(); router.push("/(auth)/login"); }} testID="comments-signin">
              <Text style={styles.signInBtnText}>Sign in</Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function CommentRow({ comment }: { comment: NestPostCommentRaw }) {
  return (
    <View style={styles.row} testID={`comment-${comment.id}`}>
      {comment.author?.avatar ? (
        <AppImage source={{ uri: comment.author.avatar }} style={styles.avatar} fallbackIcon="person-outline" />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}><Ionicons name="leaf" size={16} color={colors.brand} /></View>
      )}
      <View style={{ flex: 1 }}>
        <View style={styles.rowHead}>
          <Text style={styles.author} numberOfLines={1}>{comment.author?.name || "Someone"}</Text>
          <Text style={styles.date}>{timeAgo(comment.created_at)}</Text>
        </View>
        <Text style={styles.content}>{comment.content}</Text>
      </View>
    </View>
  );
}

function Top({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.top}>
      <TouchableOpacity onPress={() => { haptics.tap(); onBack(); }} style={styles.topBtn} testID="comments-back" accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8}><Ionicons name="chevron-back" size={22} color={colors.onSurface} /></TouchableOpacity>
      <Text style={styles.topTitle}>Comments</Text>
      <CartHeaderButton />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md },
  topTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  topBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, ...shadows.card },
  row: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceTertiary },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  rowHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  author: { fontSize: 14, fontWeight: "800", color: colors.onSurface, flexShrink: 1 },
  date: { fontSize: 12, color: colors.onSurfaceMuted },
  content: { fontSize: 14, color: colors.onSurface, lineHeight: 20, marginTop: 2 },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.surface },
  input: { flex: 1, maxHeight: 120, minHeight: 44, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.onSurface, fontSize: 14, ...shadows.card },
  sendBtn: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  sendBtnDisabled: { opacity: 0.5 },
  signIn: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.surface },
  signInText: { flex: 1, fontSize: 14, color: colors.onSurfaceMuted },
  signInBtn: { backgroundColor: colors.brand, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  signInBtnText: { color: colors.onBrand, fontWeight: "800", fontSize: 14 },
});
