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
  bridge: "/wp-json/mobile-app-bridge/v1",
} as const;

export const AUTH_TOKEN_KEY = "nest.auth.token";
const DEFAULT_TIMEOUT_MS = 25000;

export class ApiError extends Error {
  status: number;
  code: string;
  friendly: string;
  data?: any;
  // v1.0.133 — verify.tsx reads err.body for the server's structured
  // payload on signup verify failures. Kept optional so existing call
  // sites that only look at .data / .friendly are unaffected. The
  // request() layer sets `body` to the raw JSON body when a non-2xx
  // response includes one.
  body?: any;
  constructor(message: string, status = 0, code = "request_failed", data?: any) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data;
    this.body = data;
    this.friendly = friendlyFor(status, code, message);
  }
}

// v1.0.174 — Belt-and-braces sanitization. Some screens (e.g. Payout bank
// account, Earnings, Seller dashboard) render `err.friendly` inline in an
// error card, not just through the toast host. The toast layer already
// scrubs server dumps, but any inline surface would happily paint raw
// WordPress.com `.wpcomsh-fatal` CSS blocks or PHP stack traces onto the
// screen (see 2026-08-31 report: full CSS ruleset rendered on the Payout
// bank account screen). Scrubbing here means every screen — current and
// future — gets a safe message no matter how it displays it.
function looksLikeServerDump(raw: string): boolean {
  if (!raw) return false;
  if (raw.length > 600) return true; // no legit REST error message is 600+ chars
  return (
    /<\s*(?:!doctype|html|head|body|style|script|div|meta|link)\b/i.test(raw) ||
    /wpcomsh-fatal|wpcomsh-[\w-]+\s*\{|php\s+(?:fatal\s+)?(?:error|warning|notice)|stack\s+trace:|call\s+to\s+undefined|\/wp-(?:includes|content|admin)\/|font-family\s*:\s*-apple-system|BlinkMacSystemFont|text-wrap-style/i.test(raw)
  );
}

function friendlyFor(status: number, code: string, message: string): string {
  // v1.0.174 — hard bail: if the "message" from the server is actually a
  // fatal-page dump (HTML/CSS/PHP trace), never surface any of it. This runs
  // before all other branches so no downstream fallthrough can leak it.
  if (looksLikeServerDump(message)) {
    return "The website is having trouble responding. Please try again.";
  }
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
  // v1.0.102 — invalid_json means the server returned non-JSON (WP fatal,
  // proxy error page, host maintenance HTML). None of that is fit to show
  // the user; collapse to the same generic sorry copy 5xx uses regardless
  // of the numeric status, since even a 200 response can be a fatal page.
  if (code === "invalid_json") {
    return "The website is having trouble responding. Please try again.";
  }
  // v1.0.150 — bare 404s from a WP_Error that the plugin returns for a stale
  // or trashed product/order/coupon ID should never appear as a user-facing
  // toast on the seller dashboard or anywhere else. These are almost always
  // background hydration failures (a cart item, a favorite, a saved search,
  // a boost target) where the ID no longer exists. Downgrade to a calm,
  // non-alarming message; the callsite decides whether to show it at all.
  if (status === 404) {
    if (code === "product_not_found" || /^product not found\.?$/i.test(message)) {
      return "That listing is no longer available.";
    }
    if (code === "order_not_found" || /^order not found\.?$/i.test(message)) {
      return "That order is no longer available.";
    }
    if (code === "coupon_not_found" || /^coupon not found\.?$/i.test(message)) {
      return "That coupon is no longer available.";
    }
    if (code === "seller_not_found" || /^seller not found\.?$/i.test(message)) {
      return "That shop is no longer available.";
    }
  }
  if (status >= 500) {
    const hasSpecific = !!message && !/^HTTP \d+$/.test(message);
    return hasSpecific ? message : "The website is having trouble responding. Please try again.";
  }
  return message || "Something went wrong. Please try again.";
}

// v1.0.174 — exported for unit-testing the sanitizer in isolation.
export const __test_looksLikeServerDump = looksLikeServerDump;

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

  // v1.0.42 — pull-to-refresh on the Blog tab was still returning stale JSON
  // after an admin approved a new post. React Native's fetch reuses the
  // platform HTTP cache when the URL and headers are identical, so the
  // server's Cache-Control: no-store didn't help. Force every GET to bypass
  // the client cache; a request-time param also defeats any intermediate
  // proxy that ignores the request headers.
  const bypassCache = method === "GET";
  if (bypassCache) {
    headers["Cache-Control"] = "no-cache";
    headers.Pragma = "no-cache";
  }
  const finalQuery = bypassCache ? { ...(query || {}), _: Date.now() } : query;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(makeUrl(ns, path, finalQuery), {
      method,
      headers,
      body: formData || (body !== undefined ? JSON.stringify(body) : undefined),
      signal: controller.signal,
      // React Native passes this through to the native HTTP layer.
      cache: bypassCache ? "no-store" : "default",
    } as RequestInit);
    clearTimeout(timer);
    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      // v1.0.102 — the WordPress fatal-error template ships raw HTML+CSS,
      // and internal testing surfaced it dumped into an EmptyState card
      // ("We couldn't load analytics" → followed by wpcomsh-fatal CSS
      // rules). Never render server HTML as an error message. Use the
      // status line only — friendlyFor turns 5xx into a generic sorry
      // message and 4xx into a status-based fallback below.
      const looksLikeHtml = /^\s*<(?:!doctype|html|head|body|style|script|div)\b/i.test(text);
      const message = looksLikeHtml || !text
        ? `HTTP ${res.status}`
        : text.slice(0, 200);
      throw new ApiError(message, res.status, "invalid_json");
    }
    if (!res.ok) {
      // v1.0.174 — some hosts (WordPress.com atomic) return a JSON envelope
      // whose `message` field contains raw HTML/CSS from a fatal page. Prefer
      // the machine-readable `code` for detection and let friendlyFor scrub
      // the message.
      const rawMsg = data?.message || data?.error || `HTTP ${res.status}`;
      const safeMsg = looksLikeServerDump(String(rawMsg)) ? `HTTP ${res.status}` : rawMsg;
      throw new ApiError(safeMsg, res.status, data?.code || "request_failed", data);
    }
    return data as T;
  } catch (e) {
    clearTimeout(timer);
    if (e instanceof ApiError) throw e;
    if ((e as any)?.name === "AbortError") {
      const err = new ApiError("The website took too long to respond.", 0, "request_timeout");
      networkErrorListeners.forEach((fn) => fn(err));
      throw err;
    }
    const err = new ApiError("Could not reach the website. Check your connection.", 0, "network_error");
    networkErrorListeners.forEach((fn) => fn(err));
    throw err;
  }
}

