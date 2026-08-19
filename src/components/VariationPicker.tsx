// v1.0.91 — Buyer-side variable-product picker. Given the WooCommerce
// attribute + variation payload from the API, this component shows one
// row of pill options per attribute (Size, Color, …) and reports the
// picked slug for each attribute back to the parent. The parent uses
// findMatchingVariation() to resolve those picks to a specific
// WC_Product_Variation.
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { colors, radius, spacing } from "@/src/theme";
import type { ProductAttribute, ProductVariationDetail } from "@/src/types";
import { haptics } from "@/src/utils/haptics";

type Props = {
  attributes: ProductAttribute[];
  variations: ProductVariationDetail[];
  picked: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
};

// Resolve an attribute→option-slug map to a single purchasable variation.
// WooCommerce variations may leave an attribute value empty when that
// variation matches any option for the attribute, so we accept both an
// exact match and an "any" (empty string) match.
export function findMatchingVariation(
  variations: ProductVariationDetail[],
  picked: Record<string, string>,
): ProductVariationDetail | undefined {
  return variations.find((v) => {
    for (const [attr, slug] of Object.entries(picked)) {
      const val = v.attributes[attr];
      if (val === undefined) return false;
      if (val !== "" && val !== slug) return false;
    }
    return true;
  });
}

// Which option slugs for a given attribute are still reachable given the
// current picks on the other attributes. Used to grey out impossible
// combinations without hiding them.
function reachableOptions(
  variations: ProductVariationDetail[],
  attrName: string,
  picked: Record<string, string>,
): Set<string> {
  const result = new Set<string>();
  for (const v of variations) {
    let ok = true;
    for (const [attr, slug] of Object.entries(picked)) {
      if (attr === attrName) continue;
      const val = v.attributes[attr];
      if (val === undefined) { ok = false; break; }
      if (val !== "" && val !== slug) { ok = false; break; }
    }
    if (!ok) continue;
    const val = v.attributes[attrName];
    if (val === undefined) continue;
    if (val === "") {
      // "Any" match — every option for this attribute is reachable.
      return new Set(); // sentinel: caller treats empty as "all reachable"
    }
    result.add(val);
  }
  return result;
}

export function VariationPicker({ attributes, variations, picked, onChange }: Props) {
  return (
    <View>
      {attributes.map((attr) => {
        const reachable = reachableOptions(variations, attr.name, picked);
        const anyReachable = reachable.size === 0;
        return (
          <View key={attr.name} style={styles.section}>
            <Text style={styles.label}>{attr.label}</Text>
            <View style={styles.row}>
              {attr.options.map((opt) => {
                const active = picked[attr.name] === opt.slug;
                const dimmed = !anyReachable && !reachable.has(opt.slug);
                return (
                  <TouchableOpacity
                    key={opt.slug}
                    onPress={() => {
                      haptics.tap();
                      onChange({ ...picked, [attr.name]: opt.slug });
                    }}
                    style={[styles.pill, active && styles.pillActive, dimmed && !active && styles.pillDimmed]}
                    testID={`variation-${attr.name}-${opt.slug}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active, disabled: dimmed }}
                  >
                    <Text style={[styles.pillText, active && styles.pillTextActive, dimmed && !active && styles.pillTextDimmed]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: spacing.md },
  label: { fontSize: 12, fontWeight: "800", color: colors.onSurfaceMuted, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: spacing.xs },
  row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  pill: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  pillActive: { borderColor: colors.brand, backgroundColor: colors.brand + "12" },
  pillDimmed: { opacity: 0.4 },
  pillText: { fontSize: 13, fontWeight: "700", color: colors.onSurface },
  pillTextActive: { color: colors.brand },
  pillTextDimmed: { color: colors.onSurfaceMuted },
});
