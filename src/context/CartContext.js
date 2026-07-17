import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { clampQuantity } from '../lib/format';
import { loadCart, saveCart } from '../lib/storage';

const CartContext = createContext(null);

function productLimit(product) {
  const stock = Number(product?.stock_quantity);
  if (Number.isFinite(stock)) return Math.max(0, Math.min(99, Math.floor(stock)));
  return product?.stock_status === 'outofstock' ? 0 : 99;
}

function validQuantity(product, quantity) {
  const limit = productLimit(product);
  if (limit < 1) return 0;
  return Math.min(limit, clampQuantity(quantity));
}

function isAvailable(product) {
  return Boolean(product?.id) && product?.stock_status !== 'outofstock' && productLimit(product) > 0;
}

export function CartProvider({ children }) {
  const [items, setItems] = useState([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let mounted = true;
    loadCart()
      .then((stored) => {
        if (!mounted) return;
        const clean = stored
          .filter((item) => isAvailable(item?.product))
          .map((item) => ({ ...item, quantity: validQuantity(item.product, item.quantity) }))
          .filter((item) => item.quantity > 0);
        setItems(clean);
      })
      .finally(() => {
        if (mounted) setHydrated(true);
      });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (hydrated) void saveCart(items);
  }, [hydrated, items]);

  function addItem(product, quantity = 1) {
    if (!isAvailable(product)) return false;
    const nextQuantity = validQuantity(product, quantity);
    if (nextQuantity < 1) return false;

    setItems((current) => {
      const existing = current.find((item) => item.product.id === product.id);
      if (existing) {
        return current.map((item) => item.product.id === product.id
          ? { ...item, quantity: validQuantity(product, item.quantity + nextQuantity), product }
          : item);
      }
      return [...current, { product, quantity: nextQuantity }];
    });
    return true;
  }

  function setQuantity(productId, quantity) {
    setItems((current) => current.flatMap((item) => {
      if (item.product.id !== productId) return [item];
      const nextQuantity = validQuantity(item.product, quantity);
      return nextQuantity > 0 ? [{ ...item, quantity: nextQuantity }] : [];
    }));
  }

  function removeItem(productId) {
    setItems((current) => current.filter((item) => item.product.id !== productId));
  }

  function clearCart() {
    setItems([]);
  }

  const itemCount = items.reduce((total, item) => total + item.quantity, 0);
  const subtotal = items.reduce((total, item) => total + (Number(item.product.price || 0) * item.quantity), 0);

  const value = useMemo(() => ({
    items,
    itemCount,
    subtotal,
    addItem,
    setQuantity,
    removeItem,
    clearCart,
  }), [itemCount, items, subtotal]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error('useCart must be used inside CartProvider.');
  return value;
}
