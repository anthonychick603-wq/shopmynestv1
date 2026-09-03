// v1.0.214 (P0 #8) — express checkout: fires PaymentSheet for a single
// product without going through the cart screen. Uses the buyer's default
// saved address (from the address book) so the flow is one tap → wallet
// (Apple Pay / Google Pay) or saved card. Any missing preconditions
// (address, sign-in, stock) return a typed failure the caller surfaces.

import { initStripe, PaymentSheetError, type useStripe } from "@stripe/stripe-react-native";
import { nest, type NestAddressBookEntry, type NestWpAddress } from "@/src/api/nest";
import { STRIPE_MERCHANT_ID, STRIPE_URL_SCHEME } from "@/src/context/StripePayment";

export type ExpressItem = {
  product_id: number;
  quantity: number;
  variation_id?: number;
};

export type ExpressCheckoutResult =
  | { kind: "success"; order_id: number; payment_intent_id: string }
  | { kind: "cancelled" }
  // Buyer needs to add a shipping address before we can charge; caller
  // should route them to the address form (typically via the cart flow).
  | { kind: "missing_address" }
  // Anything else — surface the message to the buyer.
  | { kind: "error"; message: string };

// A fresh idempotency token per express attempt. The server dedupes pending
// orders by this token, so two rapid taps still resolve to one order.
const newCheckoutToken = () =>
  `nest_exp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;

// Convert the buyer's address-book entry into the plain WpAddress payload
// the checkout endpoint accepts. Filter out the id / label metadata; those
// aren't part of the WooCommerce shipping shape.
function toWpAddress(a: NestAddressBookEntry, email?: string): NestWpAddress {
  return {
    first_name: a.first_name,
    last_name: a.last_name,
    address_1: a.address_1,
    address_2: a.address_2,
    city: a.city,
    state: a.state,
    postcode: a.postcode,
    country: a.country,
    phone: a.phone,
    email,
  };
}

// Reuse the exact function signatures Stripe exports from useStripe(). This
// keeps the util in lockstep with whichever SDK version is installed and
// avoids re-declaring the sprawling SetupParams / SheetResult unions.
type StripeHookReturn = ReturnType<typeof useStripe>;
type StripeSheetApi = {
  initPaymentSheet: StripeHookReturn["initPaymentSheet"];
  presentPaymentSheet: StripeHookReturn["presentPaymentSheet"];
  setPublishableKey: (key: string) => void;
};

export type ExpressCheckoutOptions = {
  items: ExpressItem[];
  buyerEmail?: string;
  // Injected from the calling screen; keeps this util test-friendly and
  // avoids needing to be inside a StripeProvider to run.
  stripe: StripeSheetApi;
};

// Run a full express-checkout attempt. Caller passes the useStripe() hook
// results + the setPublishableKey setter from the StripePayment context.
export async function runExpressCheckout({ items, buyerEmail, stripe }: ExpressCheckoutOptions): Promise<ExpressCheckoutResult> {
  // 1. Resolve the default shipping address. Missing addresses short-circuit
  //    so the caller can bounce the user into the address form; we don't
  //    want to silently drop them into the wallet with no destination.
  let book: NestAddressBookEntry[] = [];
  try {
    const res = await nest.listAddressBook();
    book = res.items ?? [];
  } catch {
    return { kind: "error", message: "Could not load your saved addresses." };
  }
  const def = book.find((a) => a.is_default) ?? book[0] ?? null;
  if (!def) return { kind: "missing_address" };
  const shipping = toWpAddress(def, buyerEmail);

  // 2. Create the order + PaymentIntent for just this item. The server
  //    picks the cheapest available shipping method automatically when we
  //    omit shipping_method_id, so the buyer sees a single price in the
  //    sheet. Server remains authoritative for every amount.
  let intent: Awaited<ReturnType<typeof nest.createPaymentIntent>>;
  try {
    intent = await nest.createPaymentIntent({
      items,
      shipping_address: shipping,
      checkout_token: newCheckoutToken(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Checkout is temporarily unavailable.";
    return { kind: "error", message: msg };
  }
  if (!intent.client_secret || !intent.publishable_key) {
    return { kind: "error", message: "Checkout is temporarily unavailable. Please try again." };
  }

  // 3. Initialise the native SDK with the live publishable key. This is a
  //    no-op if the key hasn't changed, so it's safe to call every time.
  stripe.setPublishableKey(intent.publishable_key);
  await initStripe({
    publishableKey: intent.publishable_key,
    merchantIdentifier: STRIPE_MERCHANT_ID,
    urlScheme: STRIPE_URL_SCHEME,
  });

  // 4. Build the PaymentSheet with wallets enabled. Apple Pay and Google
  //    Pay show up as prominent express options in the sheet on their
  //    respective platforms; saved cards + new cards still render below.
  const { error: initError } = await stripe.initPaymentSheet({
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
  if (initError) return { kind: "error", message: initError.message || "Could not start checkout." };

  // 5. Present the sheet and let the wallet handle the rest.
  const { error: sheetError } = await stripe.presentPaymentSheet();
  if (sheetError) {
    if (sheetError.code === PaymentSheetError.Canceled) return { kind: "cancelled" };
    return { kind: "error", message: sheetError.message || "Payment could not be completed." };
  }

  // 6. Resolve the REAL order id. Under plugin v3.13.39+ the WC order does
  //    not exist at create-intent time (`intent.order_id` is 0), so we must
  //    read it back from completeCheckout's response. Retry briefly if the
  //    webhook hasn't materialized the order yet. Webhook remains the source
  //    of truth for order state; this loop just resolves the id.
  let resolvedOrderId = 0;
  const start = Date.now();
  while (Date.now() - start < 10000 && resolvedOrderId <= 0) {
    try {
      const resp = await nest.completeCheckout({
        order_id: 0, // Server ignores; uses payment_intent_id.
        payment_intent_id: intent.payment_intent_id,
      });
      if (resp && typeof resp.order_id === "number" && resp.order_id > 0) {
        resolvedOrderId = resp.order_id;
        break;
      }
    } catch {
      /* transient — retry */
    }
    await new Promise((r) => setTimeout(r, 750));
  }

  return { kind: "success", order_id: resolvedOrderId, payment_intent_id: intent.payment_intent_id };
}
