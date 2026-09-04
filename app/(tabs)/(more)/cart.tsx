import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useStripe, PaymentSheetError } from "@stripe/stripe-react-native";

import { colors, radius, shadows, spacing, type as typeTokens } from "@/src/theme";
import { useCart } from "@/src/context/CartContext";
import { useFavorites } from "@/src/context/FavoritesContext";
import { toProduct } from "@/src/api/adapters";
import type { Product } from "@/src/types";
import { useAuth } from "@/src/context/AuthContext";
import { useStripeKey } from "@/src/context/StripePayment";
import { EmptyState } from "@/src/components/EmptyState";
// v1.0.97 — picker sheet moved to its own component; cart just wires it up.
import { AddressPickerModal } from "@/src/components/AddressPickerModal";
import { SITE, nest, ApiError, type NestWpAddress, type NestShippingRate, type NestAddressBookEntry } from "@/src/api/nest";
import { toast } from "@/src/components/Toast";
import { storage } from "@/src/utils/storage";
import { pushFromTab, safeBack } from "@/src/utils/nav";
import { useBackFallback } from "@/src/context/BackFallback";
import { haptics } from "@/src/utils/haptics";
import { CartSkeleton } from "@/src/components/CartSkeleton";
import { AppImage } from "@/src/components/AppImage";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";

// Where the buyer's destination address is persisted locally (reused across sessions).
const SHIPPING_ADDRESS_KEY = "nest.checkout.shipping_address";

// Last-resort placeholder for when the quote request itself fails, so we cannot
// know the server's number. Mirrors the backend defaults in
// mnu_native_settings_defaults() (flat_shipping 6.95, free over 50) — those are
// admin-configurable, so whenever a quote does come back its `shipping` value
// wins over this.
const flatEstimate = (subtotal: number) => (subtotal >= 50 || subtotal === 0 ? 0 : 6.95);

