// Favorites — backed by nest-trust/v1 favorites (products) and the-nest/v1
// blog favorites (v1.0.55 / MNU 3.7.98). Holds both sets in memory so the
// heart on product cards and blog cards can render/toggle optimistically
// and revert on failure.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { nest, ApiError, type NestFavoritesRaw, type NestBlogFavoritesRaw } from "@/src/api/nest";
import { useAuth } from "./AuthContext";
import { toast } from "@/src/components/Toast";
import type { BlogPost } from "@/src/types";
import { toBlogPost } from "@/src/api/adapters";

type FavoritesContextValue = {
  ids: Set<string>;
  blogIds: Set<string>;
  blogPosts: BlogPost[];
  loading: boolean;
  isFavorite: (productId: string | number) => boolean;
  isBlogFavorite: (postId: string | number) => boolean;
  toggle: (productId: string | number) => Promise<void>;
  toggleBlog: (postId: string | number) => Promise<void>;
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

function normalizeBlogFavorites(raw: NestBlogFavoritesRaw): { ids: string[]; posts: BlogPost[] } {
  const list = Array.isArray(raw) ? raw : raw.favorites ?? [];
  const ids: string[] = [];
  const posts: BlogPost[] = [];
  for (const row of list) {
    const id = String(row.post_id);
    ids.push(id);
    if (row.post) posts.push(toBlogPost(row.post));
  }
  return { ids, posts };
}

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [blogIds, setBlogIds] = useState<Set<string>>(new Set());
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setIds(new Set());
      setBlogIds(new Set());
      setBlogPosts([]);
      return;
    }
    setLoading(true);
    try {
      const [rawProducts, rawBlog] = await Promise.allSettled([
        nest.trust.listFavorites(),
        nest.listBlogFavorites(),
      ]);
      if (rawProducts.status === "fulfilled") {
        setIds(new Set(normalizeFavorites(rawProducts.value)));
      }
      if (rawBlog.status === "fulfilled") {
        const { ids: bids, posts } = normalizeBlogFavorites(rawBlog.value);
        setBlogIds(new Set(bids));
        setBlogPosts(posts);
      }
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

  const toggleBlog = useCallback(
    async (postId: string | number) => {
      if (!user) return;
      const id = String(postId);
      const wasFavorite = blogIds.has(id);
      // Optimistic update
      setBlogIds((cur) => {
        const next = new Set(cur);
        if (wasFavorite) next.delete(id);
        else next.add(id);
        return next;
      });
      if (wasFavorite) {
        // Drop from the cached list right away; if the server call fails, refresh restores it.
        setBlogPosts((cur) => cur.filter((p) => p.id !== id));
      }
      try {
        if (wasFavorite) await nest.removeBlogFavorite(id);
        else await nest.toggleBlogFavorite(id);
        // On an add, refresh to pull the full post payload for the Favorites list.
        if (!wasFavorite) {
          try {
            const raw = await nest.listBlogFavorites();
            const { ids: bids, posts } = normalizeBlogFavorites(raw);
            setBlogIds(new Set(bids));
            setBlogPosts(posts);
          } catch {
            // Non-fatal; the id is already in the set for the heart state.
          }
        }
      } catch (e) {
        setBlogIds((cur) => {
          const next = new Set(cur);
          if (wasFavorite) next.add(id);
          else next.delete(id);
          return next;
        });
        toast.error(e instanceof ApiError ? e.friendly : "Could not update favorites");
      }
    },
    [user, blogIds],
  );

  const isFavorite = useCallback((productId: string | number) => ids.has(String(productId)), [ids]);
  const isBlogFavorite = useCallback((postId: string | number) => blogIds.has(String(postId)), [blogIds]);

  const value = useMemo<FavoritesContextValue>(
    () => ({ ids, blogIds, blogPosts, loading, isFavorite, isBlogFavorite, toggle, toggleBlog, refresh }),
    [ids, blogIds, blogPosts, loading, isFavorite, isBlogFavorite, toggle, toggleBlog, refresh],
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error("useFavorites must be used within FavoritesProvider");
  return ctx;
}
