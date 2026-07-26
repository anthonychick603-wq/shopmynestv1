// Nest WordPress API client — talks directly to shopmynest.com custom REST namespaces.
// Mirrors the contracts used by the v1.0.7 mobile app (src/lib/api.js) so the
// site's mynest-mobile-app-bridge + mynest-unified-marketplace plugins keep working.
import { storage } from "@/src/utils/storage";

const SITE_URL = (process.env.EXPO_PUBLIC_SITE_URL || "https://shopmynest.com").replace(/\/+$/, "");
const NS = {
  marketplace: "/wp-json/the-nest/v1",
  ops: "/wp-json/nest-ops/v1",
  checkout: "/wp-json/nest-native/v1",
  labels: "/wp-json/nest-labels/v1",
  shipping: "/wp-json/nest-shipping/v1",
  trust: "/wp-json/nest-trust/v1",
  connect: "/wp-json/nest-connect/v1",
} as const;

export const AUTH_TOKEN_KEY = "nest.auth.token";
const DEFAULT_TIMEOUT_MS = 25000;

export class ApiError extends Error {
  status: number;
  code: string;
  friendly: string;
  data?: any;
  constructor(message: string, status = 0, code = "request_failed", data?: any) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data;
    this.friendly = friendlyFor(status, code, message);
  }
}

function friendlyFor(status: number, code: string, message: string): string {
  // A 401 from /auth/login means the credentials were wrong, not that a session
  // lapsed — pass the server's wording through instead of telling a signed-out
  // user to sign in again.
  if ((status === 401 && code !== "invalid_credentials") || code === "rest_login_required") {
    return "Your session has expired. Please sign in again.";
  }
  if (code === "stripe_tax_calculation_warning" || /taxes have not been calculated/i.test(message)) {
    return "Shipping tax couldn't be calculated right now — retry in a moment.";
  }
  if (status === 402) return "We could not complete your payment. Your cart has been saved.";
  if (status >= 500) {
    const hasSpecific = code !== "invalid_json" && !!message && !/^HTTP \d+$/.test(message);
    return hasSpecific ? message : "The website is having trouble responding. Please try again.";
  }
  return message || "Something went wrong. Please try again.";
}

type Namespace = keyof typeof NS;
type ReqOpts = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  query?: Record<string, unknown>;
  body?: unknown;
  formData?: FormData;
  timeoutMs?: number;
  auth?: boolean;
};

async function readToken(): Promise<string | null> {
  return storage.secureGet<string>(AUTH_TOKEN_KEY, "");
}

export async function setAuthToken(token: string | null) {
  if (token) await storage.secureSet(AUTH_TOKEN_KEY, token);
  else await storage.secureRemove(AUTH_TOKEN_KEY);
}

function makeUrl(ns: Namespace, path: string, query?: Record<string, unknown>): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  const params = new URLSearchParams();
  Object.entries(query || {}).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    if (Array.isArray(v)) v.forEach((x) => params.append(k, String(x)));
    else params.set(k, String(v));
  });
  const qs = params.toString();
  return `${SITE_URL}${NS[ns]}${clean}${qs ? `?${qs}` : ""}`;
}

async function request<T = unknown>(ns: Namespace, path: string, opts: ReqOpts = {}): Promise<T> {
  const { method = "GET", query, body, formData, timeoutMs = DEFAULT_TIMEOUT_MS, auth = true } = opts;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (auth) {
    const t = await readToken();
    if (t) {
      headers.Authorization = `Bearer ${t}`;
      headers["X-MyNest-Token"] = t;
    }
  }
  if (!formData && body !== undefined) headers["Content-Type"] = "application/json";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(makeUrl(ns, path, query), {
      method,
      headers,
      body: formData || (body !== undefined ? JSON.stringify(body) : undefined),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      throw new ApiError(text.slice(0, 200) || "Bad response", res.status, "invalid_json");
    }
    if (!res.ok) {
      throw new ApiError(data?.message || data?.error || `HTTP ${res.status}`, res.status, data?.code || "request_failed", data);
    }
    return data as T;
  } catch (e) {
    clearTimeout(timer);
    if (e instanceof ApiError) throw e;
    if ((e as any)?.name === "AbortError") throw new ApiError("The website took too long to respond.", 0, "request_timeout");
    throw new ApiError("Could not reach the website. Check your connection.", 0, "network_error");
  }
}

