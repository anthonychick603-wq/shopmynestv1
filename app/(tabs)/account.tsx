import React, { useState } from "react";
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import * as ImagePicker from "expo-image-picker";

import { ApiError, nest, SITE } from "@/src/api/nest";
import { toast } from "@/src/components/Toast";
import { colors, radius, shadows, spacing } from "@/src/theme";
import { useAuth } from "@/src/context/AuthContext";

import { Button } from "@/src/components/Button";
import { NestLogo } from "@/src/components/NestLogo";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";
import { AppImage } from "@/src/components/AppImage";
import { pushFromTab } from "@/src/utils/nav";
import { haptics } from "@/src/utils/haptics";

export default function Account() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout, refresh } = useAuth();
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // v1.0.53 — tap the avatar to change it. We pick from the OS photo
  // library, upload to /account/photo/upload on the bridge, then
  // refresh() the auth user so the new avatar renders everywhere.
  const changeAvatar = async () => {
    if (uploadingPhoto) return;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        toast.error("Allow photo access to change your picture.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.85,
        allowsEditing: true,
        aspect: [1, 1],
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setUploadingPhoto(true);
      await nest.uploadAccountPhoto({
        uri: asset.uri,
        fileName: asset.fileName || "avatar.jpg",
        mimeType: asset.mimeType || "image/jpeg",
      });
      await refresh();
      toast.success("Profile photo updated");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.friendly : "Couldn't update your photo.");
    } finally {
      setUploadingPhoto(false);
    }
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}>
          <NestLogo compact title="Account" />
          {/* v1.0.149 — group the bell and cart so justifyContent
              space-between sees two children (logo | actions), matching
              every other tab. Otherwise the bell floats to the horizontal
              middle of the screen. */}
          <View style={styles.headerActions}>
            <AlertsBellButton />
            <CartHeaderButton />
          </View>
        </View>
        <View style={{ padding: spacing.xl, alignItems: "center" }}>
          <View style={styles.avatarLarge}>
            <Ionicons name="person" size={40} color={colors.brand} />
          </View>
          <Text style={styles.name}>Welcome to My Nest</Text>
          <Text style={styles.email}>Sign in to save favorites, follow sellers, and check out faster.</Text>
          <Button title="Sign in" onPress={() => pushFromTab(router, "/(auth)/login")} style={{ marginTop: spacing.lg, minWidth: 220 }} testID="account-signin" />
          <Button title="Create account" variant="outline" onPress={() => pushFromTab(router, "/(auth)/register")} style={{ marginTop: spacing.sm, minWidth: 220 }} testID="account-register" />
        </View>
      </SafeAreaView>
    );
  }

  const isSeller = user.role === "seller" || user.role === "admin";
  const isAdmin = user.role === "admin";

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>
        <View style={styles.header}>
          {/* Unlisted admin-only entry point to blog moderation. The backend
              remains the final authorization gate, and the client now mirrors it
              with the explicit admin role instead of seller approval status. */}
          <TouchableOpacity
            activeOpacity={1}
            delayLongPress={800}
            onLongPress={() => (user.role === "admin" ? pushFromTab(router, "/blog/moderation") : undefined)}
            testID="acc-blog-moderation"
          >
            <NestLogo compact title="Account" />
          </TouchableOpacity>
          {/* v1.0.149 — grouped so the bell sits next to the cart, not
              floating to the middle of the header. */}
          <View style={styles.headerActions}>
            <AlertsBellButton />
            <CartHeaderButton />
          </View>
        </View>

        <View style={styles.profile}>
          {/* v1.0.53 - tap the avatar to change it. */}
          <TouchableOpacity
            onPress={changeAvatar}
            activeOpacity={0.85}
            disabled={uploadingPhoto}
            style={styles.avatarWrap}
            testID="acc-change-avatar"
            accessibilityRole="button"
            accessibilityLabel={uploadingPhoto ? "Uploading profile photo" : "Change profile photo"}
            accessibilityState={{ disabled: uploadingPhoto }}
          >
            {user.profile_photo ? (
              <AppImage source={{ uri: user.profile_photo }} style={styles.avatarLarge} fallbackIcon="person-outline" />
            ) : (
              <View style={styles.avatarLarge}>
                <Ionicons name="person" size={40} color={colors.brand} />
              </View>
            )}
            <View style={styles.avatarEditBadge}>
              {uploadingPhoto ? (
                <ActivityIndicator size="small" color={colors.onBrand} />
              ) : (
                <Ionicons name="camera" size={14} color={colors.onBrand} />
              )}
            </View>
          </TouchableOpacity>
          <Text style={styles.name}>{user.name}</Text>
          <Text style={styles.email}>{user.email}</Text>
          {isSeller ? <View style={styles.sellerBadge}><Text style={styles.sellerBadgeText}>MAKER</Text></View> : null}
        </View>

        <Section title="Shopping">
          <Row icon="bag-check-outline" label="Orders" onPress={() => pushFromTab(router, "/orders")} testID="acc-orders" />
          <Row icon="hammer-outline" label="Custom requests" onPress={() => pushFromTab(router, "/custom-requests")} testID="acc-custom-requests" />
          <Row icon="chatbubble-ellipses-outline" label="Messages" onPress={() => pushFromTab(router, "/messages")} testID="acc-messages" />
          <Row icon="bookmark-outline" label="Favorites" onPress={() => pushFromTab(router, "/favorites")} testID="acc-favorites" />
          <Row icon="notifications-circle-outline" label="Saved searches" onPress={() => pushFromTab(router, "/saved-searches")} testID="acc-saved-searches" />
          <Row icon="heart-outline" label="Shops you follow" onPress={() => pushFromTab(router, "/following")} testID="acc-following" />
          <Row icon="home-outline" label="Address book" onPress={() => pushFromTab(router, "/me/addresses")} testID="acc-addresses" />
          {/* v1.0.94 (Build #17b) — push notification preferences center. */}
          <Row icon="notifications-outline" label="Notifications" onPress={() => pushFromTab(router, "/settings/notifications")} testID="acc-notifications" />
          <Row icon="shield-checkmark-outline" label="Buyer protection & disputes" onPress={() => pushFromTab(router, "/disputes")} testID="acc-disputes" />
        </Section>

        <Section title="Selling">
          {isSeller ? (
            <>
              <Row icon="storefront-outline" label="My Nest" onPress={() => pushFromTab(router, "/seller/dashboard")} testID="acc-seller-dashboard" />
              <Row icon="cube-outline" label="Add new product" onPress={() => pushFromTab(router, "/seller/product-form")} testID="acc-add-product" />
              <Row icon="pricetag-outline" label="Coupons" onPress={() => pushFromTab(router, "/seller/coupons")} testID="acc-seller-coupons" />
              <Row icon="cloud-upload-outline" label="Import products from CSV" onPress={() => pushFromTab(router, "/seller/import")} testID="acc-import-products" />
            </>
          ) : user.seller_application_status === "pending" ? (
            <Row icon="hourglass-outline" label="Application status: Pending" testID="acc-app-pending" />
          ) : (
            <Row icon="storefront-outline" label="Build your Nest" onPress={() => pushFromTab(router, "/seller/apply")} testID="acc-become-seller" />
          )}
        </Section>

        {isAdmin ? (
          <Section title="Admin">
            <Row icon="settings-outline" label="Admin controls" onPress={() => pushFromTab(router, "/admin")} testID="acc-admin" />
            <Row icon="pricetag-outline" label="Site-wide coupons" onPress={() => pushFromTab(router, "/admin/coupons")} testID="acc-admin-coupons" />
          </Section>
        ) : null}

        <Section title="Preferences">
          <Row icon="notifications-outline" label="Notifications" onPress={() => router.push("/(tabs)/alerts")} testID="acc-notifs" />
        </Section>

        <Section title="Legal">
          {/* v1.0.100 — canonical slugs served by shopmynest-legal-pages.
              Privacy uses the long slug /privacy-policy/ (matches WP core's
              wp_page_for_privacy_policy option). The other three use short
              slugs /terms/, /refunds/, /shipping/. Legal-pages v1.1.4 owns
              those redirects; the unified marketplace plugin used to fight
              them (see v3.7.94 flip and v3.7.122.2 loop fix). */}
          <Row icon="shield-checkmark-outline" label="Privacy policy" onPress={() => WebBrowser.openBrowserAsync(`${SITE}/privacy-policy/`)} testID="acc-privacy" />
          <Row icon="document-text-outline" label="Terms of service" onPress={() => WebBrowser.openBrowserAsync(`${SITE}/terms/`)} testID="acc-terms" />
          <Row icon="refresh-outline" label="Refund policy" onPress={() => WebBrowser.openBrowserAsync(`${SITE}/refunds/`)} testID="acc-refund" />
          <Row icon="cube-outline" label="Shipping policy" onPress={() => WebBrowser.openBrowserAsync(`${SITE}/shipping/`)} testID="acc-shipping" />
          <Row icon="briefcase-outline" label="Seller terms" onPress={() => WebBrowser.openBrowserAsync(`${SITE}/seller-terms/`)} testID="acc-seller-terms" />
          <Row icon="trash-outline" label="Delete my account" onPress={() => WebBrowser.openBrowserAsync(`${SITE}/data-deletion/`)} testID="acc-data-deletion" />
        </Section>

        <View style={{ padding: spacing.lg }}>
          <Button
            title="Log out"
            variant="outline"
            onPress={async () => {
              haptics.warning();
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
    <TouchableOpacity
      style={styles.row}
      onPress={() => { if (onPress) { haptics.tap(); onPress(); } }}
      disabled={!onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={20} color={colors.brand} />
      <Text style={styles.rowLabel}>{label}</Text>
      {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceMuted} /> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  profile: { alignItems: "center", padding: spacing.lg },
  avatarWrap: { position: "relative", marginBottom: spacing.md },
  avatarEditBadge: {
    position: "absolute",
    right: 2,
    bottom: spacing.md + 2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.surface,
  },
  avatarLarge: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
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