// Idempotency key for one checkout attempt. Only has to be unique per buyer, so
// it deliberately avoids a crypto dependency (`uuid` is a resolutions-only pin
// here and would need a getRandomValues polyfill at runtime).
const newCheckoutToken = () => `nest_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;

export default function Cart() {
  useBackFallback("/(tabs)");
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { cart, updateItem, removeItem, clear, refreshPrices, addProduct } = useCart();
  // v1.0.212 (P0 #6) — save-for-later is backed by the existing favorites
  // store, so "save" = add-to-favorites + remove-from-cart. Cart renders a
  // Saved for later section listing favorites that aren't currently in the
  // cart. Hydrated once per focus into `savedProducts` so we can show the
  // title / image / price without an extra call per render.
  const favorites = useFavorites();
  const [savedProducts, setSavedProducts] = React.useState<Product[]>([]);
  const [sflLoading, setSflLoading] = React.useState(false);
  // v1.0.243 — track the Saved-for-later row currently being moved so
  // rapid taps on "Move to cart" cannot fire the mutation twice.
  const [movingId, setMovingId] = React.useState<string | null>(null);
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const { setPublishableKey } = useStripeKey();
  const [paying, setPaying] = React.useState(false);
  // v1.0.223 — the paying spinner used to be an unlabeled ActivityIndicator
  // for the entire ~1.5s window between tap and PaymentSheet appearing.
  // Staging the label as "Starting checkout…" → "Opening payment…" gives
  // the buyer a signal that something is happening and reduces double-taps.
  const [payStage, setPayStage] = React.useState<"idle" | "starting" | "opening" | "verifying">("idle");
  // v1.0.223 — payment errors used to fade out in a toast the buyer often
  // missed (screen was in Apple Pay, etc). Store the error so we can show
  // a persistent dialog with a Retry button.
  const [payError, setPayError] = React.useState<{ title: string; message: string; canRetry: boolean } | null>(null);

  // Shipping address + live-rate state. Hooks live above the early returns so
  // the order stays stable regardless of cart/auth state.
  const [address, setAddress] = React.useState<NestWpAddress | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  // v1.0.94 (Build #17a) — saved-address picker on checkout. We lazy-load
  // /me/addresses on the first Change/Add tap; the picker sheet keeps the
  // existing AddressFormModal underneath as the fallback for "Enter new
  // address", so we don't lose the guest / one-off path.
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [savedAddresses, setSavedAddresses] = React.useState<NestAddressBookEntry[] | null>(null);
  const [savedLoading, setSavedLoading] = React.useState(false);
  const [rates, setRates] = React.useState<NestShippingRate[] | null>(null);
  const [selectedRateId, setSelectedRateId] = React.useState<string | null>(null);
  const [ratesLoading, setRatesLoading] = React.useState(false);
  const [ratesError, setRatesError] = React.useState(false);
  const [debugReason, setDebugReason] = React.useState<string | null>(null);
  const [quoteToken, setQuoteToken] = React.useState<string | null>(null);
  // The server's own shipping figure from the quote. Authoritative for display
  // even when there are no selectable live rates, because it is computed the
  // same way the charge will be.
  const [quotedShipping, setQuotedShipping] = React.useState<number | null>(null);
  // Set from create-intent when the server had to change the picked rate.
  const [shippingOverride, setShippingOverride] = React.useState<number | null>(null);
  // Final money returned by create-intent after WooCommerce calculates tax.
  // PaymentSheet is not opened until the buyer has seen these values once.
  // v1.0.233 — Keyed on paymentIntentId, not order_id. Under plugin v3.13.39+
  // the server returns `order_id: 0` from create-intent because no WC order
  // exists until the Stripe webhook finalizes. `payment_intent_id` is stable
  // across retries with the same checkout_token, so it's the right anchor for
  // "buyer already confirmed the reviewed total for this attempt".
  const [finalReview, setFinalReview] = React.useState<{ paymentIntentId: string; tax: number; total: number; shipping: number | null } | null>(null);

  // v1.0.222 — flash the total row when the server returns a different
  // amount than the buyer saw, so the two-tap review is visible instead of
  // silently swapping the label. Runs on every finalReview transition to a
  // non-null value.
  const totalFlash = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (!finalReview) return;
    Animated.sequence([
      Animated.timing(totalFlash, { toValue: 1, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: false }),
      Animated.timing(totalFlash, { toValue: 0, duration: 900, easing: Easing.in(Easing.quad), useNativeDriver: false }),
    ]).start();
  }, [finalReview, totalFlash]);
  const totalFlashBg = totalFlash.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(255, 214, 128, 0)", "rgba(255, 214, 128, 0.55)"],
  });
  // v1.0.92 — coupon input. The typed value only becomes an applied code once
  // the buyer taps Apply, so an accidental keystroke does not requote the cart.
  // v1.0.209 (P0 #3) — widened to a list so buyers can stack codes; per-code
  // state (discount, free-shipping, error) is echoed back by the server on
  // every quote so the cart always shows the truth, not the client's guess.
  const [couponInput, setCouponInput] = React.useState("");
  const [appliedCoupons, setAppliedCoupons] = React.useState<string[]>([]);
  const [couponRows, setCouponRows] = React.useState<
    { code: string; discount: number; free_shipping: boolean; valid: boolean; reason: string }[]
  >([]);
  const [couponError, setCouponError] = React.useState<string | null>(null);
  const [findingBestCoupons, setFindingBestCoupons] = React.useState(false);
  const couponDiscount = React.useMemo(
    () => couponRows.reduce((sum, r) => sum + (r.valid ? r.discount : 0), 0),
    [couponRows],
  );
  const couponFreeShipping = React.useMemo(
    () => couponRows.some((r) => r.valid && r.free_shipping),
    [couponRows],
  );

  const itemsForApi = React.useMemo(
    () =>
      (cart?.items ?? []).map((it) => ({
        product_id: Number(it.product_id),
        quantity: it.quantity,
        // v1.0.91 — pass through the picked variation id when set so the
        // server prices and stock-checks against the right WC variation.
        ...(it.variation_id ? { variation_id: Number(it.variation_id) } : {}),
      })),
    [cart],
  );
  const itemsSig = itemsForApi.map((i) => `${i.product_id}${i.variation_id ? `v${i.variation_id}` : ""}x${i.quantity}`).join(",");
  // Whole object, not formatAddress(): recipient name is part of what gets
  // written onto the order, and changing only the name must still count.
  const addressSig = address ? JSON.stringify(address) : "";

  React.useEffect(() => {
    setFinalReview(null);
  }, [itemsSig, addressSig, appliedCoupons]);

  // v1.0.160 — Mirror the plugin v3.13.32 buyer_contact_incomplete rules so
  // the buyer sees what's missing BEFORE they tap Checkout. The server is still
  // the source of truth (create-intent will 422 if we let a bad request through)
  // — this is just a proactive UI to save a round trip.
  const contactMissing = React.useMemo(() => {
    const missing: string[] = [];
    if (!user?.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)) missing.push("an email");
    // v1.0.243 — the plugin (v3.13.32+) requires first_name AND last_name
    // on the shipping address for the label. Previously we bundled both
    // into one "a recipient name" message which was ambiguous when only
    // last_name was blank (e.g. a mononym typed into the first-name box).
    // Split so the buyer sees exactly which field to fill in.
    if (!address?.first_name) missing.push("a first name");
    if (!address?.last_name) missing.push("a last name");
    if (!address?.address_1) missing.push("a street address");
    if (!address?.city) missing.push("a city");
    if (!address?.state) missing.push("a state");
    if (!address?.postcode) missing.push("a ZIP");
    if (!address?.country) missing.push("a country");
    // Buyer phone: accept either the phone typed onto the shipping address
    // (what the label carries) or a phone the user saved on their profile.
    const addrDigits = String(address?.phone ?? "").replace(/\D+/g, "");
    const acctDigits = String(user?.phone ?? "").replace(/\D+/g, "");
    if (addrDigits.length < 10 && acctDigits.length < 10) missing.push("a phone number");
    return missing;
  }, [user?.email, user?.phone, address]);
  const canCheckout = contactMissing.length === 0;

  // The idempotency key for the current checkout attempt, held per attempt so a
  // double-tap, a network retry, or the shipping-mismatch abort below all resend
  // the same token — the server then reuses its existing pending order instead
  // of opening a second one.
  //
  // The signature covers the two things the server bakes into that order and
  // does NOT recompute when it reuses it: the line items and the destination.
  // Change either and this must be a genuinely new order. The picked shipping
  // rate is deliberately excluded, because the abort path itself rewrites
  // selectedRateId — including it would mint a fresh token on exactly the retry
  // that needs to reuse. A manual rate change resets the attempt explicitly.
  const attempt = React.useRef<{ sig: string; token: string } | null>(null);
  const checkoutTokenFor = (sig: string): string => {
    if (!attempt.current || attempt.current.sig !== sig) {
      attempt.current = { sig, token: newCheckoutToken() };
    }
    return attempt.current.token;
  };
  const startNewCheckoutAttempt = () => {
    attempt.current = null;
  };

  // Load any previously saved destination address once.
  React.useEffect(() => {
    (async () => {
      const saved = await storage.getItem<NestWpAddress | null>(SHIPPING_ADDRESS_KEY, null);
      if (saved && saved.country) setAddress(saved);
    })();
  }, []);

  // v1.0.158 — Re-hydrate cart line prices from the server every time the
  // cart tab gains focus. Fixes stale prices when a seller edits a listing
  // after the buyer added it. Fire-and-forget; user sees the same cart
  // instantly and the numbers snap to the current server prices when the
  // fetches resolve.
  useFocusEffect(
    useCallback(() => {
      refreshPrices();
    }, [refreshPrices]),
  );

  // v1.0.212 (P0 #6) — hydrate the Saved for later section. A saved item
  // is any favorite that isn't already sitting in the cart. We fetch only
  // the ids we don't already have cached to keep this cheap on re-renders.
  const inCartIds = useMemo(() => {
    const s = new Set<string>();
    if (cart?.items) for (const it of cart.items) s.add(String(it.product_id));
    return s;
  }, [cart?.items]);
  const savedIds = useMemo(() => {
    return Array.from(favorites.ids).filter((id) => !inCartIds.has(String(id)));
  }, [favorites.ids, inCartIds]);
  useEffect(() => {
    if (!user) { setSavedProducts([]); return; }
    const wanted = new Set(savedIds.map(String));
    // Drop any hydrated product that is no longer a saved id (moved to cart
    // or un-favorited) so the section reflects the latest set immediately.
    setSavedProducts((prev) => prev.filter((p) => wanted.has(String(p.id))));
    const have = new Set(savedProducts.map((p) => String(p.id)));
    const missing = savedIds.filter((id) => !have.has(String(id)));
    if (missing.length === 0) return;
    let cancelled = false;
    setSflLoading(true);
    Promise.all(missing.map((id) => nest.getProduct(id).then(toProduct).catch(() => null)))
      .then((results) => {
        if (cancelled) return;
        const fresh = results.filter((p): p is Product => !!p);
        if (fresh.length === 0) return;
        setSavedProducts((prev) => {
          const seen = new Set(prev.map((p) => String(p.id)));
          return [...prev, ...fresh.filter((p) => !seen.has(String(p.id)))];
        });
      })
      .finally(() => { if (!cancelled) setSflLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- savedProducts is deliberately read fresh but omitted from deps to avoid a fetch loop.
  }, [savedIds.join(","), user?.id]);

  // Fetch live carrier rates whenever there is an address + items. Failure or an
  // empty list is non-fatal — checkout still works with a flat estimate.
  React.useEffect(() => {
    if (!user || !address || !address.country || itemsForApi.length === 0) {
      setRates(null);
      setSelectedRateId(null);
      setRatesError(false);
      setDebugReason(null);
      setQuoteToken(null);
      setQuotedShipping(null);
      return;
    }
    let cancelled = false;
    setRatesLoading(true);
    setRatesError(false);
    setDebugReason(null);
    setShippingOverride(null);
    nest
      .quoteCheckout(itemsForApi, address, undefined, appliedCoupons.length ? appliedCoupons : undefined)
      .then((q) => {
        if (cancelled) return;
        setQuoteToken(q.quote_token ?? null);
        setQuotedShipping(typeof q.shipping === "number" ? q.shipping : null);
        // v1.0.209 (P0 #3) — fold the server's per-code verdict back into UI
        // state. When no codes are applied, clear rows and the banner.
        if (appliedCoupons.length === 0) {
          setCouponRows([]);
          setCouponError(null);
        } else if (q.coupons && q.coupons.length) {
          const rows = q.coupons.map((c) => ({
            code: c.code,
            discount: c.valid ? c.discount || 0 : 0,
            free_shipping: c.valid ? !!c.free_shipping : false,
            valid: !!c.valid,
            reason: c.reason || "",
          }));
          setCouponRows(rows);
          // Show the first invalid reason as an inline error — valid codes just
          // stay in the chip list; invalid ones surface with an explanation.
          const firstBad = rows.find((r) => !r.valid);
          setCouponError(firstBad ? firstBad.reason || "Coupon can't be applied." : null);
        } else if (q.coupon) {
          // Server on an older plugin build only returns single `coupon` field.
          setCouponRows([{ code: q.coupon.code, discount: q.coupon.valid ? q.coupon.discount || 0 : 0, free_shipping: !!q.coupon.free_shipping, valid: !!q.coupon.valid, reason: q.coupon.reason || "" }]);
          setCouponError(q.coupon.valid ? null : q.coupon.reason || "Coupon can't be applied.");
        }
        // The backend sends `debug_reason` whenever it fell back to the flat
        // estimate (live rates unavailable / incomplete address), in which case
        // `shipping_rates` holds no real carrier choices. Treat a reason OR an
        // empty list as "no live rates" so the fallback + debug line always show.
        const reason = q.debug_reason ?? null;
        setDebugReason(reason);
        const list = q.shipping_rates ?? [];
        if (reason || list.length === 0) {
          setRates(null);
          setSelectedRateId(null);
          setRatesError(true);
          return;
        }
        const sorted = [...list].sort((a, b) => a.amount - b.amount);
        setRates(sorted);
        setSelectedRateId((prev) => (prev && sorted.some((r) => r.id === prev) ? prev : sorted[0].id));
      })
      .catch(() => {
        if (cancelled) return;
        setRates(null);
        setSelectedRateId(null);
        setRatesError(true);
        setQuotedShipping(null);
      })
      .finally(() => {
        if (!cancelled) setRatesLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- itemsSig captures item changes
  }, [user, address, itemsSig, appliedCoupons]);

  const saveAddress = async (a: NestWpAddress) => {
    setAddress(a);
    setFormOpen(false);
    await storage.setItem(SHIPPING_ADDRESS_KEY, a);
  };

  // v1.0.94 (Build #17a) — open the saved-address picker. First open
  // pulls /me/addresses; subsequent opens reuse the cached list. If the
  // list is empty we skip the picker and go straight to the manual form
  // (matches the previous behaviour so first-time buyers aren't blocked).
  const openAddressPicker = React.useCallback(async () => {
    haptics.tap();
    if (savedAddresses && savedAddresses.length === 0) {
      setFormOpen(true);
      return;
    }
    setPickerOpen(true);
    if (savedAddresses !== null) return;
    try {
      setSavedLoading(true);
      const res = await nest.listAddressBook();
      const items = res.items || [];
      setSavedAddresses(items);
      if (items.length === 0) {
        // Nothing to pick from — close the picker and open the manual form.
        setPickerOpen(false);
        setFormOpen(true);
      }
    } catch {
      // The address book endpoint isn't critical to checkout — if it fails
      // (older server, offline, etc) fall back to the manual form silently.
      setSavedAddresses([]);
      setPickerOpen(false);
      setFormOpen(true);
    } finally {
      setSavedLoading(false);
    }
  }, [savedAddresses]);

  // Convert a saved book entry to the flat NestWpAddress shape used on
  // the cart. The book has extras (label, company, is_default) that the
  // Woo-style address doesn't carry — they stay in the book for later.
  const pickSavedAddress = React.useCallback(async (entry: NestAddressBookEntry) => {
    haptics.tap();
    const wp: NestWpAddress = {
      first_name: entry.first_name,
      last_name: entry.last_name,
      address_1: entry.address_1,
      address_2: entry.address_2,
      city: entry.city,
      state: entry.state,
      postcode: entry.postcode,
      country: entry.country || "US",
      phone: entry.phone,
    };
    setPickerOpen(false);
    await saveAddress(wp);
  }, []);

  if (!user) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <Top title="Cart" />
        <EmptyState icon="log-in-outline" title="Sign in to view your cart" actionLabel="Sign in" onAction={() => pushFromTab(router, "/(auth)/login")} testID="cart-signed-out" />
      </SafeAreaView>
    );
  }

  if (!cart) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <Top title="Cart" />
        <CartSkeleton />
      </SafeAreaView>
    );
  }

  if (cart.items.length === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <Top title="Cart" />
        <EmptyState icon="bag-outline" title="Your cart is empty" message="Add some handmade goodness from the marketplace." actionLabel="Start Browsing" onAction={() => router.replace("/(tabs)/browse")} testID="cart-empty" />
      </SafeAreaView>
    );
  }

  const selectedRate = rates?.find((r) => r.id === selectedRateId) ?? null;
  let shippingAmount: number | null;
  if (shippingOverride != null) shippingAmount = shippingOverride;
  else if (selectedRate) shippingAmount = selectedRate.amount;
  else if (address && ratesError) shippingAmount = quotedShipping ?? flatEstimate(cart.subtotal);
  else shippingAmount = null;
  const displayShipping = couponFreeShipping ? 0 : (shippingAmount ?? 0);
  const estimatedTotal = Math.max(0, cart.subtotal - couponDiscount + displayShipping);
  const displayTax = finalReview?.tax ?? null;
  const displayTotal = finalReview?.total ?? estimatedTotal;

  // v1.0.158 — Buyer-facing label reads "Shipping & Handling" because the row
  // now bakes in a $1.05 handling fee on top of the real carrier rate (see
  // plugin v3.13.23 mnu_v380_processing_fee_cents).
  let shippingRowLabel = "Shipping & Handling";
  let shippingRowValue: string;
  if (!address) shippingRowValue = "Add an address";
  else if (ratesLoading) shippingRowValue = "Calculating…";
  else if (shippingAmount != null) shippingRowValue = shippingAmount === 0 ? "Free" : `$${shippingAmount.toFixed(2)}`;
  else shippingRowValue = "—";
  if (address && ratesError) shippingRowLabel = "Shipping & Handling (estimated)";

  // v1.0.223 — Poll the buyer's own order until it flips from "pending"
  // to a paid state. Stripe's webhook is the source of truth and usually
  // lands within 1–3 seconds, but before this we cleared the cart and
  // dropped the buyer on /orders where a pending order looks like a
  // ghost. Now we hold a "Confirming payment…" screen until we see the
  // paid state, and only then navigate.
  const waitForOrderPaid = async (orderId: number, timeoutMs = 12000): Promise<"paid" | "pending" | "error"> => {
    const start = Date.now();
    let delay = 750;
    while (Date.now() - start < timeoutMs) {
      try {
        const o = await nest.getBuyerOrder(orderId);
        const s = String((o as { status?: unknown }).status ?? "").toLowerCase();
        // Any non-pending, non-failed status means Stripe settled server-side.
        if (s && s !== "pending" && s !== "pending-payment" && s !== "failed") return "paid";
      } catch {
        // Transient — keep polling.
      }
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay + 250, 1500);
    }
    return "pending";
  };

  // v1.0.223 — Given the diff between local totals and what create-intent
  // returned, spell out exactly what changed. "Your final total changed" is
  // useless if the buyer can't tell whether shipping went up, tax was added,
  // or a coupon expired.
  const describeReviewChange = (opts: {
    fallbackRate: boolean;
    shippingDelta: number | null;
    taxDelta: number | null;
    totalDelta: number;
    couponAppliedDelta: number | null;
  }): string => {
    const parts: string[] = [];
    if (opts.fallbackRate) parts.push("the shipping rate you picked is no longer available");
    if (opts.shippingDelta != null && Math.abs(opts.shippingDelta) >= 0.01 && !opts.fallbackRate) {
      parts.push(opts.shippingDelta > 0 ? `shipping went up $${opts.shippingDelta.toFixed(2)}` : `shipping dropped $${Math.abs(opts.shippingDelta).toFixed(2)}`);
    }
    if (opts.taxDelta != null && Math.abs(opts.taxDelta) >= 0.01) {
      parts.push(opts.taxDelta > 0 ? `tax added $${opts.taxDelta.toFixed(2)}` : `tax dropped $${Math.abs(opts.taxDelta).toFixed(2)}`);
    }
    if (opts.couponAppliedDelta != null && Math.abs(opts.couponAppliedDelta) >= 0.01) {
      parts.push(opts.couponAppliedDelta > 0 ? `a coupon reduced the total by $${opts.couponAppliedDelta.toFixed(2)}` : `a coupon no longer applies`);
    }
    if (parts.length === 0) {
      // Nothing itemized — fall back to the raw delta.
      parts.push(opts.totalDelta > 0 ? `total went up $${opts.totalDelta.toFixed(2)}` : `total dropped $${Math.abs(opts.totalDelta).toFixed(2)}`);
    }
    const head = parts.join(", ");
    return `${head.charAt(0).toUpperCase()}${head.slice(1)}. Tap Confirm to pay the new total.`;
  };

  const onCheckout = async () => {
    if (paying || !cart || cart.items.length === 0) return;
    setPaying(true);
    setPayStage("starting");
    setPayError(null);
    try {
      const items = cart.items.map((it) => ({
        product_id: Number(it.product_id),
        quantity: it.quantity,
        // v1.0.91 — mirror itemsForApi so create-intent gets the variation ref.
        ...(it.variation_id ? { variation_id: Number(it.variation_id) } : {}),
      }));

      // 1. Create the order + PaymentIntent (and Stripe Customer + ephemeral key).
      //    Pass the destination + picked rate id; the server recomputes the real
      //    cost and only trusts the id (never a client-supplied amount).
      // v1.0.223 — Idempotency key now covers coupons too so adding/removing a
      //           code mints a fresh token instead of reusing the pending order
      //           with a mismatched coupon list.
      const couponsSig = appliedCoupons.length ? appliedCoupons.slice().sort().join(",") : "";
      const intent = await nest.createPaymentIntent({
        items,
        shipping_address: address ?? undefined,
        shipping_method_id: selectedRateId ?? undefined,
        quote_token: quoteToken ?? undefined,
        checkout_token: checkoutTokenFor(`${itemsSig}|${addressSig}|${couponsSig}`),
        // v1.0.92 — the server re-validates the code and only applies a
        // discount if it's still redeemable, so a stale code is a no-op.
        // v1.0.209 (P0 #3) — send the full list of applied codes; server
        // still accepts legacy coupon_code as the fallback.
        ...(appliedCoupons.length ? { coupon_codes: appliedCoupons } : {}),
      });

      if (!intent.client_secret || !intent.publishable_key) {
        setPayError({ title: "Checkout unavailable", message: "We couldn't start checkout right now. Please try again in a moment.", canRetry: true });
        return;
      }

      // The server is authoritative for every money field. First catch stale
      // item prices, then require an explicit second tap whenever shipping, tax,
      // discount, or the final amount differs from what was rendered before this
      // create-intent call. The same checkout token reuses the pending order on
      // that second tap, so review does not create duplicates.
      const serverSubtotal = typeof intent.subtotal === "number" ? intent.subtotal : null;
      const subtotalDiffers = serverSubtotal != null && Math.abs(serverSubtotal - cart.subtotal) >= 0.01;
      if (subtotalDiffers) {
        refreshPrices();
        setFinalReview(null);
        const delta = (serverSubtotal ?? 0) - cart.subtotal;
        const dir = delta > 0 ? "went up" : "dropped";
        toast.show(`Item prices ${dir} by $${Math.abs(delta).toFixed(2)}. Review the new total and tap Checkout again.`, "info");
        return;
      }

      const serverShipping = typeof intent.shipping_total === "number" ? intent.shipping_total : null;
      const serverTax = typeof intent.tax_total === "number" ? intent.tax_total : 0;
      const serverDiscount = typeof intent.discount_total === "number" ? intent.discount_total : null;
      const shippingDiffers = serverShipping != null && shippingAmount != null && Math.abs(serverShipping - shippingAmount) >= 0.01;
      const alreadyReviewed = !!finalReview
        && finalReview.paymentIntentId === intent.payment_intent_id
        && Math.abs(finalReview.total - intent.amount) < 0.01
        && Math.abs(finalReview.tax - serverTax) < 0.01;
      const finalDiffers = Math.abs(intent.amount - displayTotal) >= 0.01;

      if (!alreadyReviewed && (intent.shipping_selection_changed || shippingDiffers || finalDiffers)) {
        if (serverShipping != null) setShippingOverride(serverShipping);
        if (intent.shipping_method_id) setSelectedRateId(intent.shipping_method_id);
        setFinalReview({ paymentIntentId: intent.payment_intent_id, tax: serverTax, total: intent.amount, shipping: serverShipping });
        // v1.0.223 — Named rate + itemized deltas replace the vague generic toast.
        // If the picked rate was gone, name the fallback rate the server chose.
        if (intent.shipping_selection_changed && intent.shipping_label) {
          const price = serverShipping != null ? `$${serverShipping.toFixed(2)}` : "a different price";
          toast.show(`The rate you picked isn't available anymore. We switched to ${intent.shipping_label} at ${price}. Tap Confirm to pay the new total.`, "info");
        } else {
          const message = describeReviewChange({
            fallbackRate: !!intent.shipping_selection_changed,
            shippingDelta: shippingDiffers && shippingAmount != null && serverShipping != null ? serverShipping - shippingAmount : null,
            taxDelta: displayTax != null ? serverTax - displayTax : (serverTax > 0 ? serverTax : null),
            totalDelta: intent.amount - displayTotal,
            couponAppliedDelta: serverDiscount != null ? serverDiscount - couponDiscount : null,
          });
          toast.show(message, "info");
        }
        return;
      }

      // 2. Build the PaymentSheet. StripeProvider handles the publishable key
      //    globally now (v1.0.223 removed the redundant per-tap initStripe).
      //    We still call setPublishableKey so a future cart mount can prewarm
      //    the provider with the same key.
      setPublishableKey(intent.publishable_key);
      setPayStage("opening");

      // 3. Build the PaymentSheet (saved cards + Apple Pay / Google Pay wallets).
      const { error: initError } = await initPaymentSheet({
        merchantDisplayName: "MyNest",
        paymentIntentClientSecret: intent.client_secret,
        customerId: intent.customer_id,
        customerEphemeralKeySecret: intent.ephemeral_key_secret,
        allowsDelayedPaymentMethods: false,
        applePay: { merchantCountryCode: "US" },
        googlePay: {
          merchantCountryCode: "US",
          currencyCode: intent.currency?.toUpperCase() || "USD",
          testEnv: false,
        },
      });
      if (initError) {
        setPayError({ title: "Couldn't open payment", message: initError.message || "We couldn't open the payment sheet. Check your connection and try again.", canRetry: true });
        return;
      }

      // 4. Present the sheet and let the buyer pay without leaving the app.
      const { error: sheetError } = await presentPaymentSheet();
      if (sheetError) {
        // User dismissing the sheet is not an error — stop quietly.
        if (sheetError.code === PaymentSheetError.Canceled) return;
        // v1.0.223 — Card declined → give the buyer a next step instead of
        // just naming the failure. Failed payments now open a persistent
        // dialog with Retry so buyers can't miss the error on Apple Pay dismiss.
        const rawCode = String(sheetError.code || "");
        const isDeclined = /decline|Failed/i.test(rawCode) || /declined/i.test(sheetError.message || "");
        setPayError({
          title: isDeclined ? "Card declined" : "Payment didn't go through",
          message: isDeclined
            ? `${sheetError.message || "Your card was declined."} Try a different card, or tap Retry to open payment again.`
            : (sheetError.message || "Payment could not be completed. Tap Retry to try again."),
          canRetry: true,
        });
        return;
      }

      // v1.0.233 — Resolve the REAL order id. Under plugin v3.13.39+ the
      // WooCommerce order does not exist at create-intent time (`intent.order_id`
      // is always 0), so we must read it back from either completeCheckout's
      // response or from a short retry loop that waits for the webhook to
      // materialize the order. Every downstream use — polling, navigation,
      // toast — takes this resolved id.
      //
      // completeCheckout is authoritative when it returns ok=true: it either
      // finds the order the webhook already created, or triggers finalization
      // itself against the succeeded PaymentIntent. Webhook remains the true
      // source of truth for the order state, but for RESOLVING the id after
      // Stripe confirms, completeCheckout is the fastest path.
      setPayStage("verifying");
      let resolvedOrderId = 0;
      const completeStart = Date.now();
      // Retry completeCheckout up to ~10s: on the very first call the webhook
      // may not have run yet AND the intent status transition to 'succeeded'
      // in Stripe can lag PaymentSheet by a beat. Server returns ok=false with
      // payment_status='processing' in that window.
      while (Date.now() - completeStart < 10000 && resolvedOrderId <= 0) {
        try {
          const resp = await nest.completeCheckout({
            order_id: 0, // Server ignores this; it uses payment_intent_id.
            payment_intent_id: intent.payment_intent_id,
          });
          if (resp && typeof resp.order_id === "number" && resp.order_id > 0) {
            resolvedOrderId = resp.order_id;
            break;
          }
        } catch {
          // Transient (401 refresh mid-flight, network hiccup) — fall through
          // to the sleep + retry.
        }
        await new Promise((r) => setTimeout(r, 750));
      }

      startNewCheckoutAttempt();
      await clear();

      if (resolvedOrderId > 0) {
        // We have a real order. Give the webhook a beat to flip it to paid so
        // the buyer lands on a confirmed order screen rather than a pending one.
        const settled = await waitForOrderPaid(resolvedOrderId);
        if (settled === "paid") {
          toast.success("Payment received. Your order is confirmed and the seller has been notified.");
        } else {
          toast.show("Payment received. Your order is being finalized — we'll notify you when it's confirmed.", "info");
        }
        // v1.0.235 — the order-detail route is /order/:id (singular). v1.0.233
        // pushed /orders/:id (plural) which is an Unmatched Route: Expo Router
        // has app/(tabs)/(more)/order/[id].tsx and app/(tabs)/(more)/orders.tsx,
        // NOT app/(tabs)/(more)/orders/[id].tsx. Post-checkout the buyer saw a
        // full-screen `thenest:///` "Page could not be found" instead of their
        // order. Corrected below; the orders-list fallback is `/orders`
        // (plural, which is correct because orders.tsx is a leaf file).
        pushFromTab(router, `/order/${resolvedOrderId}`);
      } else {
        // Webhook is behind. Route the buyer to their orders list where the
        // new order will surface as soon as the webhook lands, instead of a
        // broken order-detail screen. Payment is safe on Stripe's side.
        toast.show("Payment received. Your order is being finalized — it'll appear in your orders shortly.", "info");
        pushFromTab(router, "/orders");
      }
    } catch (e) {
      // v1.0.160 — Plugin v3.13.32 gates checkout on the buyer having an
      // email + phone on file AND a complete shipping address (first_name,
      // last_name, address_1, city, state, postcode, country, phone). The
      // 422 response carries missing_fields[] plus an action_url. Route the
      // buyer straight to the fix instead of surfacing a raw error.
      if (e instanceof ApiError && e.code === "buyer_contact_incomplete") {
        const bag = (e.data && typeof e.data === "object" ? e.data : {}) as { missing_fields?: unknown; action_url?: unknown };
        const missing = Array.isArray(bag.missing_fields) ? (bag.missing_fields as string[]) : [];
        const actionUrl = typeof bag.action_url === "string" && bag.action_url.length > 0
          ? bag.action_url
          : "/(tabs)/(more)/me/address-edit";
        const needsAccountEmail = missing.includes("account_email");
        const needsAccountPhone = missing.includes("account_phone");
        const needsAddress = missing.some((f) => f.startsWith("shipping_"));
        const parts: string[] = [];
        if (needsAccountEmail) parts.push("an email");
        if (needsAccountPhone) parts.push("a phone number");
        if (needsAddress) parts.push("a complete shipping address");
        const summary = parts.length > 0 ? parts.join(", ") : "contact info";
        toast.show(
          `Add ${summary} before checking out. Opening your address settings…`,
          "info",
        );
        pushFromTab(router, actionUrl);
        return;
      }
      // v1.0.158 — Server rejects with `quote_changed` (409) when the item
      // subtotal in the reused quote no longer matches live product prices.
      // Recover the same way as the client-side drift branch above: refresh
      // the local snapshots and prompt the buyer to review.
      if (e instanceof ApiError && e.code === "quote_changed") {
        refreshPrices();
        toast.show("Prices changed. Review the new total and tap Checkout again.", "info");
        return;
      }
      const message = e instanceof ApiError ? e.friendly : "Could not complete checkout. Please try again.";
      setPayError({ title: "Checkout error", message, canRetry: true });
    } finally {
      setPaying(false);
      setPayStage("idle");
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Top title="Cart" />
      <ScrollView contentContainerStyle={{ paddingBottom: 220 + insets.bottom }} keyboardShouldPersistTaps="handled">
        {/* Shipping to */}
        {address ? (
          <View style={styles.addrCard} testID="cart-address">
            <View style={styles.addrIcon}><Ionicons name="location" size={18} color={colors.brand} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.addrLabel}>Shipping to</Text>
              <Text style={styles.addrName}>{[address.first_name, address.last_name].filter(Boolean).join(" ") || "Recipient"}</Text>
              <Text style={styles.addrLine}>{formatAddress(address)}</Text>
            </View>
            <TouchableOpacity onPress={openAddressPicker} testID="cart-address-edit" accessibilityRole="button">
              <Text style={styles.addrEdit}>Change</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.addrPrompt} onPress={openAddressPicker} testID="cart-address-add" activeOpacity={0.85} accessibilityRole="button">
            <View style={styles.addrIcon}><Ionicons name="location-outline" size={18} color={colors.brand} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.addrName}>Add a shipping address</Text>
              <Text style={styles.addrLine}>Add a shipping address to see accurate rates.</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.onSurfaceMuted} />
          </TouchableOpacity>
        )}

        {cart.items.map((it, idx) => (
          <View key={`${it.product_id}-${idx}`} style={styles.item}>
            <AppImage source={{ uri: it.product.images[0] }} style={styles.itemImg} fallbackIcon="image-outline" />
            <View style={{ flex: 1, paddingHorizontal: spacing.md }}>
              <Text style={styles.itemTitle} numberOfLines={2}>{it.product.title}</Text>
              <Text style={styles.itemSeller}>by {it.product.seller?.name ?? "My Nest"}</Text>
              <View style={styles.qtyRow}>
                <TouchableOpacity onPress={() => { haptics.tap(); updateItem(idx, Math.max(0, it.quantity - 1)); }} style={styles.qtyBtn} testID={`cart-qty-dec-${idx}`} accessibilityLabel={`Decrease quantity of ${it.product.title}`} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button">
                  <Ionicons name="remove" size={16} color={colors.onSurface} />
                </TouchableOpacity>
                <Text style={styles.qtyText}>{it.quantity}</Text>
                <TouchableOpacity onPress={() => { haptics.tap(); updateItem(idx, it.quantity + 1); }} style={styles.qtyBtn} testID={`cart-qty-inc-${idx}`} accessibilityLabel={`Increase quantity of ${it.product.title}`} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button">
                  <Ionicons name="add" size={16} color={colors.onSurface} />
                </TouchableOpacity>
                <View style={{ flex: 1 }} />
                <Text style={styles.itemPrice}>${it.line_total.toFixed(2)}</Text>
              </View>
            </View>
            <View style={styles.itemActionsCol}>
              <TouchableOpacity onPress={() => { haptics.warning(); removeItem(idx); }} testID={`cart-remove-${idx}`} style={styles.removeBtn} accessibilityLabel={`Remove ${it.product.title} from cart`} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button">
                <Ionicons name="trash-outline" size={18} color={colors.error} />
              </TouchableOpacity>
              {/* v1.0.212 (P0 #6) — Save for later. If the item isn't already
                  favorited we favorite it first (so it survives past this
                  session), then remove the cart line. Idempotent when the
                  item is already a favorite. */}
              <TouchableOpacity
                onPress={async () => {
                  // v1.0.241 — use the product id as the stable
                  // identity of the cart line, not the array index.
                  // While the favorites toggle awaits, another cart
                  // mutation can shift indexes, so we resolve the
                  // real index AFTER the await against the latest
                  // cart state.
                  const productId = it.product.id;
                  haptics.tap();
                  if (!favorites.isFavorite(productId)) {
                    try { await favorites.toggle(productId); }
                    catch { /* toast handled inside context */ return; }
                  }
                  const currentIdx = (cart.items ?? []).findIndex(
                    (line) => line.product.id === productId,
                  );
                  if (currentIdx >= 0) removeItem(currentIdx);
                  toast.success("Saved for later");
                }}
                testID={`cart-save-later-${idx}`}
                style={styles.saveLaterBtn}
                accessibilityLabel={`Save ${it.product.title} for later`}
                accessibilityRole="button"
              >
                <Ionicons name="bookmark-outline" size={14} color={colors.brand} />
                <Text style={styles.saveLaterText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {/* v1.0.212 (P0 #6) — Saved for later section. Any favorite that
            isn't in the cart shows up here so buyers can move it back in
            with one tap. Empty state is intentionally hidden — no need to
            surface a rail if the buyer has no saved items. */}
        {savedProducts.length > 0 ? (
          <View style={styles.sflSection} testID="cart-sfl-section">
            <View style={styles.sflHeader}>
              <Ionicons name="bookmark" size={16} color={colors.brand} />
              <Text style={styles.sflTitle}>Saved for later ({savedProducts.length})</Text>
            </View>
            {savedProducts.map((sp) => {
              const price = sp.sale_price ?? sp.price ?? 0;
              return (
                <View key={String(sp.id)} style={styles.sflRow}>
                  <TouchableOpacity
                    style={styles.sflMain}
                    onPress={() => { haptics.tap(); router.push(`/product/${sp.id}`); }}
                    accessibilityLabel={`Open ${sp.title}`}
                    accessibilityRole="button"
                    testID={`cart-sfl-open-${sp.id}`}
                  >
                    <AppImage source={{ uri: sp.images[0] }} style={styles.sflImg} fallbackIcon="image-outline" />
                    <View style={{ flex: 1, paddingHorizontal: spacing.md }}>
                      <Text style={styles.sflItemTitle} numberOfLines={2}>{sp.title}</Text>
                      <Text style={styles.sflItemSeller} numberOfLines={1}>by {sp.seller?.name ?? "My Nest"}</Text>
                      <Text style={styles.sflItemPrice}>${price.toFixed(2)}</Text>
                    </View>
                  </TouchableOpacity>
                  <View style={styles.sflActionsCol}>
                    <TouchableOpacity
                      onPress={() => {
                        // v1.0.243 — per-row lock. Ignore a second tap
                        // while the first is still resolving.
                        if (movingId != null) return;
                        setMovingId(sp.id);
                        haptics.tap();
                        // Move-to-cart: add first so a failure leaves the
                        // save intact, then remove from favorites so it
                        // vanishes from Saved for later.
                        const ok = addProduct(sp, 1);
                        if (!ok) { setMovingId(null); return; }
                        favorites.toggle(sp.id)
                          .catch(() => { /* silent; the section will refresh next focus */ })
                          .finally(() => setMovingId(null));
                        toast.success("Moved to cart");
                      }}
                      disabled={movingId === sp.id}
                      testID={`cart-sfl-move-${sp.id}`}
                      style={[styles.sflMoveBtn, movingId === sp.id && { opacity: 0.6 }]}
                      accessibilityLabel={`Move ${sp.title} to cart`}
                      accessibilityRole="button"
                    >
                      <Ionicons name="bag-add-outline" size={14} color={colors.onBrand} />
                      <Text style={styles.sflMoveText}>Move to cart</Text>
                    </TouchableOpacity>
                    {/* v1.0.222 — the Saved-for-later section is backed by
                        the favorites list, so tapping "Remove" here also
                        unfavorites the product. The old button said
                        "Remove", which read like "remove from cart" — the
                        buyer's actual expectation. Now we ask before
                        deleting the favorite. */}
                    <TouchableOpacity
                      onPress={() => {
                        haptics.tap();
                        Alert.alert(
                          "Remove from favorites?",
                          `${sp.title} will be removed from your Saved for later and your Favorites.`,
                          [
                            { text: "Keep", style: "cancel" },
                            {
                              text: "Remove",
                              style: "destructive",
                              onPress: () => {
                                haptics.warning();
                                favorites.toggle(sp.id).catch(() => { /* silent */ });
                              },
                            },
                          ],
                        );
                      }}
                      testID={`cart-sfl-remove-${sp.id}`}
                      style={styles.sflRemoveBtn}
                      accessibilityLabel={`Remove ${sp.title} from favorites`}
                      accessibilityRole="button"
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Text style={styles.sflRemoveText}>Unfavorite</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
            {sflLoading ? <ActivityIndicator style={{ marginTop: spacing.sm }} color={colors.brand} /> : null}
          </View>
        ) : null}

        {/* Shipping method (live rates) */}
        {address ? (
          <View style={styles.rateBox} testID="cart-rates">
            <Text style={styles.rateBoxTitle}>Shipping method</Text>
            {ratesLoading ? (
              <View style={styles.rateLoading} testID="cart-rates-loading">
                <ActivityIndicator color={colors.brand} />
                <Text style={styles.rateLoadingText}>Getting live rates…</Text>
              </View>
            ) : rates && rates.length > 0 ? (
              rates.map((r) => {
                const sel = r.id === selectedRateId;
                return (
                  <TouchableOpacity
                    key={r.id}
                    style={styles.rateRow}
                    onPress={() => {
                      setSelectedRateId(r.id);
                      setShippingOverride(null);
                      setFinalReview(null);
                      // Picking a different rate by hand is a new order, not a
                      // retry — the server won't re-price an order it reuses.
                      startNewCheckoutAttempt();
                    }}
                    testID={`cart-rate-${r.id}`}
                    activeOpacity={0.8}
                  >
                    <Ionicons name={sel ? "radio-button-on" : "radio-button-off"} size={20} color={sel ? colors.brand : colors.onSurfaceMuted} />
                    <Text style={styles.rateLabel} numberOfLines={2}>{r.label}</Text>
                    <Text style={styles.rateAmount}>{r.amount === 0 ? "Free" : `$${r.amount.toFixed(2)}`}</Text>
                  </TouchableOpacity>
                );
              })
            ) : (
              <View>
                <Text style={styles.rateFallback} testID="cart-rates-fallback">
                  We couldn't fetch live rates right now. An estimated cost is shown below; the final shipping amount is confirmed securely at payment.
                </Text>
                {/* v1.0.222 — dev-only. This surfaced raw plugin reason
                    strings ("no_address", "no_shipping_profile") to
                    production buyers. Keep visible in dev for debugging. */}
                {__DEV__ && debugReason ? (
                  <Text style={styles.rateDebug} testID="cart-rates-debug">
                    Debug: {debugReason}
                  </Text>
                ) : null}
              </View>
            )}
          </View>
        ) : null}

        {/* v1.0.209 (P0 #3) — stackable promo codes. Buyers may add several
            codes; each valid one shows as its own chip with an × button.
            "Find best deal" asks the server for the highest-total combo. */}
        <View style={styles.couponCard}>
          <Text style={styles.couponLabel}>Promo codes</Text>
          {appliedCoupons.length > 0 ? (
            <View style={styles.couponChipRow}>
              {appliedCoupons.map((code) => {
                const row = couponRows.find((r) => r.code.toUpperCase() === code.toUpperCase());
                const invalid = row && !row.valid;
                return (
                  <View
                    key={code}
                    style={[styles.couponChip, invalid ? styles.couponChipInvalid : null]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.couponChipCode}>{code}</Text>
                      <Text style={styles.couponChipMeta}>
                        {invalid
                          ? (row?.reason || "Not valid")
                          : row?.free_shipping
                            ? "Free shipping"
                            : `-$${(row?.discount || 0).toFixed(2)}`}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => {
                        haptics.tap();
                        setAppliedCoupons((prev) => prev.filter((c) => c !== code));
                        setFinalReview(null);
                        startNewCheckoutAttempt();
                      }}
                      accessibilityLabel={`Remove ${code}`}
                      accessibilityRole="button"
                      style={styles.couponChipRemove}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="close" size={16} color={colors.onSurface} />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          ) : null}
          <View style={styles.couponInputRow}>
            <TextInput
              value={couponInput}
              onChangeText={(t) => { setCouponInput(t); if (couponError) setCouponError(null); }}
              placeholder="Enter code"
              placeholderTextColor={colors.onSurfaceMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              style={styles.couponInput}
              returnKeyType="done"
              onSubmitEditing={() => {
                const code = couponInput.trim().toUpperCase();
                if (!code) { setCouponInput(""); return; }
                haptics.press();
                // v1.0.243 — dedupe inside the functional update so a
                // rapid Enter+Apply doesn't add the same code twice when
                // the closure's `appliedCoupons` is still empty.
                setAppliedCoupons((prev) => (prev.includes(code) ? prev : [...prev, code]));
                setCouponInput("");
                setFinalReview(null);
                startNewCheckoutAttempt();
              }}
            />
            <TouchableOpacity
              onPress={() => {
                const code = couponInput.trim().toUpperCase();
                if (!code) { setCouponInput(""); return; }
                haptics.press();
                // v1.0.243 — same functional-dedupe as onSubmitEditing.
                setAppliedCoupons((prev) => (prev.includes(code) ? prev : [...prev, code]));
                setCouponInput("");
                setFinalReview(null);
                startNewCheckoutAttempt();
              }}
              style={styles.couponApplyBtn}
              accessibilityLabel="Apply coupon"
              accessibilityRole="button"
            >
              <Text style={styles.couponApplyText}>Apply</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            onPress={async () => {
              if (findingBestCoupons || itemsForApi.length === 0) return;
              haptics.tap();
              setFindingBestCoupons(true);
              setCouponError(null);
              try {
                const best = await nest.findBestCoupons(itemsForApi);
                if (!best.codes || best.codes.length === 0) {
                  setCouponError("No promo codes apply to this cart right now.");
                } else {
                  setAppliedCoupons(best.codes);
                  setFinalReview(null);
                  startNewCheckoutAttempt();
                }
              } catch {
                setCouponError("Couldn't check for the best deal. Try again.");
              } finally {
                setFindingBestCoupons(false);
              }
            }}
            disabled={findingBestCoupons || itemsForApi.length === 0}
            style={[styles.findBestBtn, (findingBestCoupons || itemsForApi.length === 0) ? styles.findBestBtnDisabled : null]}
            accessibilityLabel="Find the best deal"
            accessibilityRole="button"
          >
            <Ionicons name="sparkles-outline" size={16} color={colors.brand} style={{ marginRight: 6 }} />
            <Text style={styles.findBestText}>{findingBestCoupons ? "Finding best deal…" : "Find best deal"}</Text>
          </TouchableOpacity>
          {couponError ? <Text style={styles.couponError}>{couponError}</Text> : null}
        </View>

        <View style={styles.summary}>
          <SummaryRow label="Subtotal" value={`$${cart.subtotal.toFixed(2)}`} />
          {/* v1.0.209 — one summary row per applied code so the buyer can see
              exactly how much each coupon contributed. */}
          {couponRows.filter((r) => r.valid && r.discount > 0).map((r) => (
            <SummaryRow key={r.code} label={`Discount (${r.code})`} value={`-$${r.discount.toFixed(2)}`} />
          ))}
          <SummaryRow label={shippingRowLabel} value={couponFreeShipping ? "Free" : shippingRowValue} />
          <SummaryRow label="Tax" value={displayTax == null ? "Calculated at checkout" : `$${displayTax.toFixed(2)}`} />
          <View style={styles.divider} />
          {/* v1.0.222 — flash the total row on transition to finalReview so
              the two-tap review is *visible*, and swap the label to a clearer
              "Final total to confirm" instead of the previous silent
              "Estimated total" → "Final total" flip. */}
          <Animated.View style={{ backgroundColor: totalFlashBg, borderRadius: radius.sm, paddingHorizontal: spacing.xs, marginHorizontal: -spacing.xs }}>
            <SummaryRow
              label={finalReview ? "Final total to confirm" : "Estimated total"}
              value={`$${displayTotal.toFixed(2)}`}
              bold
            />
          </Animated.View>
        </View>

        {/* v1.0.160 — Proactive block: mirror plugin v3.13.32 rules so the
            buyer sees what's missing before tapping Checkout. */}
        {cart.items.length > 0 && !canCheckout ? (
          <TouchableOpacity
            style={styles.contactWarn}
            onPress={openAddressPicker}
            activeOpacity={0.85}
            testID="cart-contact-warn"
            accessibilityRole="button"
            accessibilityLabel={`Add ${contactMissing.join(", ")} before checking out.`}
          >
            <View style={styles.contactWarnIcon}>
              <Ionicons name="alert-circle" size={18} color={colors.warning} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.contactWarnTitle}>Finish your details to check out</Text>
              <Text style={styles.contactWarnBody}>
                Add {contactMissing.join(", ")}. Tap to open your shipping address.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.warning} />
          </TouchableOpacity>
        ) : null}

        {/* v1.0.223 — Wallet hint. Native "Apple Pay" / "Google Pay" express
            buttons live inside the PaymentSheet; this row tells buyers so they
            don't have to guess before tapping Checkout. */}
        <View style={styles.walletHint}>
          <View style={styles.walletHintIcons}>
            {Platform.OS === "ios" ? (
              <View style={styles.walletBadge}><Ionicons name="logo-apple" size={11} color="#FFFFFF" /><Text style={styles.walletBadgeText}> Pay</Text></View>
            ) : (
              <View style={[styles.walletBadge, styles.walletBadgeG]}><Ionicons name="logo-google" size={11} color={colors.onSurface} /><Text style={[styles.walletBadgeText, styles.walletBadgeGText]}> Pay</Text></View>
            )}
            <View style={styles.walletBadgeCard}><Ionicons name="card" size={12} color={colors.onSurface} /><Text style={[styles.walletBadgeText, styles.walletBadgeGText]}> Card</Text></View>
          </View>
          <Text style={styles.walletHintText}>
            {Platform.OS === "ios" ? "Apple Pay, card, and saved cards" : "Google Pay, card, and saved cards"} at checkout.
          </Text>
        </View>

        <Text style={styles.secure}>🔒 Checkout uses secure payments on {SITE.replace(/^https?:\/\//, "")}. Your card is saved for faster checkout next time.</Text>
      </ScrollView>

      {/* No insets.bottom: the tab bar sits below this bar and already clears
          the home indicator. */}
      <View style={[styles.bottomBar, { paddingBottom: spacing.md }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.bottomTotalLabel}>Total</Text>
          <Text style={styles.bottomTotal}>${displayTotal.toFixed(2)}</Text>
        </View>
        <TouchableOpacity
          onPress={() => {
            // v1.0.160 — If contact/address is incomplete, don't waste a round
            // trip to the server. Route the buyer straight to the address form,
            // matching what the server's 422 error path would do.
            if (!canCheckout) {
              haptics.warning();
              toast.show(`Add ${contactMissing.join(", ")} to check out.`, "info");
              openAddressPicker();
              return;
            }
            haptics.press();
            onCheckout();
          }}
          disabled={paying}
          style={[styles.checkoutBtn, (paying || !canCheckout) && styles.checkoutBtnDisabled]}
          testID="cart-checkout"
          accessibilityState={{ disabled: paying || !canCheckout }}
          accessibilityLabel={canCheckout ? "Checkout" : "Complete your shipping details to check out"}
         accessibilityRole="button">
          {paying ? (
            // v1.0.223 — Staged label: "Starting checkout…" → "Opening payment…"
            // → "Confirming payment…". Buyers stopped double-tapping because
            // they can see what step we're on.
            <>
              <ActivityIndicator color={colors.onBrand} />
              <Text style={styles.checkoutText}>
                {payStage === "verifying" ? "Confirming payment…" : payStage === "opening" ? "Opening payment…" : "Starting checkout…"}
              </Text>
            </>
          ) : (
            <>
              {/* v1.0.222 — during the finalReview step, the button explicitly
                  says the price the buyer is about to be charged. This turns the
                  invisible "tap again" step into a clear consent moment. */}
              <Text style={styles.checkoutText}>
                {finalReview ? `Confirm $${displayTotal.toFixed(2)}` : "Checkout"}
              </Text>
              <Ionicons name="arrow-forward" size={18} color={colors.onBrand} />
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* v1.0.223 — Persistent payment error dialog. Toasts fade out in ~3s
          and buyers on iOS lose them behind the dismissing Apple Pay sheet.
          A modal with a labeled Retry button gives payment failures the
          weight they deserve. */}
      <Modal visible={payError !== null} transparent animationType="fade" onRequestClose={() => setPayError(null)}>
        <View style={styles.errorBackdrop}>
          <View style={styles.errorCard}>
            <View style={styles.errorIcon}>
              <Ionicons name="alert-circle" size={26} color={colors.error} />
            </View>
            <Text style={styles.errorTitle}>{payError?.title ?? "Something went wrong"}</Text>
            <Text style={styles.errorBody}>{payError?.message ?? ""}</Text>
            <View style={styles.errorButtons}>
              <TouchableOpacity
                style={styles.errorBtnSecondary}
                onPress={() => setPayError(null)}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Text style={styles.errorBtnSecondaryText}>Close</Text>
              </TouchableOpacity>
              {payError?.canRetry ? (
                <TouchableOpacity
                  style={styles.errorBtnPrimary}
                  onPress={() => {
                    setPayError(null);
                    haptics.press();
                    onCheckout();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Retry payment"
                >
                  <Text style={styles.errorBtnPrimaryText}>Retry</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>

      {/* v1.0.223 — During "verifying", block cart interactions so the buyer
          can't accidentally edit an item or address while the webhook is
          settling their new order. */}
      {paying ? (
        <View pointerEvents="auto" style={styles.payingOverlay} accessibilityLiveRegion="polite" accessibilityLabel={payStage === "verifying" ? "Confirming your payment" : "Processing checkout"} />
      ) : null}

      {/* v1.0.94 (Build #17a) — saved-address picker */}
      <AddressPickerModal
        visible={pickerOpen}
        loading={savedLoading}
        entries={savedAddresses || []}
        onPick={pickSavedAddress}
        onEnterNew={() => { setPickerOpen(false); setFormOpen(true); }}
        onManage={() => { setPickerOpen(false); pushFromTab(router, "/(tabs)/(more)/me/addresses"); }}
        onCancel={() => setPickerOpen(false)}
      />
      <AddressFormModal visible={formOpen} initial={address} onCancel={() => setFormOpen(false)} onSave={saveAddress} />
    </SafeAreaView>
  );
}

function formatAddress(a: NestWpAddress): string {
  return [a.address_1, a.address_2, [a.city, a.state].filter(Boolean).join(", "), a.postcode, a.country]
    .filter(Boolean)
    .join(" · ");
}

// Minimal local address form — collects the fields the backend needs to compute
// real carrier rates. Persisted locally by the caller; not sent to the server
// until a quote / checkout.
function AddressFormModal({
  visible,
  initial,
  onCancel,
  onSave,
}: {
  visible: boolean;
  initial: NestWpAddress | null;
  onCancel: () => void;
  onSave: (a: NestWpAddress) => void;
}) {
  const insets = useSafeAreaInsets();
  // v1.0.222 — was a single "Full name" split at the first space, so
  // "Anne Marie Smith" became first="Anne" / last="Marie Smith", and
  // buyers with a single-word legal name (mononyms) failed the "canSave"
  // gate. Structured fields fix both: no ambiguity, plus autofill hooks
  // for name-given / name-family on both iOS and Android.
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [line1, setLine1] = React.useState("");
  const [line2, setLine2] = React.useState("");
  const [city, setCity] = React.useState("");
  const [state, setState] = React.useState("");
  const [postcode, setPostcode] = React.useState("");
  const [country, setCountry] = React.useState("US");
  // v1.0.168 — Phone is required for USPS labels + carrier notifications; the
  // cart's "Finish your details" gate already checks address.phone || user.phone
  // and refuses to check out without it. Adding the field here means the
  // buyer can satisfy the gate from the same sheet they entered the address
  // in, instead of bouncing to /me/addresses to hunt for the field.
  const [phone, setPhone] = React.useState("");

  // Re-seed the fields each time the sheet opens (new/edit).
  React.useEffect(() => {
    if (!visible) return;
    setFirstName(initial?.first_name ?? "");
    setLastName(initial?.last_name ?? "");
    setLine1(initial?.address_1 ?? "");
    setLine2(initial?.address_2 ?? "");
    setCity(initial?.city ?? "");
    setState(initial?.state ?? "");
    setPostcode(initial?.postcode ?? "");
    setCountry(initial?.country ?? "US");
    setPhone(initial?.phone ?? "");
  }, [visible, initial]);

  const phoneDigits = phone.replace(/\D+/g, "");
  // v1.0.222 — first name is required (Shippo won't accept a blank
  // recipient); last name is optional so mononyms pass.
  const canSave = firstName.trim() && line1.trim() && city.trim() && state.trim() && postcode.trim() && country.trim() && phoneDigits.length >= 10;

  const submit = () => {
    if (!canSave) return;
    onSave({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      address_1: line1.trim(),
      address_2: line2.trim() || undefined,
      city: city.trim(),
      state: state.trim(),
      postcode: postcode.trim(),
      country: country.trim().toUpperCase(),
      phone: phone.trim(),
    });
  };

  return (
    // v1.0.220 — Modal on Android sits outside the normal window; RN's
    // KeyboardAvoidingView can't measure the keyboard height correctly
    // unless the Modal is statusBarTranslucent AND we give KAV the right
    // `behavior`. On Android "height" shrinks the sheet so the focused
    // field stays above the keyboard; on iOS "padding" is the canonical
    // choice. Previously behavior={undefined} on Android meant the sheet
    // never moved and State/Postcode/Country/Phone rows sat under the
    // keyboard (see 2026-09-02 report).
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={styles.modalBackdrop}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "android" ? 0 : 0}
      >
        <View style={[styles.modalSheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Shipping address</Text>
            <TouchableOpacity onPress={onCancel} testID="address-form-cancel" accessibilityRole="button" accessibilityLabel="Close" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Ionicons name="close" size={24} color={colors.onSurface} /></TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: spacing.lg }}>
            {/* v1.0.222 — structured name fields with iOS/Android autofill
                hooks. autoComplete + textContentType are the RN keys the
                platform password managers/keyboards look for. */}
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Field
                  label="First name"
                  value={firstName}
                  onChangeText={setFirstName}
                  testID="address-first-name"
                  autoCapitalize="words"
                  autoComplete="name-given"
                  textContentType="givenName"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Field
                  label="Last name (optional)"
                  value={lastName}
                  onChangeText={setLastName}
                  testID="address-last-name"
                  autoCapitalize="words"
                  autoComplete="name-family"
                  textContentType="familyName"
                />
              </View>
            </View>
            <Field label="Address line 1" value={line1} onChangeText={setLine1} testID="address-line1" />
            <Field label="Address line 2 (optional)" value={line2} onChangeText={setLine2} testID="address-line2" />
            <Field label="City" value={city} onChangeText={setCity} testID="address-city" />
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <View style={{ flex: 1 }}><Field label="State" value={state} onChangeText={setState} testID="address-state" autoCapitalize="characters" /></View>
              <View style={{ flex: 1 }}><Field label="Postcode" value={postcode} onChangeText={setPostcode} testID="address-postcode" keyboardType="numbers-and-punctuation" /></View>
            </View>
            <Field label="Country" value={country} onChangeText={setCountry} testID="address-country" autoCapitalize="characters" />
            <Field label="Phone" value={phone} onChangeText={setPhone} testID="address-phone" keyboardType="phone-pad" />
          </ScrollView>
          <TouchableOpacity
            style={[styles.modalSave, !canSave && styles.checkoutBtnDisabled]}
            onPress={submit}
            disabled={!canSave}
            testID="address-form-save"
           accessibilityRole="button">
            <Text style={styles.checkoutText}>Save address</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({
  label,
  testID,
  ...props
}: React.ComponentProps<typeof TextInput> & { label: string }) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput style={styles.fieldInput} placeholderTextColor={colors.onSurfaceMuted} testID={testID} {...props} />
    </View>
  );
}

// v1.0.117 — Cart is a peer tab, but the header shows a chevron whenever
// the nav-history tracker knows the user got here from another screen
// (e.g. tapped the header cart icon from a product page). Tapping
// safeBack replaces the cart with the previous route; if there's no
// tracked history (cold-start, user tapped the cart button in the
// account row), the chevron is hidden and the user leaves the cart by
// tapping another tab.
function Top({ title }: { title: string }) {
  const router = useRouter();
  // v1.0.168 — Cart lives inside (more)/ now, so router.canGoBack() is
  // true whenever the user got here from another screen (product page,
  // header cart button, etc.) and false only on a cold-start deep link
  // directly into /cart.
  const [hasPrev, setHasPrev] = useState<boolean>(() => {
    try { return router.canGoBack(); } catch { return false; }
  });
  useFocusEffect(
    useCallback(() => {
      try { setHasPrev(router.canGoBack()); } catch { setHasPrev(false); }
    }, [router]),
  );
  return (
    <View style={styles.top}>
      {hasPrev ? (
        <TouchableOpacity
          onPress={() => { haptics.tap(); safeBack(router, "/(tabs)"); }}
          style={styles.backBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="cart-back"
        >
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </TouchableOpacity>
      ) : null}
      <Text style={styles.topTitle}>{title}</Text>
      <View style={{ flex: 1 }} />
      <AlertsBellButton />
    </View>
  );
}

function SummaryRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 }}>
      <Text style={{ color: colors.onSurfaceMuted, fontSize: bold ? 15 : 14, fontWeight: bold ? "800" : "600" }}>{label}</Text>
      <Text style={{ color: colors.onSurface, fontSize: bold ? 18 : 14, fontWeight: bold ? "800" : "700" }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  // v1.0.226 — Cart refinement.
  //   • Every card (address, line-item, save-for-later, shipping rates,
  //     coupon, order summary) is now white on cream with a hairline
  //     border and no shadow — checkout-grade Stripe look.
  //   • Line items and mini-summary rows share the same padding + type,
  //     so scanning the cart feels rhythmic.
  //   • Coupon and address chips gain proper focus/hover-safe backgrounds.
  top: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, paddingTop: spacing.sm },
  backBtn: { width: 36, height: 36, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", marginRight: spacing.sm },
  topTitle: { ...typeTokens.h1, fontSize: 20 },
  addrCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  addrPrompt: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderStyle: "dashed",
  },
  addrIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  addrLabel: { ...typeTokens.micro },
  addrName: { ...typeTokens.body, fontWeight: "800", marginTop: 1 },
  addrLine: { ...typeTokens.caption, marginTop: 2 },
  addrEdit: { ...typeTokens.caption, color: colors.brand, fontWeight: "800" },
  item: {
    flexDirection: "row",
    padding: spacing.md,
    backgroundColor: colors.card,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  itemImg: { width: 84, height: 84, borderRadius: radius.field, backgroundColor: colors.surfaceTertiary },
  itemTitle: { ...typeTokens.body, fontWeight: "700" },
  itemSeller: { ...typeTokens.micro, textTransform: "none", letterSpacing: 0, marginTop: 2 },
  qtyRow: { flexDirection: "row", alignItems: "center", marginTop: spacing.sm, gap: 8 },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyText: { ...typeTokens.caption, fontWeight: "800", minWidth: 18, textAlign: "center" },
  itemPrice: { ...typeTokens.price, fontSize: 15 },
  removeBtn: { padding: spacing.xs, alignSelf: "flex-start" },
  // v1.0.212 (P0 #6) — Save for later button styles + section layout.
  itemActionsCol: { alignItems: "flex-end", justifyContent: "space-between", gap: spacing.xs },
  saveLaterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    backgroundColor: colors.card,
  },
  saveLaterText: { ...typeTokens.micro, textTransform: "none", letterSpacing: 0, color: colors.brand, fontWeight: "700" },
  sflSection: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  sflHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  sflTitle: { ...typeTokens.body, fontWeight: "800" },
  sflRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline },
  sflMain: { flex: 1, flexDirection: "row", alignItems: "center" },
  sflImg: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary },
  sflItemTitle: { fontSize: 13, fontWeight: "700", color: colors.onSurface },
  sflItemSeller: { fontSize: 11, color: colors.onSurfaceMuted, marginTop: 2 },
  sflItemPrice: { fontSize: 13, fontWeight: "800", color: colors.onSurface, marginTop: 2 },
  sflActionsCol: { alignItems: "flex-end", gap: spacing.xs, marginLeft: spacing.sm },
  sflMoveBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.brand },
  sflMoveText: { fontSize: 12, fontWeight: "800", color: colors.onBrand },
  sflRemoveBtn: { paddingHorizontal: spacing.sm, paddingVertical: 4 },
  sflRemoveText: { fontSize: 11, color: colors.onSurfaceMuted, textDecorationLine: "underline" },
  rateBox: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.lg,
  },
  rateBoxTitle: { ...typeTokens.micro, marginBottom: spacing.sm },
  rateLoading: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm },
  rateLoadingText: { fontSize: 13, color: colors.onSurfaceMuted },
  rateRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm },
  rateLabel: { flex: 1, fontSize: 14, fontWeight: "600", color: colors.onSurface },
  rateAmount: { fontSize: 14, fontWeight: "800", color: colors.onSurface },
  rateFallback: { fontSize: 12, color: colors.onSurfaceMuted, lineHeight: 18 },
  rateDebug: { fontSize: 10, color: colors.onSurfaceMuted, lineHeight: 14, marginTop: 4 },
  couponCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.lg,
  },
  couponLabel: { ...typeTokens.micro, marginBottom: 8 },
  couponInputRow: { flexDirection: "row", gap: 8 },
  couponInput: {
    ...typeTokens.body,
    flex: 1,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    borderRadius: radius.field,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.onSurface,
    backgroundColor: colors.surface,
  },
  couponApplyBtn: { paddingHorizontal: 16, justifyContent: "center", backgroundColor: colors.brand, borderRadius: radius.sm },
  couponApplyText: { color: colors.onBrand, fontWeight: "700" },
  couponAppliedRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  couponAppliedCode: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  couponAppliedMeta: { color: colors.success, marginTop: 2, fontWeight: "600" },
  couponRemoveBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  couponRemoveText: { color: colors.onSurfaceMuted, fontWeight: "600" },
  couponError: { color: colors.error, marginTop: 8 },
  // v1.0.209 (P0 #3) — stacked-coupon chip list + "Find best deal" button.
  couponChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  couponChip: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.divider, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 8, minWidth: 160, flexGrow: 1 },
  couponChipInvalid: { borderColor: colors.error, opacity: 0.85 },
  couponChipCode: { fontSize: 13, fontWeight: "700", color: colors.onSurface, letterSpacing: 0.3 },
  couponChipMeta: { fontSize: 11, color: colors.success, marginTop: 2, fontWeight: "600" },
  couponChipRemove: { width: 28, height: 28, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceTertiary },
  findBestBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 10, paddingVertical: 10, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.brand, backgroundColor: "transparent" },
  findBestBtnDisabled: { opacity: 0.5 },
  findBestText: { color: colors.brand, fontWeight: "700", fontSize: 14 },
  summary: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.lg,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline, marginVertical: spacing.sm },
  secure: { ...typeTokens.caption, textAlign: "center", marginTop: spacing.md, marginHorizontal: spacing.lg },
  // v1.0.160 — warning card shown above the checkout button when the buyer is
  // missing email/phone/address fields that the server would reject.
  contactWarn: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginHorizontal: spacing.lg, marginTop: spacing.md, padding: spacing.md, backgroundColor: colors.surfaceTertiary, borderRadius: radius.lg, borderLeftWidth: 3, borderLeftColor: colors.warning },
  contactWarnIcon: { width: 28, height: 28, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  contactWarnTitle: { color: colors.onSurface, fontWeight: "600", fontSize: 14, marginBottom: 2 },
  contactWarnBody: { color: colors.onSurfaceMuted, fontSize: 12, lineHeight: 16 },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairlineStrong,
    gap: spacing.md,
  },
  bottomTotalLabel: { ...typeTokens.micro },
  bottomTotal: { ...typeTokens.price, fontSize: 20 },
  checkoutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: colors.brand, borderRadius: radius.pill, paddingHorizontal: spacing.xl, minHeight: 52, gap: 8 },
  checkoutBtnDisabled: { opacity: 0.6 },
  checkoutText: { color: colors.onBrand, fontWeight: "800", fontSize: 15 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, maxHeight: "88%" },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  modalTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  fieldLabel: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceMuted, marginBottom: 4 },
  fieldInput: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: 15, color: colors.onSurface },
  modalSave: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: colors.brand, borderRadius: radius.pill, minHeight: 52, marginTop: spacing.sm },
  // v1.0.223 — Payment error dialog + verifying overlay.
  errorBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl },
  errorCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, alignItems: "center", width: "100%", maxWidth: 360, ...shadows.card },
  errorIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#FBE7E7", alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  errorTitle: { fontSize: 17, fontWeight: "800", color: colors.onSurface, textAlign: "center", marginBottom: spacing.sm },
  errorBody: { fontSize: 14, color: colors.onSurfaceMuted, textAlign: "center", lineHeight: 20, marginBottom: spacing.lg },
  errorButtons: { flexDirection: "row", gap: spacing.sm, alignSelf: "stretch" },
  errorBtnSecondary: { flex: 1, minHeight: 46, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  errorBtnSecondaryText: { color: colors.onSurface, fontWeight: "700", fontSize: 15 },
  errorBtnPrimary: { flex: 1, minHeight: 46, borderRadius: radius.pill, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  errorBtnPrimaryText: { color: colors.onBrand, fontWeight: "800", fontSize: 15 },
  // Absolute overlay that intercepts taps on the cart while paying. Visually
  // transparent because the button already carries the stage label; the
  // point is to stop accidental edits mid-checkout, not to darken the screen.
  payingOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "transparent" },
  // v1.0.223 — Wallet hint row above the secure-checkout notice.
  walletHint: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.md },
  walletHintIcons: { flexDirection: "row", gap: 6 },
  walletBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: "#000", flexDirection: "row", alignItems: "center" },
  walletBadgeG: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: colors.border },
  walletBadgeCard: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceSecondary },
  walletBadgeText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
  walletBadgeGText: { color: colors.onSurface },
  walletHintText: { fontSize: 12, color: colors.onSurfaceMuted, textAlign: "center" },
});
