import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { KeyboardAwareScroll } from "@/src/components/KeyboardAwareScroll";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";

import { nest, ApiError, type NestProductAttributeRaw, type NestProductVariationRaw } from "@/src/api/nest";
import { colors, radius, spacing, type as typeTokens } from "@/src/theme";
import { Button } from "@/src/components/Button";
import { useInvalidateOnFocus } from "@/src/state/mutationBus";
import { toast } from "@/src/components/Toast";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";
import { safeBack } from "@/src/utils/nav";
import { useBackFallback } from "@/src/context/BackFallback";
import { haptics } from "@/src/utils/haptics";
import { ErrorState } from "@/src/components/ErrorState";

// v1.0.92 (Build #8) — Simple variations editor for sellers.
// Adds/removes attributes (Size, Color, …) with option chips per attribute,
// then generates the Cartesian product of options into a grid where each row
// gets its own price + stock. Saving sends the whole payload; the server
// promotes the product to `variable` type and reconciles existing variations
// by attribute-combo match so IDs stay stable across saves.

type AttrRow = { name: string; options: string[] };
type VariRow = { variation_id?: number; attributes: Record<string, string>; price: number; stock: number };

const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

function cartesian(attrs: AttrRow[]): Record<string, string>[] {
  const usable = attrs.filter(a => a.name.trim() && a.options.length > 0);
  if (!usable.length) return [];
  return usable.reduce<Record<string, string>[]>((acc, attr) => {
    const key = slugify(attr.name);
    if (!acc.length) return attr.options.map(opt => ({ [key]: slugify(opt) }));
    const out: Record<string, string>[] = [];
    for (const row of acc) {
      for (const opt of attr.options) {
        out.push({ ...row, [key]: slugify(opt) });
      }
    }
    return out;
  }, []);
}

function variationKey(row: Record<string, string>): string {
  return Object.entries(row).map(([k, v]) => `${k}=${v}`).sort().join("|");
}

