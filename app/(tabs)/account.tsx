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
import { pushFromTab } from "@/src/utils/nav";

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
          <CartHeaderButton />
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
            onLongPress={() => (user.is_approved_seller ? pushFromTab(router, "/blog/moderation") : undefined)}
            testID="acc-blog-moderation"
          >
            <NestLogo compact title="Account" />
          </TouchableOpacity>
          <CartHeaderButton />
        </View>

        <View style={styles.profile}>
          {/* v1.0.53 - tap the avatar to change it. */}
          <TouchableOpacity
            onPress={changeAvatar}
            activeOpacity={0.85}
            disabled={uploadingPhoto}
            style={styles.avatarWrap}
            testID="acc-change-avatar"
          >
            {user.profile_photo ? (
              <Image source={{ uri: user.profile_photo }} style={styles.avatarLarge} />
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
          <Row icon="chatbubble-ellipses-outline" label="Messages" onPress={() => pushFromTab(router, "/messages")} testID="acc-messages" />
          <Row icon="heart-outline" label="Favorites" onPress={() => pushFromTab(router, "/favorites")} testID="acc-favorites" />
          <Row icon="notifications-circle-outline" label="Saved searches" onPress={() => pushFromTab(router, "/saved-searches")} testID="acc-saved-searches" />
          <Row icon="shield-checkmark-outline" label="Buyer protection & disputes" onPress={() => pushFromTab(router, "/disputes")} testID="acc-disputes" />
        </Section>

        <Section title="Selling">
          {isSeller ? (
            <>
              <Row icon="storefront-outline" label="My Nest" onPress={() => pushFromTab(router, "/seller/dashboard")} testID="acc-seller-dashboard" />
              <Row icon="cube-outline" label="Add new product" onPress={() => pushFromTab(router, "/seller/product-form")} testID="acc-add-product" />
              <Row icon="cloud-upload-outline" label="Import products from CSV" onPress={() => pushFromTab(router, "/seller/import")} testID="acc-import-products" />
            </>
          ) : user.seller_application_status === "pending" ? (
            <Row icon="hourglass-outline" label="Application status: Pending" testID="acc-app-pending" />
          ) : (
            <Row icon="storefront-outline" label="Build your Nest" onPress={() => pushFromTab(router, "/seller/apply")} testID="acc-become-seller" />
          )}
        </Section>

        <Section title="Preferences">
          <Row icon="notifications-outline" label="Notifications" onPress={() => router.push("/(tabs)/alerts")} testID="acc-notifs" />
        </Section>

        <Section title="Legal">
          {/* v1.0.51 — canonical short slugs served by shopmynest-legal-pages.
              The long-slug variants used to 301-loop against these short ones,
              so hardcoding the long slugs meant every legal link opened a
              broken redirect chain. */}
          <Row icon="shield-checkmark-outline" label="Privacy policy" onPress={() => WebBrowser.openBrowserAsync(`${SITE}/privacy/`)} testID="acc-privacy" />
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
