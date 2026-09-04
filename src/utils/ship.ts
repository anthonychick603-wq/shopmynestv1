// v1.0.247 — Shared source of truth for the ship-from profile fields
// the seller must fill in before the server's mnu_ship_from_guard will
// let a product publish (and before shippo.tsx will accept a "complete"
// profile). Previously product-form.tsx and shippo.tsx each declared
// their own list and they drifted: shippo omitted `ship_from_country`,
// which meant a seller could mark their shipping profile "complete" on
// one screen and still get a silent publish → draft downgrade on the
// other (see seller-flow audit P1, shippo.tsx L42-48 vs product-form
// L46-53).
//
// Keep this in lock-step with mnu_ship_from_required_fields() in the
// WordPress plugin.
import type { NestSellerShippingProfile } from "@/src/api/nest";

export const SHIP_FROM_REQUIRED: Array<keyof NestSellerShippingProfile> = [
  "ship_from_name",
  "ship_from_street1",
  "ship_from_city",
  "ship_from_state",
  "ship_from_zip",
  "ship_from_country",
];

export function missingShipFromFields(
  profile: Partial<NestSellerShippingProfile> | null | undefined,
): Array<keyof NestSellerShippingProfile> {
  if (!profile) return [...SHIP_FROM_REQUIRED];
  const out: Array<keyof NestSellerShippingProfile> = [];
  for (const key of SHIP_FROM_REQUIRED) {
    const v = profile[key];
    if (typeof v !== "string" || v.trim().length === 0) out.push(key);
  }
  return out;
}