export default function ProductVariationsScreen() {
  useBackFallback("/seller/listings");
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const productId = Number(id);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [attributes, setAttributes] = useState<AttrRow[]>([]);
  const [variations, setVariations] = useState<Record<string, VariRow>>({});
  // v1.0.247 — track load outcome so Save can be gated (audit P1).
  // Without this, a failed initial load leaves attributes=[] and Save
  // would happily wipe the seller's variable-product configuration.
  const [loadSucceeded, setLoadSucceeded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const doLoad = React.useCallback(async () => {
    if (!Number.isFinite(productId) || productId <= 0) {
      // v1.0.247 — explicit invalid-id surface instead of a stealthy
      // empty form (audit P1).
      setLoadError("Invalid product id. Go back and pick a product from your listings.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      // Reuse the product GET; it already returns attributes[] + variations[].
      const raw = await nest.getProduct(productId);
      const attrs: NestProductAttributeRaw[] = raw.attributes || [];
      const vars: NestProductVariationRaw[] = raw.variations || [];
      setAttributes(
        attrs.length
          ? attrs.map(a => ({
              name: a.label || a.name || "",
              options: (a.options || []).map(o => (typeof o === "string" ? o : o.label || o.slug)),
            }))
          : []
      );
      const map: Record<string, VariRow> = {};
      for (const v of vars) {
        const attrsMap: Record<string, string> = {};
        for (const [k, val] of Object.entries(v.attributes || {})) {
          attrsMap[slugify(k)] = slugify(String(val));
        }
        map[variationKey(attrsMap)] = {
          variation_id: v.id,
          attributes: attrsMap,
          price: Number(v.price || 0),
          stock: Number(v.stock_quantity || 0),
        };
      }
      setVariations(map);
      setLoadSucceeded(true);
    } catch (e) {
      const msg = e instanceof ApiError ? e.friendly : "Could not load variations";
      setLoadError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [productId]);
  useInvalidateOnFocus(["products"], doLoad);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await doLoad();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [doLoad]);

  const grid = useMemo(() => cartesian(attributes), [attributes]);

  const addAttribute = () => {
    haptics.tap();
    setAttributes(prev => [...prev, { name: "", options: [] }]);
  };
  const removeAttribute = (idx: number) => {
    haptics.tap();
    setAttributes(prev => prev.filter((_, i) => i !== idx));
  };
  // v1.0.247 — slug collision detection (audit P1). Two attributes named
  // "Size (US)" and "Size-US" both slugify to "size-us", and the
  // Cartesian product silently collapses them into one column. Warn
  // the seller inline so they can rename before saving.
  const slugCollisions = useMemo(() => {
    const seen = new Map<string, number>();
    const dup = new Set<number>();
    attributes.forEach((a, i) => {
      const s = slugify(a.name.trim());
      if (!s) return;
      if (seen.has(s)) {
        dup.add(i);
        dup.add(seen.get(s) as number);
      } else {
        seen.set(s, i);
      }
    });
    return dup;
  }, [attributes]);

  const updateAttrName = (idx: number, name: string) => {
    setAttributes(prev => prev.map((a, i) => (i === idx ? { ...a, name } : a)));
  };
  const [optionDraft, setOptionDraft] = useState<Record<number, string>>({});
  const addOption = (idx: number) => {
    const draft = (optionDraft[idx] || "").trim();
    if (!draft) return;
    haptics.tap();
    setAttributes(prev =>
      prev.map((a, i) => (i === idx ? { ...a, options: Array.from(new Set([...a.options, draft])) } : a))
    );
    setOptionDraft(prev => ({ ...prev, [idx]: "" }));
  };
  const removeOption = (idx: number, opt: string) => {
    haptics.tap();
    setAttributes(prev => prev.map((a, i) => (i === idx ? { ...a, options: a.options.filter(o => o !== opt) } : a)));
  };

  const setRowField = (rowKey: string, row: Record<string, string>, field: "price" | "stock", value: string) => {
    // v1.0.247 — clamp negatives (Number("-3") passes through unchanged)
    // so a hyphen keystroke doesn't quietly submit -3 stock (audit P1).
    const parsed = Number(value);
    const clamped = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    setVariations(prev => ({
      ...prev,
      [rowKey]: {
        variation_id: prev[rowKey]?.variation_id,
        attributes: row,
        price: field === "price" ? clamped : prev[rowKey]?.price ?? 0,
        stock: field === "stock" ? clamped : prev[rowKey]?.stock ?? 0,
      },
    }));
  };

  // v1.0.247 — refactored save body so we can wrap it in an Alert.alert
  // confirmation when a variable product is about to be flipped back to
  // simple by an empty submission (audit P1).
  const doSave = React.useCallback(async () => {
    if (!productId) return;
    setSaving(true);
    try {
      const payload = {
        attributes: attributes
          .filter(a => a.name.trim())
          .map(a => ({ name: a.name.trim(), options: a.options })),
        variations: grid.map(row => {
          const k = variationKey(row);
          const cur = variations[k];
          return {
            variation_id: cur?.variation_id,
            attributes: row,
            price: cur?.price ?? 0,
            stock: cur?.stock ?? 0,
          };
        }),
      };
      const res = await nest.saveProductVariations(productId, payload);
      toast.success("Variations saved");
      if (res.warnings && res.warnings.length) {
        toast.error(res.warnings[0]);
      }
      safeBack(router, "/seller/listings");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.friendly : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [productId, attributes, grid, variations, router]);

  const save = async () => {
    // v1.0.247 — gate on successful load so we don't wipe a variable
    // product's config on top of a failed GET (audit P1).
    if (!loadSucceeded) {
      toast.error("Couldn't load current variations. Try again before saving.");
      return;
    }
    if (slugCollisions.size > 0) {
      toast.error("Two attributes have the same slug. Rename them so each is unique.");
      return;
    }
    // v1.0.247 — saving an empty grid demotes the product from variable
    // to simple on the server. That's destructive, so gate it behind an
    // explicit confirm (audit P1).
    if (grid.length === 0) {
      Alert.alert(
        "Convert to simple product?",
        "You've removed all attributes. Saving will turn this back into a simple product with one price and stock — all existing variations will be deleted. Continue?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Convert",
            style: "destructive",
            onPress: () => { void doSave(); },
          },
        ],
      );
      return;
    }
    await doSave();
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { haptics.tap(); safeBack(router, "/seller/listings"); }} style={styles.iconBtn} accessibilityLabel="Back" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button">
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>Variations</Text>
        <AlertsBellButton />
        <CartHeaderButton />
      </View>
      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={colors.brand} /></View>
      ) : loadError && !loadSucceeded ? (
        // v1.0.247 — explicit load-failure surface with Retry, so a
        // transient GET failure doesn't strand the seller on a stealthily
        // empty form (audit P1).
        <View style={{ padding: spacing.lg }}>
          <ErrorState
            title="Couldn't load variations"
            message={loadError}
            onRetry={() => { void doLoad(); }}
            testID="variations-load-error"
          />
        </View>
      ) : (
        <KeyboardAwareScroll contentContainerStyle={{ padding: spacing.md, paddingBottom: 40 + insets.bottom }} keyboardShouldPersistTaps="handled">
          <Text style={styles.help}>Add attributes (like Size or Color), list the options, then set a price and stock for each combination.</Text>

          {attributes.map((attr, idx) => (
            <View key={idx} style={styles.card}>
              <View style={styles.row}>
                <TextInput
                  value={attr.name}
                  onChangeText={t => updateAttrName(idx, t)}
                  placeholder="Attribute name (e.g. Size)"
                  placeholderTextColor={colors.onSurfaceMuted}
                  style={styles.input}
                  autoCapitalize="words"
                />
                <TouchableOpacity onPress={() => removeAttribute(idx)} style={styles.iconBtn} accessibilityLabel="Remove attribute" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button">
                  <Ionicons name="trash-outline" size={18} color={colors.error} />
                </TouchableOpacity>
              </View>
              {slugCollisions.has(idx) ? (
                <Text style={styles.collisionText} testID={`variations-collision-${idx}`}>
                  This name collides with another attribute (same slug). Rename it so buyers see distinct options.
                </Text>
              ) : null}
              <View style={styles.chipRow}>
                {attr.options.map(opt => (
                  <TouchableOpacity key={opt} onPress={() => removeOption(idx, opt)} style={styles.chip} accessibilityLabel={`Remove ${opt}`} accessibilityRole="button">
                    <Text style={styles.chipText}>{opt}</Text>
                    <Ionicons name="close" size={14} color={colors.onSurfaceMuted} />
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.row}>
                <TextInput
                  value={optionDraft[idx] || ""}
                  onChangeText={t => setOptionDraft(prev => ({ ...prev, [idx]: t }))}
                  placeholder="Add option (e.g. Small)"
                  placeholderTextColor={colors.onSurfaceMuted}
                  style={styles.input}
                  onSubmitEditing={() => addOption(idx)}
                  returnKeyType="done"
                />
                <TouchableOpacity onPress={() => addOption(idx)} style={styles.addBtn} accessibilityLabel="Add option" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button">
                  <Ionicons name="add" size={20} color={colors.onBrand} />
                </TouchableOpacity>
              </View>
            </View>
          ))}

          <TouchableOpacity onPress={addAttribute} style={styles.addAttr} accessibilityLabel="Add attribute" accessibilityRole="button">
            <Ionicons name="add-circle-outline" size={20} color={colors.brand} />
            <Text style={styles.addAttrText}>Add attribute</Text>
          </TouchableOpacity>

          {grid.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>Variations ({grid.length})</Text>
              {grid.map(row => {
                const k = variationKey(row);
                const cur = variations[k];
                const label = Object.entries(row).map(([, v]) => v).join(" · ");
                return (
                  <View key={k} style={styles.varRow}>
                    <Text style={styles.varLabel} numberOfLines={1}>{label}</Text>
                    <View style={styles.varInputs}>
                      <TextInput
                        value={cur?.price != null ? String(cur.price) : ""}
                        onChangeText={t => setRowField(k, row, "price", t)}
                        placeholder="Price"
                        placeholderTextColor={colors.onSurfaceMuted}
                        keyboardType="decimal-pad"
                        style={[styles.input, styles.varInput]}
                      />
                      <TextInput
                        value={cur?.stock != null ? String(cur.stock) : ""}
                        onChangeText={t => setRowField(k, row, "stock", t)}
                        placeholder="Stock"
                        placeholderTextColor={colors.onSurfaceMuted}
                        keyboardType="number-pad"
                        style={[styles.input, styles.varInput]}
                      />
                    </View>
                  </View>
                );
              })}
            </>
          ) : (
            <Text style={styles.emptyHint}>Add at least one attribute with one option to generate variations. If you leave the list empty, saving will convert the product back to a simple listing.</Text>
          )}

          <Button title="Save variations" onPress={() => { haptics.press(); save(); }} loading={saving} style={{ marginTop: spacing.lg }} />
        </KeyboardAwareScroll>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  title: { ...typeTokens.h2, flex: 1, fontSize: 18, textAlign: "center" },
  iconBtn: { padding: spacing.xs, borderRadius: radius.pill },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  help: { ...typeTokens.body, color: colors.onSurfaceMuted, marginBottom: spacing.md, lineHeight: 20 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginVertical: spacing.sm },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  chipText: { ...typeTokens.body, fontWeight: "500" },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    borderRadius: radius.field,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.onSurface,
    backgroundColor: colors.surface,
  },
  addBtn: {
    backgroundColor: colors.brand,
    borderRadius: radius.sm,
    padding: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  addAttr: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: spacing.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.hairlineStrong,
    backgroundColor: colors.card,
    marginBottom: spacing.md,
  },
  addAttrText: { ...typeTokens.body, color: colors.brand, fontWeight: "700" },
  sectionTitle: { ...typeTokens.h3, marginTop: spacing.sm, marginBottom: spacing.sm },
  varRow: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  varLabel: { ...typeTokens.body, fontWeight: "600", marginBottom: 6 },
  varInputs: { flexDirection: "row", gap: spacing.sm },
  varInput: { flex: 1 },
  emptyHint: { ...typeTokens.caption, textAlign: "center", padding: spacing.md, lineHeight: 20 },
  collisionText: { ...typeTokens.caption, color: colors.error, marginTop: spacing.xs },
});
