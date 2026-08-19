// Adapters — convert WordPress/WooCommerce shapes into the internal types used by the UI.
import type {
  NestBlogPostRaw,
  NestCategoryRaw,
  NestDisputeRaw,
  NestFeedItemRaw,
  NestNotificationRaw,
  NestOrderRaw,
  NestProductRaw,
  NestUserRaw,
} from "@/src/api/nest";
import { decodeEntities } from "@/src/utils/html";
import type {
  BlogPost,
  Category,
  Dispute,
  DisputeStatus,
  NestUser,
  NotificationItem,
  Order,
  Post,
  Product,
} from "@/src/types";

export function toProduct(p: NestProductRaw): Product {
  const images = [p.image, ...(p.gallery || [])].filter(Boolean) as string[];
  return {
    id: String(p.id),
    title: decodeEntities(p.name),
    description: p.description || p.short_description || "",
    price: Number(p.price ?? p.regular_price ?? 0),
    sale_price: p.sale_price != null ? Number(p.sale_price) : null,
    categories: (p.categories || []).map((c) => c.slug),
    images,
    featured_image_index: 0,
    stock: Number(p.stock_quantity ?? 0),
    sku: "",
    in_stock: p.stock_status !== "outofstock",
    variations: [],
    status: "published",
    seller: p.seller
      ? {
          id: String(p.seller.id),
          name: decodeEntities(p.seller.store_name || ""),
          profile_photo: p.seller.avatar || null,
          rating: typeof p.seller.rating === "number" ? p.seller.rating : undefined,
          review_count: typeof p.seller.review_count === "number" ? p.seller.review_count : undefined,
        }
      : undefined,
    permalink: p.permalink,
    // v1.0.66 Build #5 - Only populated in seller context, so the field is
    // usually undefined for a buyer-facing product card.
    favorites_count: typeof p.favorites_count === "number" ? p.favorites_count : undefined,
    // v1.0.91 — variable product picker payload. Simple products carry
    // undefined here so nothing renders in the product screen picker.
    type: p.type,
    attributes: Array.isArray(p.attributes)
      ? p.attributes.map((a) => ({ name: a.name, label: a.label, options: a.options || [] }))
      : undefined,
    variation_details: Array.isArray(p.variations)
      ? p.variations.map((v) => ({
          id: Number(v.id),
          attributes: v.attributes || {},
          price: Number(v.price ?? 0),
          regular_price: v.regular_price != null ? Number(v.regular_price) : undefined,
          stock_status: (v.stock_status === "outofstock" ? "outofstock" : "instock") as "instock" | "outofstock",
          stock_quantity: v.stock_quantity ?? null,
          image: v.image || undefined,
          sku: v.sku || undefined,
          is_purchasable: !!v.is_purchasable,
        }))
      : undefined,
  };
}

export function toCategory(c: NestCategoryRaw): Category {
  return {
    id: String(c.id),
    name: decodeEntities(c.name),
    slug: c.slug,
    icon: undefined,
  };
}