// v1.0.73 — module-level pub/sub so the NetworkContext can flip an offline
// banner without every call-site having to opt in. Listeners fire on
// network_error and request_timeout only — not on 4xx/5xx from the server.
type NetworkErrorListener = (err: ApiError) => void;
const networkErrorListeners = new Set<NetworkErrorListener>();
export function onNetworkError(fn: NetworkErrorListener) {
  networkErrorListeners.add(fn);
  return () => { networkErrorListeners.delete(fn); };
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
  // v1.0.120 — two-step signup with email verification. Step 1 stashes
  // credentials + emails a code + magic link. Step 2 checks the code and
  // creates the real user. No wp_users row is created until Step 2 passes.
  signupStart: (payload: { name: string; username: string; email: string; password: string }) =>
    request<{ pending_id: number; email: string; expires_in: number }>("marketplace", "/auth/signup/start", {
      method: "POST",
      body: payload,
      auth: false,
    }),
  signupVerify: (payload: { pending_id: number; code: string }) =>
    request<{ token: string; user: NestUserRaw }>("marketplace", "/auth/signup/verify", {
      method: "POST",
      body: payload,
      auth: false,
    }),
  signupResend: (payload: { pending_id: number }) =>
    request<{ sent: boolean; expires_in: number }>("marketplace", "/auth/signup/resend", {
      method: "POST",
      body: payload,
      auth: false,
    }),
  logout: () => request<{ ok: boolean }>("marketplace", "/auth/logout", { method: "POST" }),
  // v1.0.133 — native password reset. Three steps:
  // 1. request a 6-digit code by email; response is oblivious to whether
  //    the account exists to avoid enumeration leakage.
  // 2. verify the code before the user types a new password so we can
  //    show "code incorrect" without also throwing away the typed password.
  // 3. confirm with { email, code, new_password }; on success the server
  //    returns a fresh auth token + user so the app can sign the user in
  //    without a second /auth/login round-trip.
  requestPasswordReset: (email: string) =>
    request<{ sent: boolean; expires_in: number }>("marketplace", "/auth/password-reset/request", { method: "POST", body: { email }, auth: false }),
  verifyPasswordResetCode: (email: string, code: string) =>
    request<{ valid: boolean; email: string; expires_in: number }>("marketplace", "/auth/password-reset/verify", { method: "POST", body: { email, code }, auth: false }),
  confirmPasswordReset: (payload: { email: string; code: string; new_password: string }) =>
    request<{ success: boolean; email: string; token?: string; user?: NestUserRaw }>("marketplace", "/auth/password-reset/confirm", { method: "POST", body: payload, auth: false }),
  // v1.0.134 — abandoned-cart banner support. `getAbandonedCart` returns
  // the buyer's most recent uncompleted cart snapshot (line count + item
  // list). Server drops the row on order placement and re-arms the 24-hour
  // reminder clock on every cart mutation, so a fresh add-to-cart will
  // hide the banner until 24h without further interaction. Silently
  // 401-safe: the request layer swallows guest calls at the call site.
  getAbandonedCart: () =>
    request<{
      has_cart: boolean;
      line_count?: number;
      total_cents?: number;
      items?: Array<{ product_id: number; title: string; qty: number; unit_cents: number; image?: string; permalink?: string }>;
      updated_at?: string;
    }>("marketplace", "/cart/abandoned"),
  dismissAbandonedCart: () =>
    request<{ dismissed: boolean }>("marketplace", "/cart/abandoned/dismiss", { method: "POST" }),
  me: () => request<NestUserRaw>("marketplace", "/auth/me"),
  updateMe: (payload: Record<string, unknown>) =>
    request<NestUserRaw>("marketplace", "/auth/me", { method: "PATCH", body: payload }),

  // Config
  getConfig: () => request<NestConfig>("marketplace", "/config", { auth: false }),
  mobileHealth: () => request<{ ok: boolean; version: string; authenticated: boolean }>("marketplace", "/mobile-health", { auth: false }),

  // Catalog
  getCategories: () => request<NestCategoryRaw[]>("marketplace", "/categories", { auth: false }),
  getProducts: (query?: Record<string, unknown>) => request<NestPaginated<NestProductRaw>>("marketplace", "/products", { query, auth: false }),
  // Home listings feed: recent products from shops the viewer follows, padded
  // with recent products from anywhere. Returns items with from_followed:bool.
  getHomeFeed: (query?: { per_page?: number }) =>
    request<{ items: (NestProductRaw & { from_followed?: boolean })[]; followed_count: number; has_followed: boolean; is_authenticated: boolean }>("marketplace", "/home", { query, auth: false }),
  // v1.0.152 — send auth when available so owners can pre-fill the edit form
  // for their own drafts / OOS listings. Anonymous callers still see only
  // published, in-stock listings (server-side gate in class-tnm-rest.php).
  getProduct: (id: number | string) => request<NestProductRaw>("marketplace", `/products/${id}`),
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
  // v1.0.76 — author edit + delete + non-author report. Server checks live
  // in class-mnu-blog.php (MNU 3.7.110); the mobile UI still gates the
  // menu items client-side so the sheet never offers actions the API will
  // 403 on. Caption-only edit (JSON PUT). Image edit is intentionally
  // deferred; the composer prefills the existing image but treats it as a
  // read-only preview during edit. A later patch can add multipart PUT if
  // we hear demand.
  updateBlogPost: (id: number | string, payload: { caption?: string; remove_image?: boolean }) =>
    request<{ success: boolean; post: NestBlogPostRaw }>("marketplace", `/blog/posts/${id}`, { method: "PUT", body: payload }),
  deleteBlogPost: (id: number | string) =>
    request<{ success: boolean; id: number }>("marketplace", `/blog/posts/${id}`, { method: "DELETE" }),
  reportBlogPost: (id: number | string, reason: string, details: string) =>
    request<{ success: boolean; report_id: number }>("marketplace", `/blog/posts/${id}/report`, { method: "POST", body: { reason, details } }),
  getBlogModerationPosts: (query?: { status?: "pending" | "approved" | "rejected"; page?: number; per_page?: number }) =>
    request<NestBlogPostsRaw>("marketplace", "/blog/moderation/posts", { query }),
  approveBlogPost: (id: number | string) =>
    request<NestBlogPostRaw>("marketplace", `/blog/moderation/posts/${id}/approve`, { method: "POST" }),
  rejectBlogPost: (id: number | string) =>
    request<NestBlogPostRaw>("marketplace", `/blog/moderation/posts/${id}/reject`, { method: "POST" }),

  // v1.0.86 — admin console (plugin v3.7.114). Owner-only surfaces powering
  // the in-app admin drawer; all four routes reject non-admins with 403.
  adminStats: () => request<AdminStats>("marketplace", "/admin/stats"),
  adminListReports: (query?: { status?: "pending" | "resolved" | "dismissed"; page?: number; per_page?: number }) =>
    request<{ items: AdminReport[]; page: number; total: number; total_pages: number; status: string }>(
      "marketplace",
      "/admin/reports",
      { query },
    ),
  adminResolveReport: (id: number | string) =>
    request<{ success: boolean; report: AdminReport }>("marketplace", `/admin/reports/${id}/resolve`, { method: "POST" }),
  adminDismissReport: (id: number | string) =>
    request<{ success: boolean; report: AdminReport }>("marketplace", `/admin/reports/${id}/dismiss`, { method: "POST" }),
  // v1.0.90 — marketplace-wide orders list for the admin drawer's Orders
  // tile (plugin v3.7.117 /admin/orders).
  adminListOrders: (query?: { range?: "7d" | "30d" | "all"; page?: number; per_page?: number }) =>
    request<{ items: AdminOrder[]; page: number; total: number; total_pages: number; range: string }>(
      "marketplace",
      "/admin/orders",
      { query },
    ),
  // v1.0.171 — server-authoritative operational queues (MNU 3.13.37).
  adminOperations: () => request<AdminOperationsSummary>("marketplace", "/admin/operations"),
  adminListSellerApplications: (query?: { status?: "pending" | "approved" | "rejected"; page?: number; per_page?: number }) =>
    request<AdminSellerApplicationList>("marketplace", "/admin/seller-applications", { query }),
  adminApproveSellerApplication: (id: number | string) =>
    request<AdminSellerApplication>("marketplace", `/admin/seller-applications/${id}/approve`, { method: "POST" }),
  adminRejectSellerApplication: (id: number | string, payload: { reason?: string; can_resubmit?: boolean }) =>
    request<AdminSellerApplication>("marketplace", `/admin/seller-applications/${id}/reject`, { method: "POST", body: payload }),
  adminListRefunds: (query?: { status?: "requested" | "approved" | "processing" | "completed" | "denied" | "open" | "all"; page?: number; per_page?: number }) =>
    request<AdminRefundList>("marketplace", "/admin/refunds", { query }),
  adminProcessRefund: (orderId: number | string, payload?: { amount?: number; note?: string }) =>
    request<unknown>("marketplace", `/admin/orders/${orderId}/refund/process`, { method: "POST", body: payload || {} }),
  adminDenyRefund: (orderId: number | string, note?: string) =>
    request<unknown>("marketplace", `/admin/orders/${orderId}/refund/deny`, { method: "POST", body: { note: note || "" } }),
  adminListPayouts: (query?: { status?: "pending" | "processing" | "requested" | "failed" | "returned" | "paid" | "cancelled" | "all"; page?: number; per_page?: number }) =>
    request<AdminPayoutList>("marketplace", "/admin/payouts", { query }),
  adminProcessPayout: (id: number | string, payload?: { external_id?: string; notes?: string }) =>
    request<AdminPayout>("marketplace", `/admin/payouts/${id}/process`, { method: "POST", body: payload || {} }),
  adminRetryPayout: (id: number | string) =>
    request<AdminPayout>("marketplace", `/admin/payouts/${id}/retry`, { method: "POST" }),
  adminCancelPayout: (id: number | string, notes?: string) =>
    request<AdminPayout>("marketplace", `/admin/payouts/${id}/cancel`, { method: "POST", body: { notes: notes || "" } }),

  // v1.0.54 - blog post comments (added server-side in MNU 3.7.96)
  getBlogPostComments: (id: number | string, query?: { page?: number; per_page?: number }) =>
    request<{ comments: NestBlogCommentRaw[]; total: number; pages: number }>(
      "marketplace",
      `/blog/posts/${id}/comments`,
      { query, auth: false },
    ),
  createBlogPostComment: (id: number | string, content: string) =>
    request<NestBlogCommentRaw>("marketplace", `/blog/posts/${id}/comments`, {
      method: "POST",
      body: { content },
    }),
  // v1.0.81 — blog comment edit / delete / report (added server-side in MNU 3.7.112)
  updateBlogComment: (id: number | string, content: string) =>
    request<NestBlogCommentRaw>("marketplace", `/blog/comments/${id}`, {
      method: "PUT",
      body: { content },
    }),
  deleteBlogComment: (id: number | string) =>
    request<{ success: boolean; id: number }>("marketplace", `/blog/comments/${id}`, { method: "DELETE" }),
  reportBlogComment: (id: number | string, reason: string, details: string) =>
    request<{ success: boolean; report_id: number }>("marketplace", `/blog/comments/${id}/report`, { method: "POST", body: { reason, details } }),
  // v1.0.55 — blog post favorites (added server-side in MNU 3.7.98). Mirrors
  // the trust-suite product favorites shape so the mobile FavoritesContext
  // can hold both sets in the same way.
  listBlogFavorites: () =>
    request<NestBlogFavoritesRaw>("marketplace", "/blog/favorites"),
  toggleBlogFavorite: (post_id: number | string) =>
    request<NestBlogFavoriteToggleRaw>("marketplace", `/blog/posts/${post_id}/favorite`, { method: "POST" }),
  removeBlogFavorite: (post_id: number | string) =>
    request<NestBlogFavoriteToggleRaw>("marketplace", `/blog/posts/${post_id}/favorite`, { method: "DELETE" }),
  getBlogFavoritesCount: (post_id: number | string) =>
    request<{ post_id: number; count: number }>("marketplace", `/blog/posts/${post_id}/favorites-count`, { auth: false }),

  // v1.0.44 — shop discovery row on the Browse tab.
  getSellers: (query?: Record<string, unknown>) =>
    request<NestPaginated<NestSellerListItem>>("marketplace", "/sellers", { query, auth: false }),
  getSeller: (id: number | string) => request<NestSellerRaw>("marketplace", `/sellers/${id}`),
  getSellerProducts: (id: number | string, query?: Record<string, unknown>) =>
    request<NestPaginated<NestProductRaw>>("marketplace", `/sellers/${id}/products`, { query, auth: false }),
  followSeller: (id: number | string) => request<{ ok: boolean }>("marketplace", `/sellers/${id}/follow`, { method: "POST" }),
  unfollowSeller: (id: number | string) => request<{ ok: boolean }>("marketplace", `/sellers/${id}/follow`, { method: "DELETE" }),
  // v1.0.93 (Build #13) — list of shops the current user follows. The server
  // returns a flat array (not paginated); we keep the raw shape here and
  // adapt in the screen so we can reuse the same avatar/name/rating fields
  // ProductCard already knows.
  getFollowing: () => request<NestFollowedShop[]>("marketplace", "/following"),
  // v1.0.93 (Build #14) — buyer alert preferences. Currently the price-drop
  // opt-in toggle backing the switch on Favorites. Extend as needed.
  // v3.7.121 (Build #17b) — push preferences center. All 5 categories
  // are returned; older servers only return price_drop_alerts and the
  // rest default to true on the client.
  getPreferences: () => request<NestMePreferences>("marketplace", "/me/preferences"),
  setPreferences: (patch: Partial<NestMePreferences>) =>
    request<NestMePreferences>("marketplace", "/me/preferences", { method: "PUT", body: patch }),
  reportProduct: (id: number | string, reason: string, details: string) =>
    request<{ success: boolean; report_id: number }>("marketplace", `/products/${id}/report`, { method: "POST", body: { reason, details } }),

  // v3.7.121 (Build #18a) — recently viewed. GET returns hydrated
  // NestProductRaw rows; POST bumps a product to the front of the MRU
  // list. Silent-fail is fine on the client — tracking is best-effort.
  getRecentlyViewed: (limit = 20) =>
    request<{ items: NestProductRaw[] }>("marketplace", "/me/recently-viewed", { query: { limit } }),
  trackRecentlyViewed: (productId: number | string) =>
    request<{ ok: boolean; count: number }>("marketplace", "/me/recently-viewed", { method: "POST", body: { product_id: Number(productId) } }),
  clearRecentlyViewed: () =>
    request<{ ok: boolean }>("marketplace", "/me/recently-viewed", { method: "DELETE" }),
  // v1.0.136 — drop a single row from the MRU. Server responds
  // idempotently: removing an id that isn't in the list still returns
  // `ok: true` with the remaining count, so the client can update
  // local state without a follow-up GET.
  removeRecentlyViewed: (productId: number | string) =>
    request<{ ok: boolean; count: number }>("marketplace", `/me/recently-viewed/${Number(productId)}`, { method: "DELETE" }),

  // Orders
  getBuyerOrders: (query?: Record<string, unknown>) =>
    request<{ orders: NestOrderRaw[]; page: number; total: number; total_pages: number }>("marketplace", "/orders", { query }),
  getBuyerOrder: (id: number | string) => request<NestOrderRaw>("marketplace", `/orders/${id}`),
  getReviewableProducts: (orderId: number) =>
    request<{ items: ReviewableProduct[] }>("marketplace", `/orders/${orderId}/reviewable-products`),
  // v3.7.121 (Build #16) — buyer-initiated cancel. 409 means the order is
  // already shipped / paid / closed; 403 means the caller isn't the buyer.
  cancelBuyerOrder: (id: number | string, reason?: string) =>
    request<NestOrderRaw>("marketplace", `/orders/${id}/cancel`, { method: "POST", body: reason ? { reason } : {} }),
  getOrderRefund: (id: number | string) =>
    request<NestRefundStatus>("marketplace", `/orders/${id}/refund`),
  requestOrderRefund: (id: number | string, payload: { reason: string; details?: string }) =>
    request<NestRefundStatus>("marketplace", `/orders/${id}/refund-request`, { method: "POST", body: payload }),

  // Seller profile (v1.0.52 - shop settings screen for the "Add name"
  // readiness step + future banner/about edits from the app).
  // v1.0.53 — account avatar upload. The mobile app bridge stores the file
  // via WP media_handle_upload and writes thenest_profile_photo_id +
  // thenest_profile_photo_url on the current user; tnm_user_avatar_url()
  // reads those on the server side so the new photo shows up on the
  // account screen, on messages, and on the seller profile page.
  uploadAccountPhoto: (asset: { uri: string; fileName?: string | null; mimeType?: string | null }) => {
    const form = new FormData();
    const name = asset.fileName || "avatar.jpg";
    const type = asset.mimeType || "image/jpeg";
    // @ts-expect-error — RN FormData accepts { uri, name, type } file blobs.
    form.append("file", { uri: asset.uri, name, type });
    return request<{ ok: boolean; photo_id: number; photo_url: string }>("bridge", "/account/photo/upload", {
      method: "POST",
      formData: form,
    });
  },

  getSellerProfileMe: () => request<NestSellerProfileMe>("marketplace", "/seller/profile"),
  updateSellerProfile: (
    payload: { store_name?: string; about?: string; tagline?: string }
  ) =>
    request<NestSellerProfileMe>("marketplace", "/seller/profile", {
      method: "POST",
      body: payload,
    }),

  // Reviews (v1.0.51 - buyer order screen review CTA)
  submitSellerReview: (
    sellerId: number | string,
    payload: { rating: number; review: string; order_id: number | string }
  ) =>
    request<{ success: boolean; review_id: number }>("marketplace", `/sellers/${sellerId}/reviews`, {
      method: "POST",
      body: payload,
    }),
  // v1.0.64 - buyer review browsing on the seller profile screen. GET is
  // public so anonymous shoppers can read reviews before creating an account.
  getSellerReviews: (sellerId: number | string, query?: { page?: number; per_page?: number }) =>
    request<NestSellerReviewsPage>("marketplace", `/sellers/${sellerId}/reviews`, { query, auth: false }),

  // Notifications
  getNotifications: (query?: Record<string, unknown>) =>
    request<{ items: NestNotificationRaw[]; total: number; unread?: number }>("marketplace", "/notifications", { query }),
  markNotificationsRead: (ids?: number[]) =>
    request<{ ok: boolean }>("marketplace", "/notifications/read", { method: "POST", body: { ids: ids || [] } }),

  // -------------------------------------------------------------------------
  // Saved searches — the-nest/v1/saved-searches (v3.7.101).
  // Each row is a persisted search payload the buyer wants alerts on. The
  // backend runs an hourly cron that replays each row and pushes a
  // saved_search_hit notification when new products match.
  // -------------------------------------------------------------------------
  getSavedSearches: () =>
    request<{ items: NestSavedSearchRaw[] }>("marketplace", "/saved-searches"),
  saveSearch: (payload: SaveSearchPayload) =>
    request<NestSavedSearchRaw>("marketplace", "/saved-searches", { method: "POST", body: payload }),
  updateSavedSearch: (id: number, changes: { notify?: boolean }) =>
    request<NestSavedSearchRaw>("marketplace", `/saved-searches/${id}`, { method: "PUT", body: changes }),
  deleteSavedSearch: (id: number) =>
    request<{ success: boolean }>("marketplace", `/saved-searches/${id}`, { method: "DELETE" }),

  // -------------------------------------------------------------------------
  // Direct messaging — the-nest/v1/messages
  //   GET  /messages              → inbox: latest per conversation
  //   GET  /messages/{user_id}    → thread with a specific counterpart (marks read)
  //   POST /messages              → send { recipient_id, message, product_id? }
  // -------------------------------------------------------------------------
  getConversations: () => request<NestConversationRaw[]>("marketplace", "/messages"),
  getConversation: (userId: number | string, limit = 100) =>
    request<NestMessageRaw[]>("marketplace", `/messages/${userId}`, { query: { limit } }),
  sendMessage: (payload: { recipient_id: number; message: string; product_id?: number; photo_ids?: number[] }) =>
    request<{ success: boolean; message_id: number }>("marketplace", "/messages", {
      method: "POST",
      // photo_ids is serialized as a JSON string so it survives both
      // JSON bodies and form-encoded transports on the WP side.
      body: {
        ...payload,
        photo_ids: payload.photo_ids && payload.photo_ids.length ? JSON.stringify(payload.photo_ids) : undefined,
      },
    }),
  // v3.7.86 — upload a single photo for a DM thread. FormData must carry
  // `file` (blob) and `recipient_id` (string). Server returns an attachment
  // id that the sender then passes into sendMessage({photo_ids}).
  uploadMessagePhoto: (formData: FormData) =>
    request<{ attachment_id: number; w: number; h: number; mime: string; preview_url: string }>(
      "marketplace",
      "/messages/photo_upload",
      { method: "POST", formData, timeoutMs: 60000 }
    ),
  reportMessagePhoto: (messageId: number, attachmentId: number, reason: string) =>
    request<{ ok: boolean; attachment_id: number; hidden: boolean }>(
      "marketplace",
      `/messages/${messageId}/report_photo`,
      { method: "POST", body: { attachment_id: attachmentId, reason } }
    ),

  // Seller
  submitSellerApplication: (payload: Record<string, unknown>) =>
    request<{ ok: boolean; application_id: number }>("marketplace", "/seller/application", { method: "POST", body: payload }),
  getSellerApplicationStatus: () =>
    request<{
      status: "none" | "pending" | "approved" | "rejected";
      application_id?: number;
      submitted_at?: string;
      reviewed_at?: string;
      rejection_reason?: string;
      can_resubmit?: boolean;
    }>("marketplace", "/seller/application/status"),
  getSellerDashboard: () => request<NestSellerDashboardRaw>("marketplace", "/seller/dashboard"),
  // v1.0.91 — rolling analytics for the seller dashboard's Analytics tile
  // (plugin v3.7.118 /seller/analytics).
  getSellerAnalytics: (range: 7 | 30 | 90 = 30) =>
    request<SellerAnalytics>("marketplace", "/seller/analytics", { query: { range } }),
  exportSellerAnalytics: (range: 7 | 30 | 90 = 30) =>
    request<SellerAnalyticsExport>("marketplace", "/seller/analytics/export", { query: { range } }),
  // v3.7.93 — one-screen seller readiness checklist (Stripe Connect, ship-from,
  // shop name, first product). See MNU_Seller_Readiness::build on the plugin.
  getSellerReadiness: () => request<NestSellerReadiness>("marketplace", "/seller/readiness"),
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
  // v1.0.64 (Build #3) — server-side clone. Returns the new draft product; the
  // UI navigates to its edit form so the seller can tweak variant fields.
  duplicateProduct: (id: number | string) =>
    request<NestProductRaw>("marketplace", `/seller/products/${id}/duplicate`, { method: "POST" }),
  // Multipart image upload. Field name must be `file`. Returns the attachment id
  // to attach to a product via `image_id`.
  uploadMedia: (formData: FormData) =>
    request<NestMediaRaw>("marketplace", "/media", { method: "POST", formData, timeoutMs: 60000 }),

  // -------------------------------------------------------------------------
  // Bulk product import (WooCommerce CSV format). Three-step flow:
  //   1. upload CSV -> get job_id + preview + validation report
  //   2. run -> start async processing on the server
  //   3. poll status until complete
  // -------------------------------------------------------------------------
  uploadImport: (formData: FormData) =>
    request<{
      job_id: number;
      total_rows: number;
      columns: string[];
      unrecognized_columns: string[];
      preview: Array<{ row: number; name: string; price: string; stock: string; sku: string; images_count: number }>;
      validation_errors: Array<{ row: number; name: string; problems: string[] }>;
      ready_to_run: boolean;
    }>("marketplace", "/seller/import/upload", { method: "POST", formData, timeoutMs: 60000 }),
  runImport: (jobId: number) =>
    request<{ job_id: number; status: string }>("marketplace", `/seller/import/${jobId}/run`, { method: "POST" }),
  getImportStatus: (jobId: number) =>
    request<{
      job_id: number;
      status: "ready" | "running" | "complete" | string;
      total: number;
      processed: number;
      created: number;
      updated: number;
      failed: number;
      errors: Array<{ row: number; name: string; error: string }>;
      updated_at: string;
    }>("marketplace", `/seller/import/${jobId}`),

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

  // -------------------------------------------------------------------------
  // Ship-from address + package defaults (nest-shipping/v1/seller/profile).
  // v1.0.126 — exposed to the mobile app so sellers can fill in the origin
  // address that ShopMyNest uses to buy labels on their behalf.
  //
  // v1.0.127 — The per-seller Shippo Connect methods that used to sit
  // here (getShippoStatus, connectShippoManual, disconnectShippo,
  // startShippoOAuth) were removed. The platform now uses ShopMyNest's
  // own Shippo account for every label, so sellers never touch a Shippo
  // token directly. The server endpoints under /nest-connect/v1/seller/*
  // remain for future admin/diagnostic use but the mobile app doesn't
  // call them.
  // -------------------------------------------------------------------------
  getSellerShippingProfile: () =>
    request<{ profile: NestSellerShippingProfile }>("shipping", "/seller/profile"),
  saveSellerShippingProfile: (patch: Partial<NestSellerShippingProfile>) =>
    request<{ profile: NestSellerShippingProfile }>("shipping", "/seller/profile", {
      method: "POST",
      body: patch,
    }),

  // Earnings + payouts — the-nest/v1/seller/{earnings,payouts}.
  getSellerEarnings: (query?: Record<string, unknown>) =>
    request<NestSellerEarningsRaw>("marketplace", "/seller/earnings", { query }),
  getSellerPayouts: () => request<NestSellerPayoutsRaw>("marketplace", "/seller/payouts"),
  requestPayout: (payload: { amount?: number; method?: string; destination?: string } = {}) =>
    request<{ success: boolean; payout: NestPayoutRaw }>("marketplace", "/seller/payouts", { method: "POST", body: payload }),

  // -------------------------------------------------------------------------
  // v3.8.0 seller bank account (replaces Stripe Connect for payouts).
  //
  // v1.0.127 — The Stripe Connect Express methods that used to sit here
  // (getStripeConnectOnboardLink, getStripeConnectStatus,
  // getStripeConnectDashboardLink) were removed. Sellers no longer link a
  // Stripe Express account — they enter a routing + account number on
  // /seller/bank (renamed from /seller/connect in v1.0.128) and the
  // platform ACHs their share from a business checking account after
  // the 7-day holding window. The server endpoints under
  // /nest-connect/v1 still exist but the mobile app doesn't call them.
  // -------------------------------------------------------------------------
  // GET  -> masked summary: has_bank + last4 + holder_name + updated_at.
  //         Never returns routing/account digits.
  // POST -> save/replace bank details. Server format-validates and encrypts.
  getSellerBank: () =>
    request<NestSellerBank>("marketplace", "/seller/bank-account"),
  saveSellerBank: (payload: {
    holder_name: string;
    routing_number: string;
    account_number: string;
  }) =>
    request<NestSellerBank>("marketplace", "/seller/bank-account", {
      method: "POST",
      body: payload,
    }),

  // Ops
  getAddresses: () => request<{ billing: NestWpAddress; shipping: NestWpAddress }>("ops", "/addresses"),
  saveAddresses: (payload: { billing?: NestWpAddress; shipping?: NestWpAddress }) =>
    request<{ ok: boolean }>("ops", "/addresses", { method: "POST", body: payload }),
  // Atomically saves account contact + one address-book row. The server
  // validates the complete checkout shape before writing either side.
  saveContactAddress: (payload: { contact: { email: string; phone: string }; address: NestAddressBookWrite; address_id?: string }) =>
    request<{ ok: boolean; user: NestUserRaw; address: NestAddressBookEntry }>("marketplace", "/me/contact-address", { method: "POST", body: payload }),
  registerDeviceToken: (payload: { token: string; platform: string }) =>
    request<{ ok: boolean }>("ops", "/device-token", { method: "POST", body: payload }),

  // Native Stripe PaymentSheet checkout (nest-native/v1).
  // Passing a destination address unlocks real live carrier rates (shipping_rates);
  // without one the server returns the historical flat estimate only.
  quoteCheckout: (items: { product_id: number; quantity: number; variation_id?: number }[], shippingAddress: NestWpAddress | null, couponCode?: string) =>
    request<NestQuoteRaw>("checkout", "/checkout/quote", { method: "POST", body: { items, shipping_address: shippingAddress, coupon_code: couponCode || undefined } }),
  // Creates the WC order + Stripe PaymentIntent (and Customer + ephemeral key)
  // straight from the current cart items. Returns everything PaymentSheet needs.
  // The server re-computes shipping from shipping_address + shipping_method_id and
  // only trusts the picked id (never a client amount).
  createPaymentIntent: (payload: {
    items: { product_id: number; quantity: number; variation_id?: number }[];
    billing?: NestWpAddress;
    shipping?: NestWpAddress;
    shipping_address?: NestWpAddress;
    shipping_method_id?: string;
    quote_token?: string;
    // Idempotency key for one checkout attempt. The server looks up a pending
    // order already stamped with this token and reuses it (and its PaymentIntent)
    // instead of creating a duplicate.
    checkout_token?: string;
    coupon_code?: string;
  }) =>
    request<NestPaymentIntentRaw>("checkout", "/checkout/create-intent", { method: "POST", body: payload, timeoutMs: 45000 }),
  // Best-effort confirmation after PaymentSheet succeeds. The Stripe webhook is
  // the source of truth, so callers should not block navigation on this.
  completeCheckout: (payload: { order_id: number; payment_intent_id: string }) =>
    request<{ ok: boolean; status?: string; order_id: number; payment_status?: string }>("checkout", "/checkout/complete", { method: "POST", body: payload }),

  // v3.7.119 (Build #8) — save attributes + per-variation price/stock for a product.
  saveProductVariations: (
    productId: number | string,
    payload: {
      attributes: { name: string; options: string[] }[];
      variations: { variation_id?: number; attributes: Record<string, string>; price: number; stock: number; sku?: string }[];
    }
  ) =>
    request<{ attributes: NestProductAttributeRaw[]; variations: NestProductVariationRaw[]; warnings?: string[] }>(
      "marketplace",
      `/seller/products/${productId}/variations`,
      { method: "PUT", body: payload }
    ),

  // v3.7.119 (Build #10) — coupons.
  listSellerCoupons: () =>
    request<{ items: NestCoupon[] }>("marketplace", "/seller/coupons"),
  createSellerCoupon: (payload: NestCouponWritePayload) =>
    request<NestCoupon>("marketplace", "/seller/coupons", { method: "POST", body: payload }),
  updateSellerCoupon: (id: number, payload: NestCouponWritePayload) =>
    request<NestCoupon>("marketplace", `/seller/coupons/${id}`, { method: "PUT", body: payload }),
  deleteSellerCoupon: (id: number) =>
    request<{ success: boolean }>("marketplace", `/seller/coupons/${id}`, { method: "DELETE" }),
  listAdminCoupons: () =>
    request<{ items: NestCoupon[] }>("marketplace", "/admin/coupons"),
  createAdminCoupon: (payload: NestCouponWritePayload) =>
    request<NestCoupon>("marketplace", "/admin/coupons", { method: "POST", body: payload }),
  updateAdminCoupon: (id: number, payload: NestCouponWritePayload) =>
    request<NestCoupon>("marketplace", `/admin/coupons/${id}`, { method: "PUT", body: payload }),
  deleteAdminCoupon: (id: number) =>
    request<{ success: boolean }>("marketplace", `/admin/coupons/${id}`, { method: "DELETE" }),
  applyCoupon: (code: string, items: { product_id: number; quantity: number; variation_id?: number }[]) =>
    request<{ coupon: NestCoupon; subtotal: number; eligible: number; discount: number; free_shipping: boolean }>(
      "marketplace",
      "/coupons/apply",
      { method: "POST", body: { code, items } }
    ),

  // v3.12.0 — verified purchase product reviews.
  getProductReviews: (productId: number | string, query?: { page?: number; per_page?: number }) =>
    request<ProductReviewsPage>("marketplace", `/products/${productId}/reviews`, { query: query || {} }),
  submitProductReview: (productId: number, body: {
    order_id: number;
    rating: number;
    review: string;
    photo_ids?: number[];
    variation_id?: number;
  }) => request<ProductReview>("marketplace", `/products/${productId}/reviews`, { method: "POST", body }),
  submitReviewResponse: (productId: number, reviewId: number, response: string) =>
    request<ProductReview>("marketplace", `/products/${productId}/reviews/${reviewId}/response`, {
      method: "POST",
      body: { response },
    }),
  uploadReviewPhoto: (formData: FormData) =>
    request<{ id: number; url: string; thumbnail: string; mime_type: string }>("marketplace", "/media", {
      method: "POST", query: { context: "review" }, formData, timeoutMs: 60000,
    }),
  getSellerProductReviews: (query?: { page?: number; per_page?: number }) =>
    request<ProductReviewsPage>("marketplace", "/seller/reviews", { query: query || {} }),

  // v3.7.119 (Build #11) — buyer address book (multi-address).
  listAddressBook: () => request<{ items: NestAddressBookEntry[] }>("marketplace", "/me/addresses"),
  createAddress: (payload: NestAddressBookWrite) =>
    request<NestAddressBookEntry>("marketplace", "/me/addresses", { method: "POST", body: payload }),
  updateAddress: (id: string, payload: NestAddressBookWrite) =>
    request<NestAddressBookEntry>("marketplace", `/me/addresses/${id}`, { method: "PUT", body: payload }),
  deleteAddress: (id: string) =>
    request<{ success: boolean }>("marketplace", `/me/addresses/${id}`, { method: "DELETE" }),

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

    // Boosts
    createBoost: (payload: { product_id: number; tier: string }) =>
      request<NestBoostRaw>("trust", "/boosts", { method: "POST", body: payload }),
  },

  // -------------------------------------------------------------------------
  // v1.0.132 — Customization requests. Buyer opens a request against a
  // seller's product marked customizable, they exchange messages + a quote,
  // buyer accepts → backend spins up a private one-off WooCommerce product
  // and returns its id + slug so the mobile app can add-to-cart and check
  // out through the existing native flow.
  // -------------------------------------------------------------------------
  custom: {
    createRequest: (payload: {
      product_id: number;
      title: string;
      description: string;
      budget_cents?: number;
      quantity?: number;
      reference_photo_ids?: number[];
    }) => request<NestCustomRequestRaw>("marketplace", "/custom-requests", { method: "POST", body: payload }),
    listRequests: (query?: { role?: "buyer" | "seller"; status?: string; page?: number; per_page?: number }) =>
      request<NestCustomRequestListRaw>("marketplace", "/custom-requests", { query }),
    getRequest: (id: number | string) =>
      request<NestCustomRequestDetailRaw>("marketplace", `/custom-requests/${id}`),
    postMessage: (id: number | string, payload: { body: string; photo_attachments?: number[] }) =>
      request<NestCustomRequestMessageRaw>("marketplace", `/custom-requests/${id}/messages`, { method: "POST", body: payload }),
    postQuote: (id: number | string, payload: { price_cents: number; lead_days: number; note?: string }) =>
      request<NestCustomRequestRaw>("marketplace", `/custom-requests/${id}/quote`, { method: "POST", body: payload }),
    acceptQuote: (id: number | string) =>
      request<NestCustomRequestAcceptRaw>("marketplace", `/custom-requests/${id}/accept`, { method: "POST" }),
    declineRequest: (id: number | string, reason?: string) =>
      request<NestCustomRequestRaw>("marketplace", `/custom-requests/${id}/decline`, { method: "POST", body: { reason } }),
    withdrawRequest: (id: number | string) =>
      request<NestCustomRequestRaw>("marketplace", `/custom-requests/${id}/withdraw`, { method: "POST" }),
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
  // v1.0.88 — explicit admin flag (plugin v3.7.115). True for site admins /
  // shop managers only; NOT set for regular approved sellers.
  is_admin?: boolean;
  // True for approved sellers AND for site admins/store managers, mirroring the
  // backend's seller permission gate. This is the only "can manage the store"
  // signal the API exposes to the app.
  is_approved_seller?: boolean;
  // v1.0.106 (plugin v3.7.122.9) — Shippo onboarding surfacing so the app
  // can show banners and block the listing flow client-side.
  // shippo_required is a policy flag (server-controlled), shippo_connected
  // is the actual state.
  shippo_required?: boolean;
  shippo_connected?: boolean;
  // null for non-sellers.
  seller_id?: number | null;
  seller_status?: string;
  store_name?: string;
  photo_url?: string;
  // v1.0.161 (plugin v3.13.33) — exposed so the address-edit screen can
  // hydrate account contact fields (email + phone) alongside the shipping
  // address in a single trip.
  phone?: string;
};

