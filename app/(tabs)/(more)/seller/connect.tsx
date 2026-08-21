import React from "react";
import { Redirect } from "expo-router";

// v1.0.128 — /seller/connect was renamed to /seller/bank to drop the last
// Stripe Connect naming leftover (the screen was rewritten in v3.8.0 for
// direct bank entry, so the "connect" label was outdated). Plugin v3.10.0
// emits the new deep link in the readiness endpoint, but older plugin
// builds still point at /seller/connect. This alias keeps those deep
// links working. Safe to delete once every deployed plugin is v3.10.0+
// (target: one release cycle after 3.10.0 lands in production).
export default function LegacyConnectRedirect() {
  return <Redirect href="/seller/bank" />;
}