// ---------------------------------------------------------------------------
// Public API — endpoint methods
// ---------------------------------------------------------------------------
export const nest = {
  // Auth
  login: (login: string, password: string) =>
    request<{ token: string; user: NestUserRaw }>("marketplace", "/auth/login", {
      method: "POST",
      body: { login, password },
      auth: false,
    }),
  register: (payload: { email: string; username: string; password: string; display_name?: string; name?: string; first_name?: string; last_name?: string }) =>
    request<{ token: string; user: NestUserRaw }>("marketplace", "/auth/register", {
      method: "POST",
      body: payload,
      auth: false,
    }),
  logout: () => request<{ ok: boolean }>("marketplace", "/auth/logout", { method: "POST" }),
  me: () => request<NestUserRaw>("marketplace", "/auth/me"),
  updateMe: (payload: Record<string, unknown>) =>
    request<NestUserRaw>("marketplace", "/auth/me", { method: "PATCH", body: payload }),

  // Config
  getConfig: () => request<NestConfig>("marketplace", "/config", { auth: false }),
  mobileHealth: () => request<{ ok: boolean; version: string; authenticated: boolean }>("marketplace", "/mobile-health", { auth: false }),

  // Catalog
  getCategories: () => request<NestCategoryRaw[]>("marketplace", "/categories", { auth: false }),
  getProducts: (query?: Record<string, unknown>) => request<NestPaginated<NestProductRaw>>("marketplace", "/products", { query, auth: false }),
  getProduct: (id: number | string) => request<NestProductRaw>("marketplace", `/products/${id}`, { auth: false }),
  getFeed: (query?: Record<string, unknown>) => request<NestPaginated<NestFeedItemRaw> & { mode: string }>("marketplace", "/feed", { query }),
  // Publishes a Nest social post (seller-only; 403 otherwise). Returns the created
  // post shaped identically to a feed post item.
  createPost: (payload: { title: string; content: string; image_id?: number }) =>
    request<NestFeedItemRaw>("marketplace", "/posts", { method: "POST", body: payload }),
  // Post comments (native WP comments via plugin v3.6.0). GET is public; POST requires auth.
  getPostComments: (id: number | string, query?: { page?: number; per_page?: number }) =>
    request<{ comments: NestPostCommentRaw[]; total: number; pages: number }>("marketplace", `/posts/${id}/comments`, { query, auth: false }),
  addPostComment: (id: number | string, content: string) =>
    request<NestPostCommentRaw>("marketplace", `/posts/${id}/comments`, { method: "POST", body: { content } }),
  // -------------------------------------------------------------------------
  // Blog (the-nest/v1/blog) — any logged-in user may submit a caption + photo;
  // posts stay pending until an admin approves them, so the public feed only
  // ever returns approved posts.
  // -------------------------------------------------------------------------
  getBlogPosts: (query?: { page?: number; per_page?: number }) =>
    request<NestBlogPostsRaw>("marketplace", "/blog/posts", { query, auth: false }),
  // Multipart: `caption` + optional `image` file part.
  createBlogPost: (formData: FormData) =>
    request<NestBlogPostRaw>("marketplace", "/blog/posts", { method: "POST", formData, timeoutMs: 60000 }),
  getBlogModerationPosts: (query?: { status?: "pending" | "approved" | "rejected"; page?: number; per_page?: number }) =>
    request<NestBlogPostsRaw>("marketplace", "/blog/moderation/posts", { query }),
  approveBlogPost: (id: number | string) =>
    request<NestBlogPostRaw>("marketplace", `/blog/moderation/posts/${id}/approve`, { method: "POST" }),
  rejectBlogPost: (id: number | string) =>
    request<NestBlogPostRaw>("marketplace", `/blog/moderation/posts/${id}/reject`, { method: "POST" }),

  getSeller: (id: number | string) => request<NestSellerRaw>("marketplace", `/sellers/${id}`),
  getSellerProducts: (id: number | string, query?: Record<string, unknown>) =>
    request<NestPaginated<NestProductRaw>>("marketplace", `/sellers/${id}/products`, { query, auth: false }),
  followSeller: (id: number | string) => request<{ ok: boolean }>("marketplace", `/sellers/${id}/follow`, { method: "POST" }),
  unfollowSeller: (id: number | string) => request<{ ok: boolean }>("marketplace", `/sellers/${id}/follow`, { method: "DELETE" }),
  reportProduct: (id: number | string, reason: string, details: string) =>
    request<{ success: boolean; report_id: number }>("marketplace", `/products/${id}/report`, { method: "POST", body: { reason, details } }),

  // Orders
  getBuyerOrders: (query?: Record<string, unknown>) =>
    request<{ orders: NestOrderRaw[]; page: number; total: number; total_pages: number }>("marketplace", "/orders", { query }),
  getBuyerOrder: (id: number | string) => request<NestOrderRaw>("marketplace", `/orders/${id}`),

  // Notifications
  getNotifications: (query?: Record<string, unknown>) =>
    request<{ items: NestNotificationRaw[]; total: number; unread?: number }>("marketplace", "/notifications", { query }),
  markNotificationsRead: (ids?: number[]) =>
    request<{ ok: boolean }>("marketplace", "/notifications/read", { method: "POST", body: { ids: ids || [] } }),

  // Seller
  submitSellerApplication: (payload: Record<string, unknown>) =>
    request<{ ok: boolean; application_id: number }>("marketplace", "/seller/application", { method: "POST", body: payload }),
  getSellerApplicationStatus: () =>
    request<{ status: "none" | "pending" | "approved" | "rejected"; application_id?: number; submitted_at?: string }>("marketplace", "/seller/application/status"),
  getSellerDashboard: () => request<NestSellerDashboardRaw>("marketplace", "/seller/dashboard"),
  getMyProducts: (query?: Record<string, unknown>) =>
    request<NestPaginated<NestProductRaw>>("marketplace", "/seller/products", { query }),
  getSellerOrders: (query?: Record<string, unknown>) =>
    request<{ orders: NestSellerOrderRaw[]; page: number; total: number; total_pages: number }>("marketplace", "/seller/orders", { query }),

  // Seller product management (create/edit/delete) — the-nest/v1/seller/products.
  createProduct: (payload: NestProductWritePayload) =>
    request<NestProductRaw>("marketplace", "/seller/products", { method: "POST", body: payload }),
  updateProduct: (id: number | string, payload: NestProductWritePayload) =>
    request<NestProductRaw>("marketplace", `/seller/products/${id}`, { method: "PUT", body: payload }),
  // Reads a product's stored shipping meta (package_size + real dimensions) so the
  // edit form can pre-fill the size selector and dimension inputs accurately.
  getProductShipping: (id: number | string) =>
    request<{ shipping: NestProductShippingRaw }>("shipping", `/seller/products/${id}/shipping`),
  deleteProduct: (id: number | string) =>
    request<{ success: boolean }>("marketplace", `/seller/products/${id}`, { method: "DELETE" }),
  // Multipart image upload. Field name must be `file`. Returns the attachment id
  // to attach to a product via `image_id`.
  uploadMedia: (formData: FormData) =>
    request<NestMediaRaw>("marketplace", "/media", { method: "POST", formData, timeoutMs: 60000 }),

  // Seller order fulfillment — PUT the-nest/v1/seller/orders/{id}.
  updateSellerOrder: (id: number | string, payload: { status: string; tracking_number?: string }) =>
    request<NestSellerOrderRaw>("marketplace", `/seller/orders/${id}`, { method: "PUT", body: payload }),

  // -------------------------------------------------------------------------
  // Shippo shipping labels (nest-labels/v1) — seller buys a real label and
  // prints/shares the PDF. Auth via the same bearer token as the other seller
  // mutations. Endpoints:
  //   POST /seller/orders/{id}/rates  → live carrier rates (or 409 if a label
  //        already exists — surfaced as { kind: "existing", label }).
  //   POST /seller/orders/{id}/label  → buy the label for a chosen rate.
  //   GET  /seller/orders/{id}/label  → the current label (empty fields = none).
  // -------------------------------------------------------------------------
  getShippingRates: async (orderId: number | string): Promise<NestShippingRatesResult> => {
    try {
      const res = await request<NestShippingRatesRaw>("labels", `/seller/orders/${orderId}/rates`, { method: "POST", body: {} });
      return { kind: "rates", ...res };
    } catch (e) {
      // The backend returns 409 with the existing label nested under the
      // WP_Error data (body.data.label) rather than an error the user must act on.
      if (e instanceof ApiError && e.status === 409) {
        const label = e.data?.data?.label as NestShippingLabel | undefined;
        if (label) return { kind: "existing", label };
      }
      throw e;
    }
  },
  buyShippingLabel: (orderId: number | string, rate: NestLabelRate) =>
    request<NestBuyLabelRaw>("labels", `/seller/orders/${orderId}/label`, {
      method: "POST",
      body: {
        rate: rate.object_id,
        provider: rate.provider,
        service: rate.servicelevel?.name ?? "",
        amount: rate.amount,
        currency: rate.currency,
      },
    }),
  getShippingLabel: (orderId: number | string) =>
    request<NestGetLabelRaw>("labels", `/seller/orders/${orderId}/label`),

  // Earnings + payouts — the-nest/v1/seller/{earnings,payouts}.
  getSellerEarnings: (query?: Record<string, unknown>) =>
    request<NestSellerEarningsRaw>("marketplace", "/seller/earnings", { query }),
  getSellerPayouts: () => request<NestSellerPayoutsRaw>("marketplace", "/seller/payouts"),
  requestPayout: (payload: { amount?: number; method?: string; destination?: string } = {}) =>
    request<{ success: boolean; payout: NestPayoutRaw }>("marketplace", "/seller/payouts", { method: "POST", body: payload }),

  // -------------------------------------------------------------------------
  // Stripe Connect Express (nest-connect/v1) — sellers link a real bank account
  // via Stripe-hosted onboarding, then view balance/payout history in the
  // Stripe-hosted Express dashboard. Same bearer auth as the other seller calls.
  //   POST /onboard-link   → Stripe onboarding URL (needs return/refresh URLs).
  //   GET  /status         → connection + charges/payouts enabled flags.
  //   POST /dashboard-link → Stripe Express dashboard login URL.
  // -------------------------------------------------------------------------
  getStripeConnectOnboardLink: (returnUrl: string, refreshUrl: string) =>
    request<NestConnectOnboardLink>("connect", "/onboard-link", {
      method: "POST",
      body: { return_url: returnUrl, refresh_url: refreshUrl },
    }),
  getStripeConnectStatus: () => request<NestConnectStatus>("connect", "/status"),
  getStripeConnectDashboardLink: () =>
    request<NestConnectDashboardLink>("connect", "/dashboard-link", { method: "POST" }),

  // Ops
  getAddresses: () => request<{ billing: NestWpAddress; shipping: NestWpAddress }>("ops", "/addresses"),
  saveAddresses: (payload: { billing?: NestWpAddress; shipping?: NestWpAddress }) =>
    request<{ ok: boolean }>("ops", "/addresses", { method: "POST", body: payload }),
  registerDeviceToken: (payload: { token: string; platform: string }) =>
    request<{ ok: boolean }>("ops", "/device-token", { method: "POST", body: payload }),

  // Native Stripe PaymentSheet checkout (nest-native/v1).
  // Passing a destination address unlocks real live carrier rates (shipping_rates);
  // without one the server returns the historical flat estimate only.
  quoteCheckout: (items: { product_id: number; quantity: number }[], shippingAddress: NestWpAddress | null) =>
    request<NestQuoteRaw>("checkout", "/checkout/quote", { method: "POST", body: { items, shipping_address: shippingAddress } }),
  // Creates the WC order + Stripe PaymentIntent (and Customer + ephemeral key)
  // straight from the current cart items. Returns everything PaymentSheet needs.
  // The server re-computes shipping from shipping_address + shipping_method_id and
  // only trusts the picked id (never a client amount).
  createPaymentIntent: (payload: {
    items: { product_id: number; quantity: number }[];
    billing?: NestWpAddress;
    shipping?: NestWpAddress;
    shipping_address?: NestWpAddress;
    shipping_method_id?: string;
    quote_token?: string;
    // Idempotency key for one checkout attempt. The server looks up a pending
    // order already stamped with this token and reuses it (and its PaymentIntent)
    // instead of creating a duplicate.
    checkout_token?: string;
  }) =>
    request<NestPaymentIntentRaw>("checkout", "/checkout/create-intent", { method: "POST", body: payload, timeoutMs: 45000 }),
  // Best-effort confirmation after PaymentSheet succeeds. The Stripe webhook is
  // the source of truth, so callers should not block navigation on this.
  completeCheckout: (payload: { order_id: number; payment_intent_id: string }) =>
    request<{ ok: boolean; status?: string; order_id: number; payment_status?: string }>("checkout", "/checkout/complete", { method: "POST", body: payload }),

  // -------------------------------------------------------------------------
  // Trust & Growth Suite (nest-trust/v1) — favorites, personalized feed,
  // seller badges, disputes, bundles/offers, boosts + Pro seller tier.
  // Kept namespaced under `nest.trust.*` to avoid collision with the base
  // marketplace `/feed` and `/sellers/*` routes above.
  // -------------------------------------------------------------------------
  trust: {
    // Favorites
    listFavorites: () => request<NestFavoritesRaw>("trust", "/favorites"),
    toggleFavorite: (product_id: number | string) =>
      request<NestFavoriteToggleRaw>("trust", "/favorites", { method: "POST", body: { product_id: Number(product_id) } }),
    removeFavorite: (product_id: number | string) =>
      request<NestFavoriteToggleRaw>("trust", `/favorites/${product_id}`, { method: "DELETE" }),
    getFavoritesCount: (product_id: number | string) =>
      request<{ product_id: number; count: number }>("trust", `/products/${product_id}/favorites-count`, { auth: false }),

    // Personalized feed (distinct from marketplace `/feed`)
    getPersonalizedFeed: (query?: Record<string, unknown>) =>
      request<NestPersonalizedFeedRaw>("trust", "/feed", { query }),

    // Seller performance badge + Pro seller
    getSellerBadge: (id: number | string) => request<NestBadgeRaw>("trust", `/sellers/${id}/badge`, { auth: false }),
    getProStatus: (id: number | string) => request<NestProStatusRaw>("trust", `/sellers/${id}/pro-status`, { auth: false }),

    // Disputes / buyer protection
    createDispute: (payload: {
      order_id: number;
      reason: string;
      description: string;
      contacted_seller_at?: string;
      evidence?: string[];
    }) => request<{ dispute: NestDisputeRaw; warning: string | null }>("trust", "/disputes", { method: "POST", body: payload }),
    listDisputes: (query?: { status?: string }) => request<NestDisputeListRaw>("trust", "/disputes", { query }),
    getDispute: (id: number | string) => request<NestDisputeRaw>("trust", `/disputes/${id}`),
    updateDispute: (id: number | string, payload: { resolution_note?: string; status?: string; refund_amount?: number }) =>
      request<NestDisputeRaw>("trust", `/disputes/${id}`, { method: "PUT", body: payload }),
    escalateDispute: (id: number | string) =>
      request<NestDisputeRaw>("trust", `/disputes/${id}/escalate`, { method: "POST" }),

    // Bundles + Make an Offer
    createOffer: (payload: { type: "single" | "bundle"; product_ids: number[]; offer_price: number }) =>
      request<NestOfferRaw>("trust", "/offers", { method: "POST", body: payload }),
    listOffers: (query?: { status?: string }) => request<NestOfferListRaw>("trust", "/offers", { query }),
    updateOffer: (
      id: number | string,
      payload: { action: "accept" | "decline" | "counter"; counter_price?: number },
    ) => request<NestOfferRaw>("trust", `/offers/${id}`, { method: "PUT", body: payload }),
    // Native/API client accepted-offer checkout: creates a real WC_Order at the
    // negotiated price and returns the native Stripe PaymentSheet payload
    // (same shape as cart checkout) so payment happens in-app.
    startOfferCheckoutOrder: (token: string) =>
      request<NestPaymentIntentRaw>("trust", "/offers/checkout/order", { method: "POST", body: { token } }),

    // Boosts
    createBoost: (payload: { product_id: number; tier: string }) =>
      request<NestBoostRaw>("trust", "/boosts", { method: "POST", body: payload }),
  },
};

