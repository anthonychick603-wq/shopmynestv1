import React, { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  ActivityIndicator,
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
import { initStripe, useStripe, PaymentSheetError } from "@stripe/stripe-react-native";

import { colors, radius, shadows, spacing } from "@/src/theme";
import { useCart } from "@/src/context/CartContext";
import { useAuth } from "@/src/context/AuthContext";
import { useStripeKey, STRIPE_MERCHANT_ID, STRIPE_URL_SCHEME } from "@/src/context/StripePayment";
import { EmptyState } from "@/src/components/EmptyState";
// v1.0.97 — picker sheet moved to its own component; cart just wires it up.
import { AddressPickerModal } from "@/src/components/AddressPickerModal";
import { SITE, nest, ApiError, type NestWpAddress, type NestShippingRate, type NestAddressBookEntry } from "@/src/api/nest";
import { toast } from "@/src/components/Toast";
import { storage } from "@/src/utils/storage";
import { pushFromTab, safeBack } from "@/src/utils/nav";
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
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { cart, updateItem, removeItem, clear, refreshPrices } = useCart();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const { setPublishableKey } = useStripeKey();
  const [paying, setPaying] = React.useState(false);

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
  const [finalReview, setFinalReview] = React.useState<{ orderId: number; tax: number; total: number; shipping: number | null } | null>(null);
  // v1.0.92 — coupon input. The typed value only becomes an applied code once
  // the buyer taps Apply, so an accidental keystroke does not requote the cart.
  const [couponInput, setCouponInput] = React.useState("");
  const [appliedCoupon, setAppliedCoupon] = React.useState<string | null>(null);
  const [couponDiscount, setCouponDiscount] = React.useState<number>(0);
  const [couponFreeShipping, setCouponFreeShipping] = React.useState(false);
  const [couponError, setCouponError] = React.useState<string | null>(null);

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
  }, [itemsSig, addressSig, appliedCoupon]);

  // v1.0.160 — Mirror the plugin v3.13.32 buyer_contact_incomplete rules so
  // the buyer sees what's missing BEFORE they tap Checkout. The server is still
  // the source of truth (create-intent will 422 if we let a bad request through)
  // — this is just a proactive UI to save a round trip.
  const contactMissing = React.useMemo(() => {
    const missing: string[] = [];
    if (!user?.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)) missing.push("an email");
    if (!address?.first_name || !address?.last_name) missing.push("a recipient name");
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
      .quoteCheckout(itemsForApi, address, appliedCoupon ?? undefined)
      .then((q) => {
        if (cancelled) return;
        setQuoteToken(q.quote_token ?? null);
        setQuotedShipping(typeof q.shipping === "number" ? q.shipping : null);
        // Reflect the server's decision about the applied coupon (it may reject
        // the code, e.g. minimum-not-met, expired, or a seller-scoped coupon
        // against a cart with no matching items).
        if (appliedCoupon && q.coupon) {
          if (q.coupon.valid) {
            setCouponDiscount(q.coupon.discount || 0);
            setCouponFreeShipping(!!q.coupon.free_shipping);
            setCouponError(null);
          } else {
            setCouponDiscount(0);
            setCouponFreeShipping(false);
            setCouponError(q.coupon.reason || "Coupon can't be applied.");
          }
        } else if (!appliedCoupon) {
          setCouponDiscount(0);
          setCouponFreeShipping(false);
          setCouponError(null);
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
  }, [user, address, itemsSig, appliedCoupon]);

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

  const onCheckout = async () => {
    if (paying || !cart || cart.items.length === 0) return;
    setPaying(true);
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
      const intent = await nest.createPaymentIntent({
        items,
        shipping_address: address ?? undefined,
        shipping_method_id: selectedRateId ?? undefined,
        quote_token: quoteToken ?? undefined,
        checkout_token: checkoutTokenFor(`${itemsSig}|${addressSig}`),
        // v1.0.92 — the server re-validates the code and only applies a
        // discount if it's still redeemable, so a stale code is a no-op.
        ...(appliedCoupon ? { coupon_code: appliedCoupon } : {}),
      });

      if (!intent.client_secret || !intent.publishable_key) {
        toast.error("Checkout is temporarily unavailable. Please try again.");
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
        toast.show("Prices changed. Review the new total and tap Checkout again.", "info");
        return;
      }

      const serverShipping = typeof intent.shipping_total === "number" ? intent.shipping_total : null;
      const serverTax = typeof intent.tax_total === "number" ? intent.tax_total : 0;
      const shippingDiffers = serverShipping != null && shippingAmount != null && Math.abs(serverShipping - shippingAmount) >= 0.01;
      const alreadyReviewed = finalReview?.orderId === intent.order_id
        && Math.abs(finalReview.total - intent.amount) < 0.01
        && Math.abs(finalReview.tax - serverTax) < 0.01;
      const finalDiffers = Math.abs(intent.amount - displayTotal) >= 0.01;

      if (!alreadyReviewed && (intent.shipping_selection_changed || shippingDiffers || finalDiffers)) {
        if (serverShipping != null) setShippingOverride(serverShipping);
        if (intent.shipping_method_id) setSelectedRateId(intent.shipping_method_id);
        setFinalReview({ orderId: intent.order_id, tax: serverTax, total: intent.amount, shipping: serverShipping });
        toast.show("Your final shipping, tax, or total changed. Review the final amount and tap Checkout again.", "info");
        return;
      }

      // 2. Make sure the native SDK is initialized with the live publishable key
      //    (the key is only known after create-intent, so initialize it here).
      setPublishableKey(intent.publishable_key);
      await initStripe({
        publishableKey: intent.publishable_key,
        merchantIdentifier: STRIPE_MERCHANT_ID,
        urlScheme: STRIPE_URL_SCHEME,
      });

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
        toast.error(initError.message || "Could not start checkout.");
        return;
      }

      // 4. Present the sheet and let the buyer pay without leaving the app.
      const { error: sheetError } = await presentPaymentSheet();
      if (sheetError) {
        // User dismissing the sheet is not an error — stop quietly.
        if (sheetError.code === PaymentSheetError.Canceled) return;
        toast.error(sheetError.message || "Payment could not be completed.");
        return;
      }

      // 5. Best-effort immediate confirmation (webhook is the source of truth).
      try {
        await nest.completeCheckout({ order_id: intent.order_id, payment_intent_id: intent.payment_intent_id });
      } catch {
        // Ignore — the Stripe webhook settles the order server-side regardless.
      }

      // This attempt is spent: the next checkout must open a new order.
      startNewCheckoutAttempt();
      await clear();
      toast.success("Payment received! Your order is confirmed and the seller has been notified.");
      pushFromTab(router, "/orders");
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
      toast.error(message);
    } finally {
      setPaying(false);
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
            <TouchableOpacity onPress={() => { haptics.warning(); removeItem(idx); }} testID={`cart-remove-${idx}`} style={styles.removeBtn} accessibilityLabel={`Remove ${it.product.title} from cart`} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button">
              <Ionicons name="trash-outline" size={18} color={colors.error} />
            </TouchableOpacity>
          </View>
        ))}

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
                {debugReason ? (
                  <Text style={styles.rateDebug} testID="cart-rates-debug">
                    Debug: {debugReason}
                  </Text>
                ) : null}
              </View>
            )}
          </View>
        ) : null}

        <View style={styles.couponCard} accessibilityRole="button">
          <Text style={styles.couponLabel}>Promo code</Text>
          {appliedCoupon ? (
            <View style={styles.couponAppliedRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.couponAppliedCode}>{appliedCoupon}</Text>
                <Text style={styles.couponAppliedMeta}>
                  {couponFreeShipping ? "Free shipping" : `-$${couponDiscount.toFixed(2)}`}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  haptics.tap();
                  setAppliedCoupon(null);
                  setCouponInput("");
                  setCouponDiscount(0);
                  setCouponFreeShipping(false);
                  setCouponError(null);
                  setFinalReview(null);
                  startNewCheckoutAttempt();
                }}
                accessibilityLabel="Remove coupon"
                style={styles.couponRemoveBtn}
               accessibilityRole="button">
                <Text style={styles.couponRemoveText}>Remove</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.couponInputRow}>
              <TextInput
                value={couponInput}
                onChangeText={t => { setCouponInput(t); if (couponError) setCouponError(null); }}
                placeholder="Enter code"
                placeholderTextColor={colors.onSurfaceMuted}
                autoCapitalize="characters"
                autoCorrect={false}
                style={styles.couponInput}
              />
              <TouchableOpacity
                onPress={() => {
                  const code = couponInput.trim().toUpperCase();
                  if (!code) return;
                  haptics.press();
                  setAppliedCoupon(code);
                  setFinalReview(null);
                  startNewCheckoutAttempt();
                }}
                style={styles.couponApplyBtn}
                accessibilityLabel="Apply coupon"
               accessibilityRole="button">
                <Text style={styles.couponApplyText}>Apply</Text>
              </TouchableOpacity>
            </View>
          )}
          {couponError ? <Text style={styles.couponError}>{couponError}</Text> : null}
        </View>

        <View style={styles.summary}>
          <SummaryRow label="Subtotal" value={`$${cart.subtotal.toFixed(2)}`} />
          {couponDiscount > 0 ? (
            <SummaryRow label={`Discount${appliedCoupon ? ` (${appliedCoupon})` : ""}`} value={`-$${couponDiscount.toFixed(2)}`} />
          ) : null}
          <SummaryRow label={shippingRowLabel} value={couponFreeShipping ? "Free" : shippingRowValue} />
          <SummaryRow label="Tax" value={displayTax == null ? "Calculated at checkout" : `$${displayTax.toFixed(2)}`} />
          <View style={styles.divider} />
          <SummaryRow label={finalReview ? "Final total" : "Estimated total"} value={`$${displayTotal.toFixed(2)}`} bold />
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

        <Text style={styles.secure}>🔒 Checkout uses secure payments on {SITE.replace(/^https?:\/\//, "")}.</Text>
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
            <ActivityIndicator color={colors.onBrand} />
          ) : (
            <>
              <Text style={styles.checkoutText}>Checkout</Text>
              <Ionicons name="arrow-forward" size={18} color={colors.onBrand} />
            </>
          )}
        </TouchableOpacity>
      </View>

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
  const [fullName, setFullName] = React.useState("");
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
    setFullName([initial?.first_name, initial?.last_name].filter(Boolean).join(" "));
    setLine1(initial?.address_1 ?? "");
    setLine2(initial?.address_2 ?? "");
    setCity(initial?.city ?? "");
    setState(initial?.state ?? "");
    setPostcode(initial?.postcode ?? "");
    setCountry(initial?.country ?? "US");
    setPhone(initial?.phone ?? "");
  }, [visible, initial]);

  const phoneDigits = phone.replace(/\D+/g, "");
  const canSave = fullName.trim() && line1.trim() && city.trim() && state.trim() && postcode.trim() && country.trim() && phoneDigits.length >= 10;

  const submit = () => {
    if (!canSave) return;
    const parts = fullName.trim().split(/\s+/);
    const first_name = parts[0] ?? "";
    const last_name = parts.slice(1).join(" ");
    onSave({
      first_name,
      last_name,
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
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.modalSheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Shipping address</Text>
            <TouchableOpacity onPress={onCancel} testID="address-form-cancel" accessibilityRole="button" accessibilityLabel="Close" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Ionicons name="close" size={24} color={colors.onSurface} /></TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: spacing.lg }}>
            <Field label="Full name" value={fullName} onChangeText={setFullName} testID="address-full-name" autoCapitalize="words" />
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
  top: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, paddingTop: spacing.sm },
  backBtn: { width: 36, height: 36, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", marginRight: spacing.sm },
  topTitle: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
  addrCard: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, marginHorizontal: spacing.lg, marginBottom: spacing.md, padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, ...shadows.card },
  addrPrompt: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginHorizontal: spacing.lg, marginBottom: spacing.md, padding: spacing.md, backgroundColor: colors.surfaceTertiary, borderRadius: radius.lg },
  addrIcon: { width: 36, height: 36, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  addrLabel: { fontSize: 11, color: colors.onSurfaceMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  addrName: { fontSize: 14, fontWeight: "800", color: colors.onSurface, marginTop: 1 },
  addrLine: { fontSize: 12, color: colors.onSurfaceMuted, marginTop: 2 },
  addrEdit: { fontSize: 13, color: colors.brand, fontWeight: "800" },
  item: { flexDirection: "row", padding: spacing.md, backgroundColor: colors.surfaceSecondary, marginHorizontal: spacing.lg, marginBottom: spacing.md, borderRadius: radius.lg, ...shadows.card },
  itemImg: { width: 84, height: 84, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary },
  itemTitle: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  itemSeller: { fontSize: 11, color: colors.onSurfaceMuted, marginTop: 2 },
  qtyRow: { flexDirection: "row", alignItems: "center", marginTop: spacing.sm, gap: 8 },
  qtyBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  qtyText: { fontSize: 14, fontWeight: "800", color: colors.onSurface, minWidth: 18, textAlign: "center" },
  itemPrice: { fontSize: 15, fontWeight: "800", color: colors.onSurface },
  removeBtn: { padding: spacing.xs, alignSelf: "flex-start" },
  rateBox: { marginHorizontal: spacing.lg, marginTop: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, ...shadows.card },
  rateBoxTitle: { fontSize: 13, fontWeight: "800", color: colors.onSurface, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: spacing.sm },
  rateLoading: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm },
  rateLoadingText: { fontSize: 13, color: colors.onSurfaceMuted },
  rateRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm },
  rateLabel: { flex: 1, fontSize: 14, fontWeight: "600", color: colors.onSurface },
  rateAmount: { fontSize: 14, fontWeight: "800", color: colors.onSurface },
  rateFallback: { fontSize: 12, color: colors.onSurfaceMuted, lineHeight: 18 },
  rateDebug: { fontSize: 10, color: colors.onSurfaceMuted, lineHeight: 14, marginTop: 4 },
  couponCard: { marginHorizontal: spacing.lg, marginTop: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, ...shadows.card },
  couponLabel: { fontSize: 13, fontWeight: "700", color: colors.onSurface, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  couponInputRow: { flexDirection: "row", gap: 8 },
  couponInput: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, color: colors.onSurface, backgroundColor: colors.surface },
  couponApplyBtn: { paddingHorizontal: 16, justifyContent: "center", backgroundColor: colors.brand, borderRadius: radius.sm },
  couponApplyText: { color: colors.onBrand, fontWeight: "700" },
  couponAppliedRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  couponAppliedCode: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  couponAppliedMeta: { color: colors.success, marginTop: 2, fontWeight: "600" },
  couponRemoveBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  couponRemoveText: { color: colors.onSurfaceMuted, fontWeight: "600" },
  couponError: { color: colors.error, marginTop: 8 },
  summary: { marginHorizontal: spacing.lg, marginTop: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, ...shadows.card },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.sm },
  secure: { textAlign: "center", color: colors.onSurfaceMuted, marginTop: spacing.md, marginHorizontal: spacing.lg, fontSize: 12 },
  // v1.0.160 — warning card shown above the checkout button when the buyer is
  // missing email/phone/address fields that the server would reject.
  contactWarn: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginHorizontal: spacing.lg, marginTop: spacing.md, padding: spacing.md, backgroundColor: colors.surfaceTertiary, borderRadius: radius.lg, borderLeftWidth: 3, borderLeftColor: colors.warning },
  contactWarnIcon: { width: 28, height: 28, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  contactWarnTitle: { color: colors.onSurface, fontWeight: "600", fontSize: 14, marginBottom: 2 },
  contactWarnBody: { color: colors.onSurfaceMuted, fontSize: 12, lineHeight: 16 },
  bottomBar: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceSecondary, paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.md, ...shadows.strong },
  bottomTotalLabel: { fontSize: 11, color: colors.onSurfaceMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  bottomTotal: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
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
});
