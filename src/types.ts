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
  status: "draft" | "published";
  featured?: boolean;
  seller?: { id: string; name: string; profile_photo?: string | null };
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
};

export type CartItem = {
  product_id: string;
  quantity: number;
  variation?: Record<string, string> | null;
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

export type OfferStatus = "pending" | "countered" | "accepted" | "declined" | "expired";

export type Offer = {
  id: string;
  type: "single" | "bundle";
  status: OfferStatus;
  product_ids: string[];
  products: Product[];
  offer_price: number;
  counter_price?: number | null;
  seller_id?: string;
  buyer_id?: string;
  checkout_token?: string | null;
  expires_at?: string | null;
  created_at?: string;
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
