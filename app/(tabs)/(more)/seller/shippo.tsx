import React, { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { KeyboardAwareScroll } from "@/src/components/KeyboardAwareScroll";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { nest, ApiError, type NestSellerShippingProfile } from "@/src/api/nest";
import { colors, radius, spacing, type as typeTokens } from "@/src/theme";
import { Button } from "@/src/components/Button";
import { Input } from "@/src/components/Input";
import { toast } from "@/src/components/Toast";
import { haptics } from "@/src/utils/haptics";
import { safeBack } from "@/src/utils/nav";
import { useBackFallback } from "@/src/context/BackFallback";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { useLatestRequest } from "@/src/hooks/use-latest-request";
// v1.0.247 — use the shared ship-from source of truth so this screen
// and product-form.tsx agree on which fields are mandatory. Previously
// this file's REQUIRED_FIELDS omitted `ship_from_country`, letting a
// seller mark their address "complete" here and still hit the silent
// publish→draft path in product-form (audit P1).
import { SHIP_FROM_REQUIRED, missingShipFromFields } from "@/src/utils/ship";

/**
 * Seller-side ship-from address form.
 *
 * ShopMyNest buys all shipping labels on the platform's own Shippo account —
 * sellers never sign up with Shippo directly. What we still need from each
 * seller is where the package is going out from, so Shippo can print
 * accurate origin-to-destination labels and quote realistic rates at
 * checkout. This screen is the single place a seller enters that address.
 *
 * v1.0.126 — replaces the previous "connect your Shippo account" UI, which
 * contradicted the platform model where sellers use ShopMyNest's Shippo
 * account exclusively. Route path stays /seller/shippo so the readiness
 * checklist deep link keeps working; only the screen content changes.
 *
 * Backing endpoints (nest-shipping/v1):
 *   GET  /seller/profile → { profile: NestSellerShippingProfile }
 *   POST /seller/profile → { profile: NestSellerShippingProfile }
 */

// v1.0.247 — REQUIRED_FIELDS moved to `@/src/utils/ship` (SHIP_FROM_REQUIRED)
// and is imported at the top. Alias it locally so the rest of this file
// reads the same.
const REQUIRED_FIELDS = SHIP_FROM_REQUIRED;

// v1.0.198 — default country is USA; state is intentionally left blank so
// sellers outside a single default region don't have to correct it every
// time. The <Input> still shows a two-letter placeholder as a hint.
const COUNTRY_DEFAULT = "US";

export default function SellerShipFromAddress() {
  useBackFallback("/(tabs)/seller/dashboard");
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [profile, setProfile] = useState<NestSellerShippingProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // v1.0.247 — gate Save on a successful load so a network hiccup on
  // mount can't be followed by a Save that writes an empty profile over
  // real data. Only flip to true after we've loaded the seller's real
  // profile from the server (audit P1).
  const [loadSucceeded, setLoadSucceeded] = useState(false);
  // v1.0.247 — useLatestRequest so a pull-to-refresh chased by a Save
  // or a back-nav can't setState on a stale response (audit P0).
  const { begin, isCurrent } = useLatestRequest();

  const load = useCallback(async () => {
    const reqId = begin();
    setLoading(true);
    setError(null);
    try {
      const res = await nest.getSellerShippingProfile();
      if (!isCurrent(reqId)) return;
      // Backfill only the country default. Leaving state blank means the
      // seller enters their own two-letter code instead of overwriting a
      // wrong-region default.
      const merged = {
        ...res.profile,
        ship_from_country: res.profile.ship_from_country || COUNTRY_DEFAULT,
      };
      setProfile(merged);
      setLoadSucceeded(true);
    } catch (e) {
      if (!isCurrent(reqId)) return;
      setError(e instanceof ApiError ? e.friendly : "Could not load your ship-from address.");
      setLoadSucceeded(false);
    } finally {
      if (isCurrent(reqId)) setLoading(false);
    }
  }, [begin, isCurrent]);

  useEffect(() => {
    load();
  }, [load]);

  const update = (patch: Partial<NestSellerShippingProfile>) => {
    setProfile((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const missingField = useMemo(() => {
    if (!profile) return null;
    // v1.0.247 — uses the shared helper so this stays in sync with
    // product-form's isShipFromComplete().
    return missingShipFromFields(profile)[0] ?? null;
  }, [profile]);

  const save = async () => {
    if (!profile) return;
    // v1.0.247 — refuse to save if the initial load didn't succeed
    // (audit P1). Without this, a mount-time load failure left `profile`
    // hydrated only from local edits, and Save would overwrite the
    // server's real profile with a partial one.
    if (!loadSucceeded) {
      setError("Couldn't load your address yet. Try Retry before saving.");
      return;
    }
    if (missingField) {
      setError("Please complete every required field before saving.");
      return;
    }
    const reqId = begin();
    setSaving(true);
    setError(null);
    try {
      const res = await nest.saveSellerShippingProfile(profile);
      if (!isCurrent(reqId)) return;
      setProfile(res.profile);
      haptics.success();
      toast.success("Ship-from address saved");
    } catch (e) {
      if (!isCurrent(reqId)) return;
      haptics.warning();
      setError(e instanceof ApiError ? e.friendly : "Could not save your ship-from address.");
    } finally {
      if (isCurrent(reqId)) setSaving(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => { haptics.tap(); safeBack(router, "/(tabs)/seller/dashboard"); }}
          style={styles.headerBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="ship-from-back"
         hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ship-from address</Text>
        <AlertsBellButton />
        <CartHeaderButton />
      </View>
      {/* v1.0.188 — keyboardVerticalOffset compensates for the sticky
          header row that sits above KeyboardAwareScroll. Without it,
          iOS's padding behavior undershoots by exactly the header
          height (≈50pt), leaving the bottom inputs buried. */}
      <KeyboardAwareScroll
          contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + spacing.xl }]}
          keyboardVerticalOffset={56}
          keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <Ionicons name="location-outline" size={28} color={colors.brand} />
            <Text style={styles.heroTitle}>Where do your packages ship from?</Text>
            <Text style={styles.heroBody}>
              ShopMyNest buys the shipping label for every sale on our own account, then prints it with your address as the origin. Buyers see accurate rates at checkout and USPS knows where the package started. You never need a Shippo account of your own.
            </Text>
          </View>

          {loading ? (
            <View style={styles.card}>
              <Text style={styles.dim}>Loading…</Text>
            </View>
          ) : !profile ? (
            <View style={styles.card}>
              <Text style={styles.err}>{error ?? "Could not load your ship-from address."}</Text>
              <View style={{ marginTop: spacing.md }}>
                <Button title="Retry" variant="secondary" onPress={() => { haptics.press(); load(); }} testID="ship-from-retry" />
              </View>
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Origin address</Text>
              <Text style={styles.dim}>USPS uses this address as the return address on your labels.</Text>

              <Input
                label="Full name*"
                value={profile.ship_from_name}
                onChangeText={(v) => update({ ship_from_name: v })}
                autoCapitalize="words"
                autoCorrect={false}
                placeholder="Jane Seller"
                testID="ship-from-name"
              />
              <Input
                label="Company (optional)"
                value={profile.ship_from_company}
                onChangeText={(v) => update({ ship_from_company: v })}
                autoCapitalize="words"
                autoCorrect={false}
                placeholder="Your shop name"
                testID="ship-from-company"
              />
              <Input
                label="Street address*"
                value={profile.ship_from_street1}
                onChangeText={(v) => update({ ship_from_street1: v })}
                autoCapitalize="words"
                autoCorrect={false}
                placeholder="123 Main St"
                testID="ship-from-street1"
              />
              <Input
                label="Apt/Suite (optional)"
                value={profile.ship_from_street2}
                onChangeText={(v) => update({ ship_from_street2: v })}
                autoCapitalize="words"
                autoCorrect={false}
                placeholder="Suite 200"
                testID="ship-from-street2"
              />
              <Input
                label="City*"
                value={profile.ship_from_city}
                onChangeText={(v) => update({ ship_from_city: v })}
                autoCapitalize="words"
                autoCorrect={false}
                placeholder="Portland"
                testID="ship-from-city"
              />
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Input
                    label="State*"
                    value={profile.ship_from_state}
                    onChangeText={(v) => update({ ship_from_state: v.toUpperCase().slice(0, 2) })}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={2}
                    placeholder="OR"
                    testID="ship-from-state"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Input
                    label="ZIP*"
                    value={profile.ship_from_zip}
                    onChangeText={(v) => update({ ship_from_zip: v.replace(/[^0-9-]/g, "").slice(0, 10) })}
                    keyboardType="numeric"
                    autoCorrect={false}
                    placeholder="97201"
                    testID="ship-from-zip"
                  />
                </View>
              </View>
              <Input
                label="Country"
                value={profile.ship_from_country}
                onChangeText={(v) => update({ ship_from_country: v.toUpperCase().slice(0, 2) })}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={2}
                placeholder="US"
                editable={false}
                testID="ship-from-country"
              />
              <Input
                label="Phone"
                value={profile.ship_from_phone}
                onChangeText={(v) => update({ ship_from_phone: v })}
                keyboardType="phone-pad"
                autoCorrect={false}
                placeholder="(555) 555-0123"
                testID="ship-from-phone"
              />

              {error ? <Text style={styles.err}>{error}</Text> : null}

              <View style={{ marginTop: spacing.md }}>
                <Button
                  title={saving ? "Saving…" : "Save address"}
                  onPress={() => { haptics.press(); save(); }}
                  loading={saving}
                  disabled={!!missingField}
                  testID="ship-from-save"
                />
                {missingField ? (
                  <Text style={styles.hint}>All fields marked with * are required.</Text>
                ) : null}
              </View>
            </View>
          )}

          <View style={styles.footNote}>
            <Text style={styles.dimSmall}>
              You can update this address any time. Existing shipments already labeled use the address they were bought with.
            </Text>
          </View>
        </KeyboardAwareScroll>
    </SafeAreaView>
  );
}

// v1.0.228 — Seller Shippo (shipping-from address) refinement. Cards
// become white on cream with hairline borders; hero + card titles
// migrated to shared type tokens.
const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, gap: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  headerBtn: { padding: spacing.xs, borderRadius: radius.pill },
  headerTitle: { ...typeTokens.h2, flex: 1, fontSize: 18, textAlign: "center" },
  container: { padding: spacing.lg, gap: spacing.lg },
  hero: { gap: spacing.sm },
  heroTitle: { ...typeTokens.h1 },
  heroBody: { ...typeTokens.body, color: colors.onSurfaceMuted, lineHeight: 20 },
  card: {
    padding: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    gap: spacing.sm,
  },
  cardTitle: { ...typeTokens.h3 },
  row: { flexDirection: "row", gap: spacing.md },
  dim: { ...typeTokens.caption },
  dimSmall: { ...typeTokens.micro, color: colors.onSurfaceMuted },
  err: { ...typeTokens.caption, color: colors.error, marginTop: spacing.sm },
  hint: { ...typeTokens.caption, marginTop: spacing.sm, textAlign: "center" },
  footNote: { paddingHorizontal: spacing.sm },
});
