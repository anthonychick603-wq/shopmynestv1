import React, { useCallback, useRef, useState } from "react";
import { Alert, ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { formatDistanceToNow } from "date-fns";
import { ApiError, nest, type NestCustomRequestDetailRaw, type NestCustomRequestMessageRaw, type NestCustomRequestStatus } from "@/src/api/nest";
import { toProduct } from "@/src/api/adapters";
import { colors, radius, shadows, spacing } from "@/src/theme";
import { Button } from "@/src/components/Button";
import { EmptyState } from "@/src/components/EmptyState";
import { AppImage } from "@/src/components/AppImage";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { useAuth } from "@/src/context/AuthContext";
import { useCart } from "@/src/context/CartContext";
import { pushDetail, safeBack } from "@/src/utils/nav";
import { useBackFallback } from "@/src/context/BackFallback";
import { haptics } from "@/src/utils/haptics";
import { parseServerDate } from "@/src/utils/datetime";

type Dialog = "quote" | "decline" | null;

export default function CustomRequestDetail() {
  useBackFallback("/custom-requests");
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { user } = useAuth();
  const { ensureProduct } = useCart();
  const listRef = useRef<FlatList<NestCustomRequestMessageRaw>>(null);
  const [request, setRequest] = useState<NestCustomRequestDetailRaw | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [price, setPrice] = useState("");
  const [leadDays, setLeadDays] = useState("");
  const [quoteNote, setQuoteNote] = useState("");
  const [declineReason, setDeclineReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }
    try {
      const result = await nest.custom.getRequest(id);
      setRequest(result);
      setError(null);
    } catch (e) {
      setRequest(null);
      setError(e instanceof ApiError ? e.friendly : "This request could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  // v1.0.220 — hide bottom Tabs bar while a custom-request thread is
  // focused so the composer input isn't drawn behind the tab bar. Same
  // pattern as messages/[userId].tsx.
  const navigation = useNavigation();
  useFocusEffect(
    useCallback(() => {
      const parent = navigation.getParent()?.getParent?.();
      parent?.setOptions?.({ tabBarStyle: { display: "none" } });
      return () => {
        parent?.setOptions?.({ tabBarStyle: undefined });
      };
    }, [navigation])
  );

  const isBuyer = !!request && String(request.buyer_id) === user?.id;
  const isTerminal = request ? terminalStatus(request.status) : true;

  const runAction = async (action: () => Promise<unknown>) => {
    setWorking(true);
    setError(null);
    try {
      await action();
      haptics.success();
      await load();
    } catch (e) {
      haptics.warning();
      setError(e instanceof ApiError ? e.friendly : "Could not update this request. Please try again.");
    } finally {
      setWorking(false);
    }
  };

  const sendMessage = async () => {
    if (!request || !message.trim() || working) return;
    const body = message.trim();
    setMessage("");
    await runAction(() => nest.custom.postMessage(request.id, { body }));
  };

  const submitQuote = async () => {
    if (!request || !price.trim() || !leadDays.trim()) return;
    const priceCents = Math.round(Number(price) * 100);
    const days = parseInt(leadDays, 10);
    if (!Number.isFinite(priceCents) || priceCents <= 0 || !Number.isFinite(days) || days < 1) {
      setError("Enter a valid price and lead time.");
      return;
    }
    await runAction(async () => {
      await nest.custom.postQuote(request.id, { price_cents: priceCents, lead_days: days, note: quoteNote.trim() || undefined });
      setDialog(null);
      setPrice("");
      setLeadDays("");
      setQuoteNote("");
    });
  };

  const submitDecline = async () => {
    if (!request) return;
    await runAction(async () => {
      await nest.custom.declineRequest(request.id, declineReason.trim() || undefined);
      setDialog(null);
      setDeclineReason("");
    });
  };

  const addPrivateProductAndCheckout = async (privateProductId: number) => {
    const raw = await nest.getProduct(privateProductId);
    const product = toProduct(raw);
    if (!ensureProduct(product, 1)) {
      throw new Error("This custom item is not currently purchasable.");
    }
    router.push("/(tabs)/cart");
  };

  const payAcceptedQuote = () => {
    if (!request?.private_product_id || working) return;
    void runAction(() => addPrivateProductAndCheckout(request.private_product_id));
  };

  const acceptQuote = () => {
    if (!request) return;
    Alert.alert("Accept quote?", `This will add a private one-off product to your cart for ${money(request.quoted_price_cents)}.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Accept",
        onPress: () => {
          void runAction(async () => {
            const result = await nest.custom.acceptQuote(request.id);
            await addPrivateProductAndCheckout(result.private_product_id);
          });
        },
      },
    ]);
  };

  if (loading) return <SafeAreaView style={styles.safe} edges={["top"]}><Top title={`Request #${id || ""}`} onBack={() => safeBack(router, "/custom-requests")} /><View style={styles.center}><ActivityIndicator color={colors.brand} /></View></SafeAreaView>;
  if (!user) return <SafeAreaView style={styles.safe} edges={["top"]}><Top title={`Request #${id || ""}`} onBack={() => safeBack(router, "/custom-requests")} /><EmptyState icon="lock-closed-outline" title="Sign in" message="Sign in to view this custom request." actionLabel="Sign in" onAction={() => router.push("/(auth)/login")} testID="custom-request-signed-out" /></SafeAreaView>;
  if (!request) return <SafeAreaView style={styles.safe} edges={["top"]}><Top title={`Request #${id || ""}`} onBack={() => safeBack(router, "/custom-requests")} /><EmptyState icon="alert-circle-outline" title="Request unavailable" message={error || "This custom request could not be found."} actionLabel="Back" onAction={() => safeBack(router, "/custom-requests")} testID="custom-request-not-found" /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Top title={`Request #${request.id}`} onBack={() => safeBack(router, "/custom-requests")} />
      {error ? <View style={styles.errorBanner}><Ionicons name="alert-circle-outline" size={18} color={colors.error} /><Text style={styles.errorText}>{error}</Text></View> : null}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={70}>
        <FlatList
          ref={listRef}
          data={request.messages}
          keyExtractor={(item) => String(item.id)}
          style={styles.flex}
          contentContainerStyle={styles.messagesContent}
          ListHeaderComponent={<RequestHeader request={request} isBuyer={isBuyer} working={working} onWithdraw={() => void runAction(() => nest.custom.withdrawRequest(request.id))} onAccept={acceptQuote} onPay={payAcceptedQuote} onQuote={() => setDialog("quote")} onDecline={() => setDialog("decline")} router={router} />}
          renderItem={({ item }) => <MessageRow message={item} />}
          ListEmptyComponent={<Text style={styles.noMessages}>No messages yet. Start the conversation below.</Text>}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          onLayout={() => listRef.current?.scrollToEnd({ animated: false })}
          keyboardShouldPersistTaps="handled"
        />
        {!isTerminal ? <Composer value={message} onChange={setMessage} onSend={() => void sendMessage()} disabled={working || !message.trim()} /> : null}
      </KeyboardAvoidingView>
      <QuoteModal visible={dialog === "quote"} price={price} leadDays={leadDays} note={quoteNote} working={working} onPrice={setPrice} onLeadDays={setLeadDays} onNote={setQuoteNote} onClose={() => setDialog(null)} onSubmit={() => void submitQuote()} />
      <DeclineModal visible={dialog === "decline"} reason={declineReason} working={working} onReason={setDeclineReason} onClose={() => setDialog(null)} onSubmit={() => void submitDecline()} />
    </SafeAreaView>
  );
}

function RequestHeader({ request, isBuyer, working, onWithdraw, onAccept, onPay, onQuote, onDecline, router }: { request: NestCustomRequestDetailRaw; isBuyer: boolean; working: boolean; onWithdraw: () => void; onAccept: () => void; onPay: () => void; onQuote: () => void; onDecline: () => void; router: ReturnType<typeof useRouter> }) {
  const status = statusAppearance(request.status);
  const action = actionFor({ status: request.status, isBuyer, onWithdraw, onAccept, onPay, onQuote, onDecline });
  return (
    <View>
      <View style={styles.headerContent}>
        <View style={[styles.statusPill, status.container]}><Text style={[styles.statusPillText, status.text]}>{statusLabel(request.status)}</Text></View>
        <TouchableOpacity style={styles.productCard} onPress={() => pushDetail(router, `/product/${request.product_id}`)} testID="custom-request-product" accessibilityRole="button" accessibilityLabel="View product">
          <AppImage source={{ uri: request.product?.image_url }} style={styles.productImage} fallbackIcon="pricetag-outline" />
          <View style={styles.productBody}><Text style={styles.productName} numberOfLines={2}>{request.product?.name || "Product"}</Text><Text style={styles.productLink}>View listing</Text></View>
          <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceMuted} />
        </TouchableOpacity>
        {request.status !== "open" && request.quoted_price_cents > 0 ? <QuoteCard request={request} /> : null}
        {action ? <View style={styles.actionBar}>{action.primary ? <Button title={action.primary.title} onPress={action.primary.onPress} loading={working} style={styles.primaryAction} testID={action.primary.testID} /> : null}{action.secondary ? <Button title={action.secondary.title} onPress={action.secondary.onPress} disabled={working} variant="outline" style={styles.secondaryAction} testID={action.secondary.testID} /> : null}</View> : null}
        <Text style={styles.messagesTitle}>Messages</Text>
      </View>
    </View>
  );
}

function QuoteCard({ request }: { request: NestCustomRequestDetailRaw }) {
  return <View style={styles.quoteCard}><Text style={styles.quoteEyebrow}>SELLER QUOTE</Text><Text style={styles.quotePrice}>{money(request.quoted_price_cents)}</Text><Text style={styles.quoteLead}>Ships in {request.quoted_lead_days} {request.quoted_lead_days === 1 ? "day" : "days"}</Text>{request.quote_note ? <Text style={styles.quoteNote}>{request.quote_note}</Text> : null}<Text style={styles.quoteTime}>{relativeTime(request.quoted_at || request.updated_at)}</Text></View>;
}

function MessageRow({ message }: { message: NestCustomRequestMessageRaw }) {
  if (message.kind.startsWith("system_")) return <View style={styles.systemWrap}><Text style={styles.systemChip}>{systemMessage(message)}</Text></View>;
  return <View style={styles.messageRow}><View style={styles.avatar}>{message.sender?.avatar_url ? <AppImage source={{ uri: message.sender.avatar_url }} style={styles.avatarImage} fallbackIcon="person-outline" /> : <Ionicons name="person-outline" size={16} color={colors.onSurfaceMuted} />}</View><View style={styles.messageBody}><View style={styles.messageMeta}><Text style={styles.messageName}>{message.sender?.display_name || "Member"}</Text><Text style={styles.messageTime}>{relativeTime(message.created_at)}</Text></View><Text style={styles.messageText}>{message.body}</Text></View></View>;
}

function Composer({ value, onChange, onSend, disabled }: { value: string; onChange: (value: string) => void; onSend: () => void; disabled: boolean }) {
  return <View style={styles.composer}><TextInput value={value} onChangeText={onChange} placeholder="Write a message…" placeholderTextColor={colors.onSurfaceMuted} multiline style={styles.composerInput} testID="custom-request-message" /><TouchableOpacity style={[styles.sendButton, disabled && styles.sendButtonDisabled]} onPress={() => { haptics.tap(); onSend(); }} disabled={disabled} testID="custom-request-send" accessibilityLabel="Send message" accessibilityRole="button" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Ionicons name="send" size={18} color={colors.onBrand} /></TouchableOpacity></View>;
}

function QuoteModal({ visible, price, leadDays, note, working, onPrice, onLeadDays, onNote, onClose, onSubmit }: { visible: boolean; price: string; leadDays: string; note: string; working: boolean; onPrice: (value: string) => void; onLeadDays: (value: string) => void; onNote: (value: string) => void; onClose: () => void; onSubmit: () => void }) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><View style={styles.modalBackdrop}><View style={styles.modalCard}><Text style={styles.modalTitle}>Send quote</Text><Text style={styles.modalIntro}>Set a price and how long you need to make this custom item.</Text><Text style={styles.modalLabel}>Price</Text><View style={styles.moneyField}><Text style={styles.currency}>$</Text><TextInput value={price} onChangeText={onPrice} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.onSurfaceMuted} style={styles.moneyInput} testID="custom-request-quote-price" /></View><Text style={styles.modalLabel}>Lead time (days)</Text><TextInput value={leadDays} onChangeText={onLeadDays} keyboardType="number-pad" placeholder="7" placeholderTextColor={colors.onSurfaceMuted} style={styles.modalInput} testID="custom-request-quote-days" /><Text style={styles.modalLabel}>Note (optional)</Text><TextInput value={note} onChangeText={onNote} multiline placeholder="What is included in this quote?" placeholderTextColor={colors.onSurfaceMuted} style={styles.modalTextarea} testID="custom-request-quote-note" /><View style={styles.modalActions}><Button title="Cancel" variant="ghost" onPress={onClose} style={styles.modalButton} /><Button title="Send quote" onPress={onSubmit} loading={working} style={styles.modalButton} testID="custom-request-quote-submit" /></View></View></View></Modal>;
}

function DeclineModal({ visible, reason, working, onReason, onClose, onSubmit }: { visible: boolean; reason: string; working: boolean; onReason: (value: string) => void; onClose: () => void; onSubmit: () => void }) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><View style={styles.modalBackdrop}><View style={styles.modalCard}><Text style={styles.modalTitle}>Decline request</Text><Text style={styles.modalIntro}>You can share a reason with the other person, if helpful.</Text><TextInput value={reason} onChangeText={onReason} multiline placeholder="Reason (optional)" placeholderTextColor={colors.onSurfaceMuted} style={styles.modalTextarea} testID="custom-request-decline-reason" /><View style={styles.modalActions}><Button title="Cancel" variant="ghost" onPress={onClose} style={styles.modalButton} /><Button title="Decline" variant="outline" onPress={onSubmit} loading={working} style={styles.modalButton} testID="custom-request-decline-submit" /></View></View></View></Modal>;
}

