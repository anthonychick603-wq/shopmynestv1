import React, { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import * as ImagePicker from "expo-image-picker";

import { ApiError, nest, SITE } from "@/src/api/nest";
import { toast } from "@/src/components/Toast";
import { colors, radius, spacing, type as typeTokens } from "@/src/theme";
import { useAuth } from "@/src/context/AuthContext";

import { Button } from "@/src/components/Button";
import { NestLogo } from "@/src/components/NestLogo";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";
import { AppImage } from "@/src/components/AppImage";
import { Card, Badge, ListRow, Screen } from "@/src/components/ui";
import { pushFromTab } from "@/src/utils/nav";
import { haptics } from "@/src/utils/haptics";

// v1.0.224 — Account screen, refined.
//
// Prior version rendered a cream-on-cream profile card, tightly stacked
// section titles that competed with the row titles, and a chevron-only
// row treatment. The refinement pass introduces:
//   • White card surfaces with hairline borders (Stripe language).
//   • Uppercase micro section eyebrows so section labels visually recede
//     and the row titles read as primary.
//   • Profile card with a MAKER badge that no longer competes with body
//     text — moved into the shared Badge primitive.
//   • The list rows use the shared ListRow primitive so radius, icon
//     wrap, chevron, and hit target line up with every other list in
//     the app.
export default function Account() {
  const router = useRouter();
  const { user, logout, refresh } = useAuth();
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

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
        <Header />
        <View style={styles.signedOutWrap}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatarLarge}>
              <Ionicons name="person-outline" size={40} color={colors.brandDark} />
            </View>
          </View>
          <Text style={styles.name}>Welcome to My Nest</Text>
          <Text style={styles.tagline}>
            Sign in to save favorites, follow sellers, and check out faster.
          </Text>
          <Button
            title="Sign in"
            onPress={() => pushFromTab(router, "/(auth)/login")}
            style={{ marginTop: spacing.lg, minWidth: 220 }}
            testID="account-signin"
          />
          <Button
            title="Create account"
            variant="outline"
            onPress={() => pushFromTab(router, "/(auth)/register")}
            style={{ marginTop: spacing.sm, minWidth: 220 }}
            testID="account-register"
          />
        </View>
      </SafeAreaView>
    );
  }

  const isSeller = user.role === "seller" || user.role === "admin";
  const isAdmin = user.role === "admin";

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Header admin={user.role === "admin"} />
      <Screen bottomInset={80}>
        {/* Profile hero card — the app now has a real "who am I" moment
            at the top of the account tab. Prior version was a big cream
            circle on a cream page, which read as visual noise. */}
        <Card variant="flat" padding="lg" style={styles.profileCard}>
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
              <AppImage
                source={{ uri: user.profile_photo }}
                style={styles.avatarLarge}
                fallbackIcon="person-outline"
              />
            ) : (
              <View style={styles.avatarLarge}>
                <Ionicons name="person-outline" size={40} color={colors.brandDark} />
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
          {isSeller ? (
            <View style={{ marginTop: spacing.sm }}>
              <Badge label="MAKER" tone="brand" micro />
            </View>
          ) : null}
        </Card>

        <SectionEyebrow>Shopping</SectionEyebrow>
        <Card variant="flat" padding="none">
          <ListRow icon="bag-check-outline" title="Orders" onPress={() => pushFromTab(router, "/orders")} />
          <ListRow icon="hammer-outline" title="Custom requests" onPress={() => pushFromTab(router, "/custom-requests")} />
          <ListRow icon="chatbubble-ellipses-outline" title="Messages" onPress={() => pushFromTab(router, "/messages")} />
          <ListRow icon="bookmark-outline" title="Favorites" onPress={() => pushFromTab(router, "/favorites")} />
          <ListRow icon="notifications-circle-outline" title="Saved searches" onPress={() => pushFromTab(router, "/saved-searches")} />
          <ListRow icon="heart-outline" title="Shops you follow" onPress={() => pushFromTab(router, "/following")} />
          <ListRow icon="home-outline" title="Address book" onPress={() => pushFromTab(router, "/me/addresses")} />
          <ListRow icon="notifications-outline" title="Notifications" onPress={() => pushFromTab(router, "/settings/notifications")} />
          <ListRow icon="lock-closed-outline" title="App lock" onPress={() => pushFromTab(router, "/settings/app-lock")} />
          <ListRow icon="shield-checkmark-outline" title="Buyer protection & disputes" onPress={() => pushFromTab(router, "/disputes")} />
        </Card>

        <SectionEyebrow>Selling</SectionEyebrow>
        <Card variant="flat" padding="none">
          {isSeller ? (
            <>
              <ListRow icon="storefront-outline" title="My Nest" onPress={() => pushFromTab(router, "/seller/dashboard")} />
              <ListRow icon="cube-outline" title="Add new product" onPress={() => pushFromTab(router, "/seller/product-form")} />
              <ListRow icon="pricetag-outline" title="Coupons" onPress={() => pushFromTab(router, "/seller/coupons")} />
              <ListRow icon="cloud-upload-outline" title="Import products from CSV" onPress={() => pushFromTab(router, "/seller/import")} />
            </>
          ) : user.seller_application_status === "pending" ? (
            <ListRow icon="hourglass-outline" title="Application status: Pending" hideChevron />
          ) : (
            <ListRow icon="storefront-outline" title="Build your Nest" onPress={() => pushFromTab(router, "/seller/apply")} />
          )}
        </Card>

        {isAdmin ? (
          <>
            <SectionEyebrow>Admin</SectionEyebrow>
            <Card variant="flat" padding="none">
              <ListRow icon="settings-outline" title="Admin controls" onPress={() => pushFromTab(router, "/admin")} />
              <ListRow icon="pricetag-outline" title="Site-wide coupons" onPress={() => pushFromTab(router, "/admin/coupons")} />
            </Card>
          </>
        ) : null}

        <SectionEyebrow>Preferences</SectionEyebrow>
        <Card variant="flat" padding="none">
          <ListRow icon="notifications-outline" title="Notifications" onPress={() => router.push("/(tabs)/alerts")} />
        </Card>

        <SectionEyebrow>Legal</SectionEyebrow>
        <Card variant="flat" padding="none">
          <ListRow icon="shield-checkmark-outline" title="Privacy policy" onPress={() => WebBrowser.openBrowserAsync(`${SITE}/privacy-policy/`)} />
          <ListRow icon="document-text-outline" title="Terms of service" onPress={() => WebBrowser.openBrowserAsync(`${SITE}/terms/`)} />
          <ListRow icon="refresh-outline" title="Refund policy" onPress={() => WebBrowser.openBrowserAsync(`${SITE}/refunds/`)} />
          <ListRow icon="cube-outline" title="Shipping policy" onPress={() => WebBrowser.openBrowserAsync(`${SITE}/shipping/`)} />
          <ListRow icon="briefcase-outline" title="Seller terms" onPress={() => WebBrowser.openBrowserAsync(`${SITE}/seller-terms/`)} />
          <ListRow icon="cloud-download-outline" title="Download my data" onPress={() => { haptics.tap(); router.push("/(tabs)/(more)/me/data-export"); }} />
          <ListRow icon="trash-outline" title="Delete my account" onPress={() => { haptics.tap(); router.push("/(tabs)/(more)/me/delete-account"); }} destructive />
        </Card>

        <View style={{ marginTop: spacing.xl }}>
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
      </Screen>
    </SafeAreaView>
  );
}

