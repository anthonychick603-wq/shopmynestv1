/**
 * Seller Shop Settings — v1.0.52
 *
 * Reachable from the seller readiness checklist "Add name" action and
 * from the seller dashboard. Approved sellers whose store name was
 * never set previously landed on /seller/apply, which detected
 * "approved" and dead-ended on a success card with no fields — they
 * literally couldn't set a shop name inside the app. This screen owns
 * that flow: fetch the current profile, let the seller edit the name
 * (short tagline, and About), POST /seller/profile, then bounce back.
 */
// v1.0.247 — About is capped at 2000 chars with a live counter, and
// the Save button is gated on a successful load so a transient
// GET /seller/profile failure can't be silently overwritten with a
// blank About the seller never intended (audit P1).
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { KeyboardAwareScroll } from "@/src/components/KeyboardAwareScroll";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { nest, ApiError, type NestSellerProfileMe } from "@/src/api/nest";
import { colors, radius, spacing, type as typeTokens } from "@/src/theme";
import { safeBack } from "@/src/utils/nav";
import { useBackFallback } from "@/src/context/BackFallback";
import { haptics } from "@/src/utils/haptics";
import { Button } from "@/src/components/Button";
import { Input } from "@/src/components/Input";
import { toast } from "@/src/components/Toast";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";
import { useRedirectAdmins } from "@/src/hooks/use-redirect-admins";
import { useInvalidateOnFocus } from "@/src/state/mutationBus";

export default function ShopSettings() {
  useBackFallback("/(tabs)/seller/dashboard");
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // v1.0.237 — admins don't have a public shop; if one gets here via a
  // deep link or notification, bounce to the admin console before the
  // GET /seller/profile call fires and returns the admin-fallback that
  // triggers a confusing "That shop is no longer available." toast on
  // save.
  const { isAdmin } = useRedirectAdmins("/admin");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<NestSellerProfileMe | null>(null);
  const [storeName, setStoreName] = useState("");
  const [tagline, setTagline] = useState("");
  const [about, setAbout] = useState("");
  // v1.0.247 — track whether the profile GET succeeded so Save can be
  // gated (audit P1). Without this, a network failure on the initial
  // load leaves storeName/tagline/about as empty strings and Save
  // would silently overwrite the server profile with those blanks.
  const [loadSucceeded, setLoadSucceeded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const ABOUT_MAX = 2000;

  const load = useCallback(async () => {
    if (isAdmin) return; // don't fire the seller GET as an admin
    try {
      const p = await nest.getSellerProfileMe();
      setProfile(p);
      setStoreName(p.store_name || "");
      setTagline(p.tagline || "");
      setAbout(p.about || "");
      setLoadSucceeded(true);
      setLoadError(null);
    } catch (e) {
      const msg = e instanceof ApiError ? e.friendly : "Couldn't load your shop settings.";
      setLoadError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      if (cancel) return;
      await load();
    })();
    return () => {
      cancel = true;
    };
  }, [load]);

  useInvalidateOnFocus(["sellers"], load);

  const save = async () => {
    // v1.0.247 — refuse to save if the load didn't complete. Otherwise
    // "" for tagline/about (which are how we initialize state) would
    // silently overwrite whatever the seller already had on file
    // (audit P1).
    if (!loadSucceeded) {
      toast.error("Couldn't load your current settings. Try again before saving.");
      return;
    }
    const trimmed = storeName.trim();
    if (!trimmed) {
      toast.error("Enter a shop name so buyers know who you are.");
      return;
    }
    if (about.length > ABOUT_MAX) {
      toast.error(`About is too long (${about.length}/${ABOUT_MAX}).`);
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
      // v1.0.255 — push (was replace); strict back rule means back from
      // the dashboard should return here, not to whatever was behind
      // shop-settings.
      router.push("/(tabs)/seller/dashboard");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.friendly : "Couldn't save your shop settings.");
    } finally {
      setSaving(false);
    }
  };

  // Admins get bounced by the hook above; render nothing while the
  // replace is in flight so no seller UI flashes on screen.
  if (isAdmin) return null;

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
            onChangeText={(v) => setAbout(v.slice(0, ABOUT_MAX))}
            placeholder="What do you make? Tell buyers your story."
            multiline
            numberOfLines={5}
            maxLength={ABOUT_MAX}
            style={{ height: 120, textAlignVertical: "top" }}
            testID="shop-settings-about"
          />
          {/* v1.0.247 — counter surfaces the 2000-char cap so sellers
              don't hit an opaque server rejection after typing a long
              story (audit P1). */}
          <Text style={styles.counter} testID="shop-settings-about-counter">
            {about.length}/{ABOUT_MAX}
          </Text>
        </View>

        {loadError && !loadSucceeded ? (
          <Text style={styles.loadErrorText} testID="shop-settings-load-error">
            {loadError} Retry loading before you save.
          </Text>
        ) : null}

        <Button
          title="Save shop settings"
          onPress={() => { haptics.press(); save(); }}
          loading={saving}
          disabled={!loadSucceeded}
          testID="shop-settings-save"
        />
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
  // v1.0.247 — About counter + load-error surface.
  counter: { ...typeTokens.caption, marginTop: spacing.xs, textAlign: "right", color: colors.onSurfaceMuted },
  loadErrorText: { ...typeTokens.caption, color: colors.error, marginBottom: spacing.md, textAlign: "center" },
});