// WebView checkout URL. Since we're in Expo Go, we open the site's own /checkout/
// with a `?mynest_token=<token>` query param — the mynest-mobile-app-bridge plugin
// picks that up and hydrates the WordPress session so the cart shows up.
// The site's /cart/ page adds items via the ?add-to-cart= URL param.
export function checkoutUrlForCart(token: string, items: { product_id: number; quantity: number }[]): string {
  const first = items[0];
  if (!first) return `${SITE_URL}/checkout/?mynest_token=${encodeURIComponent(token)}`;
  const params = new URLSearchParams({
    "add-to-cart": String(first.product_id),
    quantity: String(first.quantity),
    mynest_token: token,
  });
  return `${SITE_URL}/cart/?${params.toString()}`;
}

export const SITE = SITE_URL;

// ---------------------------------------------------------------------------
// Response shapes (what WordPress actually returns)
// ---------------------------------------------------------------------------
export type NestUserRaw = {
  id: number;
  email: string;
  name?: string;
  display_name?: string;
  first_name?: string;
  last_name?: string;
  avatar?: string;
  is_seller?: boolean;
  // True for approved sellers AND for site admins/store managers, mirroring the
  // backend's seller permission gate. This is the only "can manage the store"
  // signal the API exposes to the app.
  is_approved_seller?: boolean;
  // null for non-sellers.
  seller_id?: number | null;
  seller_status?: string;
  store_name?: string;
  photo_url?: string;
};

