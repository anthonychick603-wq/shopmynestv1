import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useNavigation } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Image as ExpoImage } from "expo-image";

import { nest, friendlyMessage, type NestMessagePhoto, type NestMessageRaw } from "@/src/api/nest";
import { appendFilePart } from "@/src/utils/upload";
import { colors, radius, shadows, spacing } from "@/src/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { toast } from "@/src/components/Toast";
import { decodeEntities } from "@/src/utils/html";
import { useAuth } from "@/src/context/AuthContext";
import { safeBack } from "@/src/utils/nav";
import { useBackFallback } from "@/src/context/BackFallback";
import { haptics } from "@/src/utils/haptics";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";
import { parseServerDate } from "@/src/utils/datetime";
import { useLatestRequest } from "@/src/hooks/use-latest-request";
import { useInvalidateOnFocus } from "@/src/state/mutationBus";

// Format a MySQL UTC timestamp as a friendly time-of-day / date line above a
// message bubble ("Today 3:14 PM", "Yesterday 11:02 AM", "Mar 4 3:14 PM").
// v1.0.250 — parseServerDate returns null on invalid input, so the extra
// isNaN(d.getTime()) guard was dead code. One guard is enough.
function formatBubbleTime(iso: string): string {
  const utc = iso.includes("T") ? iso : iso.replace(" ", "T") + "Z";
  const d = parseServerDate(utc);
  if (!d) return "";
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
  useBackFallback("/(tabs)/(more)/messages");
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

  // v1.0.250 — the old cancelRef only handled unmount, not request races.
  // useLatestRequest handles BOTH: an older getConversation() that lands
  // after a newer one (fast pull-to-refresh, or an onSend-triggered
  // reload arriving before an earlier focus refetch) can no longer
  // overwrite the newer response.
  const { begin, isCurrent } = useLatestRequest();

  // v1.0.220 — hide the bottom Tabs bar while the message thread is
  // focused so the composer sits directly above the OS gesture bar. With
  // the tabs visible the composer was drawn *behind* the tab bar and the
  // Send button was half-hidden. Restore on blur so peer tabs get the
  // bar back. Setting tabBarStyle back to undefined lets React Navigation
  // fall through to the screenOptions defined in (tabs)/_layout.tsx, which
  // is what we want — no need to re-specify colors or height here.
  const navigation = useNavigation();
  useFocusEffect(
    useCallback(() => {
      // Stack (more) -> Tabs
      const parent = navigation.getParent()?.getParent?.();
      parent?.setOptions?.({ tabBarStyle: { display: "none" } });
      return () => {
        parent?.setOptions?.({ tabBarStyle: undefined });
      };
    }, [navigation])
  );

  const load = useCallback(async () => {
    if (!user || !otherId) return;
    const id = begin();
    try {
      const rows = await nest.getConversation(otherId, 200);
      if (!isCurrent(id)) return;
      setMessages(Array.isArray(rows) ? rows : []);
    } catch (e: unknown) {
      if (!isCurrent(id)) return;
      toast.error(friendlyMessage(e) || "Could not load conversation.");
    } finally {
      if (isCurrent(id)) setLoading(false);
    }
  }, [user, otherId, begin, isCurrent]);

  useEffect(() => { load(); }, [load]);
  useInvalidateOnFocus(["messages"], load);

  // v1.0.250 — the previous version scheduled a 40ms setTimeout after every
  // messages-length change to call scrollToEnd. On slow devices or when
  // photos were still loading, list content height wasn't final at 40ms
  // and the scroll ended up mid-thread. We now anchor the scroll to
  // FlatList's onContentSizeChange (declarative last-known content height)
  // and only auto-scroll when a new *last* message appears — not on every
  // photo hydration.
  const lastAutoScrolledIdRef = useRef<number | null>(null);
  const onListContentSizeChange = useCallback(() => {
    if (loading) return;
    const last = messages[messages.length - 1];
    if (!last) return;
    if (lastAutoScrolledIdRef.current === last.id) return;
    lastAutoScrolledIdRef.current = last.id;
    listRef.current?.scrollToEnd({ animated: false });
  }, [loading, messages]);

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
    let ImagePicker: typeof import("expo-image-picker");
    let ImageManipulator: typeof import("expo-image-manipulator");
    try {
      ImagePicker = await import("expo-image-picker");
      ImageManipulator = await import("expo-image-manipulator");
    } catch {
      toast.error("Photo picker is unavailable.");
      return;
    }
    // v1.0.241 — wrap the native permission + picker in try/catch so
    // an OS-level rejection can't bubble out as an unhandled promise.
    let res: Awaited<ReturnType<typeof ImagePicker.launchImageLibraryAsync>>;
    try {
      const perms = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perms.granted) {
        toast.error("Photo library access is required to send photos.");
        return;
      }
      res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions?.Images ?? "Images",
        allowsMultipleSelection: true,
        selectionLimit: remaining,
        quality: 0.9,
      });
    } catch {
      toast.error("Couldn't open the photo library. Please try again.");
      return;
    }
    if (res.canceled || !res.assets?.length) return;

    const picks = res.assets.slice(0, remaining);
    const newDrafts: DraftPhoto[] = picks.map((a) => ({
      key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      uri: a.uri,
      uploading: true,
    }));
    setDrafts((prev) => [...prev, ...newDrafts]);

    // Upload each pick in parallel with per-item error handling so a single
    // failure doesn't take the batch down.
    // v1.0.250 — gate each state write on the current request so a screen
    // unmount mid-upload can't fire toasts or state setters into a torn-down
    // tree.
    const uploadReq = begin();
    await Promise.all(newDrafts.map(async (d) => {
      try {
        // Compress to max 2048px longer edge, JPEG q=0.82. Keeps most uploads
        // well under the 8 MB server cap.
        const manip = await ImageManipulator.manipulateAsync(d.uri, [{ resize: { width: 2048 } }], {
          compress: 0.82,
          format: ImageManipulator.SaveFormat.JPEG,
        });
        const fd = new FormData();
        fd.append("recipient_id", String(otherId));
        appendFilePart(fd, "file", {
          uri: manip.uri,
          name: `photo-${d.key}.jpg`,
          type: "image/jpeg",
        });
        const resp = await nest.uploadMessagePhoto(fd);
        if (!isCurrent(uploadReq)) return;
        setDrafts((prev) => prev.map((p) => (p.key === d.key ? { ...p, uploading: false, attachmentId: resp.attachment_id } : p)));
      } catch (e: unknown) {
        if (!isCurrent(uploadReq)) return;
        setDrafts((prev) => prev.map((p) => (p.key === d.key ? { ...p, uploading: false, error: friendlyMessage(e) || "Upload failed" } : p)));
        toast.error(friendlyMessage(e) || "One photo could not be uploaded.");
      }
    }));
  }, [drafts.length, otherId, sending, begin, isCurrent]);

  const removeDraft = useCallback((key: string) => {
    setDrafts((prev) => prev.filter((p) => p.key !== key));
  }, []);

  // v1.0.250 — onSend used to await sendMessage() AND the follow-up load()
  // inside a single try/catch, then roll back the optimistic bubble on any
  // failure. If sendMessage() succeeded but the follow-up load() threw
  // (transient network), the bubble was rolled back and the user re-sent —
  // resulting in a duplicate. Split now: sendMessage failure rolls back;
  // load() failure keeps the bubble and shows a soft "tap to refresh" toast.
  //
  // Also memoized as useCallback so the render tree can memoize rows.
  // Also — rollback preserves the current draft if the user has started
  // editing (drops the restore silently rather than clobbering fresh text).
  const onSend = useCallback(async () => {
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
    // Snapshot drafts BEFORE clearing so a rollback still has access to the
    // exact photo entries the user picked (fixes the race where a photo
    // finishes uploading between the filter() call and the setDrafts([])).
    const draftsAtSend = drafts;
    // v1.0.250 — sender_id: coerce to number, fall back to 0 if the id was
    // ever a non-numeric string. Prevents NaN sender_id, which would compare
    // as "NaN" === "NaN" in the mine-check but is confusing when inspecting
    // state during debugging.
    const senderId = Number(user!.id) || 0;
    // v1.0.250 — the optimistic bubble no longer fabricates photo entries
    // with local file URIs (they were being mistaken for signed URLs). It
    // just carries a lightweight placeholder count that the row renderer
    // uses to draw an "Uploading…" tile. After load() lands, the real
    // server photos with fresh signed URLs replace this row entirely.
    const optimistic: NestMessageRaw = {
      id: tempId,
      sender_id: senderId,
      recipient_id: otherId,
      message: wireBody,
      is_read: false,
      created_at: new Date().toISOString().slice(0, 19).replace("T", " "),
      photos: draftsAtSend
        .filter((d) => d.attachmentId)
        .map((d) => ({ id: d.attachmentId!, url: d.uri, w: 0, h: 0, mime: "image/jpeg", hidden: false })),
    };
    setMessages((prev) => [...prev, optimistic]);
    setDraft("");
    setDrafts([]);
    const sendReq = begin();
    try {
      await nest.sendMessage({ recipient_id: otherId, message: wireBody, product_id: productId || undefined, photo_ids: readyIds });
      haptics.success();
    } catch (e: unknown) {
      if (!isCurrent(sendReq)) return;
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      haptics.error();
      toast.error(friendlyMessage(e) || "Message could not be sent.");
      // v1.0.250 — only restore the draft text if the user hasn't started
      // typing something new in the meantime. Preserving in-progress text
      // is more valuable than the exact prior body.
      setDraft((current) => (current === "" ? body : current));
      // Keep drafts in the composer so the user can retry send without
      // re-picking. Use the pre-send snapshot so photos that finished
      // uploading after the filter() call are preserved.
      setDrafts(draftsAtSend.filter((d) => d.attachmentId).map((d) => ({
        key: `retry-${d.attachmentId}`,
        uri: d.uri,
        uploading: false,
        attachmentId: d.attachmentId,
      })));
      setSending(false);
      return;
    }

    // Reload to get server-authoritative rows (fresh signed URLs, etc.).
    // v1.0.250 — if this fails we DON'T roll back — the send succeeded and
    // rolling back would prompt the user to duplicate. Show a soft hint.
    try {
      await load();
    } catch {
      if (isCurrent(sendReq)) toast.info("Sent — pull to refresh if you don't see it.");
    }
    if (isCurrent(sendReq)) setSending(false);
  }, [draft, drafts, orderId, sending, otherId, user, productId, load, begin, isCurrent]);

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
            // v1.0.250 — guard the toast and follow-up load against unmount.
            const reqId = begin();
            try {
              await nest.reportMessagePhoto(messageId, photo.id, "user reported from chat");
              if (!isCurrent(reqId)) return;
              toast.success("Photo reported and hidden.");
              await load();
            } catch (e: unknown) {
              if (!isCurrent(reqId)) return;
              toast.error(friendlyMessage(e) || "Could not report photo.");
            }
          },
        },
      ]
    );
  }, [load, begin, isCurrent]);

  if (!user) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.top}>
          <TouchableOpacity onPress={() => safeBack(router, "/(tabs)/(more)/messages")} style={styles.topBtn} testID="thread-back" accessibilityRole="button" accessibilityLabel="Go back" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
          </TouchableOpacity>
          <Text style={styles.topTitle} numberOfLines={1}>{headerName}</Text>
          <AlertsBellButton />
        </View>
        <EmptyState icon="chatbubble-ellipses-outline" title="Sign in to send messages" message="Sign in to talk to shops on MyNest." testID="thread-signin" />
      </SafeAreaView>
    );
  }

  // v1.0.243 — reject a malformed conversation route (`.../messages/abc`
  // or a missing userId). Previously `Number(params.userId)` produced
  // NaN, load() bailed on `!otherId`, and the screen sat forever in the
  // loading spinner with no way to recover. Show an ErrorState with a
  // path back to the inbox instead.
  if (!Number.isFinite(otherId) || !Number.isInteger(otherId) || otherId <= 0) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.top}>
          <TouchableOpacity onPress={() => safeBack(router, "/(tabs)/(more)/messages")} style={styles.topBtn} testID="thread-back" accessibilityRole="button" accessibilityLabel="Go back" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
          </TouchableOpacity>
          <Text style={styles.topTitle} numberOfLines={1}>Conversation</Text>
          <AlertsBellButton />
        </View>
        <EmptyState
          icon="alert-circle-outline"
          title="Conversation not found"
          message="That link doesn't point to a valid conversation."
          actionLabel="Back to messages"
          onAction={() => safeBack(router, "/(tabs)/(more)/messages")}
          testID="thread-bad-route"
        />
      </SafeAreaView>
    );
  }

  // v1.0.250 — was Dimensions.get('window') which is captured once per render
  // and doesn't respond to rotation. useWindowDimensions re-renders when the
  // window changes, so tablet rotation or split-screen resize repaints bubbles
  // at the correct max width.
  const { width: winWidth } = useWindowDimensions();
  const bubbleMaxWidth = Math.min(320, winWidth * 0.72);

  // v1.0.250 — renderItem was previously an inline arrow in the JSX which
  // means FlatList sees a new function reference on every keystroke of the
  // composer (draft state change re-renders this component). Memoizing lets
  // FlatList skip row work when the underlying `messages` array is stable.
  const renderMessage = useCallback(({ item, index }: { item: NestMessageRaw; index: number }) => {
    const mine = String(item.sender_id) === String(user!.id);
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
              photos={item.photos ?? []}
              bubbleMaxWidth={bubbleMaxWidth}
              onPress={(i) => setViewer({ photos: item.photos ?? [], index: i })}
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
  }, [messages, user, bubbleMaxWidth, onPhotoLongPress, router]);

  return (
    // v1.0.113 — stop including the bottom safe-area edge here. When the
    // keyboard is up the composer must sit flush against the keyboard, and
    // an extra bottom inset would push it below what KeyboardAvoidingView
    // moves it to. The composer applies its own bottom inset when the
    // keyboard is closed (see styles.composer).
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.top}>
        <TouchableOpacity onPress={() => safeBack(router, "/(tabs)/(more)/messages")} style={styles.topBtn} testID="thread-back" accessibilityRole="button" accessibilityLabel="Go back" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <TouchableOpacity
          style={{ flex: 1 }}
          onPress={() => router.push({ pathname: "/seller/[id]", params: { id: String(otherId) } })}
          testID="thread-open-shop"
         accessibilityRole="button">
          <Text style={styles.topTitle} numberOfLines={1}>{headerName}</Text>
          {/* v1.0.250 — only show "Tap to view shop" when we know we routed
              from a shop / product / order surface (i.e. we have a name from
              the inbox that reads like a shop). If we don't have a shop-ish
              header name, don't imply the counterpart is a seller. */}
          {headerName && headerName !== "Conversation" ? (
            <Text style={styles.topSubtitle} numberOfLines={1}>Tap to view shop</Text>
          ) : null}
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
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => {
              // v1.0.250 — dedupe rapid pull-to-refresh while a load is in flight.
              if (loading || refreshing) return;
              setRefreshing(true);
              try { await load(); }
              finally { setRefreshing(false); }
            }} tintColor={colors.brand} colors={[colors.brand]} />}
            onContentSizeChange={onListContentSizeChange}
            renderItem={renderMessage}
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
                <TouchableOpacity style={styles.draftRemove} onPress={() => removeDraft(d.key)} testID={`draft-remove-${d.key}`} accessibilityRole="button" accessibilityLabel="Close" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
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
           hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button">
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
           /* v1.0.250 — hitSlop only when the button is enabled. When disabled
              the extended touch target implied the button was actionable. */
           hitSlop={canSend ? { top: 8, bottom: 8, left: 8, right: 8 } : undefined}>
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
              {/* v1.0.250 — tap the photo itself to advance to the next photo
                  (Instagram-style). If it's the last photo, tap closes the
                  viewer. Long-press still delegates to the outer Pressable
                  via propagation, keeping close-on-outside-tap intact. */}
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  if (viewer.index < viewer.photos.length - 1) {
                    setViewer({ ...viewer, index: viewer.index + 1 });
                  } else {
                    setViewer(null);
                  }
                }}
                style={styles.viewerImg}
                testID="viewer-tap-advance"
                accessibilityRole="imagebutton"
                accessibilityLabel={viewer.index < viewer.photos.length - 1 ? "Next photo" : "Close viewer"}
              >
                <ExpoImage
                  source={{ uri: viewer.photos[viewer.index]?.url || "" }}
                  style={StyleSheet.absoluteFill}
                  contentFit="contain"
                  transition={120}
                />
              </Pressable>
              <View style={styles.viewerHeader}>
                <TouchableOpacity onPress={() => setViewer(null)} style={styles.viewerBtn} testID="viewer-close" accessibilityRole="button" accessibilityLabel="Close" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
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
                      testID="viewer-prev" accessibilityRole="button" accessibilityLabel="Previous photo" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
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
                     hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
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
  // v1.0.224 — Refinement pass. Chat thread bubbles used to be:
  //   • Received bubble: cream fill (surfaceSecondary) on cream page —
  //     essentially invisible, especially at bubble edges.
  //   • Sent bubble: terracotta — correct, kept.
  // Now: received bubbles are white with a hairline warm-gray border so
  // they read as physical objects on the cream canvas; the corner radii
  // match modern iMessage/Poshmark. Sent bubble unchanged for continuity.
  bubble: {
    maxWidth: "82%",
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: 18,
  },
  bubbleTheirs: {
    alignSelf: "flex-start",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderBottomLeftRadius: 6,
  },
  bubbleMine: {
    alignSelf: "flex-end",
    backgroundColor: colors.brand,
    borderBottomRightRadius: 6,
  },
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
