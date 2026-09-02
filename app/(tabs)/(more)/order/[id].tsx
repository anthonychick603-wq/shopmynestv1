import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { KeyboardAwareScroll } from "@/src/components/KeyboardAwareScroll";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { format } from "date-fns";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import { nest, ApiError, type NestSellerOrderRaw, type NestLabelRate, type NestShippingLabel, type NestRefundStatus, type NestDisputeRaw } from "@/src/api/nest";
import { toOrder } from "@/src/api/adapters";
import { colors, radius, spacing, type as typeTokens } from "@/src/theme";
import type { Order } from "@/src/types";
import { useAuth } from "@/src/context/AuthContext";
import { Input } from "@/src/components/Input";
import { Button } from "@/src/components/Button";
import { toast } from "@/src/components/Toast";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";
import { AppImage } from "@/src/components/AppImage";
import { RefundStatusCard } from "@/src/components/RefundStatusCard";
import { BuyerTrackingCard } from "@/src/components/BuyerTrackingCard";
import { OrderStatusTimeline } from "@/src/components/OrderStatusTimeline";
import { safeBack } from "@/src/utils/nav";
import { haptics } from "@/src/utils/haptics";
import { OrderDetailSkeleton } from "@/src/components/OrderDetailSkeleton";
import { parseServerDate } from "@/src/utils/datetime";
import { statusLabel } from "@/src/utils/orderStatus";