function Header({ admin }: { admin?: boolean }) {
  const router = useRouter();
  return (
    <View style={styles.header}>
      <TouchableOpacity
        activeOpacity={1}
        delayLongPress={800}
        onLongPress={() => (admin ? pushFromTab(router, "/blog/moderation") : undefined)}
        testID="acc-blog-moderation"
        accessibilityRole="button"
      >
        <NestLogo compact title="Account" />
      </TouchableOpacity>
      <View style={styles.headerActions}>
        <AlertsBellButton />
        <CartHeaderButton />
      </View>
    </View>
  );
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionEyebrow}>{String(children).toUpperCase()}</Text>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  signedOutWrap: { padding: spacing.xl, alignItems: "center" },
  profileCard: {
    alignItems: "center",
    marginBottom: spacing.md,
  },
  avatarWrap: { position: "relative", marginBottom: spacing.md },
  avatarEditBadge: {
    position: "absolute",
    right: 0,
    bottom: 4,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.card,
  },
  avatarLarge: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  name: { ...typeTokens.h1, fontSize: 22, lineHeight: 28 },
  tagline: {
    ...typeTokens.body,
    color: colors.onSurfaceMuted,
    marginTop: spacing.xs,
    textAlign: "center",
    maxWidth: 320,
  },
  email: { ...typeTokens.body, color: colors.onSurfaceMuted, marginTop: 2, textAlign: "center" },
  sectionEyebrow: {
    ...typeTokens.micro,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    marginLeft: spacing.sm,
  },
});
