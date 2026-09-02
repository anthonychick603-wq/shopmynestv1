/**
 * Seller Shop Settings — v1.0.52
 *
 * Reachable from the seller readiness checklist "Add name" action and
 * (later) from the seller dashboard. Approved sellers whose store name
 * was never set previously landed on /seller/apply, which detected
 * "approved" and dead-ended on a success card with no fields — they
 * literally couldn't set a shop name inside the app. This screen owns
 * that flow: fetch the current profile, let the seller edit the name
 * (and short tagline), POST /seller/profile, then bounce back.
 */
import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { KeyboardAwareScroll } from "@/src/components/KeyboardAwareScroll";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { nest, ApiError, type NestSellerProfileMe } from "@/src/api/nest";
import { colors, radius, spacing, type as typeTokens } from "@/src/theme";
import { safeBack } from "@/src/utils/nav";
import { haptics } from "@/src/utils/haptics";
import { Button } from "@/src/components/Button";
import { Input } from "@/src/components/Input";
import { toast } from "@/src/components/Toast";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";

export default function ShopSettings() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<NestSellerProfileMe | null>(null);
  const [storeName, setStoreName] = useState("");
  const [tagline, setTagline] = useState("");
  const [about, setAbout] = useState("");

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const p = await nest.getSellerProfileMe();
        if (cancel) return;
        setProfile(p);
        setStoreName(p.store_name || "");
        setTagline(p.tagline || "");
        setAbout(p.about || "");
      } catch (e) {
        toast.error(e instanceof ApiError ? e.friendly : "Couldn't load your shop settings.");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const save = async () => {
    const trimmed = storeName.trim();
    if (!trimmed) {
      toast.error("Enter a shop name so buyers know who you are.");
      return;
    }
    setSaving(true);
    try {
      const p = await nest.updateSellerProfile({
        store_name: trimmed,
        tagline: tagline.trim(),
        about: about.trim(),
      });
      setProfile(p);
      haptics.success();
      toast.success("Shop settings saved");
      // Land the seller back on the dashboard so the readiness card
      // re-fetches with the new name marked complete.
      router.replace("/(tabs)/seller/dashboard");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.friendly : "Couldn't save your shop settings.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <Top onBack={() => safeBack(router, "/(tabs)/seller/dashboard")} />
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Top onBack={() => safeBack(router, "/(tabs)/seller/dashboard")} />
      <KeyboardAwareScroll contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Shop name</Text>
          <Text style={styles.cardHint}>Buyers see this on your listings, order updates, and profile.</Text>
          <Input
            label="Shop name"
            value={storeName}
            onChangeText={setStoreName}
            placeholder="e.g. Willow & Pine Studio"
            testID="shop-settings-name"
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Tagline</Text>
          <Text style={styles.cardHint}>A short one-liner shown on your profile (max 140 chars).</Text>
          <Input
            label="Tagline"
            value={tagline}
            onChangeText={setTagline}
            placeholder="Handmade with care, one piece at a time"
            maxLength={140}
            testID="shop-settings-tagline"
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>About</Text>
          <Text style={styles.cardHint}>Longer story buyers see on your profile.</Text>
          <Input
            label="About"
            value={about}
            onChangeText={setAbout}
            placeholder="What do you make? Tell buyers your story."
            multiline
            numberOfLines={5}
            style={{ height: 120, textAlignVertical: "top" }}
            testID="shop-settings-about"
          />
        </View>

        <Button title="Save shop settings" onPress={() => { haptics.press(); save(); }} loading={saving} testID="shop-settings-save" />
      </KeyboardAwareScroll>
    </SafeAreaView>
  );
}

function Top({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.top}>
      <TouchableOpacity style={styles.topBtn} onPress={() => { haptics.tap(); onBack(); }} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
      </TouchableOpacity>
      <Text style={styles.topTitle}>Shop settings</Text>
      <AlertsBellButton />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  // v1.0.224 — Refinement pass. The prior shop-settings cards were
  // cream-with-shadow which made them fight the input fields (also
  // cream). Fields were nearly invisible. New treatment:
  //   • White card + hairline border. Sits cleanly on cream.
  //   • Card title reads as h3 with tighter tracking.
  //   • Hint copy uses caption tone.
  //   • Inputs inherit the refined Input primitive (white + border +
  //     focus ring), so they read as distinct interactive surfaces.
  top: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  topTitle: { ...typeTokens.h2, flex: 1, textAlign: "center" },
  topBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardTitle: { ...typeTokens.h3, marginBottom: 2 },
  cardHint: { ...typeTokens.caption, marginBottom: spacing.md },
});