function Top({ title, onBack }: { title: string; onBack: () => void }) {
  return <View style={styles.top}><TouchableOpacity onPress={() => { haptics.tap(); onBack(); }} style={styles.topBtn} testID="custom-request-back" accessibilityRole="button" accessibilityLabel="Go back" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Ionicons name="chevron-back" size={22} color={colors.onSurface} /></TouchableOpacity><Text style={styles.topTitle} numberOfLines={1}>{title}</Text><View style={styles.headerActions}><AlertsBellButton /><CartHeaderButton /></View></View>;
}

function actionFor({ status, isBuyer, onWithdraw, onAccept, onPay, onQuote, onDecline }: { status: NestCustomRequestStatus; isBuyer: boolean; onWithdraw: () => void; onAccept: () => void; onPay: () => void; onQuote: () => void; onDecline: () => void }) {
  if (isBuyer && status === "open") return { primary: undefined, secondary: { title: "Withdraw", onPress: onWithdraw, testID: "custom-request-withdraw" } };
  if (isBuyer && status === "quoted") return { primary: { title: "Accept & pay", onPress: onAccept, testID: "custom-request-accept" }, secondary: { title: "Decline", onPress: onDecline, testID: "custom-request-decline" } };
  if (isBuyer && status === "accepted") return { primary: { title: "Pay now", onPress: onPay, testID: "custom-request-pay" }, secondary: undefined };
  if (!isBuyer && status === "open") return { primary: { title: "Send quote", onPress: onQuote, testID: "custom-request-send-quote" }, secondary: { title: "Decline", onPress: onDecline, testID: "custom-request-decline" } };
  if (!isBuyer && status === "quoted") return { primary: { title: "Update quote", onPress: onQuote, testID: "custom-request-update-quote" }, secondary: { title: "Decline", onPress: onDecline, testID: "custom-request-decline" } };
  return null;
}