export type NestSellerRaw = {
  id: number;
  store_name?: string;
  avatar?: string;
  is_pro?: boolean;
  badge?: string;
  bio?: string;
  // GET /sellers/{id} now also returns that seller's most recent posts.
  posts?: NestFeedItemRaw[];
};

export type NestCategoryRaw = { id: number; name: string; slug: string; count?: number; parent?: number; image?: string };

export type NestProductRaw = {
  id: number;
  name: string;
  slug?: string;
  description?: string;
  short_description?: string;
  price: number;
  regular_price?: number;
  sale_price?: number;
  price_html?: string;
  currency?: string;
  stock_status?: "instock" | "outofstock";
  stock_quantity?: number | null;
  image?: string;
  gallery?: string[];
  permalink?: string;
  seller?: NestSellerRaw;
  categories?: { id: number; name: string; slug: string }[];
};

export type NestFeedItemRaw = {
  type: "product" | "post";
  id: number;
  title: string;
  content?: string;
  excerpt?: string;
  image?: string;
  permalink?: string;
  date?: string;
  price?: number;
  price_html?: string;
  author?: NestSellerRaw;
  comments?: number;
  stock_status?: string;
  stock_quantity?: number | null;
};

export type NestBlogPostRaw = {
  id: number;
  status: "pending" | "approved" | "rejected";
  caption: string;
  image_id?: number;
  image?: string | null;
  thumbnail?: string | null;
  author: { id: number; name: string; avatar?: string };
  created_at?: string;
};

