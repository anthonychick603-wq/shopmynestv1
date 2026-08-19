// v1.0.97 — thin route wrapper. All rendering lives in
// <CouponsListScreen scope="seller" />; the twin `admin/coupons.tsx`
// route uses the same component with scope="admin".
import React from "react";
import { CouponsListScreen } from "@/src/components/CouponsListScreen";

export default function SellerCouponsScreen() {
  return <CouponsListScreen scope="seller" />;
}
