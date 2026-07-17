import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from './AuthContext';

const FavoritesContext = createContext(null);

export function FavoritesProvider({ children }) {
  const { token } = useAuth();
  const [ids, setIds] = useState(() => new Set());
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!token) {
      setIds(new Set());
      setLoaded(true);
      return;
    }
    try {
      const result = await api.getFavorites(token);
      const list = Array.isArray(result) ? result : (result?.product_ids || result?.items || []);
      setIds(new Set(list.map((item) => Number(item?.product_id ?? item?.id ?? item))));
    } catch {
      // Favorites are non-critical; keep whatever we already have.
    } finally {
      setLoaded(true);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const isFavorite = useCallback((productId) => ids.has(Number(productId)), [ids]);

  const toggle = useCallback(async (productId) => {
    if (!token) return 'unauthenticated';
    const id = Number(productId);
    const wasFavorite = ids.has(id);

    // Optimistic update.
    setIds((current) => {
      const next = new Set(current);
      if (wasFavorite) next.delete(id);
      else next.add(id);
      return next;
    });

    try {
      if (wasFavorite) await api.removeFavorite(id, token);
      else await api.toggleFavorite(id, token);
      return wasFavorite ? 'removed' : 'added';
    } catch (err) {
      // Roll back on failure.
      setIds((current) => {
        const next = new Set(current);
        if (wasFavorite) next.add(id);
        else next.delete(id);
        return next;
      });
      throw err;
    }
  }, [ids, token]);

  const value = useMemo(() => ({
    favoriteIds: ids,
    favoriteCount: ids.size,
    loaded,
    isFavorite,
    toggle,
    refresh: load,
  }), [ids, isFavorite, load, loaded, toggle]);

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites() {
  const value = useContext(FavoritesContext);
  if (!value) throw new Error('useFavorites must be used inside FavoritesProvider.');
  return value;
}
