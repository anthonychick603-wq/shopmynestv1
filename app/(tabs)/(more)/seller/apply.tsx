import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { nest, ApiError } from "@/src/api/nest";
import { colors, radius, shadows, spacing } from "@/src/theme";
import { Button } from "@/src/components/Button";
import { Input } from "@/src/components/Input";
import { CategorySubcategoryPicker } from "@/src/components/CategorySubcategoryPicker";
import { useAuth } from "@/src/context/AuthContext";
import { toast } from "@/src/components/Toast";
import { EmptyState } from "@/src/components/EmptyState";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";
import { safeBack } from "@/src/utils/nav";
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [s, cs] = await Promise.all([nest.getSellerApplicationStatus(), nest.getCategories()]);
        if (cancelled) return;
        setStatus(s.status || "none");
        setRejectionReason(s.rejection_reason || "");
        setCanResubmit(s.can_resubmit !== false);
        setCategories(cs.map(toHierarchicalCategory));
      } catch {
        if (cancelled) return;
        setStatus("none");
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
              My Nest is a marketplace for handmade goods. Sellers offering mass-produced, wholesale, dropshipped, or other non-handmade products will not be approved.
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
              <Text style={styles.handmadeCheckText}>I understand that the items I sell on My Nest must be handmade.</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.intro}>
            {status === "rejected"
              ? "Update the information below and resubmit."
              : "Complete this short application first. If approved, you can set up your public shop description, tagline, and other shop details afterward."}
          </Text>

          <Input label="Shop name" value={shopName} onChangeText={setShopName} testID="apply-shop-name" />
          <Input
            label="What will you be selling?"
            value={description}
            onChangeText={setDescription}
            multiline
            style={{ height: 120, textAlignVertical: "top" }}
            hint="Tell us a brief description of what you will be selling. This is for application purposes only and will not show up on your shop page."
            testID="apply-description"
          />

          <Text style={styles.label}>What will you sell?</Text>
          <Text style={styles.hint}>Choose a major category, then choose the sub-category underneath it. Add another selection if your shop sells more than one type of product.</Text>
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
  intro: { color: colors.onSurfaceMuted, marginBottom: spacing.md, lineHeight: 20 },
  rejectedBox: { flexDirection: "row", gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.error, backgroundColor: colors.surfaceTertiary, marginBottom: spacing.md },
  rejectedTitle: { color: colors.onSurface, fontSize: 14, fontWeight: "800" },
  rejectedText: { color: colors.onSurfaceMuted, fontSize: 13, lineHeight: 18, marginTop: 2 },
  resubmitBlocked: { color: colors.error, fontSize: 12, lineHeight: 17, textAlign: "center", marginTop: spacing.sm },
  handmadeNotice: { padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.brand, backgroundColor: colors.surfaceSecondary, marginBottom: spacing.lg },
  handmadeHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  handmadeTitle: { color: colors.onSurface, fontSize: 16, fontWeight: "800", flex: 1 },
  handmadeBody: { color: colors.onSurface, fontSize: 13, lineHeight: 19 },
  handmadeCheckRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  handmadeCheckText: { color: colors.onSurface, flex: 1, fontSize: 13, lineHeight: 19, fontWeight: "700" },
  label: { fontSize: 13, fontWeight: "800", color: colors.onSurface, marginTop: spacing.md, marginBottom: spacing.xs },
  hint: { color: colors.onSurfaceMuted, fontSize: 12, lineHeight: 17, marginBottom: spacing.sm },
  categoryCard: { padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, marginBottom: spacing.sm },
  removeCategory: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: spacing.xs, paddingTop: spacing.sm },
  removeCategoryText: { color: colors.error, fontSize: 13, fontWeight: "700" },
  addCategory: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: spacing.md, marginBottom: spacing.md },
  addCategoryText: { color: colors.brand, fontSize: 14, fontWeight: "800" },
  terms: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.md },
});
