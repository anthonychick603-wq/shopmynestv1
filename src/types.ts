export type Role = "customer" | "seller" | "admin";

export type NestAddress = {
  id: string;
  label?: string;
  first_name: string;
  last_name: string;
  phone?: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  is_default_shipping?: boolean;
  is_default_billing?: boolean;
};

export type NestUser = {
  id: string;
  email: string;
  name: string;
  profile_photo?: string | null;
  role: Role;
  // Backend's "can manage the store" flag: approved sellers plus admins/managers.
  is_approved_seller: boolean;
  seller_id?: string | null;
  followed_sellers: string[];
  favorites: string[];
  addresses: NestAddress[];
  notification_preferences: Record<string, boolean>;
  seller_application_status: "not_submitted" | "pending" | "approved" | "rejected";
  seller_profile?: { shop_name: string; shop_description: string; shipping_info: string } | null;
};

export type ProductVariation = { id: string; name: string; options: string[] };

// v1.0.91 — shape of a WooCommerce variable product's picker options.
export type ProductAttribute = { name: string; label: string; options: { slug: string; label: string }[] };

// v1.0.91 — one purchasable variation on a variable product.
export type ProductVariationDetail = {
  id: number;
  attributes: Record<string, string>;
  price: number;
  regular_price?: number;
  stock_status: "instock" | "outofstock";
  stock_quantity?: number | null;
  image?: string;
  sku?: string;
  is_purchasable: boolean;
};

export type Product = {
  id: string;
  title: string;
  description: string;
  price: number;
  sale_price?: number | null;
  categories: string[];
  images: string[];
  featured_image_index?: number;
  stock: number;
  sku?: string;
  in_stock: boolean;
  variations: ProductVariation[];
  // v1.0.91 — WooCommerce product type + picker payload for variable products.
  // Simple products leave these undefined.
  type?: "simple" | "variable" | "grouped" | "external" | string;
  attributes?: ProductAttribute[];
  variation_details?: ProductVariationDetail[];
  status: "draft" | "published";
  featured?: boolean;
  seller?: { id: string; name: string; profile_photo?: string | null; rating?: number; review_count?: number };
  permalink?: string;
  // v1.0.66 Build #5 - Populated only in seller context (nest.getMyProducts).
  // Left off buyer-facing product cards so the payload stays small.
  favorites_count?: number;
};

export type Category = { id: string; name: string; slug: string; icon?: string };

export type Post = {
  id: string;
  title: string;
  content: string;
  excerpt: string;
  image?: string | null;
  permalink?: string;
  date?: string;
  comments: number;
  author: { id: string; name: string; profile_photo?: string | null };
};

export type BlogPost = {
  id: string;
  status: "pending" | "approved" | "rejected";
  caption: string;
  image?: string | null;
  date?: string;
  author: { id: string; name: string; profile_photo?: string | null };
  comment_count?: number;
  // v1.0.55 — favorite state; count is authoritative from the server, the
  // heart icon reads from FavoritesContext so it stays in sync across screens.
  favorites_count?: number;
  is_favorited?: boolean;
};

export type CartItem = {
  product_id: string;
  quantity: number;
  variation?: Record<string, string> | null;
  // v1.0.91 — numeric variation id for the picked size/color combo. The
  // server needs this to attach the WC order line to the correct variation.
  variation_id?: number | null;
  unit_price: number;
  line_total: number;
  product: Product;
};

export type Cart = {
  id: string;
  items: CartItem[];
  coupon_code?: string | null;
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  tax_calculated: boolean;
  total: number;
};

export type ShippingMethod = { id: string; name: string; price: number; min_subtotal?: number };

export type Order = {
  id: string;
  checkout_id: string;
  items: CartItem[];
  shipping_address: NestAddress;
  billing_address: NestAddress;
  shipping_method: ShippingMethod;
  shipping_cost: number;
  subtotal: number;
  discount: number;
  coupon_code?: string | null;
  tax: number;
  total: number;
  status: "awaiting_payment" | "paid" | "processing" | "shipped" | "delivered" | "failed" | "cancelled";
  // v1.0.51 - per-seller tracking rows (the old single-object shape lost
  // visibility on multi-seller orders). See buyer order screen for how
  // this is grouped with the items belonging to each seller.
  tracking_rows: OrderTrackingRow[];
  shipping_status: "awaiting" | "partial" | "shipped" | "delivered";
  can_review: boolean;
  reviewable_seller_ids: number[];
  shipping_label?: { carrier: string; tracking_number: string; label_data_uri: string };
  contact_email?: string;
  contact_phone?: string;
  created_at?: string;
  paid_at?: string;
  shipped_at?: string;
  completed_at?: string;
  // v3.7.121 (Build #16) — true when the buyer can outright cancel
  // (pending/on-hold, no shipments). Paid orders route to refund flow.
  cancellable?: boolean;
  seller_fees?: { seller_id: string; gross: number; marketplace_fee: number; seller_net: number; fee_percent: number }[];
};

export type OrderTrackingRow = {
  seller_id: number;
  seller_name: string;
  number: string;
  carrier?: string;
  service?: string;
  tracking_url?: string;
  label_source?: "shippo" | "manual" | "";
  shipped_at?: string;
  status?: string;
};

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
  meta?: Record<string, unknown>;
};

export type BadgeTier = "none" | "rising_seller" | "trusted_seller";
export type SellerBadge = {
  tier: BadgeTier;
  tier_label: string;
  metrics: {
    on_time_rate?: number;
    avg_rating?: number;
    response_rate?: number;
    completed_orders?: number;
    gmv?: number;
  };
  meets_minimum_volume: boolean;
};

export type DisputeStatus =
  | "open"
  | "awaiting_seller"
  | "awaiting_buyer"
  | "escalated"
  | "resolved_refund"
  | "resolved_partial"
  | "resolved_no_refund"
  | "closed";

export type Dispute = {
  id: string;
  order_id: string;
  status: DisputeStatus;
  reason: string;
  description: string;
  resolution_note?: string | null;
  refund_amount?: number | null;
  evidence: string[];
  contacted_seller_at?: string | null;
  created_at?: string;
  updated_at?: string;
  can_escalate: boolean;
};

export type SellerApplication = {
  id: string;
  shop_name: string;
  shop_description: string;
  product_categories: string[];
  shipping_info: string;
  example_photos: string[];
  status: "pending" | "approved" | "rejected";
  created_at: string;
};
