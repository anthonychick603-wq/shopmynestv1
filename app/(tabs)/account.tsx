import React from "react";
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";

import { SITE } from "@/src/api/nest";
import { colors, radius, shadows, spacing } from "@/src/theme";
import { useAuth } from "@/src/context/AuthContext";
import { Button } from "@/src/components/Button";
import { NestLogo } from "@/src/components/NestLogo";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";

export default function Account() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuth();

  if (!user) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}>
          <NestLogo compact title="Account" />
          <CartHeaderButton />
        </View>
        <View style={{ padding: spacing.xl, alignItems: "center" }}>
          <View style={styles.avatarLarge}>
            <Ionicons name="person" size={40} color={colors.brand} />
          </View>
          <Text style={styles.name}>Welcome to My Nest</Text>
          <Text style={styles.email}>Sign in to save favorites, follow sellers, and check out faster.</Text>
          <Button title="Sign in" onPress={() => router.push("/(auth)/login")} style={{ marginTop: spacing.lg, minWidth: 220 }} testID="account-signin" />
          <Button title="Create account" variant="outline" onPress={() => router.push("/(auth)/register")} style={{ marginTop: spacing.sm, minWidth: 220 }} testID="account-register" />
        </View>
      </SafeAreaView>
    );
  }

  const isSeller = user.role === "seller" || user.role === "admin";

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>
        <View style={styles.header}>
          {/* Unlisted entry point to blog moderation. The backend routes are the
              real gate (403 for non-admins); is_approved_seller is the only
              store-management flag the API exposes, so it is used here only to
              keep the affordance away from buyers. */}
          <TouchableOpacity
            activeOpacity={1}
            delayLongPress={800}
            onLongPress={() => (user.is_approved_seller ? router.push("/blog/moderation") : undefined)}
            testID="acc-blog-moderation"
          >
            <NestLogo compact title="Account" />
          </TouchableOpacity>
          <CartHeaderButton />
        </View>

        <View style={styles.profile}>
          {user.profile_photo ? (
            <Image source={{ uri: user.profile_photo }} style={styles.avatarLarge} />
          ) : (
            <View style={styles.avatarLarge}>
              <Ionicons name="person" size={40} color={colors.brand} />
            </View>
          )}
          <Text style={styles.name}>{user.name}</Text>
          <Text style={styles.email}>{user.email}</Text>
          {isSeller ? <View style={styles.sellerBadge}><Text style={styles.sellerBadgeText}>MAKER</Text></View> : null}
        </View>

        <Section title="Shopping">
          <Row icon="bag-check-outline" label="Orders" onPress={() => router.push("/orders")} testID="acc-orders" />
          <Row icon="chatbubble-ellipses-outline" label="Messages" onPress={() => router.push("/messages")} testID="acc-messages" />
          <Row icon="heart-outline" label="Favorites" onPress={() => router.push("/favorites")} testID="acc-favorites" />
          <Row icon="shield-checkmark-outline" label="Buyer protection & disputes" onPress={() => router.push("/disputes")} testID="acc-disputes" />
        </Section>

        <Section title="Selling">
          {isSeller ? (
            <>
              <Row icon="storefront-outline" label="My Nest" onPress={() => router.push("/seller/dashboard")} testID="acc-seller-dashboard" />
              <Row icon="cube-outline" label="Add new product" onPress={() => router.push("/seller/product-form")} testID="acc-add-product" />
              <Row icon="cloud-upload-outline" label="Import products from CSV" onPress={() => router.push("/seller/import")} testID="acc-import-products" />
            </>
          ) : user.seller_application_status === "pending" ? (
            <Row icon="hourglass-outline" label="Application status: Pending" testID="acc-app-pending" />
          ) : (
            <Row icon="storefront-outline" label="Build your Nest" onPress={() => router.push("/seller/apply")} testID="acc-become-seller" />
          )}
        </Section>

        <Section title="Preferences">
          <Row icon="notifications-outline" label="Notifications" onPress={() => router.push("/(tabs)/alerts")} testID="acc-notifs" />
        </Section>

        <Section title="Legal">
          <Row icon="shield-checkmark-outline" label="Privacy policy" onPress={() => WebBrowser.openBrowserAsync(`${SITE}/privacy-policy`)} testID="acc-privacy" />
          <Row icon="document-text-outline" label="Terms of service" onPress={() => WebBrowser.openBrowserAsync(`${SITE}/terms-of-service`)} testID="acc-terms" />
          <Row icon="refresh-outline" label="Refund policy" onPress={() => WebBrowser.openBrowserAsync(`${SITE}/refund-policy`)} testID="acc-refund" />
          <Row icon="briefcase-outline" label="Seller terms" onPress={() => WebBrowser.openBrowserAsync(`${SITE}/seller-terms`)} testID="acc-seller-terms" />
        </Section>

        <View style={{ padding: spacing.lg }}>
          <Button
            title="Log out"
            variant="outline"
            onPress={async () => {
              await logout();
              router.replace("/(tabs)");
            }}
            testID="acc-logout"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function Row({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
  testID?: string;
}) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} disabled={!onPress} testID={testID}>
      <Ionicons name={icon} size={20} color={colors.brand} />
      <Text style={styles.rowLabel}>{label}</Text>
      {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceMuted} /> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  profile: { alignItems: "center", padding: spacing.lg },
  avatarLarge: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  name: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
  email: { fontSize: 13, color: colors.onSurfaceMuted, marginTop: 2, textAlign: "center" },
  sellerBadge: { backgroundColor: colors.brand, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 4, marginTop: spacing.sm },
  sellerBadgeText: { color: colors.onBrand, fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.md },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: colors.onSurfaceMuted, marginBottom: spacing.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  sectionCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, overflow: "hidden", ...shadows.card },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowLabel: { flex: 1, fontSize: 15, color: colors.onSurface, fontWeight: "600" },
});