export type NestBlogPostsRaw = {
  items: NestBlogPostRaw[];
  page?: number;
  per_page?: number;
  total: number;
  total_pages?: number;
};

export type NestPostCommentRaw = {
  id: number;
  content: string;
  created_at: string;
  author: { id: number; name: string; avatar: string };
};

export type NestPaginated<T> = { items: T[]; page?: number; total: number; total_pages?: number };

export type NestWpAddress = {
  first_name?: string;
  last_name?: string;
  address_1?: string;
  address_2?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
  email?: string;
  phone?: string;
};

export type NestOrderItemRaw = {
  item_id: number;
  product_id: number;
  variation_id?: number;
  name: string;
  quantity: number;
  subtotal: number;
  total: number;
  tax: number;
  image?: string;
  seller_id?: number;
  seller_name?: string;
};

export type NestOrderRaw = {
  id: number;
  number: string;
  status: string;
  date_created?: string;
  currency: string;
  subtotal: number;
  shipping_total: number;
  tax_total: number;
  discount_total: number;
  total: number;
  payment_method?: string;
  shipping_method?: string;
  billing: NestWpAddress;
  shipping: NestWpAddress;
  items: NestOrderItemRaw[];
  tracking?: { seller_id: number; seller_name: string; number: string; status: string }[];
  customer_note?: string;
};

