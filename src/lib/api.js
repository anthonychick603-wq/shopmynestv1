import { API_NAMESPACES, SITE_URL } from '../config';

const DEFAULT_TIMEOUT_MS = 25000;

export class ApiError extends Error {
  constructor(message, status = 0, code = 'request_failed', details = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function makeUrl(namespace, path, query) {
  const base = `${SITE_URL}${API_NAMESPACES[namespace]}`;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const params = new URLSearchParams();
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, String(item)));
      return;
    }
    params.set(key, String(value));
  });
  const queryString = params.toString();
  return `${base}${cleanPath}${queryString ? `?${queryString}` : ''}`;
}

async function parseResponse(response) {
  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new ApiError(
      text?.slice(0, 220) || 'The server returned an unreadable response.',
      response.status,
      'invalid_json'
    );
  }

  if (!response.ok) {
    throw new ApiError(
      data?.message || data?.error || `Request failed with status ${response.status}.`,
      response.status,
      data?.code || 'request_failed',
      data?.data || null
    );
  }

  return data;
}

export async function apiRequest(namespace, path, options = {}) {
  const {
    method = 'GET',
    token,
    query,
    body,
    formData,
    headers = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;

  const requestHeaders = { Accept: 'application/json', ...headers };
  if (token) {
    requestHeaders.Authorization = `Bearer ${token}`;
    requestHeaders['X-MyNest-Token'] = token;
  }
  if (!formData && body !== undefined) requestHeaders['Content-Type'] = 'application/json';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(makeUrl(namespace, path, query), {
      method,
      headers: requestHeaders,
      body: formData || (body !== undefined ? JSON.stringify(body) : undefined),
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new ApiError(
        'The website took too long to respond. Check your connection and try again.',
        0,
        'request_timeout',
        error
      );
    }
    throw new ApiError(
      `Could not reach ${SITE_URL}. Check your connection and confirm the website is online.`,
      0,
      'network_error',
      error
    );
  } finally {
    clearTimeout(timeout);
  }

  return parseResponse(response);
}

export const api = {
  getConfig: () => apiRequest('marketplace', '/config'),
  getMobileHealth: (token) => apiRequest('marketplace', '/mobile-health', { token }),
  getCategories: () => apiRequest('marketplace', '/categories'),
  getProducts: (params = {}) => apiRequest('marketplace', '/products', { query: params }),
  getProduct: (id) => apiRequest('marketplace', `/products/${id}`),
  getFeed: (params = {}, token) => apiRequest('marketplace', '/feed', { query: params, token }),
  getSeller: (id, token) => apiRequest('marketplace', `/sellers/${id}`, { token }),
  getSellerProducts: (id, params = {}) => apiRequest('marketplace', `/sellers/${id}/products`, { query: params }),
  followSeller: (id, token) => apiRequest('marketplace', `/sellers/${id}/follow`, { method: 'POST', token }),
  unfollowSeller: (id, token) => apiRequest('marketplace', `/sellers/${id}/follow`, { method: 'DELETE', token }),
  reportProduct: (id, reason, details, token) => apiRequest('marketplace', `/products/${id}/report`, {
    method: 'POST',
    token,
    body: { reason, details },
  }),

  login: (login, password) => apiRequest('marketplace', '/auth/login', {
    method: 'POST',
    body: { login, password },
  }),
  register: (payload) => apiRequest('marketplace', '/auth/register', {
    method: 'POST',
    body: payload,
  }),
  logout: (token) => apiRequest('marketplace', '/auth/logout', { method: 'POST', token }),
  me: (token) => apiRequest('marketplace', '/auth/me', { token }),
  updateMe: (payload, token) => apiRequest('marketplace', '/auth/me', { method: 'PATCH', token, body: payload }),
  uploadMedia: (file, token) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiRequest('marketplace', '/media', { method: 'POST', token, formData, timeoutMs: 60000 });
  },

  getNotifications: (params, token) => apiRequest('marketplace', '/notifications', { query: params, token }),
  markNotificationsRead: (ids, token) => apiRequest('marketplace', '/notifications/read', {
    method: 'POST', token, body: { ids },
  }),
  getConversations: (token) => apiRequest('marketplace', '/messages', { token }),
  getConversation: (userId, token) => apiRequest('marketplace', `/messages/${userId}`, { token }),
  sendMessage: (recipientId, message, token) => apiRequest('marketplace', '/messages', {
    method: 'POST', token, body: { recipient_id: recipientId, message },
  }),

  submitSellerApplication: (payload, token) => apiRequest('marketplace', '/seller/application', {
    method: 'POST', token, body: payload,
  }),
  getSellerApplicationStatus: (token) => apiRequest('marketplace', '/seller/application/status', { token }),
  getSellerDashboard: (token) => apiRequest('marketplace', '/seller/dashboard', { token }),
  getSellerProfile: (token) => apiRequest('marketplace', '/seller/profile', { token }),
  updateSellerProfile: (payload, token) => apiRequest('marketplace', '/seller/profile', {
    method: 'PATCH', token, body: payload,
  }),
  getMyProducts: (params, token) => apiRequest('marketplace', '/seller/products', { query: params, token }),
  createProduct: (payload, token) => apiRequest('marketplace', '/seller/products', {
    method: 'POST', token, body: payload,
  }),
  updateProduct: (id, payload, token) => apiRequest('marketplace', `/seller/products/${id}`, {
    method: 'PATCH', token, body: payload,
  }),
  deleteProduct: (id, token) => apiRequest('marketplace', `/seller/products/${id}`, {
    method: 'DELETE', token,
  }),
  getSellerOrders: (params, token) => apiRequest('marketplace', '/seller/orders', { query: params, token }),
  updateSellerOrder: (id, payload, token) => apiRequest('marketplace', `/seller/orders/${id}`, {
    method: 'PATCH', token, body: payload,
  }),
  getSellerEarnings: (params, token) => apiRequest('marketplace', '/seller/earnings', { query: params, token }),
  getSellerPayouts: (token) => apiRequest('marketplace', '/seller/payouts', { token }),
  requestPayout: (payload, token) => apiRequest('marketplace', '/seller/payouts', {
    method: 'POST', token, body: payload,
  }),

  getShippingProfile: (token) => apiRequest('shipping', '/seller/profile', { token }),
  saveShippingProfile: (payload, token) => apiRequest('shipping', '/seller/profile', {
    method: 'POST', token, body: payload,
  }),
  getProductShipping: (id, token) => apiRequest('shipping', `/seller/products/${id}/shipping`, { token }),
  saveProductShipping: (id, payload, token) => apiRequest('shipping', `/seller/products/${id}/shipping`, {
    method: 'POST', token, body: payload,
  }),
  getShippingLabel: (id, token) => apiRequest('labels', `/seller/orders/${id}/label`, { token }),
  getShippingRates: (id, token) => apiRequest('labels', `/seller/orders/${id}/rates`, {
    method: 'POST', token, body: {}, timeoutMs: 60000,
  }),
  buyShippingLabel: (id, payload, token) => apiRequest('labels', `/seller/orders/${id}/label`, {
    method: 'POST', token, body: payload, timeoutMs: 60000,
  }),

  getAddresses: (token) => apiRequest('operations', '/addresses', { token }),
  saveAddresses: (payload, token) => apiRequest('operations', '/addresses', { method: 'POST', token, body: payload }),
  registerDeviceToken: (payload, token) => apiRequest('operations', '/device-token', { method: 'POST', token, body: payload }),
  uploadAccountPhoto: (file, token) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiRequest('marketplace', '/account/photo/upload', { method: 'POST', token, formData, timeoutMs: 60000 });
  },

  quoteCheckout: (items, shipping, token, offerToken) => apiRequest('checkout', '/checkout/quote', {
    method: 'POST', token, body: { items, shipping, offer_token: offerToken || undefined },
  }),
  createPaymentIntent: (payload, token) => apiRequest('checkout', '/checkout/create-intent', {
    method: 'POST', token, body: payload, timeoutMs: 45000,
  }),
  completeCheckout: (payload, token) => apiRequest('checkout', '/checkout/complete', {
    method: 'POST', token, body: payload, timeoutMs: 45000,
  }),

  getBuyerOrders: (params, token) => apiRequest('marketplace', '/orders', { query: params, token }),
  getBuyerOrder: (id, token) => apiRequest('marketplace', `/orders/${id}`, { token }),

  // Trust & Growth Suite (nest-trust/v1)
  getTrustFeed: (params = {}, token) => apiRequest('trust', '/feed', { query: params, token }),

  getFavorites: (token) => apiRequest('trust', '/favorites', { token }),
  toggleFavorite: (productId, token) => apiRequest('trust', '/favorites', {
    method: 'POST', token, body: { product_id: productId },
  }),
  removeFavorite: (productId, token) => apiRequest('trust', `/favorites/${productId}`, {
    method: 'DELETE', token,
  }),
  getFavoritesCount: (productId) => apiRequest('trust', `/products/${productId}/favorites-count`),

  getSellerBadge: (sellerId) => apiRequest('trust', `/sellers/${sellerId}/badge`),
  getSellerProStatus: (sellerId) => apiRequest('trust', `/sellers/${sellerId}/pro-status`),

  createDispute: (payload, token) => apiRequest('trust', '/disputes', {
    method: 'POST', token, body: payload,
  }),
  getDisputes: (params, token) => apiRequest('trust', '/disputes', { query: params, token }),
  getDispute: (id, token) => apiRequest('trust', `/disputes/${id}`, { token }),
  updateDispute: (id, payload, token) => apiRequest('trust', `/disputes/${id}`, {
    method: 'PUT', token, body: payload,
  }),
  escalateDispute: (id, token) => apiRequest('trust', `/disputes/${id}/escalate`, {
    method: 'POST', token, body: {},
  }),

  createOffer: (payload, token) => apiRequest('trust', '/offers', {
    method: 'POST', token, body: payload,
  }),
  getOffers: (params, token) => apiRequest('trust', '/offers', { query: params, token }),
  updateOffer: (id, payload, token) => apiRequest('trust', `/offers/${id}`, {
    method: 'PUT', token, body: payload,
  }),
  startOfferCheckout: (offerToken, token) => apiRequest('trust', '/offers/checkout/start', {
    method: 'POST', token, body: { token: offerToken },
  }),
  addToBundleBuilder: (productId, token) => apiRequest('trust', '/bundle-builder', {
    method: 'POST', token, body: { product_id: productId },
  }),
  getBundleBuilder: (token) => apiRequest('trust', '/bundle-builder', { token }),

  createBoost: (payload, token) => apiRequest('trust', '/boosts', {
    method: 'POST', token, body: payload,
  }),
};
