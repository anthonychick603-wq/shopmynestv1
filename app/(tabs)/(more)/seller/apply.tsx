import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { KeyboardAwareScroll } from "@/src/components/KeyboardAwareScroll";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { nest, ApiError } from "@/src/api/nest";
import { colors, radius, spacing, type as typeTokens } from "@/src/theme";
import { Button } from "@/src/components/Button";
import { Input } from "@/src/components/Input";
import { CategorySubcategoryPicker } from "@/src/components/CategorySubcategoryPicker";
import { useAuth } from "@/src/context/AuthContext";
import { toast } from "@/src/components/Toast";
import { EmptyState } from "@/src/components/EmptyState";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";
import { safeBack } from "@/src/utils/nav";
import { useBackFallback } from "@/src/context/BackFallback";
import { haptics } from "@/src/utils/haptics";
import {
  categoryPathLabel,
  isCategorySelectionComplete,
  toHierarchicalCategory,
  type HierarchicalCategory,
} from "@/src/utils/categories";

type ApplicationCategorySelection = {
  key: string;
  categoryId: string | null;
  subcategoryId: string | null;
};

function newSelection(key = "category-1"): ApplicationCategorySelection {
  return { key, categoryId: null, subcategoryId: null };
}

export default function ApplySeller() {
  useBackFallback("/(tabs)/seller/dashboard");
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { refresh } = useAuth();
  const [status, setStatus] = useState<"none" | "pending" | "approved" | "rejected" | "loading">("loading");
  const [rejectionReason, setRejectionReason] = useState("");
  const [canResubmit, setCanResubmit] = useState(true);
  const [shopName, setShopName] = useState("");
  const [description, setDescription] = useState("");
  const [shipping, setShipping] = useState("");
  const [categories, setCategories] = useState<HierarchicalCategory[]>([]);
  const [categorySelections, setCategorySelections] = useState<ApplicationCategorySelection[]>([newSelection()]);
  const [handmadeOnlyAcknowledged, setHandmadeOnlyAcknowledged] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  // v1.0.247 — track the categories fetch separately from the app-status
  // fetch so we can surface a distinct banner when only the taxonomy
  // failed to load (audit P2). Without it, a categories-endpoint blip
  // silently drops the seller into a form with no picker options and
  // no explanation why.
  const [categoriesError, setCategoriesError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Fire in parallel but track outcomes independently so a failure
      // on one doesn't hide the other.
      const [sRes, csRes] = await Promise.allSettled([
        nest.getSellerApplicationStatus(),
        nest.getCategories(),
      ]);
      if (cancelled) return;
      if (sRes.status === "fulfilled") {
        setStatus(sRes.value.status || "none");
        setRejectionReason(sRes.value.rejection_reason || "");
        setCanResubmit(sRes.value.can_resubmit !== false);
      } else {
        // v1.0.247 — surface "none" so the form is at least reachable
        // rather than looping the loading spinner forever.
        setStatus("none");
      }
      if (csRes.status === "fulfilled") {
        setCategories(csRes.value.map(toHierarchicalCategory));
        setCategoriesError(null);
      } else {
        const reason = csRes.reason;
        setCategoriesError(reason instanceof ApiError ? reason.friendly : "Couldn't load categories. Some picker options may be unavailable.");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const updateCategorySelection = (key: string, categoryId: string | null, subcategoryId: string | null) => {
    setCategorySelections((rows) => rows.map((row) => (
      row.key === key ? { ...row, categoryId, subcategoryId } : row
    )));
  };

  const addCategorySelection = () => {
    haptics.tap();
    setCategorySelections((rows) => [
      ...rows,
      newSelection(`category-${Date.now()}-${rows.length + 1}`),
    ]);
  };

  const removeCategorySelection = (key: string) => {
    haptics.tap();
    setCategorySelections((rows) => rows.length <= 1 ? rows : rows.filter((row) => row.key !== key));
  };

  const submit = async () => {
    const chosen = categorySelections.filter((selection) => !!selection.categoryId);
    const incompleteCategory = chosen.some((selection) => !isCategorySelectionComplete(
      categories,
      selection.categoryId,
      selection.subcategoryId,
    ));

    const missing: string[] = [];
    if (!handmadeOnlyAcknowledged) missing.push("Handmade-only seller acknowledgement");
    if (!shopName.trim()) missing.push("Shop name");
    if (description.trim().length < 10) missing.push("A brief description of what you will sell (10+ characters)");
    if (chosen.length === 0) missing.push("At least one product category");
    if (incompleteCategory) missing.push("A sub-category for each selected category");
    if (!agreed) missing.push("Agreement to seller terms");
    if (missing.length) {
      return toast.error("Please complete: " + missing.join(", "));
    }

    const uniqueSelections = chosen.filter((selection, index, all) => {
      const key = `${selection.categoryId || ""}:${selection.subcategoryId || ""}`;
      return all.findIndex((item) => `${item.categoryId || ""}:${item.subcategoryId || ""}` === key) === index;
    });
    const categoryPaths = uniqueSelections
      .map((selection) => categoryPathLabel(categories, selection.categoryId, selection.subcategoryId))
      .filter(Boolean);

    const aboutBody =
      description.trim() +
      (shipping.trim() ? "\n\nShipping: " + shipping.trim() : "");
    const productsBody = categoryPaths.join("\n");

    setBusy(true);
    try {
      await nest.submitSellerApplication({
        store_name: shopName.trim(),
        application_description: aboutBody,
        // Backward compatibility with backend releases prior to v3.13.50.
        about: aboutBody,
        handmade_acknowledged: handmadeOnlyAcknowledged,
        products: productsBody,
        accept_terms: agreed,
      });
      await refresh();
      toast.success("Application submitted!");
      // v1.0.255 — push (was replace) so back returns to the apply form.
      router.push("/(tabs)/account");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.friendly : "Could not submit application");
    } finally {
      setBusy(false);
    }
  };

  if (status === "loading") {
    // v1.0.247 — previously rendered an empty <View>, so the seller
    // saw a blank white screen while the two GETs ran. Now show the
    // header + a spinner so it reads as "loading" instead of
    // "something broke" (audit P2).
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Top onBack={() => safeBack(router, "/(tabs)/seller/dashboard")} title="Application" />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </SafeAreaView>
    );
  }

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
        {/* v1.0.247 — route to the tabs seller dashboard path (audit
            P2). `/seller/dashboard` is not a real route in this app
            — the actual screen lives under `(tabs)/seller/dashboard`
            — and expo-router silently swallowed the mismatch. */}
        <EmptyState icon="checkmark-circle" title="You're approved!" message="Head to the seller dashboard to start listing." actionLabel="Open dashboard" onAction={() => router.push("/(tabs)/seller/dashboard")} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Top onBack={() => safeBack(router, "/(tabs)/seller/dashboard")} title="Build your Nest" />
      <KeyboardAwareScroll contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
          {status === "rejected" ? (
            <View style={styles.rejectedBox} testID="apply-rejected-details">
              <Ionicons name="alert-circle-outline" size={20} color={colors.error} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rejectedTitle}>Your last application needs changes</Text>
                <Text style={styles.rejectedText}>{rejectionReason || "Review your application details and submit an updated application. If you need clarification, contact marketplace support before resubmitting."}</Text>
              </View>
            </View>
          ) : null}

          <View style={styles.handmadeNotice} testID="apply-handmade-policy">
            <View style={styles.handmadeHeader}>
              <Ionicons name="hand-left-outline" size={22} color={colors.brand} />
              <Text style={styles.handmadeTitle}>My Nest is for handmade items only</Text>
            </View>
            <Text style={styles.handmadeBody}>
              My Nest is for handmade items only. Sellers offering mass-produced, wholesale, dropshipped, or otherwise non-handmade products will not be approved.
            </Text>
            <TouchableOpacity
              onPress={() => { haptics.tap(); setHandmadeOnlyAcknowledged((value) => !value); }}
              style={styles.handmadeCheckRow}
              testID="apply-handmade-acknowledgement"
              accessibilityRole="checkbox"
              accessibilityState={{ checked: handmadeOnlyAcknowledged }}
              accessibilityLabel="I understand My Nest is for handmade items only"
            >
              <Ionicons name={handmadeOnlyAcknowledged ? "checkbox" : "square-outline"} size={23} color={handmadeOnlyAcknowledged ? colors.brand : colors.onSurfaceMuted} />
              <Text style={styles.handmadeCheckText}>I understand that every item I sell on My Nest must be handmade by me.</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.intro}>
            {status === "rejected"
              ? "Update the information below and resubmit."
              : "Fill out this short application to be considered. Once approved, you can set up your shop description, tagline, banner, and everything else that appears on your public shop page."}
          </Text>

          <Input
            label="Shop name"
            value={shopName}
            onChangeText={setShopName}
            placeholder="What would you like your shop to be called?"
            autoCapitalize="words"
            autoCorrect={false}
            testID="apply-shop-name"
          />
          <Input
            label="Brief description of what you will be selling"
            value={description}
            onChangeText={setDescription}
            multiline
            style={{ height: 120, textAlignVertical: "top" }}
            hint="For application purposes only — this will not appear on your public shop page. You can write your shop description, tagline, and story after you're approved."
            placeholder="e.g. Hand-thrown stoneware mugs and small serving bowls, each glazed in-studio in small batches."
            testID="apply-description"
          />

          <Text style={styles.label}>Which categories will your shop sell in?</Text>
          <Text style={styles.hint}>Choose a major category, then choose the sub-category underneath it. Add another selection if your shop sells more than one type of product.</Text>
          {categoriesError ? (
            <View style={styles.errorBanner} testID="apply-categories-error">
              <Ionicons name="warning-outline" size={16} color={colors.error} />
              <Text style={styles.errorText}>{categoriesError}</Text>
            </View>
          ) : null}
          {categorySelections.map((selection, index) => (
            <View key={selection.key} style={styles.categoryCard} testID={`apply-category-row-${index}`}>
              <CategorySubcategoryPicker
                categories={categories}
                categoryId={selection.categoryId}
                subcategoryId={selection.subcategoryId}
                onChange={(categoryId, subcategoryId) => updateCategorySelection(selection.key, categoryId, subcategoryId)}
                testIDPrefix={`apply-category-${index}`}
              />
              {categorySelections.length > 1 ? (
                <TouchableOpacity
                  onPress={() => removeCategorySelection(selection.key)}
                  style={styles.removeCategory}
                  accessibilityRole="button"
                  accessibilityLabel="Remove this category selection"
                  testID={`apply-category-remove-${index}`}
                >
                  <Ionicons name="trash-outline" size={16} color={colors.error} />
                  <Text style={styles.removeCategoryText}>Remove</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
          <TouchableOpacity
            onPress={addCategorySelection}
            style={styles.addCategory}
            accessibilityRole="button"
            accessibilityLabel="Add another product category"
            testID="apply-category-add"
          >
            <Ionicons name="add-circle-outline" size={18} color={colors.brand} />
            <Text style={styles.addCategoryText}>Add another category</Text>
          </TouchableOpacity>

          <Input label="Shipping information" value={shipping} onChangeText={setShipping} multiline style={{ height: 80, textAlignVertical: "top" }} hint="Where do you ship from, average lead time." testID="apply-shipping" />

          <TouchableOpacity onPress={() => { haptics.tap(); setAgreed((v) => !v); }} style={styles.terms} testID="apply-agree" accessibilityRole="checkbox" accessibilityState={{ checked: agreed }} accessibilityLabel="Agree to seller terms">
            <Ionicons name={agreed ? "checkbox" : "square-outline"} size={22} color={agreed ? colors.brand : colors.onSurfaceMuted} />
            <Text style={{ color: colors.onSurface, flex: 1 }}>I agree to The Nest seller terms and marketplace fee policy.</Text>
          </TouchableOpacity>

          <Button title={status === "rejected" ? "Resubmit application" : "Submit application"} onPress={() => { haptics.press(); submit(); }} loading={busy} disabled={status === "rejected" && !canResubmit} testID="apply-submit" />
          {status === "rejected" && !canResubmit ? <Text style={styles.resubmitBlocked}>This application cannot be resubmitted yet. Contact marketplace support for the next step.</Text> : null}
        </KeyboardAwareScroll>
    </SafeAreaView>
  );
}

function Top({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <View style={styles.top}>
      <TouchableOpacity onPress={() => { haptics.tap(); onBack(); }} style={styles.topBtn} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Ionicons name="chevron-back" size={22} color={colors.onSurface} /></TouchableOpacity>
      <Text style={styles.topTitle}>{title}</Text>
      <AlertsBellButton />
      <CartHeaderButton />
    </View>
  );
}

// v1.0.227 — Seller onboarding (Apply) refinement. The handmade
// notice becomes a hero white card with brand accent; category picker
// tiles are white with hairline; Add category is a dashed Notion tile.
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md },
  topTitle: { ...typeTokens.h2, fontSize: 18 },
  topBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  intro: { ...typeTokens.body, color: colors.onSurfaceMuted, marginBottom: spacing.md, lineHeight: 20 },
  rejectedBox: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.error,
    backgroundColor: colors.card,
    marginBottom: spacing.md,
  },
  rejectedTitle: { ...typeTokens.body, fontWeight: "800" },
  rejectedText: { ...typeTokens.caption, lineHeight: 18, marginTop: 2 },
  resubmitBlocked: { ...typeTokens.caption, color: colors.error, lineHeight: 17, textAlign: "center", marginTop: spacing.sm },
  handmadeNotice: {
    padding: spacing.lg,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
    marginBottom: spacing.lg,
  },
  handmadeHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  handmadeTitle: { ...typeTokens.h3, flex: 1 },
  handmadeBody: { ...typeTokens.caption, color: colors.onSurface, lineHeight: 19 },
  handmadeCheckRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline },
  handmadeCheckText: { ...typeTokens.caption, color: colors.onSurface, flex: 1, lineHeight: 19, fontWeight: "700" },
  label: { ...typeTokens.caption, fontWeight: "800", color: colors.onSurface, marginTop: spacing.md, marginBottom: spacing.xs },
  hint: { ...typeTokens.caption, lineHeight: 17, marginBottom: spacing.sm },
  categoryCard: {
    padding: spacing.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
    marginBottom: spacing.sm,
  },
  removeCategory: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: spacing.xs, paddingTop: spacing.sm },
  removeCategoryText: { ...typeTokens.caption, color: colors.error, fontWeight: "700" },
  addCategory: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    borderStyle: "dashed",
    borderRadius: radius.card,
    backgroundColor: colors.card,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  addCategoryText: { ...typeTokens.body, color: colors.brand, fontWeight: "800" },
  terms: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.md },
  // v1.0.247 — inline banner for the categories-load-failed state.
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.error,
    backgroundColor: colors.card,
    marginBottom: spacing.md,
  },
  errorText: { ...typeTokens.caption, color: colors.error, flex: 1 },
});
