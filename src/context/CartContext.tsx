// Client-side cart. Persisted locally, unaware of the server until checkout.
// Mirrors v1.0.7's CartContext but in TypeScript with the internal Product shape.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { storage } from "@/src/utils/storage";
import type { Product, Cart, CartItem } from "@/src/types";
import { useAuth } from "./AuthContext";

const CART_STORAGE_KEY = "nest.cart.items";
const MAX_QTY = 99;

type LocalItem = { product: Product; quantity: number; variation?: Record<string, string> | null };

type CartContextValue = {
  cart: Cart | null;
  refreshing: boolean;
  refresh: () => Promise<void>;
  addItem: (product_id: string, quantity: number, variation?: Record<string, string> | null, product?: Product) => Promise<void>;
  addProduct: (product: Product, quantity?: number) => boolean;
  updateItem: (index: number, quantity: number) => Promise<void>;
  removeItem: (index: number) => Promise<void>;
  applyCoupon: (code: string) => Promise<void>;
  removeCoupon: () => Promise<void>;
  clear: () => Promise<void>;
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
    const unit = it.product.sale_price ?? it.product.price ?? 0;
    return {
      product_id: it.product.id,
      quantity: it.quantity,
      variation: it.variation || null,
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

  const addProduct = useCallback((product: Product, quantity: number = 1) => {
    const q = clamp(product, quantity);
    if (q < 1) return false;
    setItems((cur) => {
      const idx = cur.findIndex((it) => it.product.id === product.id);
      if (idx >= 0) {
        const next = [...cur];
        next[idx] = { ...next[idx], product, quantity: clamp(product, next[idx].quantity + q) };
        return next;
      }
      return [...cur, { product, quantity: q }];
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
      itemCount,
    }),
    [cart, refresh, addItem, addProduct, updateItem, removeItem, applyCoupon, removeCoupon, clear, itemCount],
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
