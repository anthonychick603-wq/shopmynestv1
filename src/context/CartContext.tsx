// Client-side cart. Persisted locally, unaware of the server until checkout.
// Mirrors v1.0.7's CartContext but in TypeScript with the internal Product shape.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { storage } from "@/src/utils/storage";
import type { Product, Cart, CartItem, ProductVariationDetail } from "@/src/types";
import { nest } from "@/src/api/nest";
import { toProduct } from "@/src/api/adapters";
import { useAuth } from "./AuthContext";

const CART_STORAGE_KEY = "nest.cart.items";
const MAX_QTY = 99;

// v1.0.91 — cart lines can now pin a specific variation (size/color combo)
// on variable products. `variation_id` is the numeric id the server needs
// when it creates the WC order line; `variation` is the display-only
// attribute→option map. Both are optional for backwards compat with
// simple products.
type LocalItem = {
  product: Product;
  quantity: number;
  variation?: Record<string, string> | null;
  variation_id?: number | null;
  variation_price?: number | null;
};

type CartContextValue = {
  cart: Cart | null;
  refreshing: boolean;
  refresh: () => Promise<void>;
  addItem: (product_id: string, quantity: number, variation?: Record<string, string> | null, product?: Product) => Promise<void>;
  addProduct: (product: Product, quantity?: number, variation?: ProductVariationDetail | null) => boolean;
  updateItem: (index: number, quantity: number) => Promise<void>;
  removeItem: (index: number) => Promise<void>;
  applyCoupon: (code: string) => Promise<void>;
  removeCoupon: () => Promise<void>;
  clear: () => Promise<void>;
  // v1.0.158 — refresh every line's price/stock from the server. Fixes
  // "seller edited price, cart still shows old value" because LocalItem
  // stores a snapshot of the product taken at add-to-cart time and has
  // no other way to notice a subsequent price / stock change.
  refreshPrices: () => Promise<void>;
  itemCount: number;
};

const CartContext = createContext<CartContextValue | null>(null);

function limitFor(p: Product): number {
  const s = Number(p.stock);
  if (Number.isFinite(s) && s > 0) return Math.min(MAX_QTY, s);
  return p.in_stock ? MAX_QTY : 0;
}

function clamp(product: Product, qty: number): number {
  const l = limitFor(product);
  if (l < 1) return 0;
  return Math.max(0, Math.min(l, Math.floor(qty)));
}

