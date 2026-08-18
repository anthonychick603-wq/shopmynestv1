// v1.0.56 - share utility. Wraps React Native's Share API with a consistent
// title + short description + URL payload so the same social preview shows up
// whether the share sheet is opened from a detail screen or a card.
//
// Android App Links are configured in app.json so shopmynest.com/product/*,
// /?p=*, /shop/*, and blog post URLs open in the app when installed - the
// share still ships a plain website URL so the recipient can always open it
// in a browser.
import { Share } from "react-native";
import { SITE } from "@/src/api/nest";
import { decodeEntities, stripHtml } from "@/src/utils/html";
import type { BlogPost, Product } from "@/src/types";

const MAX_DESCRIPTION = 140;

function clip(text: string, max = MAX_DESCRIPTION): string {
  const clean = stripHtml(decodeEntities(text || ""));
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).trimEnd() + "\u2026";
}

export type ShareInput = {
  title: string;
  description?: string;
  url: string;
};

/**
 * Show the platform share sheet. Title + description + URL land as
 * multi-line text so recipients see context, not just a bare link. On iOS
 * the `url` field also drives the rich link preview.
 */
export async function shareContent({ title, description, url }: ShareInput): Promise<void> {
  const cleanTitle = decodeEntities(title || "").trim() || "ShopMyNest";
  const cleanDesc = description ? clip(description) : "";
  const message = cleanDesc
    ? `${cleanTitle} on ShopMyNest\n${cleanDesc}\n${url}`
    : `${cleanTitle} on ShopMyNest\n${url}`;
  try {
    await Share.share(
      { message, url, title: cleanTitle },
      { dialogTitle: `Share ${cleanTitle}` },
    );
  } catch {
    // The user dismissing the sheet throws on some Android versions; treat as no-op.
  }
}

/**
 * Best available public URL for a product. Prefers the WP permalink (with the
 * SEO-friendly slug) and falls back to the canonical `/?p=<id>` form.
 */
export function productShareUrl(product: Pick<Product, "id" | "permalink">): string {
  if (product.permalink && /^https?:/i.test(product.permalink)) return product.permalink;
  return `${SITE}/?p=${product.id}`;
}

/** Best available public URL for a blog post. */
export function blogShareUrl(post: Pick<BlogPost, "id">): string {
  return `${SITE}/?p=${post.id}`;
}

/**
 * Best available public URL for a seller shop. `shop_url` is set by the
 * marketplace plugin when the seller has an active storefront; fall back to
 * the canonical `/vendors/<id>/` slug that Dokan uses.
 */
export function sellerShareUrl(seller: { id: number | string; shop_url?: string | null }): string {
  if (seller.shop_url && /^https?:/i.test(String(seller.shop_url))) return String(seller.shop_url);
  return `${SITE}/vendors/${seller.id}/`;
}

/** Convenience: share a product with a sensible default description. */
export function shareProduct(product: Product): Promise<void> {
  return shareContent({
    title: product.title,
    description: product.description || undefined,
    url: productShareUrl(product),
  });
}

/** Convenience: share a blog post with the caption as its description. */
export function shareBlogPost(post: BlogPost): Promise<void> {
  const author = post.author?.name ? ` \u2014 ${post.author.name}` : "";
  return shareContent({
    title: `Fresh from the Nest${author}`,
    description: post.caption,
    url: blogShareUrl(post),
  });
}

/** Convenience: share a seller shop with the tagline as its description. */
export function shareSeller(seller: {
  id: number | string;
  store_name?: string | null;
  tagline?: string | null;
  about?: string | null;
  shop_url?: string | null;
}): Promise<void> {
  const name = seller.store_name || "Seller";
  return shareContent({
    title: `${name} on ShopMyNest`,
    description: seller.tagline || seller.about || undefined,
    url: sellerShareUrl(seller),
  });
}
