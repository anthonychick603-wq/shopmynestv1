// Favorites — backed by nest-trust/v1 favorites endpoints, with optimistic UI.
// Holds the current user's favorited product IDs in memory; toggling updates
// state immediately and reverts if the server call fails.
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { nest, ApiError, type NestFavoritesRaw } from "@/src/api/nest";
import { useAuth } from "./AuthContext";
import { toast } from "@/src/components/Toast";

type FavoritesContextValue = {
  ids: Set<string>;
  loading: boolean;
  isFavorite: (productId: string | number) => boolean;
  toggle: (productId: string | number) => Promise<void>;
  refresh: () => Promise<void>;
};

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

function normalizeFavorites(raw: NestFavoritesRaw): string[] {
  // The live plugin returns a plain array of `{ product_id, created_at }` objects
  // (TNM_Trust_Favorites::get_user_favorites), but we also tolerate raw ID arrays
  // and `{product_ids}`/`{favorites}` envelopes — hence the shared object-aware map.
  const list = Array.isArray(raw) ? raw : raw.product_ids ?? raw.favorites ?? [];
  return list.map((x) => (typeof x === "object" && x ? String(x.product_id) : String(x)));
}

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setIds(new Set());
      return;
    }
    setLoading(true);
    try {
      const raw = await nest.trust.listFavorites();
      setIds(new Set(normalizeFavorites(raw)));
    } catch {
      // Non-fatal: favorites just render empty until next refresh.
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const toggle = useCallback(
    async (productId: string | number) => {
      if (!user) return;
      const id = String(productId);
      const wasFavorite = ids.has(id);
      // Optimistic update
      setIds((cur) => {
        const next = new Set(cur);
        if (wasFavorite) next.delete(id);
        else next.add(id);
        return next;
      });
      try {
        if (wasFavorite) await nest.trust.removeFavorite(id);
        else await nest.trust.toggleFavorite(id);
      } catch (e) {
        // Revert on failure
        setIds((cur) => {
          const next = new Set(cur);
          if (wasFavorite) next.add(id);
          else next.delete(id);
          return next;
        });
        toast.error(e instanceof ApiError ? e.friendly : "Could not update favorites");
      }
    },
    [user, ids],
  );

  const value: FavoritesContextValue = {
    ids,
    loading,
    isFavorite: (productId) => ids.has(String(productId)),
    toggle,
    refresh,
  };

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error("useFavorites must be used within FavoritesProvider");
  return ctx;
}