function terminalStatus(status: NestCustomRequestStatus) { return status === "declined" || status === "withdrawn" || status === "completed"; }
function money(cents: number) { return `$${(Number(cents || 0) / 100).toFixed(2)}`; }
function relativeTime(value?: string | null) { const date = parseServerDate(value); return date ? formatDistanceToNow(date, { addSuffix: true }) : ""; }
function systemMessage(message: NestCustomRequestMessageRaw) { if (message.kind === "system_quote") return message.body || "Quote sent"; if (message.kind === "system_accept") return message.body || "Buyer accepted"; if (message.kind === "system_decline") return message.body || "Request declined"; if (message.kind === "system_withdraw") return message.body || "Request withdrawn"; if (message.kind === "system_paid") return message.body || "Payment received"; if (message.kind === "system_completed") return message.body || "Request completed"; return message.body; }
function statusAppearance(status: NestCustomRequestStatus) { if (status === "quoted" || status === "accepted") return { container: styles.statusBrand, text: styles.statusOnBrand }; if (status === "paid") return { container: styles.statusSuccess, text: styles.statusOnBrand }; if (status === "completed") return { container: styles.statusCompleted, text: styles.statusMuted }; if (status === "declined" || status === "withdrawn") return { container: styles.statusMutedBg, text: styles.statusMuted }; return { container: styles.statusNeutral, text: styles.statusNeutralText }; }
function statusLabel(status: NestCustomRequestStatus) { return status.charAt(0).toUpperCase() + status.slice(1); }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface }, flex: { flex: 1 }, center: { flex: 1, alignItems: "center", justifyContent: "center" },
  top: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.md }, topBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, ...shadows.card }, topTitle: { flex: 1, marginLeft: spacing.md, color: colors.onSurface, fontSize: 17, fontWeight: "800" }, headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  errorBanner: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginHorizontal: spacing.lg, marginBottom: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.error, backgroundColor: colors.surfaceTertiary }, errorText: { flex: 1, color: colors.error, fontSize: 13, fontWeight: "700" },
  messagesContent: { paddingBottom: spacing.xl, flexGrow: 1 }, headerContent: { paddingHorizontal: spacing.lg }, statusPill: { alignSelf: "flex-start", paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill, marginBottom: spacing.md }, statusPillText: { fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.3 }, statusNeutral: { backgroundColor: colors.surfaceTertiary }, statusNeutralText: { color: colors.onSurface }, statusBrand: { backgroundColor: colors.brand }, statusSuccess: { backgroundColor: colors.success }, statusCompleted: { backgroundColor: colors.surfaceTertiary, opacity: 0.72 }, statusMutedBg: { backgroundColor: colors.surfaceTertiary }, statusOnBrand: { color: colors.onBrand }, statusMuted: { color: colors.onSurfaceMuted },
  productCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, ...shadows.card }, productImage: { width: 56, height: 56, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary }, productBody: { flex: 1 }, productName: { color: colors.onSurface, fontSize: 15, fontWeight: "800" }, productLink: { color: colors.brand, fontSize: 13, fontWeight: "700", marginTop: spacing.xs },
  quoteCard: { padding: spacing.lg, marginTop: spacing.md, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md }, quoteEyebrow: { color: colors.onSurfaceMuted, fontSize: 10, letterSpacing: 0.6, fontWeight: "800" }, quotePrice: { color: colors.onSurface, fontSize: 28, fontWeight: "800", marginTop: spacing.xs }, quoteLead: { color: colors.onSurface, fontSize: 14, fontWeight: "700", marginTop: spacing.xs }, quoteNote: { color: colors.onSurface, fontSize: 14, lineHeight: 20, marginTop: spacing.sm }, quoteTime: { color: colors.onSurfaceMuted, fontSize: 12, marginTop: spacing.md },
  actionBar: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }, primaryAction: { flex: 1 }, secondaryAction: { flex: 1 }, messagesTitle: { color: colors.onSurface, fontSize: 16, fontWeight: "800", marginTop: spacing.xl, marginBottom: spacing.sm }, noMessages: { color: colors.onSurfaceMuted, textAlign: "center", fontSize: 13, marginTop: spacing.lg },
  messageRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }, avatar: { width: 32, height: 32, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", overflow: "hidden", backgroundColor: colors.surfaceTertiary }, avatarImage: { width: 32, height: 32 }, messageBody: { flex: 1, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, ...shadows.card }, messageMeta: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm, marginBottom: spacing.xs }, messageName: { color: colors.onSurface, fontSize: 13, fontWeight: "800" }, messageTime: { color: colors.onSurfaceMuted, fontSize: 11 }, messageText: { color: colors.onSurface, fontSize: 14, lineHeight: 20 }, systemWrap: { alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.xs }, systemChip: { color: colors.onSurfaceMuted, fontSize: 12, textAlign: "center", backgroundColor: colors.surfaceTertiary, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surfaceSecondary }, composerInput: { flex: 1, minHeight: 44, maxHeight: 110, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.onSurface, fontSize: 14, backgroundColor: colors.surfaceTertiary, textAlignVertical: "center" }, sendButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.brand }, sendButtonDisabled: { opacity: 0.5 },
  modalBackdrop: { flex: 1, justifyContent: "center", padding: spacing.lg, backgroundColor: colors.surfaceTertiary }, modalCard: { padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surfaceSecondary, ...shadows.strong }, modalTitle: { color: colors.onSurface, fontSize: 20, fontWeight: "800" }, modalIntro: { color: colors.onSurfaceMuted, fontSize: 14, lineHeight: 20, marginTop: spacing.xs }, modalLabel: { color: colors.onSurface, fontSize: 13, fontWeight: "800", marginTop: spacing.md, marginBottom: spacing.xs }, modalInput: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, color: colors.onSurface, fontSize: 15 }, modalTextarea: { minHeight: 94, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, color: colors.onSurface, fontSize: 15, textAlignVertical: "top", marginTop: spacing.md }, moneyField: { flexDirection: "row", alignItems: "center", minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingLeft: spacing.md }, currency: { color: colors.onSurface, fontSize: 16, fontWeight: "800" }, moneyInput: { flex: 1, minHeight: 48, paddingHorizontal: spacing.sm, color: colors.onSurface, fontSize: 15 }, modalActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg }, modalButton: { flex: 1 },
});