export type NestNotificationRaw = {
  id: number;
  type: string;
  title: string;
  body: string;
  read?: boolean;
  read_at?: string | null;
  created_at?: string;
  date?: string;
  meta?: Record<string, unknown>;
};

export type NestConfig = {
  name: string;
  version: string;
  site_url: string;
  currency: string;
  fee: { percent: number; label: string };
  pages: Record<string, string>;
  features: Record<string, boolean>;
  authenticated: boolean;
  user: NestUserRaw | null;
};

// A single selectable shipping option returned by /checkout/quote.
export type NestShippingRate = { id: string; label: string; amount: number };

export type NestQuoteRaw = {
  quote_token: string;
  currency: string;
  subtotal: number;
  shipping: number;
  tax: number;
  tax_estimated?: boolean;
  discount?: number;
  total: number;
  items?: { product_id: number; name: string; image?: string; quantity: number; unit_price: number; line_total: number }[];
  // Present only when a destination address was supplied; the cheapest is
  // mirrored into `shipping`.
  shipping_rates?: NestShippingRate[];
  // Present when live rates failed and the flat estimate fallback was used;
  // a short diagnostic string for the site owner.
  debug_reason?: string;
};

export type NestPaymentIntentRaw = {
  publishable_key: string;
  client_secret: string;
  order_id: number;
  payment_intent_id: string;
  customer_id: string;
  ephemeral_key_secret: string;
  amount: number;
  currency: string;
  // Server-resolved shipping selection (present on the native checkout intent).
  shipping_total?: number;
  shipping_label?: string;
  shipping_method_id?: string;
  // True when the picked rate was gone and the server fell back to cheapest.
  shipping_selection_changed?: boolean;
};