function toCart(items: LocalItem[]): Cart {
  const outItems: CartItem[] = items.map((it) => {
    // Prefer the picked variation price when set; fall back to the product
    // price so simple products keep their historical unit price.
    const unit = it.variation_price != null
      ? it.variation_price
      : (it.product.sale_price ?? it.product.price ?? 0);
    return {
      product_id: it.product.id,
      quantity: it.quantity,
      variation: it.variation || null,
      variation_id: it.variation_id ?? null,
      unit_price: unit,
      line_total: Math.round(unit * it.quantity * 100) / 100,
      product: it.product,
    };
  });
  const subtotal = outItems.reduce((s, it) => s + it.line_total, 0);
  // Shipping is no longer guessed with a flat client-side rate. The cart screen
  // resolves it from real carrier quotes once a destination address is entered
  // (/checkout/quote), so the base cart carries 0 and the UI shows a
  // "calculated after you add an address" state until then.
  return {
    id: "local",
    items: outItems,
    coupon_code: null,
    subtotal: Math.round(subtotal * 100) / 100,
    discount: 0,
    shipping: 0,
    tax: 0,
    tax_calculated: false,
    total: Math.round(subtotal * 100) / 100,
  };
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [items, setItems] = useState<LocalItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    (async () => {
      const raw = await storage.getItem<LocalItem[]>(CART_STORAGE_KEY, []);
      const clean = (Array.isArray(raw) ? raw : [])
        .filter((it: LocalItem) => it?.product && it.product.id)
        .map((it: LocalItem) => ({ ...it, quantity: clamp(it.product, it.quantity) }))
        .filter((it: LocalItem) => it.quantity > 0);
      setItems(clean);
      setHydrated(true);
    })();
  }, []);

  useEffect(() => {
    if (hydrated) storage.setItem(CART_STORAGE_KEY, items);
  }, [items, hydrated]);

  const cart = useMemo(() => toCart(items), [items]);
  const itemCount = useMemo(() => items.reduce((s, it) => s + it.quantity, 0), [items]);

  const refresh = useCallback(async () => {
    // client-side; nothing to fetch
  }, []);

  // v1.0.158 — Re-fetch every distinct product in the cart and patch the
  // stored snapshot with the current price / sale_price / stock / in_stock.
  // We keep the rest of the snapshot (title, image, etc.) because the
  // catalog endpoint that filled it is the same endpoint we'd hit here.
  // Variation prices are also refreshed by looking up the pinned variation
  // by id inside the refreshed product's variations array.
  const refreshPrices = useCallback(async () => {
    setItems((cur) => {
      if (cur.length === 0) return cur;
      // Kick off the fetches from a snapshot; we apply results in a later
      // setItems call so React sees a single update.
      const ids = Array.from(new Set(cur.map((it) => it.product.id)));
      Promise.all(
        ids.map(async (id) => {
          try {
            const raw = await nest.getProduct(id);
            return { id, product: toProduct(raw) };
          } catch {
            return { id, product: null };
          }
        }),
      ).then((results) => {
        const byId = new Map<string | number, Product>();
        for (const r of results) if (r.product) byId.set(r.id, r.product);
        if (byId.size === 0) return;
        setItems((prev) =>
          prev
            .map((it) => {
              const fresh = byId.get(it.product.id);
              if (!fresh) return it;
              // Refresh the variation-picked price too, when applicable.
              let variation_price = it.variation_price;
              if (it.variation_id != null && Array.isArray(fresh.variation_details)) {
                const v = fresh.variation_details.find((x) => x.id === it.variation_id);
                if (v && v.price != null) variation_price = v.price;
              }
              return {
                ...it,
                product: fresh,
                variation_price,
                quantity: clamp(fresh, it.quantity),
              };
            })
            .filter((it) => it.quantity > 0),
        );
      });
      return cur;
    });
  }, []);

  const addProduct = useCallback((product: Product, quantity: number = 1, variation: ProductVariationDetail | null = null) => {
    // v1.0.91 — when a variation is picked, its stock/purchasability
    // gates the add (not the parent product). Stock quantity is copied
    // from the variation so `clamp` and `limitFor` behave correctly.
    const gate: Product = variation
      ? {
          ...product,
          stock: Number(variation.stock_quantity ?? 0),
          in_stock: variation.stock_status !== "outofstock" && variation.is_purchasable,
        }
      : product;
    const q = clamp(gate, quantity);
    if (q < 1) return false;
    setItems((cur) => {
      // Two lines of the same product with different variations must NOT merge.
      const idx = cur.findIndex(
        (it) => it.product.id === product.id && (it.variation_id ?? null) === (variation?.id ?? null),
      );
      if (idx >= 0) {
        const next = [...cur];
        next[idx] = { ...next[idx], product, quantity: clamp(gate, next[idx].quantity + q) };
        return next;
      }
      return [
        ...cur,
        {
          product,
          quantity: q,
          variation: variation?.attributes ?? null,
          variation_id: variation?.id ?? null,
          variation_price: variation?.price ?? null,
        },
      ];
    });
    return true;
  }, []);

  const addItem = useCallback<CartContextValue["addItem"]>(async (_product_id, quantity, _variation, product) => {
    if (!product) return;
    addProduct(product, quantity);
  }, [addProduct]);

  const updateItem = useCallback(async (index: number, quantity: number) => {
    setItems((cur) =>
      cur
        .map((it, i) => (i === index ? { ...it, quantity: clamp(it.product, quantity) } : it))
        .filter((it) => it.quantity > 0),
    );
  }, []);

  const removeItem = useCallback(async (index: number) => {
    setItems((cur) => cur.filter((_, i) => i !== index));
  }, []);

  const applyCoupon = useCallback<CartContextValue["applyCoupon"]>(async (_code) => {
    // Coupons resolved at checkout by WooCommerce
  }, []);

  const removeCoupon = useCallback(async () => {}, []);

  const clear = useCallback(async () => {
    setItems([]);
  }, []);

  const value = useMemo<CartContextValue>(
    () => ({
      cart,
      refreshing: false,
      refresh,
      addItem,
      addProduct,
      updateItem,
      removeItem,
      applyCoupon,
      removeCoupon,
      clear,
      refreshPrices,
      itemCount,
    }),
    [cart, refresh, addItem, addProduct, updateItem, removeItem, applyCoupon, removeCoupon, clear, refreshPrices, itemCount],
  );

  // Clear cart on logout
  useEffect(() => {
    if (!user && hydrated && items.length > 0) {
      // Keep the cart across logins per the v1.0.7 UX — do nothing on logout
    }
  }, [user, hydrated, items.length]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