export function toUser(u: NestUserRaw): NestUser {
  const displayName = u.display_name || u.name || [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email;
  return {
    id: String(u.id),
    email: u.email,
    name: displayName,
    profile_photo: u.photo_url || u.avatar || null,
    // v1.0.88 — backend now sends an explicit is_admin flag (plugin v3.7.115).
    // Previously we derived role from is_seller || is_approved_seller, which
    // collapsed admin+seller accounts to "seller" and hid the admin drawer.
    // Prefer the explicit flag; keep the legacy derivation as a fallback for
    // older backends that don't send is_admin yet.
    role: u.is_admin === true
      ? "admin"
      : u.is_seller
      ? "seller"
      : u.is_approved_seller
      ? "admin"
      : "customer",
    is_approved_seller: u.is_approved_seller === true,
    seller_id: u.seller_id != null ? String(u.seller_id) : null,
    followed_sellers: [],
    favorites: [],
    addresses: [],
    notification_preferences: {},
    seller_application_status: (u.seller_status as any) || (u.is_seller ? "approved" : "not_submitted"),
    seller_profile: u.is_seller
      ? { shop_name: u.store_name || displayName, shop_description: "", shipping_info: "" }
      : null,
  };
}

export function toOrder(o: NestOrderRaw): Order {
  const asAddr = (a: any = {}) => ({
    id: `wp-${o.id}`,
    first_name: a.first_name || "",
    last_name: a.last_name || "",
    phone: a.phone || "",
    line1: a.address_1 || "",
    line2: a.address_2 || "",
    city: a.city || "",
    state: a.state || "",
    postal_code: a.postcode || "",
    country: a.country || "US",
  });
  return {
    id: String(o.id),
    checkout_id: `wp-${o.id}`,
    items: (o.items || []).map((it) => ({
      product_id: String(it.product_id),
      quantity: it.quantity,
      unit_price: it.quantity ? it.subtotal / it.quantity : 0,
      line_total: it.total,
      variation: null,
      product: {
        id: String(it.product_id),
        title: decodeEntities(it.name),
        description: "",
        price: it.quantity ? it.subtotal / it.quantity : 0,
        categories: [],
        images: it.image ? [it.image] : [],
        stock: 0,
        in_stock: true,
        variations: [],
        status: "published",
        seller: it.seller_id
          ? { id: String(it.seller_id), name: decodeEntities(it.seller_name || ""), profile_photo: null }
          : undefined,
      },
    })),
    shipping_address: asAddr(o.shipping),
    billing_address: asAddr(o.billing),
    shipping_method: { id: "wp", name: o.shipping_method || "Standard", price: o.shipping_total },
    shipping_cost: o.shipping_total,
    subtotal: o.subtotal,
    discount: o.discount_total,
    tax: o.tax_total,
    total: o.total,
    // v1.0.51 - buyer-visible status now derives from the aggregate
    // shipping_status the plugin computes across all sellers on the order.
    // The old logic ignored per-seller shipped state, so multi-seller
    // orders stayed "processing" until Woo itself flipped to completed.
    status: deriveBuyerStatus(o),
    tracking_rows: (o.tracking || []).map((t) => ({
      seller_id: t.seller_id,
      seller_name: decodeEntities(t.seller_name || ""),
      number: t.number || "",
      carrier: t.carrier || "",
      service: t.service || "",
      tracking_url: t.tracking_url || "",
      label_source: (t.label_source as any) || "",
      shipped_at: t.shipped_at || "",
      status: t.status || "",
    })),
    shipping_status: (o.shipping_status as Order["shipping_status"]) || deriveShippingStatus(o),
    can_review: !!o.reviewable?.can_review,
    reviewable_seller_ids: o.reviewable?.seller_ids || [],
    contact_email: (o.billing as any)?.email,
    created_at: o.date_created,
    paid_at: o.date_paid,
    completed_at: o.date_completed,
  };
}

function deriveBuyerStatus(o: NestOrderRaw): Order["status"] {
  if (o.status === "failed") return "failed";
  if (o.status === "cancelled") return "cancelled";
  if (o.status === "completed") return "delivered";
  const ship = o.shipping_status || deriveShippingStatus(o);
  if (ship === "shipped") return "shipped";
  if (ship === "delivered") return "delivered";
  if (o.status === "processing") return "processing";
  if (o.status === "pending" || o.status === "on-hold") return "awaiting_payment";
  return "processing";
}

function deriveShippingStatus(o: NestOrderRaw): Order["shipping_status"] {
  // Fallback for older bridges that don't emit shipping_status yet: use
  // the presence of a tracking row as a proxy for "at least partially
  // shipped", so buyers on outdated servers still get some parity.
  const rows = o.tracking || [];
  if (o.status === "completed") return "delivered";
  if (rows.some((r) => r.status === "shipped" || r.status === "completed")) return "partial";
  return "awaiting";
}

// Personalized-feed rows can arrive product-shaped (`name`) or feed-item-shaped
// (`title`, `author`). Normalize both into the internal Product type.
export function feedRowToProduct(raw: NestProductRaw | NestFeedItemRaw): Product {
  if ((raw as NestProductRaw).name) return toProduct(raw as NestProductRaw);
  const fi = raw as NestFeedItemRaw;
  return toProduct({
    id: fi.id,
    name: fi.title,
    description: fi.excerpt || fi.content || "",
    price: Number(fi.price ?? 0),
    image: fi.image,
    seller: fi.author,
    stock_status: (fi.stock_status as any) || "instock",
    stock_quantity: fi.stock_quantity,
  } as NestProductRaw);
}

// Feed/profile post rows (type:'post') → internal Post type.
export function toPost(raw: NestFeedItemRaw): Post {
  return {
    id: String(raw.id),
    title: decodeEntities(raw.title || ""),
    content: raw.content || "",
    excerpt: decodeEntities(raw.excerpt || ""),
    image: raw.image || null,
    permalink: raw.permalink,
    date: raw.date,
    comments: Number(raw.comments ?? 0),
    author: raw.author
      ? { id: String(raw.author.id), name: decodeEntities(raw.author.store_name || ""), profile_photo: raw.author.avatar || null }
      : { id: "", name: "", profile_photo: null },
  };
}

export function toBlogPost(raw: NestBlogPostRaw): BlogPost {
  return {
    id: String(raw.id),
    status: raw.status,
    caption: decodeEntities(raw.caption || ""),
    image: raw.image || raw.thumbnail || null,
    date: raw.created_at,
    author: {
      id: String(raw.author?.id ?? ""),
      name: decodeEntities(raw.author?.name || ""),
      profile_photo: raw.author?.avatar || null,
    },
    comment_count: Number(raw.comments ?? 0),
    favorites_count: Number(raw.favorites_count ?? 0),
    is_favorited: Boolean(raw.is_favorited),
  };
}

export function toDispute(d: NestDisputeRaw): Dispute {
  return {
    id: String(d.id),
    order_id: String(d.order_id),
    status: (d.status as DisputeStatus) || "open",
    reason: d.reason || "",
    description: d.description || "",
    resolution_note: d.resolution_note ?? null,
    refund_amount: d.refund_amount ?? null,
    evidence: Array.isArray(d.evidence) ? d.evidence : [],
    contacted_seller_at: d.contacted_seller_at ?? null,
    created_at: d.created_at,
    updated_at: d.updated_at,
    can_escalate: !!d.can_escalate,
  };
}

export function toNotification(n: NestNotificationRaw): NotificationItem {
  return {
    id: String(n.id),
    type: n.type,
    title: decodeEntities(n.title),
    body: decodeEntities(n.body),
    read: !!n.read,
    created_at: n.created_at || n.date || new Date().toISOString(),
    meta: n.meta,
  };
}
