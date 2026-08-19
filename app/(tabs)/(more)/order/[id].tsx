import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Linking, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { format } from "date-fns";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import { nest, ApiError, type NestSellerOrderRaw, type NestLabelRate, type NestShippingLabel, type NestRefundStatus } from "@/src/api/nest";
import { toOrder } from "@/src/api/adapters";
import { colors, radius, shadows, spacing } from "@/src/theme";
import type { Order } from "@/src/types";
import { useAuth } from "@/src/context/AuthContext";
import { Input } from "@/src/components/Input";
import { Button } from "@/src/components/Button";
import { toast } from "@/src/components/Toast";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { AppImage } from "@/src/components/AppImage";
import { RefundStatusCard } from "@/src/components/RefundStatusCard";
import { BuyerTrackingCard } from "@/src/components/BuyerTrackingCard";
import { OrderStatusTimeline } from "@/src/components/OrderStatusTimeline";
import { OrderReviewCTA } from "@/src/components/OrderReviewCTA";
import { safeBack } from "@/src/utils/nav";
import { haptics } from "@/src/utils/haptics";
import { OrderDetailSkeleton } from "@/src/components/OrderDetailSkeleton";

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
  const [refreshing, setRefreshing] = useState(false);

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
    return Promise.all([buyerP, sellerP]).finally(() => { setLoading(false); setRefreshing(false); });
  }, [id, isSeller]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <SafeAreaView style={styles.safe}><OrderDetailSkeleton /></SafeAreaView>;

  // v1.0.46 — seller-only view: buyer fetch was refused (403) but this
  // seller has a line item on the order. Render a purpose-built seller
  // fulfillment screen instead of the "can't view this order" wall.
  if (!order && sellerOrder) {
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
          <TouchableOpacity onPress={() => safeBack(router, "/(tabs)/account")} style={styles.topBtn} accessibilityRole="button" accessibilityLabel="Go back">
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
        <TouchableOpacity onPress={() => safeBack(router, "/(tabs)/account")} style={styles.topBtn} accessibilityRole="button" accessibilityLabel="Go back"><Ionicons name="chevron-back" size={22} color={colors.onSurface} /></TouchableOpacity>
        <Text style={styles.topTitle}>Order #{order.id}</Text>
        <CartHeaderButton />
      </View>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}
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
        </View>
        {order.tracking_rows.length > 0 ? (
          <View style={{ marginBottom: spacing.sm }}>
            {order.tracking_rows.map((row) => (
              <BuyerTrackingCard key={row.seller_id} row={row} />
            ))}
          </View>
        ) : null}
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
        {refund ? (
          <RefundStatusCard
            orderId={order.id}
            refund={refund}
            onChange={setRefund}
          />
        ) : null}
        <OrderReviewCTA order={order} />
        {isSeller && sellerOrder ? (
          <SellerFulfillment orderId={String(order.id)} data={sellerOrder} onUpdated={setSellerOrder} />
        ) : null}
        <View style={styles.card}>
          <View style={styles.protectRow}>
            <Ionicons name="shield-checkmark" size={20} color={colors.brand} />
            <Text style={styles.protectTitle}>Buyer protection</Text>
          </View>
          <Text style={styles.protectText}>Something wrong with this order? Open a dispute and we'll hold the seller's payout while we help sort it out.</Text>
          <View style={styles.protectBtns}>
            <TouchableOpacity style={styles.protectPrimary} onPress={() => router.push(`/disputes/new?order=${order.id}`)} testID="order-open-dispute">
              <Text style={styles.protectPrimaryText}>Open a dispute</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.protectGhost} onPress={() => router.push("/disputes")} testID="order-view-disputes">
              <Text style={styles.protectGhostText}>My disputes</Text>
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.placedAt}>Placed {order.created_at ? format(new Date(order.created_at), "PPpp") : ""}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const SELLER_STATUSES: { value: string; label: string }[] = [
  { value: "processing", label: "Processing" },
  { value: "shipped", label: "Shipped" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

function SellerFulfillment({ orderId, data, onUpdated }: { orderId: string; data: NestSellerOrderRaw; onUpdated: (o: NestSellerOrderRaw) => void }) {
  const [status, setStatus] = useState<string>(data.seller_status || "processing");
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState(data.tracking_number || "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    haptics.press();
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

  return (
    <View style={styles.card}>
      <View style={styles.protectRow}>
        <Ionicons name="cube-outline" size={20} color={colors.brand} />
        <Text style={styles.protectTitle}>Fulfill this order</Text>
      </View>
      <Text style={styles.sellerNet}>Your net (before shipping): ${data.net_before_shipping.toFixed(2)}</Text>
      <Text style={styles.fieldLabel}>Status</Text>
      <View style={styles.statusRow}>
        {SELLER_STATUSES.map((s) => {
          const on = status === s.value;
          return (
            <TouchableOpacity key={s.value} onPress={() => { haptics.tap(); setStatus(s.value); }} style={[styles.statusChip, on && styles.statusChipOn]} testID={`order-status-${s.value}`} accessibilityLabel={`Set status to ${s.label}`}>
              <Text style={[styles.statusChipText, on && styles.statusChipTextOn]}>{s.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Input label="Carrier (optional)" value={carrier} onChangeText={setCarrier} placeholder="USPS, UPS, FedEx…" testID="order-carrier" />
      <Input label="Tracking number" value={tracking} onChangeText={setTracking} autoCapitalize="characters" testID="order-tracking" />
      <Button title="Save fulfillment" onPress={save} loading={busy} testID="order-fulfill-save" />

      <View style={styles.labelDivider} />
      <ShippingLabelSection orderId={orderId} />
    </View>
  );
}

// Buy a real Shippo label and print/share the PDF. Additive to the manual
// tracking fields above — either path fulfils the order.
function ShippingLabelSection({ orderId }: { orderId: string }) {
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
      .catch(() => {})
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
          {label.status && label.status !== "success" ? (
            <Text style={styles.labelPending}>Label is {label.status}. Pull to refresh once it's ready.</Text>
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
              >
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
                ${amt} in postage will be deducted from your next payout.
              </Text>
            );
          })() : null}
          <Button title="Buy this label" onPress={buy} loading={buying} testID="order-label-buy" />
          <TouchableOpacity onPress={() => { setRates(null); setError(null); }} style={styles.labelCancel} testID="order-label-cancel">
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
        <TouchableOpacity onPress={() => safeBack(router, "/(tabs)/account")} style={styles.topBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Order #{data.number || data.id}</Text>
        <View style={{ width: 36 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Your fulfillment status</Text>
          <Text style={styles.status}>{(data.seller_status || "processing").toUpperCase()}</Text>
          {data.tracking_number ? (
            <View style={styles.tracking}>
              <Ionicons name="location-outline" size={18} color={colors.brand} />
              <Text style={styles.trackingText}>{data.tracking_number}</Text>
            </View>
          ) : null}
        </View>
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
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Your earnings</Text>
          <Line k="Item subtotal" v={`$${Number(data.gross ?? 0).toFixed(2)}`} />
          <Line k="Platform fee" v={`-$${Number(data.platform_fee ?? 0).toFixed(2)}`} />
          <View style={styles.divider} />
          <Line k="Net (before shipping)" v={`$${Number(data.net_before_shipping ?? 0).toFixed(2)}`} bold />
        </View>
        <SellerFulfillment orderId={String(data.id)} data={data} onUpdated={onUpdated} />
        <Text style={styles.placedAt}>Placed {data.date_created ? format(new Date(data.date_created), "PPpp") : ""}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function buyerStatusLabel(order: Order): string {
  // v1.0.51 - map internal status to human copy the buyer expects on the
  // order screen. "processing" is deliberately shown as "Preparing" because
  // customers don't read "processing" as "the seller is picking + packing".
  switch (order.status) {
    case "awaiting_payment":
      return "Payment pending";
    case "processing":
      return order.shipping_status === "partial" ? "Partially shipped" : "Preparing";
    case "shipped":
      return "Shipped";
    case "delivered":
      return "Delivered";
    case "failed":
      return "Payment failed";
    case "cancelled":
      return "Cancelled";
    default:
      return String(order.status).replace("_", " ");
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.md },
  topTitle: { fontSize: 16, fontWeight: "800", color: colors.onSurface },
  topBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, ...shadows.card },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, ...shadows.card },
  cardLabel: { fontSize: 11, color: colors.onSurfaceMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  status: { fontSize: 15, fontWeight: "800", color: colors.onSurface },
  statusHint: { fontSize: 12, color: colors.onSurfaceMuted, marginTop: 4, lineHeight: 17 },
  tracking: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.md, backgroundColor: colors.surfaceTertiary, padding: spacing.md, borderRadius: radius.md },
  trackingText: { color: colors.onSurface, fontWeight: "700" },
  itemRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  itemImg: { width: 60, height: 60, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary },
  itemTitle: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  itemMeta: { fontSize: 12, color: colors.onSurfaceMuted },
  itemTotal: { fontWeight: "800", color: colors.onSurface },
  addr: { color: colors.onSurface, fontWeight: "600", fontSize: 13, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: 6 },
  placedAt: { textAlign: "center", color: colors.onSurfaceMuted, fontSize: 12 },
  protectRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  protectTitle: { fontSize: 15, fontWeight: "800", color: colors.onSurface },
  protectText: { fontSize: 13, color: colors.onSurfaceMuted, lineHeight: 19 },
  protectBtns: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  protectPrimary: { flex: 1, alignItems: "center", backgroundColor: colors.brand, borderRadius: radius.pill, paddingVertical: spacing.md },
  protectPrimaryText: { color: colors.onBrand, fontWeight: "800", fontSize: 14 },
  protectGhost: { flex: 1, alignItems: "center", backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill, paddingVertical: spacing.md },
  protectGhostText: { color: colors.onSurface, fontWeight: "800", fontSize: 14 },
  sellerNet: { color: colors.onSurfaceMuted, fontSize: 13, marginBottom: spacing.md },
  fieldLabel: { fontSize: 13, fontWeight: "800", color: colors.onSurface, marginBottom: spacing.sm },
  statusRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  statusChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border },
  statusChipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  statusChipText: { color: colors.onSurface, fontWeight: "700", fontSize: 13 },
  statusChipTextOn: { color: colors.onBrand },
  labelDivider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.lg },
  labelChecking: { paddingVertical: spacing.md, alignItems: "center" },
  labelPending: { color: colors.onSurfaceMuted, fontSize: 13, marginTop: spacing.sm, marginBottom: spacing.sm },
  labelError: { color: colors.error, fontSize: 13, marginTop: spacing.sm, marginBottom: spacing.sm },
  labelDeductionNotice: { color: colors.onSurfaceMuted, fontSize: 12, marginTop: spacing.sm, marginBottom: spacing.xs, textAlign: "center" },
  labelCancel: { alignItems: "center", paddingVertical: spacing.sm, marginTop: spacing.sm },
  labelCancelText: { color: colors.onSurfaceMuted, fontWeight: "700", fontSize: 13 },
  rateRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm },
  rateLabel: { flex: 1, fontSize: 14, fontWeight: "600", color: colors.onSurface },
  rateAmount: { fontSize: 14, fontWeight: "800", color: colors.onSurface },
});