export type NestSellerRaw = {
  id: number;
  store_name?: string;
  avatar?: string;
  banner?: string;
  is_pro?: boolean;
  badge?: string;
  /** Short one-line shop tagline (max 140 chars). */
  tagline?: string;
  /** Long-form 'About your shop' text. */
  about?: string;
  /** @deprecated The server field is `about`; keep for backwards compatibility. */
  bio?: string;
  followers?: number;
  rating?: number;
  review_count?: number;
  // v1.0.93 (Build #13) — whether the current user follows this shop; used
  // by the shop detail screen to seed the Follow/Unfollow CTA state.
  is_following?: boolean;
  // GET /sellers/{id} now also returns that seller's most recent posts.
  posts?: NestFeedItemRaw[];
};

// v1.0.44 — lighter row shape returned by GET /sellers (list).
export type NestSellerListItem = {
  id: number;
  store_name?: string;
  display_name?: string;
  avatar?: string;
  tagline?: string;
  about_snippet?: string;
  follower_count?: number;
  is_following?: boolean;
  product_count?: number;
  // v3.7.103 - server now returns cached aggregates on every seller list row.
  rating?: number;
  review_count?: number;
  shop_url?: string;
};

// v3.7.119 — /following response row. Mirrors TNM_Social::following_list().
export type NestFollowedShop = {
  id: number;
  store_name?: string;
  avatar?: string;
  follower_count?: number;
  product_count?: number;
  rating?: number;
  review_count?: number;
  shop_url?: string;
};

