// v1.0.222 — Single source of truth for order-status labels across the app.
//
// Before this file, every screen had its own way of turning a raw server
// status into user-facing text: StatusPill uppercased the raw string
// (yielding "AWAITING_PAYMENT" with the underscore), OrderStatusTimeline
// used its own "Preparing / Paid / Shipped / Delivered" vocabulary,
// buyerStatusLabel in order/[id].tsx had a third mapping, and the buyer
// tracking card said "Preparing to ship". The same order rendered three
// different words in three different places.
//
// This helper is the ONLY place that translates a status to a label. All
// three surfaces (pill, tracker, hint) now go through it.
//
// Roles: "buyer" and "seller" render the same states with different
// vocabularies. Buyers see "Preparing" while sellers see "Processing" for
// the same server state, because sellers care about workflow and buyers
// care about waiting.

export type Role = "buyer" | "seller";

// Canonical status keys — after the adapter has normalized a raw plugin
// status. This is the union we render against.
export type OrderStatusKey =
  | "awaiting_payment"
  | "paid"
  | "processing"
  | "shipped"
  | "partial"
  | "delivered"
  | "completed"
  | "refunded"
  | "cancelled"
  | "failed"
  | "on_hold"
  | "pending";

// Normalize any incoming string (raw Woo status, adapter-derived, seller
// pill label, uppercased legacy) to a canonical key. Any unknown value
// falls through to `processing` for buyer-side and `processing` for
// seller-side — safer than showing raw tokens.
export function normalizeStatus(status: string | null | undefined): OrderStatusKey {
  const s = String(status || "").toLowerCase().replace(/[-\s]+/g, "_");
  switch (s) {
    case "awaiting_payment":
    case "pending":
    case "on_hold":
      return "awaiting_payment";
    case "paid":
      return "paid";
    case "processing":
      return "processing";
    case "shipped":
      return "shipped";
    case "partial":
    case "partially_shipped":
      return "partial";
    case "delivered":
      return "delivered";
    case "completed":
      return "completed";
    case "refunded":
      return "refunded";
    case "cancelled":
    case "canceled":
      return "cancelled";
    case "failed":
      return "failed";
    default:
      return "processing";
  }
}

// Title-cased buyer- and seller-facing labels. Same visual weight
// everywhere. Buyers see "Preparing" for the middle state so it reads
// like a delivery timeline; sellers see "Processing" because that's the
// workflow word they use in the fulfillment card.
const BUYER_LABEL: Record<OrderStatusKey, string> = {
  awaiting_payment: "Payment pending",
  paid: "Paid",
  processing: "Preparing",
  shipped: "Shipped",
  partial: "Partially shipped",
  delivered: "Delivered",
  completed: "Delivered",
  refunded: "Refunded",
  cancelled: "Cancelled",
  failed: "Payment failed",
  on_hold: "Payment pending",
  pending: "Payment pending",
};

const SELLER_LABEL: Record<OrderStatusKey, string> = {
  awaiting_payment: "Awaiting payment",
  paid: "Paid",
  processing: "Processing",
  shipped: "Shipped",
  partial: "Partially shipped",
  delivered: "Delivered",
  completed: "Completed",
  refunded: "Refunded",
  cancelled: "Cancelled",
  failed: "Failed",
  on_hold: "On hold",
  pending: "Pending",
};

export function statusLabel(status: string | null | undefined, role: Role = "buyer"): string {
  const key = normalizeStatus(status);
  return role === "seller" ? SELLER_LABEL[key] : BUYER_LABEL[key];
}

// Color palette by role-agnostic bucket. Reuses the same warm-nest colors
// that StatusPill already used; extracted here so RefundStatusCard and
// OrderStatusTimeline can share them.
export function statusColors(status: string | null | undefined): { bg: string; fg: string } {
  const key = normalizeStatus(status);
  switch (key) {
    case "cancelled":
    case "failed":
    case "refunded":
      return { bg: "#F8D7DA", fg: "#8B2E36" };
    case "shipped":
    case "partial":
      return { bg: "#E7EEF7", fg: "#2F5AA3" };
    case "delivered":
    case "completed":
    case "paid":
      return { bg: "#DFF3E3", fg: "#2A6B3A" };
    case "awaiting_payment":
    case "on_hold":
    case "pending":
    case "processing":
      return { bg: "#FFEED9", fg: "#8A4B10" };
    default:
      return { bg: "#EEE7DA", fg: "#4A3A24" };
  }
}
