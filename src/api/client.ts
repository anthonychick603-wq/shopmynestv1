import { storage } from "@/src/utils/storage";

const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL || "";
export const AUTH_TOKEN_KEY = "nest.auth.token";

export class ApiError extends Error {
  status: number;
  friendly: string;
  constructor(status: number, message: string, friendly?: string) {
    super(message);
    this.status = status;
    this.friendly = friendly ?? message;
  }
}

// Turn technical errors into customer-friendly copy.
function friendlyFor(path: string, status: number, detail?: string): string {
  if (status === 401 || status === 403) return "Your session has expired. Please sign in again.";
  if (path.includes("/products") && status >= 500) return "We could not load products. Please try again.";
  if (path.includes("/payments") && (status === 402 || status === 400))
    return detail || "We could not complete your payment. Your cart has been saved.";
  if (path.includes("/checkout") && status >= 500)
    return "Something went wrong while placing your order. No duplicate order was created.";
  if (path.includes("/shipping") && status >= 400) return "Shipping could not be calculated for this address.";
  return detail || "Something went wrong. Please try again.";
}

type RequestOpts = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  auth?: boolean;
  retry?: number;
  timeoutMs?: number;
};

async function readToken(): Promise<string | null> {
  return storage.secureGet<string>(AUTH_TOKEN_KEY, "");
}

async function request<T = unknown>(path: string, opts: RequestOpts = {}): Promise<T> {
  const { method = "GET", body, auth = true, retry = 1, timeoutMs = 20000 } = opts;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) {
    const t = await readToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const url = `${BASE_URL}/api${path}`;
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      let detail: string | undefined;
      try {
        const j = await res.json();
        detail = j?.detail || j?.message;
      } catch {}
      throw new ApiError(res.status, detail || res.statusText, friendlyFor(path, res.status, detail));
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  } catch (e) {
    clearTimeout(timer);
    if (e instanceof ApiError) throw e;
    // Retry once for transient failures
    if (retry > 0) {
      return request<T>(path, { ...opts, retry: retry - 1 });
    }
    throw new ApiError(0, "network_error", "We're having trouble connecting. Please try again.");
  }
}

export const api = {
  get: <T>(p: string, o?: RequestOpts) => request<T>(p, { ...o, method: "GET" }),
  post: <T>(p: string, body?: unknown, o?: RequestOpts) =>
    request<T>(p, { ...o, method: "POST", body }),
  patch: <T>(p: string, body?: unknown, o?: RequestOpts) =>
    request<T>(p, { ...o, method: "PATCH", body }),
  del: <T>(p: string, o?: RequestOpts) => request<T>(p, { ...o, method: "DELETE" }),
};

export async function setAuthToken(token: string | null) {
  if (token) await storage.secureSet(AUTH_TOKEN_KEY, token);
  else await storage.secureRemove(AUTH_TOKEN_KEY);
}

export function isSignedInSync(token: string | null | undefined): boolean {
  return !!token;
}
