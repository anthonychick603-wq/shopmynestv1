import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { nest, ApiError } from "@/src/api/nest";
import { toCategory } from "@/src/api/adapters";
import { colors, radius, shadows, spacing } from "@/src/theme";
import type { Category } from "@/src/types";
import { Button } from "@/src/components/Button";
import { Input } from "@/src/components/Input";
import { useAuth } from "@/src/context/AuthContext";
import { toast } from "@/src/components/Toast";
import { EmptyState } from "@/src/components/EmptyState";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";
import { safeBack } from "@/src/utils/nav";
import { haptics } from "@/src/utils/haptics";

export default function ApplySeller() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [status, setStatus] = useState<"none" | "pending" | "approved" | "rejected" | "loading">("loading");
  const [shopName, setShopName] = useState("");
  const [description, setDescription] = useState("");
  const [shipping, setShipping] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);

  // v1.0.95 — cancel guard so quickly backing out of the apply screen
  // doesn't setState on an unmounted tree.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [s, cs] = await Promise.all([nest.getSellerApplicationStatus(), nest.getCategories()]);
        if (cancelled) return;
        setStatus(s.status || "none");
        setCategories(cs.map(toCategory));
      } catch {
        if (cancelled) return;
        setStatus("none");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const submit = async () => {
    // v1.0.110 — client-side checks now match the exact server contract
    // (store_name / about / products / accept_terms), and the toast
    // names the specific field(s) missing so the seller doesn't have
    // to guess after tapping submit on a long form.
    const missing: string[] = [];
    if (!shopName.trim()) missing.push("Shop name");
    if (description.trim().length < 10) missing.push("Shop description (10+ characters)");
    if (selectedCats.length === 0) missing.push("At least one product category");
    if (!agreed) missing.push("Agreement to seller terms");
    if (missing.length) {
      return toast.error("Please complete: " + missing.join(", "));
    }

    // v1.0.110 — map the mobile form fields to the exact payload the
    // plugin's /seller/application endpoint expects. The old payload
    // used shop_name / shop_description / product_categories /
    // shipping_info / agreed_to_terms, none of which matched, so the
    // server always answered with the 422 "Store name, about,
    // products, and acceptance of seller terms are required" banner
    // even for a fully-filled form. Categories and shipping info are
    // merged into `products` and `about` so the admin reviewing the
    // application still sees everything the seller entered.
    const catNames = selectedCats
      .map((id) => categories.find((c) => c.id === id)?.name || "")
      .filter(Boolean);
    const aboutBody =
      description.trim() +
      (shipping.trim() ? "\n\nShipping: " + shipping.trim() : "");
    const productsBody = catNames.length
      ? "Categories: " + catNames.join(", ")
      : "";

    setBusy(true);
    try {
      await nest.submitSellerApplication({
        store_name: shopName.trim(),
        about: aboutBody,
        products: productsBody,
        accept_terms: agreed,
      });
      await refresh();
      toast.success("Application submitted!");
      router.replace("/(tabs)/account");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.friendly : "Could not submit application");
    } finally {
      setBusy(false);
    }
  };

  if (status === "loading") return <SafeAreaView style={styles.safe}><View style={{ flex: 1 }} /></SafeAreaView>;

  if (status === "pending") {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Top onBack={() => safeBack(router, "/(tabs)/seller/dashboard")} title="Application" />
        <EmptyState icon="hourglass-outline" title="Under review" message="We'll notify you as soon as your application is reviewed." />
      </SafeAreaView>
    );
  }
  if (status === "approved") {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Top onBack={() => safeBack(router, "/(tabs)/seller/dashboard")} title="Application" />
        <EmptyState icon="checkmark-circle" title="You're approved!" message="Head to the seller dashboard to start listing." actionLabel="Open dashboard" onAction={() => router.replace("/seller/dashboard")} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Top onBack={() => safeBack(router, "/(tabs)/seller/dashboard")} title="Build your Nest" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.intro}>Tell us about your shop. Approval usually takes 1–3 days.</Text>
          <Input label="Shop name" value={shopName} onChangeText={setShopName} testID="apply-shop-name" />
          <Input label="Shop description" value={description} onChangeText={setDescription} multiline style={{ height: 120, textAlignVertical: "top" }} hint="What do you make? Tell buyers your story." testID="apply-description" />

          <Text style={styles.label}>Product categories</Text>
          <View style={styles.chips}>
            {categories.map((c) => {
              const on = selectedCats.includes(c.id);
              return (
                <TouchableOpacity
                  key={c.id}
                  onPress={() => { haptics.tap(); setSelectedCats((s) => (s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id])); }}
                  style={[styles.chip, on && styles.chipOn]}
                  testID={`apply-cat-${c.id}`}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{c.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Input label="Shipping information" value={shipping} onChangeText={setShipping} multiline style={{ height: 80, textAlignVertical: "top" }} hint="Where do you ship from, average lead time." testID="apply-shipping" />

          <TouchableOpacity onPress={() => { haptics.tap(); setAgreed((v) => !v); }} style={styles.terms} testID="apply-agree" accessibilityRole="checkbox" accessibilityLabel="Agree to seller terms">
            <Ionicons name={agreed ? "checkbox" : "square-outline"} size={22} color={agreed ? colors.brand : colors.onSurfaceMuted} />
            <Text style={{ color: colors.onSurface, flex: 1 }}>I agree to the My Nest seller terms and marketplace fee policy.</Text>
          </TouchableOpacity>

          <Button title="Submit application" onPress={() => { haptics.press(); submit(); }} loading={busy} testID="apply-submit" />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Top({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <View style={styles.top}>
      <TouchableOpacity onPress={() => { haptics.tap(); onBack(); }} style={styles.topBtn} accessibilityRole="button" accessibilityLabel="Go back"><Ionicons name="chevron-back" size={22} color={colors.onSurface} /></TouchableOpacity>
      <Text style={styles.topTitle}>{title}</Text>
      <AlertsBellButton />
      <CartHeaderButton />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md },
  topTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  topBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, ...shadows.card },
  intro: { color: colors.onSurfaceMuted, marginBottom: spacing.md },
  label: { fontSize: 13, fontWeight: "800", color: colors.onSurface, marginTop: spacing.md, marginBottom: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { color: colors.onSurface, fontWeight: "700", fontSize: 13 },
  chipTextOn: { color: colors.onBrand },
  terms: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.md },
});
