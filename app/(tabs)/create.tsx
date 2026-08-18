import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Redirect, useRouter } from "expo-router";

import { colors, radius, shadows, spacing } from "@/src/theme";
import { useAuth } from "@/src/context/AuthContext";
import { Button } from "@/src/components/Button";
import { NestLogo } from "@/src/components/NestLogo";
import { EmptyState } from "@/src/components/EmptyState";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { pushFromTab } from "@/src/utils/nav";

export default function CreateTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  if (!user) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <EmptyState
          icon="log-in-outline"
          title="Sign in to create"
          message="Log in to apply as a seller or list new products."
          actionLabel="Sign in"
          onAction={() => pushFromTab(router, "/(auth)/login")}
          testID="create-signed-out"
        />
      </SafeAreaView>
    );
  }

  const isSeller = user.role === "seller" || user.role === "admin";
  const isPending = user.seller_application_status === "pending";

  // Approved sellers manage their inventory on the dedicated listings screen.
  if (isSeller) {
    return <Redirect href="/seller/listings" />;
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 100, paddingHorizontal: spacing.lg }}>
        <View style={styles.header}>
          <NestLogo compact />
          <CartHeaderButton />
        </View>

        {isPending ? (
          <EmptyState
            icon="hourglass-outline"
            title="Application under review"
            message={"We'll notify you as soon as your seller application is reviewed."}
            testID="create-pending"
          />
        ) : (
          <>
            <Text style={styles.title}>Build your Nest</Text>
            <Text style={styles.subtitle}>Apply to open your shop on My Nest. Approval usually takes 1–3 days.</Text>
            <Action
              icon="storefront-outline"
              title="Build your Nest"
              body="Tell us about your shop and what you make."
              onPress={() => pushFromTab(router, "/seller/apply")}
              testID="create-apply-seller"
            />
            {user.seller_application_status === "rejected" ? (
              <Text style={styles.rejected}>Your last application wasn't approved. You can re-apply.</Text>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Action({
  icon,
  title,
  body,
  onPress,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85} testID={testID}>
      <View style={styles.cardIcon}>
        <Ionicons name={icon} size={22} color={colors.brand} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardBody}>{body}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.onSurfaceMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: spacing.sm, paddingBottom: spacing.lg },
  title: { fontSize: 24, fontWeight: "800", color: colors.onSurface, marginTop: spacing.md, marginBottom: spacing.xs },
  subtitle: { fontSize: 14, color: colors.onSurfaceMuted, marginBottom: spacing.xl },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.md,
    ...shadows.card,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { fontSize: 15, fontWeight: "800", color: colors.onSurface },
  cardBody: { fontSize: 13, color: colors.onSurfaceMuted, marginTop: 2 },
  rejected: { color: colors.error, marginTop: spacing.md, fontSize: 13 },
});