// v3.7.103 - /sellers/{id}/reviews response shape.
export type NestSellerReviewRaw = {
  id: number;
  reviewer_id: number;
  seller_id: number;
  order_id: number;
  rating: number;
  review: string;
  status: string;
  created_at: string;
  updated_at: string;
  reviewer: { display_name: string; avatar: string };
};

export type NestSellerReviewsPage = {
  items: NestSellerReviewRaw[];
  total: number;
  average: number;
  page: number;
  total_pages: number;
};

export type ProductReview = {
  id: number;
  rating: number;
  review: string;
  product_id: number;
  variation_id: number;
  variation_name?: string | null;
  order_id: number;
  reviewer_id: number;
  reviewer: { display_name: string; avatar: string };
  photo_ids: number[];
  photos: string[];
  seller_response: string | null;
  seller_response_at: string | null;
  created_at: string;
  product_name?: string;
};

export type ProductReviewsPage = {
  items: ProductReview[];
  total: number;
  average: number;
  page: number;
  total_pages: number;
};

export type ReviewableProduct = {
  product_id: number;
  name: string;
  image: string;
  variation_id: number;
  already_reviewed: boolean;
};

// v3.7.119 (Build #10)
export type NestCouponScope = "seller" | "site";
export type NestCouponDiscountType = "percent" | "fixed_cart" | "fixed_product";
export type NestCoupon = {
  id: number;
  code: string;
  discount_type: NestCouponDiscountType;
  amount: number;
  description: string;
  minimum_amount: number;
  usage_limit: number;
  usage_count: number;
  expires_at: string;
  free_shipping: boolean;
  seller_id: number;
  scope: NestCouponScope;
};
export type NestCouponWritePayload = {
  code: string;
  discount_type: NestCouponDiscountType;
  amount: number;
  description?: string;
  minimum_amount?: number;
  usage_limit?: number;
  expires_at?: string;
  free_shipping?: boolean;
};

