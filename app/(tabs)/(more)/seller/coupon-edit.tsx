import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { KeyboardAwareScroll } from "@/src/components/KeyboardAwareScroll";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";

import { nest, ApiError, type NestCoupon, type NestCouponDiscountType, type NestCouponWritePayload } from "@/src/api/nest";
import { colors, radius, spacing } from "@/src/theme";
import { Button } from "@/src/components/Button";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";
import { toast } from "@/src/components/Toast";
import { safeBack } from "@/src/utils/nav";
import { haptics } from "@/src/utils/haptics";

// v1.0.92 (Build #10) — coupon editor. Shared by /seller/coupon-edit and
// /admin/coupon-edit; the `scope` param picks the API surface. The server
// scopes seller coupons to the current seller's product ids automatically.

const TYPES: { value: NestCouponDiscountType; label: string }[] = [
  { value: "percent", label: "Percent" },
  { value: "fixed_cart", label: "Fixed cart" },
  { value: "fixed_product", label: "Fixed product" },
];

type Scope = "seller" | "admin";

export default function CouponEditScreen() {
  const router = useRouter();
  const { id, scope } = useLocalSearchParams<{ id?: string; scope?: string }>();
  const scopeMode: Scope = scope === "admin" ? "admin" : "seller";
  const isEdit = !!id;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  const [code, setCode] = useState("");
  const [type, setType] = useState<NestCouponDiscountType>("percent");
  const [amount, setAmount] = useState("10");
  const [description, setDescription] = useState("");
  const [minimum, setMinimum] = useState("");
  const [usageLimit, setUsageLimit] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [freeShipping, setFreeShipping] = useState(false);

  useEffect(() => {
    if (!isEdit || !id) return;
    (async () => {
      try {
        const list = scopeMode === "admin" ? await nest.listAdminCoupons() : await nest.listSellerCoupons();
        const c = (list.items || []).find(x => String(x.id) === String(id));
        if (c) hydrate(c);
        else toast.error("Coupon not found");
      } catch (e) {
        toast.error(e instanceof ApiError ? e.friendly : "Load failed");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isEdit, scopeMode]);

  const hydrate = (c: NestCoupon) => {
    setCode(c.code);
    setType(c.discount_type);
    setAmount(String(c.amount));
    setDescription(c.description || "");
    setMinimum(c.minimum_amount ? String(c.minimum_amount) : "");
    setUsageLimit(c.usage_limit ? String(c.usage_limit) : "");
    setExpiresAt(c.expires_at || "");
    setFreeShipping(!!c.free_shipping);
  };

  const save = async () => {
    if (!code.trim()) { toast.error("Code is required"); return; }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 0) { toast.error("Amount must be zero or more"); return; }
    if (type === "percent" && amt > 100) { toast.error("Percent cannot exceed 100"); return; }
    setSaving(true);
    try {
      const payload: NestCouponWritePayload = {
        code: code.trim().toUpperCase(),
        discount_type: type,
        amount: amt,
        description: description || undefined,
        minimum_amount: minimum ? Number(minimum) : undefined,
        usage_limit: usageLimit ? Number(usageLimit) : undefined,
        expires_at: expiresAt || undefined,
        free_shipping: freeShipping,
      };
      if (scopeMode === "admin") {
        if (isEdit && id) await nest.updateAdminCoupon(Number(id), payload);
        else await nest.createAdminCoupon(payload);
      } else {
        if (isEdit && id) await nest.updateSellerCoupon(Number(id), payload);
        else await nest.createSellerCoupon(payload);
      }
      toast.success(isEdit ? "Coupon saved" : "Coupon created");
      safeBack(router, scopeMode === "admin" ? "/admin/coupons" : "/seller/coupons");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.friendly : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { haptics.tap(); safeBack(router, scopeMode === "admin" ? "/admin/coupons" : "/seller/coupons"); }} style={styles.iconBtn} accessibilityLabel="Back" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button">
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.title}>{isEdit ? "Edit coupon" : "New coupon"}</Text>
        <AlertsBellButton />
        <CartHeaderButton />
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <KeyboardAwareScroll contentContainerStyle={{ padding: spacing.md }} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Code</Text>
          <TextInput value={code} onChangeText={setCode} autoCapitalize="characters" style={styles.input} placeholder="SUMMER10" placeholderTextColor={colors.onSurfaceMuted} />

          <Text style={styles.label}>Discount type</Text>
          <View style={styles.chipRow}>
            {TYPES.map(t => (
              <TouchableOpacity key={t.value} onPress={() => { haptics.tap(); setType(t.value); }} style={[styles.chip, type === t.value && styles.chipActive]} accessibilityRole="button">
                <Text style={[styles.chipText, type === t.value && styles.chipTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>{type === "percent" ? "Percent (0-100)" : "Amount ($)"}</Text>
          <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" style={styles.input} placeholder={type === "percent" ? "10" : "5.00"} placeholderTextColor={colors.onSurfaceMuted} />

          <Text style={styles.label}>Description (optional)</Text>
          <TextInput value={description} onChangeText={setDescription} style={styles.input} placeholder="Fall promo" placeholderTextColor={colors.onSurfaceMuted} />

          <Text style={styles.label}>Minimum cart amount ($)</Text>
          <TextInput value={minimum} onChangeText={setMinimum} keyboardType="decimal-pad" style={styles.input} placeholder="0" placeholderTextColor={colors.onSurfaceMuted} />

          <Text style={styles.label}>Usage limit</Text>
          <TextInput value={usageLimit} onChangeText={setUsageLimit} keyboardType="number-pad" style={styles.input} placeholder="Unlimited" placeholderTextColor={colors.onSurfaceMuted} />

          <Text style={styles.label}>Expires (YYYY-MM-DD)</Text>
          <TextInput value={expiresAt} onChangeText={setExpiresAt} style={styles.input} placeholder="2026-12-31" placeholderTextColor={colors.onSurfaceMuted} autoCapitalize="none" />

          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Free shipping</Text>
              <Text style={styles.hint}>Buyers redeeming this coupon get shipping waived.</Text>
            </View>
            <Switch value={freeShipping} onValueChange={setFreeShipping} trackColor={{ true: colors.brand, false: colors.border }} />
          </View>

          <Button title={isEdit ? "Save changes" : "Create coupon"} onPress={() => { haptics.press(); save(); }} loading={saving} style={{ marginTop: spacing.lg }} />
        </KeyboardAwareScroll>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, gap: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  title: { flex: 1, fontSize: 18, fontWeight: "700", color: colors.onSurface, textAlign: "center" },
  iconBtn: { padding: spacing.xs, borderRadius: radius.pill },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  label: { color: colors.onSurface, fontWeight: "600", marginTop: spacing.md, marginBottom: 6 },
  hint: { color: colors.onSurfaceMuted, marginTop: 2 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, color: colors.onSurface, backgroundColor: colors.surface },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { color: colors.onSurface, fontWeight: "500" },
  chipTextActive: { color: colors.onBrand },
  switchRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md, paddingVertical: spacing.sm },
});