// Stored shipping meta for a product (nest-shipping/v1). Dimensions come back as
// normalized decimal strings; package_size is always one of the allowed presets
// or "custom".
export type NestProductShippingRaw = {
  weight_oz: string;
  length_in: string;
  width_in: string;
  height_in: string;
  package_size: "small" | "medium" | "large" | "custom";
  shipping_profile: string;
  processing_time: string;
};

// Product create/update payload accepted by the-nest/v1/seller/products.
// Shipping keys (weight/dimensions/package_size) persist on both create and edit.
export type NestProductWritePayload = {
  name?: string;
  description?: string;
  price?: number | string;
  stock?: number;
  sku?: string;
  status?: "publish" | "draft" | "pending";
  category_ids?: number[];
  image_id?: number;
  weight_oz?: number | string;
  length_in?: number | string;
  width_in?: number | string;
  height_in?: number | string;
  package_size?: "small" | "medium" | "large" | "custom";
  processing_time?: string;
};

export type NestMediaRaw = { id: number; url: string; thumbnail?: string; mime_type?: string };

// GET /seller/orders row shape (seller-scoped; distinct from buyer NestOrderRaw).
export type NestSellerOrderItemRaw = {
  item_id: number;
  product_id: number;
  variation_id?: number;
  name: string;
  quantity: number;
  gross: number;
  tax: number;
  platform_fee: number;
  net: number;
};
export type NestSellerOrderRaw = {
  id: number;
  number: string;
  status: string;
  seller_status: string;
  tracking_number: string;
  date_created: string | null;
  customer: { name: string; email: string; phone: string; address: string };
  items: NestSellerOrderItemRaw[];
  gross: number;
  platform_fee: number;
  net_before_shipping: number;
  currency: string;
};

export type NestBalances = {
  pending: number;
  available: number;
  reserved: number;
  paid: number;
  currency: string;
};

export type NestLedgerEntryRaw = {
  id: number;
  order_id: number;
  order_item_id: number;
  payout_id: number;
  status: string;
  gross: number;
  platform_fee: number;
  tax: number;
  shipping: number;
  net: number;
  currency?: string;
  created_at?: string;
};

export type NestSellerEarningsRaw = {
  balances: NestBalances;
  ledger: { entries: NestLedgerEntryRaw[]; page: number; total: number; total_pages: number };
};

export type NestPayoutRaw = {
  id: number;
  seller_id: number;
  amount: number;
  currency: string;
  method: string;
  destination: string;
  status: string;
  notes?: string;
  requested_at?: string;
  processed_at?: string | null;
};

export type NestSellerPayoutsRaw = {
  balances: NestBalances;
  payouts: NestPayoutRaw[];
  minimum: number;
};

// ---------------------------------------------------------------------------
// Stripe Connect Express (nest-connect/v1)
// ---------------------------------------------------------------------------
export type NestConnectStatus = {
  connected: boolean;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
};
export type NestConnectOnboardLink = { url: string };
export type NestConnectDashboardLink = { url: string };

export type NestSellerDashboardRaw = {
  store_name?: string;
  totals?: { orders?: number; revenue?: number; earnings?: number; pending?: number };
  recent_orders?: NestOrderRaw[];
  products?: NestProductRaw[];
};

// ---------------------------------------------------------------------------
// Trust & Growth Suite response shapes (nest-trust/v1)
// ---------------------------------------------------------------------------