// v3.7.119 (Build #11)
// v3.7.121 (Build #17b) — buyer push preferences returned by /me/preferences.
export type NestMePreferences = {
  orders?: boolean;
  messages?: boolean;
  price_drop_alerts?: boolean;
  follows?: boolean;
  promos?: boolean;
};

export type NestAddressBookEntry = {
  id: string;
  label: string;
  first_name: string;
  last_name: string;
  company: string;
  address_1: string;
  address_2: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  phone: string;
  is_default: boolean;
};
export type NestAddressBookWrite = Partial<Omit<NestAddressBookEntry, "id">>;

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
  product_rating?: { rating: number; review_count: number };
  categories?: { id: number; name: string; slug: string }[];
  // v3.7.104 Build #5 - Populated only in seller context. Buyer-facing
  // endpoints omit it to keep the response small.
  favorites_count?: number;
  // v3.7.118 — variations. `type: 'variable'` products carry attribute
  // + variation arrays so the mobile product screen can render size/color
  // pickers. Simple products keep the historical shape untouched.
  type?: "simple" | "variable" | "grouped" | "external" | string;
  attributes?: NestProductAttributeRaw[];
  variations?: NestProductVariationRaw[];
  // v1.0.132 — seller opt-in per-product flag that enables the "Request
  // customization" button on this listing. Backed by the `_mnu_customizable`
  // post meta.
  customizable?: boolean;
  // v1.0.146 — seller-context only. The plugin (v3.13.6+) returns the raw
  // WooCommerce post status ("publish" | "draft" | "pending" | "private")
  // when the caller is the owning seller, plus an actionable reason when
  // the status is "draft" (see class-tnm-marketplace.php::product_to_array).
  status?: string;
  draft_reason?: {
    kind?: string;
    field?: string;
    label?: string;
  };
};

