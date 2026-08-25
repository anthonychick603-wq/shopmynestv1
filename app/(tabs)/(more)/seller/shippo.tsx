import React, { useCallback, useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { nest, ApiError, type NestSellerShippingProfile } from "@/src/api/nest";
import { colors, radius, shadows, spacing } from "@/src/theme";
import { Button } from "@/src/components/Button";
import { Input } from "@/src/components/Input";
import { toast } from "@/src/components/Toast";
import { haptics } from "@/src/utils/haptics";
import { safeBack } from "@/src/utils/nav";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";

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

// Fields that must be non-empty for the ship-from address to be considered
// complete. Matches mnu_seller_ship_from_missing_field() on the server, minus
// the package-default dimensions (those live on the seller's shipping-defaults
// screen — this screen is address-only to stay focused).
const REQUIRED_FIELDS: Array<keyof NestSellerShippingProfile> = [
  "ship_from_name",
  "ship_from_street1",
  "ship_from_city",
  "ship_from_state",
  "ship_from_zip",
];

// Rule from the project: default country is USA, default state is NH.
const COUNTRY_DEFAULT = "US";
const STATE_DEFAULT = "NH";

export default function SellerShipFromAddress() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [profile, setProfile] = useState<NestSellerShippingProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await nest.getSellerShippingProfile();
      // Backfill the two defaults the platform requires so a brand-new seller
      // sees the form pre-filled to USA / NH instead of blank pickers.
      const merged = {
        ...res.profile,
        ship_from_country: res.profile.ship_from_country || COUNTRY_DEFAULT,
        ship_from_state: res.profile.ship_from_state || STATE_DEFAULT,
      };
      setProfile(merged);
    } catch (e) {
      setError(e instanceof ApiError ? e.friendly : "Could not load your ship-from address.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const update = (patch: Partial<NestSellerShippingProfile>) => {
    setProfile((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const missingField = useMemo(() => {
    if (!profile) return null;
    for (const key of REQUIRED_FIELDS) {
      const v = String(profile[key] ?? "").trim();
      if (v === "") return key;
    }
    return null;
  }, [profile]);

  const save = async () => {
    if (!profile) return;
    if (missingField) {
      setError("Please complete every required field before saving.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await nest.saveSellerShippingProfile(profile);
      setProfile(res.profile);
      haptics.success();
      toast.success("Ship-from address saved");
    } catch (e) {
      haptics.warning();
      setError(e instanceof ApiError ? e.friendly : "Could not save your ship-from address.");
    } finally {
      setSaving(false);
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
        >
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ship-from address</Text>
        <AlertsBellButton />
        <CartHeaderButton />
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + spacing.xl }]}
          keyboardShouldPersistTaps="handled"
        >
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
                placeholder="Apt 4B"
                testID="ship-from-street2"
              />
              <Input
                label="City*"
                value={profile.ship_from_city}
                onChangeText={(v) => update({ ship_from_city: v })}
                autoCapitalize="words"
                autoCorrect={false}
                placeholder="Rochester"
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
                    placeholder="NH"
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
                    placeholder="03867"
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
                placeholder="(603) 555-0123"
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
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, gap: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  headerBtn: { padding: spacing.xs, borderRadius: radius.pill },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "700", color: colors.onSurface, textAlign: "center" },
  container: { padding: spacing.lg, gap: spacing.lg },
  hero: { gap: spacing.sm },
  heroTitle: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
  heroBody: { fontSize: 14, color: colors.onSurfaceMuted, lineHeight: 20 },
  card: { padding: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.lg, ...shadows.card, gap: spacing.sm },
  cardTitle: { fontSize: 16, fontWeight: "800", color: colors.onSurface },
  row: { flexDirection: "row", gap: spacing.md },
  dim: { color: colors.onSurfaceMuted, fontSize: 13 },
  dimSmall: { color: colors.onSurfaceMuted, fontSize: 12 },
  err: { color: colors.error, fontSize: 13, marginTop: spacing.sm },
  hint: { color: colors.onSurfaceMuted, fontSize: 12, marginTop: spacing.sm, textAlign: "center" },
  footNote: { paddingHorizontal: spacing.sm },
});
