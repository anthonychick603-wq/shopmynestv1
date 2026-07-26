import { Stack } from "expo-router";
import React from "react";

import { colors } from "@/src/theme";

// Every pushed screen in the app lives under this Stack, and this Stack lives
// inside the (tabs) group — that is what keeps the bottom tab bar on screen
// while still giving these routes real stack behaviour (push/pop, back gestures,
// and stacking a route on top of itself, e.g. product → seller → product).
//
// `(more)` is a group segment, so it is invisible in URLs: this file's siblings
// still resolve at /product/[id], /seller/product-form, /orders and so on, and
// every existing router.push() target keeps working unchanged.
export default function MoreStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.surface },
      }}
    />
  );
}
