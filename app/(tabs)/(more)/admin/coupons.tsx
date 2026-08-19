// v1.0.97 — thin route wrapper. All rendering lives in
// <CouponsListScreen scope="admin" />; the twin `seller/coupons.tsx`
// route uses the same component with scope="seller".
import React from "react";
import { CouponsListScreen } from "@/src/components/CouponsListScreen";

export default function AdminCouponsScreen() {
  return <CouponsListScreen scope="admin" />;
}