export type NestProductAttributeRaw = {
  name: string;
  label: string;
  options: { slug: string; label: string }[];
};

export type NestProductVariationRaw = {
  id: number;
  attributes: Record<string, string>;
  price: number;
  regular_price?: number;
  stock_status: "instock" | "outofstock";
  stock_quantity?: number | null;
  image?: string;
  sku?: string;
  is_purchasable: boolean;
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

// v1.0.86 — admin console shapes (plugin v3.7.114).
export type AdminStats = {
  pending_blog_posts: number;
  pending_reports: number;
  sellers_total: number;
  products_total: number;
  orders_7d: number;
  refreshed_at: string;
};

// v1.0.91 — seller analytics timeseries (plugin v3.7.118 /seller/analytics).
export type SellerAnalytics = {
  range: 7 | 30 | 90;
  revenue: Array<{ date: string; revenue: number }>;
  orders_count: number;
  refund_rate: number;
  total_gross: number;
  total_fees: number;
  total_net: number;
  top_products: Array<{ id: number; name: string; image: string; gross: number }>;
  pending_payout: number;
  // v3.7.120 (Build #15) — previous window baseline for compare deltas.
  compare?: {
    prev_total_gross: number;
    prev_orders_count: number;
    delta_gross: number;
    delta_orders: number;
    pct_gross: number | null;
    pct_orders: number | null;
  };
  // v3.13.4 — status breakdown (actionable: "3 processing right now")
  // and customer summary (marketplace-health metric). Both are optional
  // on the type so older plugin builds still parse cleanly.
  status_breakdown?: {
    processing: number;
    on_hold: number;
    completed: number;
    refunded: number;
  };
  customers?: {
    unique: number;
    new: number;
    repeat: number;
    /** Share of orders that came from repeat buyers (0–1). */
    repeat_rate: number;
  };
};

// v3.7.120 (Build #15) — CSV export envelope.
export type SellerAnalyticsExport = {
  range: 7 | 30 | 90;
  filename: string;
  csv: string;
  rows: number;
};

// v1.0.90 — marketplace-wide orders row (plugin v3.7.117 /admin/orders).
export type AdminOrder = {
  id: number;
  number: string;
  status: string;
  total: number;
  currency: string;
  item_count: number;
  buyer: string;
  created_at: string | null;
};

export type AdminQueueMetric = { count: number; oldest_hours: number };

export type AdminOperationsSummary = {
  seller_applications: AdminQueueMetric;
  refunds: AdminQueueMetric;
  disputes: AdminQueueMetric;
  payouts_pending: AdminQueueMetric;
  payouts_failed: AdminQueueMetric;
  shipping_exceptions: AdminQueueMetric;
  order_exceptions: AdminQueueMetric;
  reports: AdminQueueMetric;
  refreshed_at: string;
};

export type AdminSellerApplication = {
  id: number;
  seller_id: number;
  seller_name: string;
  seller_email: string;
  store_name: string;
  about: string;
  products: string;
  website: string;
  categories: string;
  submitted_at: string;
  status: "pending" | "approved" | "rejected";
  rejection_reason: string;
  reviewed_at: string;
  reviewed_by: string;
  can_resubmit: boolean;
};
export type AdminSellerApplicationList = { items: AdminSellerApplication[]; page: number; total: number; total_pages: number; status: string };

export type AdminRefund = {
  order_id: number;
  order_number: string;
  buyer_name: string;
  buyer_email: string;
  order_total: number;
  currency: string;
  state: "requested" | "approved" | "processing" | "completed" | "denied";
  requested_amount: number;
  refunded_amount: number;
  reason: string;
  details: string;
  requested_at: string;
};
export type AdminRefundList = { items: AdminRefund[]; page: number; total: number; total_pages: number; status: string };

export type AdminPayout = {
  id: number;
  seller_id: number;
  seller_name: string;
  seller_email: string;
  amount: number;
  currency: string;
  method: string;
  destination: string;
  external_id: string;
  status: "requested" | "processing" | "paid" | "cancelled" | "failed" | "returned";
  notes: string;
  requested_at: string;
  processed_at: string;
};
export type AdminPayoutList = { items: AdminPayout[]; page: number; total: number; total_pages: number; status: string };

export type AdminReport = {
  id: number;
  kind: string;
  status: "pending" | "resolved" | "dismissed";
  reason: string;
  created_at: string;
  reporter: { id: number; name: string } | null;
  subject_label: string;
  subject_body: string;
  subject_url: string;
  blog_post_id: number | null;
  blog_comment_id: number | null;
  product_id: number | null;
  resolved_by: { id: number; name: string } | null;
  resolved_at: string | null;
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
  comments?: number;
  // v1.0.55 — optional favorite fields; the app falls back gracefully when
  // the server hasn't been upgraded yet.
  favorites_count?: number;
  is_favorited?: boolean;
};

export type NestBlogFavoriteToggleRaw = {
  post_id?: number;
  favorited?: boolean;
  favorites_count?: number;
};

export type NestBlogFavoritesRaw = {
  favorites?: Array<{ post_id: number; created_at?: string; post?: NestBlogPostRaw }>;
};

export type NestBlogCommentRaw = {
  id: number;
  content: string;
  created_at: string;
  author: { id: number; name: string; avatar?: string };
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

export type NestPaginated<T> = { items: T[]; page?: number; total: number; total_pages?: number; debug?: { seller_id?: number; product_ids_count?: number; product_ids?: number[]; query_found?: number; posts_by_status?: Record<string, number> } };

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
  // v1.0.108 — buyer identity so a seller-buyer account viewing their
  // own purchase can force the buyer-framed screen even when the order
  // happens to match their seller-orders list. Optional so older plugin
  // builds still parse.
  customer_id?: number;
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
  // v1.0.51 - per-seller tracking row now carries carrier / service /
  // tap-through URL / shipped_at / label_source ("shippo" or "manual").
  // The old shape had only { seller_id, seller_name, number, status }.
  tracking?: NestOrderTrackingRow[];
  shipping_status?: "awaiting" | "partial" | "shipped" | "delivered";
  date_paid?: string;
  date_completed?: string;
  customer_note?: string;
  refund?: NestRefundStatus;
  reviewable?: { can_review: boolean; seller_ids: number[] };
  // v3.7.121 (Build #16) — per-step timestamps for the order timeline.
  // Fields go null when the corresponding step hasn't happened yet.
  timeline?: {
    placed: string | null;
    paid: string | null;
    shipped: string | null;
    delivered: string | null;
  };
  // v3.7.121 (Build #16) — true only when the buyer can outright cancel
  // (pending/on-hold, no shipments). Paid orders route to refund instead.
  cancellable?: boolean;
};

export type NestOrderTrackingRow = {
  seller_id: number;
  seller_name: string;
  number: string;
  carrier?: string;
  service?: string;
  tracking_url?: string;
  label_source?: "shippo" | "manual" | "";
  shipped_at?: string;
  status?: string;
};

export type NestRefundState = "none" | "requested" | "approved" | "processing" | "completed" | "denied";

export type NestRefundTimelineEntry = {
  at: string;
  state: NestRefundState | string;
  label: string;
};

export type NestRefundStatus = {
  order_id: number;
  currency: string;
  order_total: number;
  state: NestRefundState;
  label: string;
  requested_amount: number;
  refunded_amount: number;
  reason: string;
  details: string;
  denial_note: string;
  request_type?: "cancellation" | "return" | "in_transit" | "";
  timeline: NestRefundTimelineEntry[];
  eligibility: {
    can_request: boolean;
    blockers: string[];
    policy_days: number;
    request_type?: "cancellation" | "return" | "in_transit" | "";
  };
};

export type NestConversationRaw = {
  user: { id: number; display_name: string; store_name: string; avatar: string };
  last_message: string;
  date: string;
  unread: boolean;
};

export type NestMessagePhoto = {
  id: number;
  url: string;
  w: number;
  h: number;
  mime: string;
  hidden: boolean;
};

export type NestMessageRaw = {
  id: number;
  sender_id: number;
  recipient_id: number;
  message: string;
  is_read: boolean;
  created_at: string;
  // v3.7.86 — hydrated photo attachments (signed URLs, 24h expiry).
  photos?: NestMessagePhoto[];
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

// v1.0.63 — saved searches. The `query` object is the exact payload that
// will be re-run by the backend cron, so the mobile side just echoes it into
// the Browse screen params to replay the search.
export type NestSavedSearchQuery = {
  search?: string;
  category?: number;
  sort?: string;
  min_price?: string;
  max_price?: string;
  pa_condition?: string;
  pa_size?: string;
  pa_brand?: string;
  seller_id?: number;
};

export type NestSavedSearchRaw = {
  id: number;
  label: string;
  query: NestSavedSearchQuery;
  notify: boolean;
  last_checked_at: string;
  created_at: string;
  updated_at: string;
};

export type SaveSearchPayload = {
  label?: string;
  search?: string;
  category?: number | string;
  sort?: string;
  min_price?: string;
  max_price?: string;
  pa_condition?: string;
  pa_size?: string;
  pa_brand?: string;
  seller_id?: number;
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
  // v3.7.119 (Build #10) — present when a coupon_code was supplied.
  coupon?: {
    code: string;
    discount: number;
    free_shipping: boolean;
    valid: boolean;
    reason: string;
  };
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
  // Final server-calculated tax/discount included in `amount`. Quote tax is only
  // an estimate; cart.tsx uses these to require one explicit review tap when the
  // final total differs before PaymentSheet can open.
  tax_total?: number;
  discount_total?: number;
  shipping_label?: string;
  shipping_method_id?: string;
  // True when the picked rate was gone and the server fell back to cheapest.
  shipping_selection_changed?: boolean;
  // v1.0.158 — items subtotal recomputed by the server from live WC prices.
  // Compared against the cart display to catch stale-price drift.
  subtotal?: number;
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
  customer_id?: number;
  customer: { id?: number; name: string; email: string; phone: string; address: string };
  items: NestSellerOrderItemRaw[];
  gross: number;
  platform_fee: number;
  net_before_shipping: number;
  // v3.7.124 backend — present on orders under the new fee model (platform
  // keeps shipping). Older orders omit these fields, so treat as optional.
  stripe_fee?: number;
  seller_net?: number;
  platform_keeps_shipping?: boolean;
  currency: string;
};

export type NestBalances = {
  pending: number;
  available: number;
  reserved: number;
  paid: number;
  // v1.0.104 — positive dollar amount the seller currently owes for
  // shipping labels they bought. The plugin's ledger stamps postage as a
  // negative row that nets off the next transfer; the payouts screen
  // surfaces this as a separate line so a $-5.17 raw sum doesn't get
  // read as "you owe us." Optional so older plugin builds still parse.
  shipping_owed?: number;
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

// v3.8.0 seller bank account (masked-only response). The four Stripe
// Connect Express types that used to sit above this block
// (NestConnectStatus, NestConnectOnboardLink, NestConnectDashboardLink)
// were retired in v1.0.127 when the mobile app stopped calling those
// endpoints. See the corresponding removal comment in the client.

export type NestSellerBank = {
  has_bank: boolean;
  last4: string;
  holder_name: string;
  updated_at: string;
};

export type NestSellerDashboardRaw = {
  store_name?: string;
  totals?: { orders?: number; revenue?: number; earnings?: number; pending?: number };
  recent_orders?: NestOrderRaw[];
  products?: NestProductRaw[];
};

// v3.7.93 — seller readiness checklist. One entry per required setup step.
export type NestSellerProfileMe = {
  id: number;
  store_name: string;
  display_name: string;
  about?: string;
  tagline?: string;
  avatar?: string;
  banner?: string;
  followers?: number;
  rating?: number;
  review_count?: number;
};

export type NestSellerReadinessStep = {
  key: string;
  label: string;
  description: string;
  ok: boolean;
  blocking: boolean;
  action_url: string;
  action_label: string;
  detail: string;
};
export type NestSellerReadiness = {
  seller_id: number;
  ready_to_sell: boolean;
  completed: number;
  total: number;
  steps: NestSellerReadinessStep[];
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

// Shape returned by GET/POST /nest-shipping/v1/seller/profile. Every field is
// stored as a string on the server (dimensions serialize as decimals-in-a-string
// for backward compatibility). free_shipping_allowed is a boolean.
export type NestSellerShippingProfile = {
  ship_from_name: string;
  ship_from_company: string;
  ship_from_street1: string;
  ship_from_street2: string;
  ship_from_city: string;
  ship_from_state: string;
  ship_from_zip: string;
  ship_from_country: string;
  ship_from_phone: string;
  processing_time: string;
  default_weight_oz: string;
  default_length_in: string;
  default_width_in: string;
  default_height_in: string;
  free_shipping_allowed: boolean;
};

// v1.0.127 — NestShippoStatus removed. The per-seller Shippo Connect
// endpoints under /nest-connect/v1/seller/* are no longer called from
// the mobile app; every seller ships on the platform's own Shippo
// account. The type is preserved in git history if it ever needs to
// come back for an admin/diagnostic screen.

// -----------------------------------------------------------------------------
// v1.0.132 — Customization requests. Shape matches the plugin's hydrated
// request object (class-mnu-custom-requests.php). Money is integer cents.
// -----------------------------------------------------------------------------
export type NestCustomRequestStatus =
  | "open"
  | "quoted"
  | "accepted"
  | "paid"
  | "completed"
  | "declined"
  | "withdrawn";

export type NestCustomRequestUserBrief = {
  id: number;
  display_name?: string;
  avatar_url?: string;
  shop_url?: string;
};

export type NestCustomRequestProductBrief = {
  id: number;
  name?: string;
  image_url?: string;
  permalink?: string;
};

export type NestCustomRequestRaw = {
  id: number;
  buyer_id: number;
  seller_id: number;
  product_id: number;
  title: string;
  description: string;
  budget_cents: number;
  quantity: number;
  reference_photo_ids?: number[];
  reference_photo_urls?: string[];
  status: NestCustomRequestStatus;
  quoted_price_cents: number;
  quoted_lead_days: number;
  quoted_at?: string | null;
  quote_note?: string | null;
  decline_reason?: string | null;
  private_product_id: number;
  private_product_slug?: string | null;
  order_id: number;
  buyer?: NestCustomRequestUserBrief;
  seller?: NestCustomRequestUserBrief;
  product?: NestCustomRequestProductBrief;
  unread_for_caller?: number;
  last_activity_at: string;
  created_at: string;
  updated_at: string;
};

export type NestCustomRequestMessageKind =
  | "message"
  | "system_quote"
  | "system_accept"
  | "system_decline"
  | "system_withdraw"
  | "system_paid"
  | "system_completed";

export type NestCustomRequestMessageRaw = {
  id: number;
  request_id: number;
  sender_id: number;
  sender?: NestCustomRequestUserBrief;
  kind: NestCustomRequestMessageKind;
  body: string;
  photo_attachments?: number[];
  photo_urls?: string[];
  created_at: string;
};

export type NestCustomRequestDetailRaw = NestCustomRequestRaw & {
  messages: NestCustomRequestMessageRaw[];
};

export type NestCustomRequestListRaw = {
  items: NestCustomRequestRaw[];
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
};

// Returned by POST /custom-requests/{id}/accept. `private_product_id` is the
// new hidden WooCommerce SKU created for this quote so the buyer can add it
// to their cart and pay through native checkout.
export type NestCustomRequestAcceptRaw = {
  request: NestCustomRequestRaw;
  private_product_id: number;
  private_product_slug: string;
  add_to_cart_url: string;
};