export default function OrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const isSeller = !!user && (user.role === "seller" || user.role === "admin");
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<{ status: number; message: string } | null>(null);
  const [sellerOrder, setSellerOrder] = useState<NestSellerOrderRaw | null>(null);
  // v1.0.49 — refund lifecycle block returned by /orders/{id}.
  const [refund, setRefund] = useState<NestRefundStatus | null>(null);
  const [orderDispute, setOrderDispute] = useState<NestDisputeRaw | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // v1.0.94 (Build #16) — in-flight flag for buyer-initiated cancel.
  const [cancelling, setCancelling] = useState(false);

  // v1.0.94 (Build #16) — buyer-initiated cancel. Confirms first so a
  // stray tap can't wipe out the order. On success we reload the order so
  // the timeline flips to Cancelled and the cancel button disappears.
  const onCancelOrder = useCallback(() => {
    if (!order) return;
    Alert.alert(
      "Cancel this order?",
      "The seller will be notified and the order will be closed.",
      [
        { text: "Keep order", style: "cancel" },
        {
          text: "Cancel order",
          style: "destructive",
          onPress: async () => {
            try {
              setCancelling(true);
              haptics.warning();
              const raw = await nest.cancelBuyerOrder(order.id);
              setOrder(toOrder(raw));
              toast.success("Order cancelled");
            } catch (e) {
              const friendly = e instanceof ApiError ? e.friendly : "Couldn't cancel this order. Please try again.";
              toast.error(friendly);
              haptics.error();
            } finally {
              setCancelling(false);
            }
          },
        },
      ]
    );
  }, [order]);

  const load = useCallback(() => {
    setLoadError(null);
    setLoading(true);
    // v1.0.46 — Jo tapped her seller dashboard's #2943 row and hit the
    // "you can't view this order" wall because getBuyerOrder 403s for a
    // seller who is not the buyer. Fire both requests in parallel; if the
    // buyer path fails but the seller path finds the order, keep the
    // screen mounted so the seller-fulfillment view can render.
    const buyerP = nest
      .getBuyerOrder(id!)
      .then((raw) => {
        setOrder(toOrder(raw));
        if (raw.refund) setRefund(raw.refund);
      })
      .catch((err) => {
        if (err instanceof ApiError) {
          setLoadError({ status: err.status, message: err.friendly || err.message });
        } else {
          setLoadError({ status: 0, message: "Couldn’t load this order." });
        }
        setOrder(null);
      });
    const sellerP = isSeller
      ? nest.getSellerOrders({ per_page: 100 })
          .then((res) => setSellerOrder(res.orders?.find((o) => String(o.id) === String(id)) ?? null))
          .catch(() => setSellerOrder(null))
      : Promise.resolve();
    const disputeP = user
      ? nest.trust.listDisputes()
          .then((res) => {
            const rows = Array.isArray(res) ? res : res.disputes || [];
            setOrderDispute(rows.find((d) => String(d.order_id) === String(id) && !String(d.status).startsWith("resolved_")) ?? null);
          })
          .catch(() => setOrderDispute(null))
      : Promise.resolve();
    return Promise.all([buyerP, sellerP, disputeP]).finally(() => { setLoading(false); setRefreshing(false); });
  }, [id, isSeller]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <SafeAreaView style={styles.safe}><OrderDetailSkeleton /></SafeAreaView>;

  // v1.0.108 — a seller-buyer account viewing an order they
  // BOUGHT (as the customer_id on the order) must always see the buyer
  // view, even if getSellerOrders happens to return this order id back
  // to them. A seller-buyer once saw one such order render as
  // SellerOrderScreen with a fulfillment card and "Your earnings"
  // because a stale/erroneous `_tnm_seller_ids` stamp put their own
  // uid on the CSV even though they had no line items to ship. The plugin (v3.7.122.14) also filters
  // this out server-side, but gate on identity here so older bridges
  // (and any future data drift) can't render the wrong screen.
  const iAmBuyer = !!order && !!user && typeof order.customer_id === "number" && Number(order.customer_id) === Number(user.id);

  // v1.0.101 — a seller looking at an order where they have line items
  // must ALWAYS see the seller-framed view ("Ship to", "Your earnings",
  // fulfillment status), never the buyer-framed one. Originally this
  // branch only fired when the buyer fetch 403'd (v1.0.46 fix for Jo's
  // #2943). But on some orders the buyer endpoint returns the order to
  // sellers/admins, and the screen then rendered the buyer layout with
  // "SHIPPING TO <buyer>" for the person actually doing the shipping.
  // getSellerOrders only returns orders where the current user has
  // line items to fulfill, so a match there uniquely means "this user
  // is a seller ON this order" — even if the buyer endpoint also let
  // them read it.
  if (sellerOrder && !iAmBuyer) {
    return <SellerOrderScreen data={sellerOrder} onUpdated={setSellerOrder} />;
  }

  if (!order) {
    const status = loadError?.status ?? 0;
    const heading =
      status === 401
        ? "Please sign in again"
        : status === 403
        ? "You can’t view this order"
        : status === 404
        ? "Order not found"
        : "Couldn’t load this order";
    const detail =
      status === 401
        ? "Your session has expired. Sign back in and try again."
        : status === 403
        ? "This order belongs to another buyer. If you placed it, sign in with that account."
        : status === 404
        ? "We couldn’t find an order with this number. If you just placed it, give it a few seconds and try again."
        : (loadError?.message ?? "Something went wrong. Please try again.");
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.top}>
          <TouchableOpacity onPress={() => safeBack(router, "/(tabs)/account")} style={styles.topBtn} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
          </TouchableOpacity>
          <Text style={styles.topTitle}>Order</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.center}>
          <Ionicons name={status === 403 ? "lock-closed-outline" : status === 401 ? "log-in-outline" : "help-circle-outline"} size={40} color={colors.onSurfaceMuted} />
          <Text style={[styles.status, { marginTop: spacing.md }]}>{heading}</Text>
          <Text style={{ color: colors.onSurfaceMuted, textAlign: "center", marginTop: spacing.sm, paddingHorizontal: spacing.xl }}>{detail}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.top}>
        <TouchableOpacity onPress={() => safeBack(router, "/(tabs)/account")} style={styles.topBtn} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Ionicons name="chevron-back" size={22} color={colors.onSurface} /></TouchableOpacity>
        <Text style={styles.topTitle}>Order #{order.id}</Text>
        <AlertsBellButton />
        <CartHeaderButton />
      </View>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} colors={[colors.brand]} />}
      >
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Status</Text>
          <OrderStatusTimeline order={order} />
          <Text style={[styles.statusHint, { marginTop: spacing.sm, textAlign: "center" }]}>
            {buyerStatusLabel(order)}
          </Text>
          {order.shipping_status === "partial" ? (
            <Text style={styles.statusHint}>Some sellers on this order have shipped, others are still preparing.</Text>
          ) : null}
          {/*
            v1.0.94 (Build #16) — inline cancel action for buyers. Only
            visible while the order is truly cancellable (pending/on-hold,
            no shipments). Paid orders route to the refund flow via
            RefundStatusCard below. We confirm with Alert.alert so a stray
            tap can't nuke the order.
          */}
          {!isSeller && order.cancellable && !refund ? (
            <TouchableOpacity
              onPress={onCancelOrder}
              disabled={cancelling}
              accessibilityRole="button"
              accessibilityLabel="Cancel this order"
              style={styles.cancelBtn}
              testID="order-cancel"
            >
              {cancelling ? (
                <ActivityIndicator color={colors.error} size="small" />
              ) : (
                <>
                  <Ionicons name="close-circle-outline" size={16} color={colors.error} />
                  <Text style={styles.cancelBtnText}>Cancel order</Text>
                </>
              )}
            </TouchableOpacity>
          ) : null}
        </View>
        {order.tracking_rows.length > 0 ? (
          <View style={{ marginBottom: spacing.sm }}>
            {order.tracking_rows.map((row) => (
              <BuyerTrackingCard key={row.seller_id} row={row} />
            ))}
          </View>
        ) : null}
        <OrderSellerMessagesCard order={order} />
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Items</Text>
          {order.items.map((it, i) => (
            <View key={i} style={styles.itemRow}>
              <AppImage source={{ uri: it.product.images?.[0] }} style={styles.itemImg} fallbackIcon="pricetag-outline" />
              <View style={{ flex: 1, paddingHorizontal: spacing.md }}>
                <Text style={styles.itemTitle} numberOfLines={2}>{it.product.title}</Text>
                <Text style={styles.itemMeta}>Qty {it.quantity}</Text>
              </View>
              <Text style={styles.itemTotal}>${it.line_total.toFixed(2)}</Text>
            </View>
          ))}
        </View>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Shipping to</Text>
          <Text style={styles.addr}>{order.shipping_address.first_name} {order.shipping_address.last_name}</Text>
          <Text style={styles.addr}>{order.shipping_address.line1}{order.shipping_address.line2 ? `, ${order.shipping_address.line2}` : ""}</Text>
          <Text style={styles.addr}>{order.shipping_address.city}, {order.shipping_address.state} {order.shipping_address.postal_code}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Totals</Text>
          <Line k="Subtotal" v={`$${order.subtotal.toFixed(2)}`} />
          <Line k="Shipping" v={`$${order.shipping_cost.toFixed(2)}`} />
          <Line k="Tax" v={`$${order.tax.toFixed(2)}`} />
          <View style={styles.divider} />
          <Line k="Total" v={`$${order.total.toFixed(2)}`} bold />
        </View>
        {/* v1.0.222 — always mount the refund card for the buyer. If the
            server omitted the `refund` block (legacy plugin, non-fatal
            partial response), synthesize a client-side "none" block so the
            card can still surface a first-time "Request refund" CTA and
            the buyer isn't left with no path. Eligibility is unknown
            client-side, so we let the server enforce it on submit. */}
        {iAmBuyer ? (
          <RefundStatusCard
            orderId={order.id}
            refund={refund ?? synthesizeEmptyRefund(order)}
            onChange={setRefund}
            activeCaseId={orderDispute?.id ?? null}
          />
        ) : null}
        {order.status === "delivered" ? (
          <TouchableOpacity style={styles.leaveReviewBtn} onPress={() => router.push(`/orders/${order.id}/review` as Href)} testID="order-leave-review" accessibilityRole="button">
            <Ionicons name="star-outline" size={18} color={colors.onBrand} />
            <Text style={styles.leaveReviewText}>Leave a review</Text>
          </TouchableOpacity>
        ) : null}
        {isSeller && sellerOrder && !iAmBuyer ? (
          <SellerFulfillment orderId={String(order.id)} data={sellerOrder} onUpdated={setSellerOrder} />
        ) : null}
        <View style={styles.card}>
          <View style={styles.protectRow}>
            <Ionicons name="shield-checkmark" size={20} color={colors.brand} />
            <Text style={styles.protectTitle}>Resolution center</Text>
          </View>
          {/* v1.0.222 — the previous copy contradicted the refund card:
              when the refund card said "You can't request a refund on
              this order" for a `none` state with blockers, this section
              still offered "Open buyer-protection case". Now the resolution
              card only shows an action when it is *the* action for that
              state; otherwise it's a passive info card that defers to the
              refund card above. */}
          <Text style={styles.protectText}>
            {orderDispute
              ? "A buyer-protection case is already open for this order. Keep updates and escalation in that case so there is one source of truth."
              : refund && ["requested", "approved", "processing"].includes(refund.state)
              ? "Your refund request is active. A separate dispute cannot be started while that resolution is in progress."
              : refund?.state === "completed"
              ? "This order's refund has been completed."
              : refund?.state === "denied"
              ? "Your refund request was denied. You can escalate the same order issue to buyer protection for review."
              : refund?.eligibility?.can_request
              ? "Start with the refund request above. Buyer protection is the escalation path if that doesn't resolve it."
              : refund && !refund.eligibility?.can_request
              ? "See the refund card above for what's available on this order. Buyer protection is only for cases the refund path can't resolve."
              : "If a refund cannot resolve your issue, you can open one buyer-protection case for the order."}
          </Text>
          <View style={styles.protectBtns}>
            {orderDispute ? (
              <TouchableOpacity style={styles.protectPrimary} onPress={() => router.push(`/disputes/${orderDispute.id}`)} testID="order-view-active-dispute" accessibilityRole="button">
                <Text style={styles.protectPrimaryText}>View active case</Text>
              </TouchableOpacity>
            ) : refund?.state === "denied" ? (
              // Only surface the escalation CTA after a denial — that's the
              // one case where buyer protection is unambiguously the path.
              <TouchableOpacity style={styles.protectPrimary} onPress={() => router.push(`/disputes/new?order=${order.id}`)} testID="order-open-dispute" accessibilityRole="button">
                <Text style={styles.protectPrimaryText}>Escalate to buyer protection</Text>
              </TouchableOpacity>
            ) : !refund ? (
              // No refund block was returned at all — legacy or partial
              // order. Give the buyer the single escalation button.
              <TouchableOpacity style={styles.protectPrimary} onPress={() => router.push(`/disputes/new?order=${order.id}`)} testID="order-open-dispute" accessibilityRole="button">
                <Text style={styles.protectPrimaryText}>Open buyer-protection case</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.protectGhost} onPress={() => router.push("/disputes")} testID="order-view-disputes" accessibilityRole="button">
              <Text style={styles.protectGhostText}>My cases</Text>
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.placedAt}>Placed {order.created_at ? format(parseServerDate(order.created_at) ?? new Date(0), "PPpp") : ""}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function OrderSellerMessagesCard({ order }: { order: Order }) {
  const router = useRouter();
  const sellers = new Map<string, { id: string; name: string; titles: string[]; productIds: string[] }>();

  for (const item of order.items) {
    const seller = item.product.seller;
    if (!seller?.id || Number(seller.id) <= 0) continue;
    const existing = sellers.get(String(seller.id)) ?? { id: String(seller.id), name: seller.name || "Seller", titles: [], productIds: [] };
    if (item.product.title && !existing.titles.includes(item.product.title)) existing.titles.push(item.product.title);
    if (item.product_id && !existing.productIds.includes(item.product_id)) existing.productIds.push(item.product_id);
    sellers.set(existing.id, existing);
  }

  if (!sellers.size) return null;

  return (
    <View style={styles.card}>
      <View style={styles.protectRow}>
        <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.brand} />
        <Text style={styles.protectTitle}>{sellers.size > 1 ? "Message a seller" : "Message seller"}</Text>
      </View>
      <Text style={styles.protectText}>
        Ask about this purchase here. Messages started from this order are tagged with Order #{order.id}.
      </Text>
      <View style={styles.orderMessageList}>
        {Array.from(sellers.values()).map((seller) => {
          const title = seller.titles.slice(0, 2).join(", ");
          return (
            <TouchableOpacity
              key={seller.id}
              style={styles.orderMessageRow}
              onPress={() => {
                haptics.tap();
                router.push({
                  pathname: "/messages/[userId]",
                  params: {
                    userId: seller.id,
                    name: seller.name,
                    orderId: order.id,
                    orderTitle: title || `Order #${order.id}`,
                    productId: seller.productIds[0],
                  },
                });
              }}
              testID={`order-message-seller-${seller.id}`}
              accessibilityRole="button"
              accessibilityLabel={`Message ${seller.name} about order ${order.id}`}
            >
              <View style={styles.orderMessageIcon}>
                <Ionicons name="storefront-outline" size={18} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.orderMessageName} numberOfLines={1}>{seller.name}</Text>
                {title ? <Text style={styles.orderMessageMeta} numberOfLines={1}>{title}</Text> : null}
              </View>
              <Text style={styles.orderMessageAction}>Message</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.onSurfaceMuted} />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const SELLER_STATUS_LABELS: Record<string, string> = {
  processing: "Processing",
  shipped: "Shipped",
  completed: "Completed",
  cancelled: "Cancelled",
};

function allowedSellerStatuses(currentRaw: string): string[] {
  const current = (currentRaw || "processing").toLowerCase();
  if (current === "completed" || current === "cancelled") return [current];
  if (current === "shipped") return ["shipped"];
  return ["processing", "shipped", "cancelled"];
}

function SellerFulfillment({ orderId, data, onUpdated }: { orderId: string; data: NestSellerOrderRaw; onUpdated: (o: NestSellerOrderRaw) => void }) {
  const [status, setStatus] = useState<string>(data.seller_status || "processing");
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState(data.tracking_number || "");
  const [busy, setBusy] = useState(false);

  // v1.0.222 — the actual write to the server. `save` is the tap handler;
  // it routes cancels through a confirm dialog first because cancellation
  // is destructive (buyer is charged, seller has to refund) and used to
  // fire on a single tap of a chip labeled "Cancelled".
  const doSave = async () => {
    if (status === "shipped" && !tracking.trim()) {
      toast.error("Add a tracking number before marking a manual shipment as shipped, or buy a ShopMyNest label below.");
      return;
    }
    setBusy(true);
    try {
      const tracking_number = [carrier.trim(), tracking.trim()].filter(Boolean).join(" ");
      const updated = await nest.updateSellerOrder(orderId, { status, tracking_number });
      onUpdated(updated);
      setCarrier("");
      setTracking(updated.tracking_number || "");
      toast.success("Fulfillment updated");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.friendly : "Could not update this order.");
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    haptics.press();
    if (status === "cancelled" && data.seller_status !== "cancelled") {
      Alert.alert(
        "Cancel this order?",
        "The buyer will be refunded and this order will be marked cancelled. This can't be undone from here.",
        [
          { text: "Keep order", style: "cancel", onPress: () => setStatus(data.seller_status || "processing") },
          { text: "Cancel order", style: "destructive", onPress: () => { void doSave(); } },
        ],
      );
      return;
    }
    void doSave();
  };

  return (
    <View style={styles.card}>
      <View style={styles.protectRow}>
        <Ionicons name="cube-outline" size={20} color={colors.brand} />
        <Text style={styles.protectTitle}>Fulfill this order</Text>
      </View>
      {/* v1.0.222 — removed the duplicate "Your net" line here. The
          same number is displayed by the payout breakdown card below
          (with the full deduction detail), so this second, less-detailed
          copy was contradicting itself when the breakdown re-derived it
          from platform_fee + stripe_fee. Kept the breakdown as the single
          source of truth. */}
      <Text style={styles.fieldLabel}>Status</Text>
      <View style={styles.statusRow}>
        {allowedSellerStatuses(data.seller_status).map((value) => {
          const on = status === value;
          const label = SELLER_STATUS_LABELS[value] || value;
          return (
            <TouchableOpacity key={value} onPress={() => { haptics.tap(); setStatus(value); }} style={[styles.statusChip, on && styles.statusChipOn]} testID={`order-status-${value}`} accessibilityLabel={`Set status to ${label}`} accessibilityRole="button">
              <Text style={[styles.statusChipText, on && styles.statusChipTextOn]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Input label="Carrier (optional)" value={carrier} onChangeText={setCarrier} placeholder="USPS, UPS, FedEx…" testID="order-carrier" />
      <Input label="Tracking number" value={tracking} onChangeText={setTracking} autoCapitalize="characters" testID="order-tracking" />
      <Button title="Save fulfillment" onPress={save} loading={busy} testID="order-fulfill-save" />

      <View style={styles.labelDivider} />
      {/* v1.0.222 — pass a purchase callback so the buy-label flow can
          update the fulfillment card's tracking field immediately, and
          the parent's seller-order data. Fixes the race where the seller
          bought a label, tapped Save, and the save call failed with
          "add a tracking number" because state hadn't caught up. */}
      <ShippingLabelSection
        orderId={orderId}
        platformKeepsShipping={data.platform_keeps_shipping === true}
        onLabelPurchased={(l) => {
          if (l?.tracking_number) {
            setTracking(l.tracking_number);
            // Propagate the tracking upward so the parent's snapshot of
            // the seller order matches the server. The label-buy endpoint
            // stamps _tnm_tracking_<seller_id> server-side; we mirror that
            // in the local shape so a subsequent Save doesn't wipe it.
            onUpdated({ ...data, tracking_number: l.tracking_number });
          }
        }}
      />
    </View>
  );
}

// Buy a real Shippo label and print/share the PDF. Additive to the manual
// tracking fields above — either path fulfils the order.
function ShippingLabelSection({ orderId, platformKeepsShipping, onLabelPurchased }: { orderId: string; platformKeepsShipping: boolean; onLabelPurchased?: (label: NestShippingLabel | null) => void }) {
  const [label, setLabel] = useState<NestShippingLabel | null>(null);
  const [checking, setChecking] = useState(true);
  const [rates, setRates] = useState<NestLabelRate[] | null>(null);
  const [selectedRateId, setSelectedRateId] = useState<string | null>(null);
  const [loadingRates, setLoadingRates] = useState(false);
  const [buying, setBuying] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasLabel = !!label && (!!label.label_url || !!label.transaction);

  const applyLabel = useCallback((l: NestShippingLabel | null) => {
    if (l && (l.label_url || l.transaction)) setLabel(l);
  }, []);

  useEffect(() => {
    let alive = true;
    nest.getShippingLabel(orderId)
      .then((res) => { if (alive) applyLabel(res.label); })
      .catch((e: unknown) => {
        // v1.0.97 — previously swallowed. The label probe was designed
        // to fail benignly when an order simply has no label yet, but a
        // real network / auth error was indistinguishable from that. Now
        // we surface the error into the section’s inline error slot so
        // the seller sees why buying rates won’t work.
        if (alive) setError(e instanceof ApiError ? e.friendly : "Couldn’t check for an existing label");
      })
      .finally(() => { if (alive) setChecking(false); });
    return () => { alive = false; };
  }, [orderId, applyLabel]);

  const loadRates = async () => {
    setError(null);
    setLoadingRates(true);
    try {
      const res = await nest.getShippingRates(orderId);
      if (res.kind === "existing") {
        applyLabel(res.label);
        setRates(null);
        return;
      }
      const sorted = [...res.rates].sort((a, b) => parseFloat(a.amount) - parseFloat(b.amount));
      setRates(sorted);
      setSelectedRateId(sorted[0]?.object_id ?? null);
      if (sorted.length === 0) setError("No shipping rates were available for this package.");
    } catch (e) {
      setError(e instanceof ApiError ? e.friendly : "Could not fetch shipping rates.");
    } finally {
      setLoadingRates(false);
    }
  };

  const buy = async () => {
    const rate = rates?.find((r) => r.object_id === selectedRateId);
    if (!rate) return;
    setError(null);
    setBuying(true);
    try {
      const res = await nest.buyShippingLabel(orderId, rate);
      applyLabel(res.label);
      setRates(null);
      // v1.0.222 — notify parent so the tracking field and seller-order
      // data reflect the new label BEFORE the seller taps Save fulfillment.
      if (onLabelPurchased) onLabelPurchased(res.label ?? null);
      if (res.label?.label_url) toast.success("Shipping label purchased");
      else toast.success("Label requested — it will be ready shortly");
    } catch (e) {
      setError(e instanceof ApiError ? e.friendly : "Could not purchase the label.");
    } finally {
      setBuying(false);
    }
  };

  const share = async () => {
    if (!label?.label_url) return;
    setSharing(true);
    try {
      const target = `${FileSystem.cacheDirectory}label-${orderId}.pdf`;
      const { uri } = await FileSystem.downloadAsync(label.label_url, target);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: "Print or share shipping label",
          UTI: "com.adobe.pdf",
        });
      } else {
        await Linking.openURL(label.label_url);
      }
    } catch {
      try {
        await Linking.openURL(label.label_url);
      } catch {
        toast.error("Could not open the label.");
      }
    } finally {
      setSharing(false);
    }
  };

  return (
    <View>
      <View style={styles.protectRow}>
        <Ionicons name="pricetag-outline" size={20} color={colors.brand} />
        <Text style={styles.protectTitle}>Shipping label</Text>
      </View>

      {checking ? (
        <View style={styles.labelChecking}><ActivityIndicator color={colors.brand} /></View>
      ) : hasLabel && label ? (
        <View>
          <View style={styles.tracking}>
            <Ionicons name="cube" size={18} color={colors.brand} />
            <Text style={styles.trackingText}>
              {[label.carrier, label.service].filter(Boolean).join(" ") || "Label"}
              {label.tracking_number ? ` — ${label.tracking_number}` : ""}
            </Text>
          </View>
          {/* v1.0.222 — Shippo returns raw status strings like
              "QUEUED" / "PROCESSING" / "ERROR" / "REFUNDED" (and lowercase
              variants). Show the seller a human sentence instead of the
              raw token. */}
          {label.status && String(label.status).toLowerCase() !== "success" ? (
            <Text style={styles.labelPending}>{humanLabelStatus(label.status)}</Text>
          ) : null}
          {label.label_url ? (
            <Button title="Print / Share label" onPress={share} loading={sharing} testID="order-label-share" />
          ) : (
            <Text style={styles.labelPending}>The label PDF isn't ready yet.</Text>
          )}
        </View>
      ) : rates ? (
        <View>
          <Text style={styles.fieldLabel}>Choose a rate</Text>
          {rates.map((r) => {
            const sel = r.object_id === selectedRateId;
            return (
              <TouchableOpacity
                key={r.object_id}
                onPress={() => setSelectedRateId(r.object_id)}
                style={styles.rateRow}
                testID={`order-rate-${r.object_id}`}
               accessibilityRole="button">
                <Ionicons name={sel ? "radio-button-on" : "radio-button-off"} size={20} color={sel ? colors.brand : colors.onSurfaceMuted} />
                <Text style={styles.rateLabel} numberOfLines={2}>
                  {[r.provider, r.servicelevel?.name].filter(Boolean).join(" ")}
                  {r.estimated_days ? ` · ${r.estimated_days}d` : ""}
                </Text>
                <Text style={styles.rateAmount}>${parseFloat(r.amount).toFixed(2)}</Text>
              </TouchableOpacity>
            );
          })}
          {error ? <Text style={styles.labelError}>{error}</Text> : null}
          {selectedRateId ? (() => {
            const r = rates.find((x) => x.object_id === selectedRateId);
            const amt = r ? parseFloat(r.amount).toFixed(2) : "0.00";
            return (
              <Text style={styles.labelDeductionNotice} testID="order-label-deduction-notice">
                {platformKeepsShipping
                  ? `ShopMyNest covers the $${amt} postage for this order; it will not reduce your seller payout.`
                  : `$${amt} postage will be recorded in the seller earnings ledger and reconciled before payout.`}
              </Text>
            );
          })() : null}
          <Button title="Buy this label" onPress={buy} loading={buying} testID="order-label-buy" />
          <TouchableOpacity onPress={() => { setRates(null); setError(null); }} style={styles.labelCancel} testID="order-label-cancel" accessibilityRole="button">
            <Text style={styles.labelCancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View>
          <Text style={styles.protectText}>Buy a prepaid label and we'll fill in the carrier and tracking automatically.</Text>
          {error ? <Text style={styles.labelError}>{error}</Text> : null}
          <View style={{ marginTop: spacing.md }}>
            <Button title="Buy shipping label" onPress={loadRates} loading={loadingRates} testID="order-label-start" />
          </View>
        </View>
      )}
    </View>
  );
}

function Line({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
      <Text style={{ color: colors.onSurfaceMuted, fontWeight: bold ? "800" : "600" }}>{k}</Text>
      <Text style={{ color: colors.onSurface, fontWeight: bold ? "800" : "700", fontSize: bold ? 17 : 14 }}>{v}</Text>
    </View>
  );
}

// v1.0.47 — WooCommerce's get_formatted_shipping_address() returns HTML
// with literal <br/> tags. React Native's <Text> renders those as visible
// characters, so "45 Leonard Street" showed up as "<br/>45 Leonard
// Street<br/>". Split on any <br> variant, strip other tags, and drop the
// first line when it duplicates the name we already printed.
function formatShipAddress(name?: string, address?: string): string[] {
  const cleanName = (name || "").trim();
  const raw = (address || "").replace(/<\s*br\s*\/?\s*>/gi, "\n");
  const lines = raw
    .split(/\n+/)
    .map((l) => l.replace(/<[^>]+>/g, "").trim())
    .filter(Boolean);
  if (cleanName && lines[0] && lines[0].toLowerCase() === cleanName.toLowerCase()) {
    lines.shift();
  }
  return cleanName ? [cleanName, ...lines] : lines.length ? lines : ["Customer"];
}

// v1.0.46 — seller-only order detail. Rendered when the buyer endpoint 403s
// (i.e. the current seller is not the buyer of this order) but our own
// /seller/orders list confirms this seller has line items on it. Uses only
// NestSellerOrderRaw fields — no buyer PII beyond what the seller already
// sees on the fulfillment card.
function SellerOrderScreen({ data, onUpdated }: { data: NestSellerOrderRaw; onUpdated: (o: NestSellerOrderRaw) => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.top}>
        <TouchableOpacity onPress={() => safeBack(router, "/(tabs)/account")} style={styles.topBtn} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Order #{data.number || data.id}</Text>
        <View style={{ width: 36 }} />
      </View>
      <KeyboardAwareScroll contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        {/*
          v1.0.141 — removed the read-only "Your fulfillment status" card
          that used to sit here. Its two facts (current seller_status and
          the tracking number) are already surfaced — and editable — in
          the <SellerFulfillment> section further down on the same screen.
          Keeping both meant the seller saw the same status label twice
          and the same tracking number twice, with the top card offering
          no action. The status chips and tracking input below cover the
          need without duplication.
        */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Your items</Text>
          {data.items.map((it, i) => (
            <View key={i} style={styles.itemRow}>
              <View style={{ flex: 1, paddingRight: spacing.md }}>
                <Text style={styles.itemTitle} numberOfLines={2}>{it.name}</Text>
                <Text style={styles.itemMeta}>Qty {it.quantity}</Text>
              </View>
              <Text style={styles.itemTotal}>${Number(it.gross ?? 0).toFixed(2)}</Text>
            </View>
          ))}
        </View>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Ship to</Text>
          {formatShipAddress(data.customer?.name, data.customer?.address).map((line, i) => (
            <Text key={i} style={styles.addr}>{line}</Text>
          ))}
        </View>
        {/* v1.0.222 — seller-side refund strip. The plugin (v3.13.76+)
            returns a `refund` summary on the seller-order payload so the
            seller can see when the buyer has an active or completed
            refund request without having to guess from the top-level
            order status. Renders only when the plugin sends a block. */}
        <SellerRefundStrip refund={data.refund} />
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Your earnings</Text>
          <Line k="Item subtotal" v={`$${Number(data.gross ?? 0).toFixed(2)}`} />
          <Line k="Platform fee" v={`-$${Number(data.platform_fee ?? 0).toFixed(2)}`} />
          {/* v1.0.127 — Renamed from "Stripe processing fee" to "Card
              processing fee" — same field on the server, vendor-agnostic
              wording so sellers see what the deduction is for without
              us naming a specific payment processor. */}
          {Number(data.stripe_fee ?? 0) > 0 && (
            <Line k="Card processing fee" v={`-$${Number(data.stripe_fee ?? 0).toFixed(2)}`} />
          )}
          <View style={styles.divider} />
          <Line
            k="Your net"
            v={`$${Number(data.seller_net ?? data.net_before_shipping ?? 0).toFixed(2)}`}
            bold
          />
          {data.platform_keeps_shipping ? (
            <Text style={{ fontSize: 12, color: '#7A7974', marginTop: 6 }}>
              Shipping is paid by the buyer and covered by ShopMyNest — you don't need to pay for the label.
            </Text>
          ) : null}
        </View>
        <SellerFulfillment orderId={String(data.id)} data={data} onUpdated={onUpdated} />
        <OrderBuyerMessageCard data={data} />
        <Text style={styles.placedAt}>Placed {data.date_created ? format(parseServerDate(data.date_created) ?? new Date(0), "PPpp") : ""}</Text>
      </KeyboardAwareScroll>
    </SafeAreaView>
  );
}

// v1.0.130 — seller-side counterpart to OrderSellerMessagesCard. Deep-links
// into the existing DM thread with the buyer, pre-populating the order
// context so the reply is stamped with [Order #<id>] and shows an ORDER
// CONVERSATION chip on both ends. Rendered only when the seller order
// carries a real buyer id (customer_id or customer.id) — guest checkouts and
// legacy rows without a buyer uid are silently skipped.
// v1.0.222 — seller-facing refund status strip. Reads the seller-safe
// summary the plugin (v3.13.76+) attaches to the seller-order payload.
// Colors match the buyer's RefundStatusCard buckets so the two sides
// speak the same visual language.
function SellerRefundStrip({ refund }: { refund?: import("@/src/api/nest").NestSellerRefundSummary | null }) {
  if (!refund) return null;
  const state = refund.state;
  // Bucket colors mirror the buyer refund card. Kept inline (rather than
  // importing statusPalette) so the strip stays a small, self-contained
  // seller UI element.
  const tone =
    state === "denied"
      ? { bg: "#FCE7E7", fg: "#8A1A1A" }
      : state === "completed"
      ? { bg: "#E4F0DB", fg: "#245B12" }
      : state === "requested" || state === "approved" || state === "processing"
      ? { bg: "#FFF3D2", fg: "#8A5A00" }
      : { bg: "#EFEDE7", fg: "#5A5852" };
  const requestedTxt = refund.requested_amount > 0 ? ` · Requested $${refund.requested_amount.toFixed(2)}` : "";
  const refundedTxt = refund.refunded_amount > 0 ? ` · Refunded $${refund.refunded_amount.toFixed(2)}` : "";
  const requestKind =
    refund.request_type === "cancellation" ? "Cancellation"
    : refund.request_type === "return" ? "Return"
    : refund.request_type === "in_transit" ? "In-transit refund"
    : "";
  return (
    <View style={[styles.card, { backgroundColor: tone.bg }]}>
      <View style={styles.protectRow}>
        <Ionicons name="cash-outline" size={20} color={tone.fg} />
        <Text style={[styles.protectTitle, { color: tone.fg }]}>Refund: {refund.label}</Text>
      </View>
      <Text style={{ fontSize: 13, color: tone.fg, marginTop: 6 }}>
        {requestKind ? `${requestKind}${requestedTxt}${refundedTxt}` : `${refund.label}${requestedTxt}${refundedTxt}`.trim()}
      </Text>
      {state === "requested" ? (
        <Text style={{ fontSize: 12, color: tone.fg, marginTop: 6 }}>
          The buyer is waiting on ShopMyNest to review this. You don't need to act.
        </Text>
      ) : state === "approved" || state === "processing" ? (
        <Text style={{ fontSize: 12, color: tone.fg, marginTop: 6 }}>
          ShopMyNest is processing this refund. The amount is reversed from your net for this order.
        </Text>
      ) : state === "completed" ? (
        <Text style={{ fontSize: 12, color: tone.fg, marginTop: 6 }}>
          The buyer has been refunded. No further action is required.
        </Text>
      ) : state === "denied" ? (
        <Text style={{ fontSize: 12, color: tone.fg, marginTop: 6 }}>
          The buyer's refund request was denied by ShopMyNest.
        </Text>
      ) : null}
    </View>
  );
}

function OrderBuyerMessageCard({ data }: { data: NestSellerOrderRaw }) {
  const router = useRouter();
  const buyerId = data.customer_id ?? data.customer?.id;
  if (!buyerId || Number(buyerId) <= 0) return null;

  const buyerName = (data.customer?.name || "").trim() || "Buyer";
  const firstItem = data.items?.[0];
  const otherCount = (data.items?.length ?? 0) - 1;
  const contextTitle = firstItem
    ? otherCount > 0
      ? `${firstItem.name} +${otherCount} more`
      : firstItem.name
    : `Order #${data.number || data.id}`;

  return (
    <View style={styles.card}>
      <View style={styles.protectRow}>
        <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.brand} />
        <Text style={styles.protectTitle}>Message buyer</Text>
      </View>
      <Text style={styles.protectText}>
        Reach out about this order. Messages sent from here are tagged with Order #{data.number || data.id} so the thread keeps its context.
      </Text>
      <View style={styles.orderMessageList}>
        <TouchableOpacity
          style={styles.orderMessageRow}
          onPress={() => {
            haptics.tap();
            router.push({
              pathname: "/messages/[userId]",
              params: {
                userId: String(buyerId),
                name: buyerName,
                orderId: String(data.id),
                orderTitle: contextTitle,
              },
            });
          }}
          testID={`order-message-buyer-${buyerId}`}
          accessibilityRole="button"
          accessibilityLabel={`Message ${buyerName} about order ${data.number || data.id}`}
        >
          <View style={styles.orderMessageIcon}>
            <Ionicons name="person-outline" size={18} color={colors.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.orderMessageName} numberOfLines={1}>{buyerName}</Text>
            {firstItem ? <Text style={styles.orderMessageMeta} numberOfLines={1}>{contextTitle}</Text> : null}
          </View>
          <Text style={styles.orderMessageAction}>Message</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.onSurfaceMuted} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// v1.0.222 — translate Shippo raw label.status tokens to a friendly
// sentence. Falls back to a generic message for unrecognized tokens.
function humanLabelStatus(raw: string): string {
  const t = String(raw || "").toLowerCase();
  switch (t) {
    case "queued":
      return "Label is queued with the carrier. Pull to refresh once it's ready.";
    case "processing":
      return "Label is being generated. Pull to refresh once it's ready.";
    case "error":
      return "The carrier couldn't generate this label. Try buying it again below.";
    case "refunded":
      return "Label was voided and refunded. Buy a new label to ship.";
    case "pending":
      return "Label is pending. Pull to refresh once it's ready.";
    default:
      return "Label is not ready yet. Pull to refresh in a moment.";
  }
}

// v1.0.222 — fallback refund payload for orders where the plugin didn't
// include one. Lets RefundStatusCard mount so the buyer at least has the
// "Request refund" affordance. Eligibility is unknown, so we optimistically
// mark can_request=true and let the server return the real blockers when
// the buyer taps Submit.
function synthesizeEmptyRefund(order: Order): import("@/src/api/nest").NestRefundStatus {
  return {
    order_id: Number(order.id),
    currency: "USD",
    order_total: order.total,
    state: "none",
    label: "No refund activity",
    requested_amount: 0,
    refunded_amount: 0,
    reason: "",
    details: "",
    denial_note: "",
    request_type: "",
    timeline: [],
    eligibility: { can_request: true, blockers: [], policy_days: 14, request_type: "" },
  };
}

function buyerStatusLabel(order: Order): string {
  // v1.0.222 — routes through the shared statusLabel helper so the pill,
  // the tracker, and this hint always emit the same words. The one
  // buyer-specific nuance is Partially Shipped, which depends on
  // shipping_status rather than order.status.
  if (order.status === "shipped" && order.shipping_status === "partial") {
    return statusLabel("partial", "buyer");
  }
  if (order.status === "processing" && order.shipping_status === "partial") {
    return statusLabel("partial", "buyer");
  }
  return statusLabel(order.status, "buyer");
}

const styles = StyleSheet.create({
  // v1.0.227 — Order Detail / Confirmation refinement. Every panel
  // (status, items, address, payment, tracking, seller actions) rebuilds
  // as a white card with hairline border and no shadow, matching Cart
  // and Product Detail. Section labels use `micro`, status uses h2.
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.md },
  topTitle: { ...typeTokens.h2, fontSize: 16 },
  topBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardLabel: { ...typeTokens.micro, marginBottom: 4 },
  // v1.0.94 (Build #16) — inline cancel button rendered inside the Status card.
  cancelBtn: {
    marginTop: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.error + "55",
    backgroundColor: colors.error + "10",
    alignSelf: "center",
    minHeight: 36,
  },
  cancelBtnText: { ...typeTokens.caption, fontWeight: "700", color: colors.error },
  leaveReviewBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.brand, borderRadius: radius.pill, paddingVertical: spacing.md, marginBottom: spacing.md },
  leaveReviewText: { color: colors.onBrand, fontWeight: "800", fontSize: 15 },
  status: { ...typeTokens.h3 },
  statusHint: { ...typeTokens.caption, marginTop: 4 },
  tracking: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.md,
    borderRadius: radius.field,
  },
  trackingText: { ...typeTokens.body, fontWeight: "700" },
  itemRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  itemImg: { width: 60, height: 60, borderRadius: radius.field, backgroundColor: colors.surfaceTertiary },
  itemTitle: { ...typeTokens.body, fontWeight: "700" },
  itemMeta: { ...typeTokens.caption },
  itemTotal: { ...typeTokens.body, fontWeight: "800" },
  addr: { ...typeTokens.caption, color: colors.onSurface, fontWeight: "600", marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline, marginVertical: 6 },
  placedAt: { ...typeTokens.caption, textAlign: "center" },
  protectRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  protectTitle: { ...typeTokens.h3 },
  protectText: { ...typeTokens.caption, lineHeight: 19 },
  protectBtns: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  protectPrimary: { flex: 1, alignItems: "center", backgroundColor: colors.brand, borderRadius: radius.pill, paddingVertical: spacing.md },
  protectPrimaryText: { color: colors.onBrand, fontWeight: "800", fontSize: 14 },
  protectGhost: {
    flex: 1,
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
  },
  protectGhostText: { color: colors.onSurface, fontWeight: "800", fontSize: 14 },
  orderMessageList: { marginTop: spacing.md, gap: spacing.sm },
  orderMessageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.field,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  orderMessageIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.brand + "14", alignItems: "center", justifyContent: "center" },
  orderMessageName: { ...typeTokens.caption, fontWeight: "800", color: colors.onSurface },
  orderMessageMeta: { ...typeTokens.micro, textTransform: "none", letterSpacing: 0, marginTop: 2 },
  orderMessageAction: { ...typeTokens.caption, fontWeight: "800", color: colors.brandDark },
  sellerNet: { ...typeTokens.caption, marginBottom: spacing.md },
  fieldLabel: { ...typeTokens.caption, fontWeight: "800", color: colors.onSurface, marginBottom: spacing.sm },
  statusRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  statusChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
  },
  statusChipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  statusChipText: { ...typeTokens.caption, color: colors.onSurface, fontWeight: "700" },
  statusChipTextOn: { color: colors.onBrand },
  labelDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline, marginVertical: spacing.lg },
  labelChecking: { paddingVertical: spacing.md, alignItems: "center" },
  labelPending: { ...typeTokens.caption, marginTop: spacing.sm, marginBottom: spacing.sm },
  labelError: { ...typeTokens.caption, color: colors.error, marginTop: spacing.sm, marginBottom: spacing.sm },
  labelDeductionNotice: { ...typeTokens.caption, marginTop: spacing.sm, marginBottom: spacing.xs, textAlign: "center" },
  labelCancel: { alignItems: "center", paddingVertical: spacing.sm, marginTop: spacing.sm },
  labelCancelText: { ...typeTokens.caption, color: colors.onSurfaceMuted, fontWeight: "700" },
  rateRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm },
  rateLabel: { ...typeTokens.body, flex: 1, fontWeight: "600" },
  rateAmount: { ...typeTokens.body, fontWeight: "800" },
});