// GET /favorites — the live plugin (TNM_Trust_Favorites::get_user_favorites)
// returns a plain array of `{ product_id, created_at }` objects. We still accept
// raw-ID arrays and `{product_ids}`/`{favorites}` envelopes defensively and
// normalize in the favorites context.
type NestFavoriteRow = number | { product_id: number; created_at?: string };
export type NestFavoritesRaw =
  | NestFavoriteRow[]
  | { product_ids?: number[]; favorites?: NestFavoriteRow[] };

export type NestFavoriteToggleRaw = { product_id?: number; favorited?: boolean; count?: number };

// GET /feed — ranked WooCommerce products. Shape mirrors the base paginated
// products/feed responses; we handle both product- and feed-item-shaped rows.
export type NestPersonalizedFeedRaw = {
  items?: Array<NestProductRaw | NestFeedItemRaw>;
  page?: number;
  per_page?: number;
  total?: number;
  total_pages?: number;
};

export type NestBadgeTier = "none" | "rising_seller" | "trusted_seller";
export type NestBadgeRaw = {
  tier: NestBadgeTier;
  tier_label: string;
  metrics: {
    on_time_rate?: number;
    avg_rating?: number;
    response_rate?: number;
    completed_orders?: number;
    gmv?: number;
  };
  meets_minimum_volume: boolean;
};

export type NestProStatusRaw = { seller_id: number; pro_seller: boolean };

export type NestDisputeRaw = {
  id: number;
  order_id: number;
  status: string;
  reason?: string;
  description?: string;
  resolution_note?: string | null;
  refund_amount?: number | null;
  evidence?: string[];
  buyer_id?: number;
  seller_id?: number;
  contacted_seller_at?: string | null;
  created_at?: string;
  updated_at?: string;
  can_escalate?: boolean;
};
export type NestDisputeListRaw = NestDisputeRaw[] | { disputes: NestDisputeRaw[] };

export type NestOfferRaw = {
  id: number;
  type: "single" | "bundle";
  status: string;
  product_ids: number[];
  products?: NestProductRaw[];
  offer_price: number;
  counter_price?: number | null;
  seller_id?: number;
  buyer_id?: number;
  checkout_token?: string | null;
  expires_at?: string | null;
  created_at?: string;
};
export type NestOfferListRaw = NestOfferRaw[] | { offers: NestOfferRaw[] };

// Boost purchase returns the native Stripe PaymentSheet payload (same shape as
// cart checkout) plus the created boost row id so the boost activates in-app.
export type NestBoostRaw = NestPaymentIntentRaw & { boost_id: number };

// ---------------------------------------------------------------------------
// Shipping labels (nest-labels/v1) — Shippo-backed
// ---------------------------------------------------------------------------

// A single Shippo rate row returned by POST /seller/orders/{id}/rates. Only the
// fields the app reads are typed; Shippo returns more.
export type NestLabelRate = {
  object_id: string;
  amount: string;
  currency: string;
  provider: string;
  provider_image_75?: string;
  provider_image_200?: string;
  servicelevel?: { name?: string; token?: string; terms?: string };
  estimated_days?: number;
  duration_terms?: string;
};

// The persisted label payload (mnu_labels_payload). Empty strings mean "no label
// yet". `status` is "success" once the label PDF is ready.
export type NestShippingLabel = {
  label_url: string;
  tracking_number: string;
  carrier: string;
  service: string;
  amount: string;
  currency: string;
  transaction: string;
  status: "success" | "queued" | "waiting" | "";
  test_mode: boolean;
};

// Raw success body of POST /rates.
export type NestShippingRatesRaw = {
  seller_id: number;
  shipment: Record<string, unknown>;
  rates: NestLabelRate[];
  parcel: Record<string, unknown>;
  test_mode: boolean;
};

// getShippingRates normalizes the 409 "already has a label" case into a discriminated union.
export type NestShippingRatesResult =
  | ({ kind: "rates" } & NestShippingRatesRaw)
  | { kind: "existing"; label: NestShippingLabel };

// Raw body of POST /label (buy).
export type NestBuyLabelRaw = {
  ok: boolean;
  existing?: boolean;
  seller_id: number;
  status: string;
  label: NestShippingLabel;
};

// Raw body of GET /label.
export type NestGetLabelRaw = {
  seller_id: number;
  label: NestShippingLabel;
};
