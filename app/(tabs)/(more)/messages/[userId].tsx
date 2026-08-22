import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  RefreshControl,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Image as ExpoImage } from "expo-image";

import { nest, type NestMessagePhoto, type NestMessageRaw } from "@/src/api/nest";
import { colors, radius, shadows, spacing } from "@/src/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { toast } from "@/src/components/Toast";
import { decodeEntities } from "@/src/utils/html";
import { useAuth } from "@/src/context/AuthContext";
import { safeBack } from "@/src/utils/nav";
import { haptics } from "@/src/utils/haptics";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";
import { parseServerDate } from "@/src/utils/datetime";

// Format a MySQL UTC timestamp as a friendly time-of-day / date line above a
// message bubble ("Today 3:14 PM", "Yesterday 11:02 AM", "Mar 4 3:14 PM").
function formatBubbleTime(iso: string): string {
  const utc = iso.includes("T") ? iso : iso.replace(" ", "T") + "Z";
  const d = parseServerDate(utc);
  if (!d) return "";
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

function withOrderContext(body: string, orderId?: string): string {
  if (!orderId) return body;
  const marker = `[Order #${orderId}]`;
  return body ? `${marker}\n${body}` : marker;
}

function parseOrderContext(raw: string): { orderId?: string; body: string } {
  const text = raw || "";
  const match = text.match(/^\[Order #([^\]\r\n]+)\](?:\r?\n)?/);
  if (!match) return { body: text };
  return { orderId: match[1].trim(), body: text.slice(match[0].length) };
}

// Draft photo the user has picked but not yet sent. `uri` is the local Expo
// file URI, `uploading` is true while the multipart upload is in flight, and
// `attachmentId` is set once the server acknowledges the upload.
type DraftPhoto = {
  key: string;
  uri: string;
  uploading: boolean;
  attachmentId?: number;
  error?: string;
};

// Photo grid inside a bubble. Renders 1–5 tiles with a Messenger-like layout:
// - 1: full-width up to 220px tall
// - 2: side by side
// - 3: one big + two stacked
// - 4: 2x2 grid
// - 5: one big + four in a 2x2
function PhotoGrid({
  photos,
  bubbleMaxWidth,
  onPress,
  onLongPress,
}: {
  photos: NestMessagePhoto[];
  bubbleMaxWidth: number;
  onPress: (index: number) => void;
  onLongPress: (photo: NestMessagePhoto) => void;
}) {
  const n = photos.length;
  if (n === 0) return null;
  const gap = 3;
  const inner = bubbleMaxWidth;
  const renderTile = (p: NestMessagePhoto, idx: number, w: number, h: number) => (
    <Pressable
      key={p.id}
      onPress={() => onPress(idx)}
      onLongPress={() => onLongPress(p)}
      style={{ width: w, height: h, borderRadius: 10, overflow: "hidden", backgroundColor: colors.surfaceSecondary }}
    >
      {p.hidden ? (
        <View style={styles.hiddenTile}>
          <Ionicons name="eye-off-outline" size={20} color={colors.onSurfaceMuted} />
          <Text style={styles.hiddenText}>Hidden</Text>
        </View>
      ) : (
        <ExpoImage source={{ uri: p.url }} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={120} />
      )}
    </Pressable>
  );
  if (n === 1) {
    const p = photos[0];
    const ratio = p.w && p.h ? p.w / p.h : 4 / 3;
    const w = Math.min(inner, 260);
    const h = Math.max(120, Math.min(320, w / ratio));
    return <View>{renderTile(p, 0, w, h)}</View>;
  }
  if (n === 2) {
    const w = (inner - gap) / 2;
    return (
      <View style={{ flexDirection: "row", gap }}>
        {photos.map((p, i) => renderTile(p, i, w, w))}
      </View>
    );
  }
  if (n === 3) {
    const big = Math.round(inner * 0.62);
    const small = inner - big - gap;
    const smallH = (big - gap) / 2;
    return (
      <View style={{ flexDirection: "row", gap }}>
        {renderTile(photos[0], 0, big, big)}
        <View style={{ gap }}>
          {renderTile(photos[1], 1, small, smallH)}
          {renderTile(photos[2], 2, small, smallH)}
        </View>
      </View>
    );
  }
  if (n === 4) {
    const w = (inner - gap) / 2;
    return (
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap }}>
        {photos.map((p, i) => renderTile(p, i, w, w))}
      </View>
    );
  }
  // 5
  const big = inner;
  const small = (inner - gap * 3) / 4;
  return (
    <View style={{ gap }}>
      {renderTile(photos[0], 0, big, Math.min(220, big * 0.62))}
      <View style={{ flexDirection: "row", gap }}>
        {photos.slice(1).map((p, i) => renderTile(p, i + 1, small, small))}
      </View>
    </View>
  );
}

export default function MessageThread() {
  const router = useRouter();
  const params = useLocalSearchParams<{ userId: string; name?: string; productId?: string; draft?: string; orderId?: string; orderTitle?: string }>();
  const { user } = useAuth();

  const otherId = Number(params.userId);
  const productId = params.productId ? Number(params.productId) : 0;
  const headerName = decodeEntities(params.name || "Shop");
  const orderId = typeof params.orderId === "string" ? params.orderId.trim() : "";
  const orderTitle = typeof params.orderTitle === "string" ? decodeEntities(params.orderTitle) : "";

  const [messages, setMessages] = useState<NestMessageRaw[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<string>(typeof params.draft === "string" ? params.draft : "");
  // v1.0.114 — Quick replies removed. The seller canned-reply sheet and
  // manager screen were deleted, so there is no templatesOpen state.
  const [drafts, setDrafts] = useState<DraftPhoto[]>([]);
  const [sending, setSending] = useState(false);
  const [viewer, setViewer] = useState<{ photos: NestMessagePhoto[]; index: number } | null>(null);
  const listRef = useRef<FlatList<NestMessageRaw>>(null);

  const [refreshing, setRefreshing] = useState(false);

  // v1.0.95 — cancel guard so backing out mid-fetch doesn't setState on
  // an unmounted conversation.
  const cancelRef = useRef({ cancelled: false });
  useEffect(() => () => { cancelRef.current.cancelled = true; }, []);

  const load = useCallback(async () => {
    if (!user || !otherId) return;
    try {
      const rows = await nest.getConversation(otherId, 200);
      if (cancelRef.current.cancelled) return;
      setMessages(Array.isArray(rows) ? rows : []);
    } catch (e: any) {
      if (cancelRef.current.cancelled) return;
      toast.error(e?.friendly || "Could not load conversation.");
    } finally {
      if (!cancelRef.current.cancelled) setLoading(false);
    }
  }, [user, otherId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!loading && messages.length && listRef.current) {
      // Wait a tick for layout so scrollToEnd lands on the newest bubble.
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 40);
    }
  }, [loading, messages.length]);

  // v3.7.86 — pick up to (5 - alreadyDrafted) photos, compress each locally, then
  // upload them in parallel. Progress state lives in `drafts` so the composer can
  // show a preview strip with per-tile spinners.
  const pickAndUploadPhotos = useCallback(async () => {
    if (!otherId || sending) return;
    const remaining = 5 - drafts.length;
    if (remaining <= 0) {
      toast.info("You can attach up to 5 photos per message.");
      return;
    }
    let ImagePicker: any;
    let ImageManipulator: any;
    try {
      ImagePicker = await import("expo-image-picker");
      ImageManipulator = await import("expo-image-manipulator");
    } catch {
      toast.error("Photo picker is unavailable.");
      return;
    }
    const perms = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perms.granted) {
      toast.error("Photo library access is required to send photos.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions?.Images ?? "Images",
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.9,
    });
    if (res.canceled || !res.assets?.length) return;

    const picks = res.assets.slice(0, remaining);
    const newDrafts: DraftPhoto[] = picks.map((a: any) => ({
      key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      uri: a.uri,
      uploading: true,
    }));
    setDrafts((prev) => [...prev, ...newDrafts]);

    // Upload each pick in parallel with per-item error handling so a single
    // failure doesn't take the batch down.
    await Promise.all(newDrafts.map(async (d, i) => {
      try {
        // Compress to max 2048px longer edge, JPEG q=0.82. Keeps most uploads
        // well under the 8 MB server cap.
        const manip = await ImageManipulator.manipulateAsync(d.uri, [{ resize: { width: 2048 } }], {
          compress: 0.82,
          format: ImageManipulator.SaveFormat.JPEG,
        });
        const fd = new FormData();
        fd.append("recipient_id", String(otherId));
        fd.append("file", {
          uri: manip.uri,
          name: `photo-${d.key}.jpg`,
          type: "image/jpeg",
        } as any);
        const resp = await nest.uploadMessagePhoto(fd);
        setDrafts((prev) => prev.map((p) => (p.key === d.key ? { ...p, uploading: false, attachmentId: resp.attachment_id } : p)));
      } catch (e: any) {
        setDrafts((prev) => prev.map((p) => (p.key === d.key ? { ...p, uploading: false, error: e?.friendly || "Upload failed" } : p)));
        toast.error(e?.friendly || "One photo could not be uploaded.");
      }
    }));
  }, [drafts.length, otherId, sending]);

  const removeDraft = useCallback((key: string) => {
    setDrafts((prev) => prev.filter((p) => p.key !== key));
  }, []);

  const onSend = async () => {
    const body = draft.trim();
    const wireBody = withOrderContext(body, orderId || undefined);
    const readyIds = drafts.filter((d) => !d.uploading && !d.error && d.attachmentId).map((d) => d.attachmentId!) as number[];
    if ((!body && readyIds.length === 0) || sending || !otherId) return;
    // Block send while any photo is still uploading so we don't drop attachments.
    if (drafts.some((d) => d.uploading)) {
      toast.info("Wait for photos to finish uploading.");
      return;
    }
    // v1.0.71 — tap on commit, success on server ack, error handled below.
    haptics.tap();
    setSending(true);
    const tempId = -Date.now();
    const optimistic: NestMessageRaw = {
      id: tempId,
      // v1.0.71 — NestMessageRaw declares these as number; User.id is a
      // string in our types, so coerce here (server-side ids are all numeric).
      sender_id: Number(user!.id),
      recipient_id: otherId,
      message: wireBody,
      is_read: false,
      created_at: new Date().toISOString().slice(0, 19).replace("T", " "),
      photos: drafts
        .filter((d) => d.attachmentId)
        .map((d) => ({ id: d.attachmentId!, url: d.uri, w: 0, h: 0, mime: "image/jpeg", hidden: false })),
    };
    setMessages((prev) => [...prev, optimistic]);
    setDraft("");
    setDrafts([]);
    try {
      await nest.sendMessage({ recipient_id: otherId, message: wireBody, product_id: productId || undefined, photo_ids: readyIds });
      // Reload to get server-authoritative rows (fresh signed URLs, etc.).
      await load();
      haptics.success();
    } catch (e: any) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      haptics.error();
      toast.error(e?.friendly || "Message could not be sent.");
      setDraft(body);
      // Keep drafts in the composer so the user can retry send without re-picking.
      setDrafts(optimistic.photos!.map((p) => ({
        key: `retry-${p.id}`,
        uri: p.url,
        uploading: false,
        attachmentId: p.id,
      })));
    } finally {
      setSending(false);
    }
  };

  const canSend = useMemo(() => {
    if (sending) return false;
    if (drafts.some((d) => d.uploading)) return false;
    const readyPhotos = drafts.some((d) => d.attachmentId && !d.error);
    return !!draft.trim() || readyPhotos;
  }, [draft, drafts, sending]);

  const onPhotoLongPress = useCallback((photo: NestMessagePhoto, messageId: number) => {
    if (photo.hidden) return;
    Alert.alert(
      "Report photo",
      "Report this photo? It will be hidden from this conversation and reviewed by our team.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Report",
          style: "destructive",
          onPress: async () => {
            try {
              await nest.reportMessagePhoto(messageId, photo.id, "user reported from chat");
              toast.success("Photo reported and hidden.");
              await load();
            } catch (e: any) {
              toast.error(e?.friendly || "Could not report photo.");
            }
          },
        },
      ]
    );
  }, [load]);

  if (!user) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.top}>
          <TouchableOpacity onPress={() => safeBack(router, "/(tabs)/account")} style={styles.topBtn} testID="thread-back" accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
          </TouchableOpacity>
          <Text style={styles.topTitle} numberOfLines={1}>{headerName}</Text>
          <AlertsBellButton />
        </View>
        <EmptyState icon="chatbubble-ellipses-outline" title="Sign in to send messages" message="Sign in to talk to shops on MyNest." testID="thread-signin" />
      </SafeAreaView>
    );
  }

  const winWidth = Dimensions.get("window").width;
  const bubbleMaxWidth = Math.min(320, winWidth * 0.72);

  return (
    // v1.0.113 — stop including the bottom safe-area edge here. When the
    // keyboard is up the composer must sit flush against the keyboard, and
    // an extra bottom inset would push it below what KeyboardAvoidingView
    // moves it to. The composer applies its own bottom inset when the
    // keyboard is closed (see styles.composer).
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.top}>
        <TouchableOpacity onPress={() => safeBack(router, "/(tabs)/account")} style={styles.topBtn} testID="thread-back" accessibilityRole="button" accessibilityLabel="Go back">
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
        <AlertsBellButton />
      </View>

      {orderId ? (
        <TouchableOpacity
          style={styles.orderContext}
          onPress={() => router.push(`/order/${orderId}`)}
          testID="thread-order-context"
          accessibilityRole="button"
          accessibilityLabel={`View order ${orderId}`}
        >
          <View style={styles.orderContextIcon}>
            <Ionicons name="receipt-outline" size={18} color={colors.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.orderContextEyebrow}>ORDER CONVERSATION</Text>
            <Text style={styles.orderContextTitle} numberOfLines={1}>Order #{orderId}</Text>
            {orderTitle ? <Text style={styles.orderContextSub} numberOfLines={1}>{orderTitle}</Text> : null}
          </View>
          <Text style={styles.orderContextLink}>View order</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.onSurfaceMuted} />
        </TouchableOpacity>
      ) : null}

      {/* v1.0.113 — the messaging screen needs the composer to sit flush
          against the keyboard on both platforms. Android's default
          adjustResize does not fully work with Expo's edgeToEdgeEnabled
          layout, so we now use behavior='height' on Android which lets
          KeyboardAvoidingView shrink the container to make room for the
          input. keyboardVerticalOffset accounts for the top header. */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
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
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.brand} colors={[colors.brand]} />}
            renderItem={({ item, index }) => {
              const mine = String(item.sender_id) === String(user.id);
              const prev = index > 0 ? messages[index - 1] : null;
              const showTime =
                !prev ||
                Math.abs((parseServerDate(item.created_at)?.getTime() ?? 0) -
                  (parseServerDate(prev.created_at)?.getTime() ?? 0)) > 15 * 60 * 1000;
              const parsed = parseOrderContext(item.message);
              const hasPhotos = (item.photos?.length || 0) > 0;
              const hasText = !!parsed.body.trim();
              return (
                <View>
                  {showTime ? <Text style={styles.timeLabel}>{formatBubbleTime(item.created_at)}</Text> : null}
                  {parsed.orderId ? (
                    <TouchableOpacity
                      style={[styles.orderTag, mine ? styles.orderTagMine : styles.orderTagTheirs]}
                      onPress={() => router.push(`/order/${parsed.orderId}`)}
                      accessibilityRole="button"
                      accessibilityLabel={`View order ${parsed.orderId}`}
                    >
                      <Ionicons name="receipt-outline" size={12} color={colors.brandDark} />
                      <Text style={styles.orderTagText}>Order #{parsed.orderId}</Text>
                    </TouchableOpacity>
                  ) : null}
                  {hasPhotos ? (
                    <View style={[styles.photoWrap, mine ? styles.photoWrapMine : styles.photoWrapTheirs]}>
                      <PhotoGrid
                        photos={item.photos!}
                        bubbleMaxWidth={bubbleMaxWidth}
                        onPress={(i) => setViewer({ photos: item.photos!, index: i })}
                        onLongPress={(p) => onPhotoLongPress(p, item.id)}
                      />
                    </View>
                  ) : null}
                  {hasText ? (
                    <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs, hasPhotos && { marginTop: 4 }]}>
                      <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]} selectable>
                        {renderBody(parsed.body)}
                      </Text>
                    </View>
                  ) : null}
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

        {drafts.length > 0 ? (
          <View style={styles.draftStrip} testID="thread-draft-strip">
            {drafts.map((d) => (
              <View key={d.key} style={styles.draftTile}>
                <ExpoImage source={{ uri: d.uri }} style={styles.draftImg} contentFit="cover" />
                {d.uploading ? (
                  <View style={styles.draftOverlay}>
                    <ActivityIndicator color="#fff" />
                  </View>
                ) : null}
                {d.error ? (
                  <View style={[styles.draftOverlay, { backgroundColor: "rgba(200,40,40,0.7)" }]}>
                    <Ionicons name="alert-circle" size={20} color="#fff" />
                  </View>
                ) : null}
                <TouchableOpacity style={styles.draftRemove} onPress={() => removeDraft(d.key)} testID={`draft-remove-${d.key}`} accessibilityRole="button" accessibilityLabel="Close">
                  <Ionicons name="close" size={14} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.composer}>
          <TouchableOpacity
            style={styles.attachBtn}
            onPress={pickAndUploadPhotos}
            disabled={sending || drafts.length >= 5}
            testID="thread-attach"
            accessibilityLabel="Attach photos"
          >
            <Ionicons name="image-outline" size={22} color={drafts.length >= 5 ? colors.onSurfaceMuted : colors.onSurface} />
          </TouchableOpacity>
          {/* v1.0.114 — Quick replies button removed. */}
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder={drafts.length ? "Add a caption…" : "Write a message…"}
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
            accessibilityRole="button"
            accessibilityLabel="Send message"
            accessibilityState={{ disabled: !canSend }}
          >
            {sending ? (
              <ActivityIndicator color={colors.onBrand} />
            ) : (
              <Ionicons name="send" size={18} color={colors.onBrand} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Full-screen photo viewer */}
      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <Pressable style={styles.viewerRoot} onPress={() => setViewer(null)}>
          {viewer ? (
            <>
              <ExpoImage
                source={{ uri: viewer.photos[viewer.index]?.url || "" }}
                style={styles.viewerImg}
                contentFit="contain"
                transition={120}
              />
              <View style={styles.viewerHeader}>
                <TouchableOpacity onPress={() => setViewer(null)} style={styles.viewerBtn} testID="viewer-close" accessibilityRole="button" accessibilityLabel="Close">
                  <Ionicons name="close" size={22} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.viewerCount}>{viewer.index + 1} / {viewer.photos.length}</Text>
                <View style={styles.viewerBtn} />
              </View>
              {viewer.photos.length > 1 ? (
                <>
                  {viewer.index > 0 ? (
                    <TouchableOpacity
                      style={[styles.viewerNav, { left: 16 }]}
                      onPress={() => setViewer({ ...viewer, index: viewer.index - 1 })}
                      testID="viewer-prev" accessibilityRole="button" accessibilityLabel="Previous photo">
                      <Ionicons name="chevron-back" size={26} color="#fff" />
                    </TouchableOpacity>
                  ) : null}
                  {viewer.index < viewer.photos.length - 1 ? (
                    <TouchableOpacity
                      style={[styles.viewerNav, { right: 16 }]}
                      onPress={() => setViewer({ ...viewer, index: viewer.index + 1 })}
                      testID="viewer-next"
                      accessibilityRole="button"
                      accessibilityLabel="Next photo"
                    >
                      <Ionicons name="chevron-forward" size={26} color="#fff" />
                    </TouchableOpacity>
                  ) : null}
                </>
              ) : null}
            </>
          ) : null}
        </Pressable>
      </Modal>
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
  // v1.0.113 — paddingBottom bumped so the composer keeps a comfortable
  // gap above the system nav bar when the keyboard is closed (the parent
  // SafeAreaView no longer applies a bottom inset for this screen).
  orderContext: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    ...shadows.card,
  },
  orderContextIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.brand + "14" },
  orderContextEyebrow: { fontSize: 9, fontWeight: "800", letterSpacing: 0.7, color: colors.onSurfaceMuted },
  orderContextTitle: { fontSize: 14, fontWeight: "800", color: colors.onSurface, marginTop: 1 },
  orderContextSub: { fontSize: 11, color: colors.onSurfaceMuted, marginTop: 1 },
  orderContextLink: { fontSize: 11, fontWeight: "800", color: colors.brandDark },
  orderTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    marginBottom: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.brand + "14",
    borderWidth: 1,
    borderColor: colors.brand + "25",
  },
  orderTagMine: { alignSelf: "flex-end" },
  orderTagTheirs: { alignSelf: "flex-start" },
  orderTagText: { fontSize: 10, fontWeight: "800", color: colors.brandDark },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.lg, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.surface },
  attachBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary },
  input: { flex: 1, minHeight: 40, maxHeight: 140, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, color: colors.onSurface, fontSize: 15 },
  sendBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.brand },
  sendBtnDisabled: { opacity: 0.5 },
  // v3.7.86 — bubble variants when the message is photo-only or photo+text.
  photoWrap: { maxWidth: "82%", borderRadius: radius.md, overflow: "hidden" },
  photoWrapMine: { alignSelf: "flex-end" },
  photoWrapTheirs: { alignSelf: "flex-start" },
  hiddenTile: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSecondary, gap: 4 },
  hiddenText: { fontSize: 11, color: colors.onSurfaceMuted },
  // Draft strip above the composer while user has photos queued to send.
  draftStrip: { flexDirection: "row", gap: 8, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xs, backgroundColor: colors.surface },
  draftTile: { width: 64, height: 64, borderRadius: 10, backgroundColor: colors.surfaceSecondary, position: "relative", overflow: "hidden" },
  draftImg: { width: "100%", height: "100%" },
  draftOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.35)" },
  draftRemove: { position: "absolute", top: 2, right: 2, width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.55)" },
  // Full-screen viewer
  viewerRoot: { flex: 1, backgroundColor: "rgba(0,0,0,0.95)", alignItems: "center", justifyContent: "center" },
  viewerImg: { width: "100%", height: "100%" },
  viewerHeader: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingTop: Platform.OS === "ios" ? 54 : 24, paddingBottom: 12 },
  viewerBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20, backgroundColor: "rgba(255,255,255,0.12)" },
  viewerCount: { color: "#fff", fontSize: 14, fontWeight: "600" },
  viewerNav: { position: "absolute", top: "50%", width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.18)" },
});
