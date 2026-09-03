import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Redirect, useRouter } from "expo-router";

import { colors, radius, spacing, type as typeTokens } from "@/src/theme";
import { useAuth } from "@/src/context/AuthContext";
import { NestLogo } from "@/src/components/NestLogo";
import { EmptyState } from "@/src/components/EmptyState";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";
import { usePushFromTab } from "@/src/utils/nav";
import { haptics } from "@/src/utils/haptics";

export default function CreateTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const push = usePushFromTab();
  const { user } = useAuth();

  if (!user) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <EmptyState
          icon="log-in-outline"
          title="Sign in to create"
          message="Log in to apply as a seller or list new products."
          actionLabel="Sign in"
          onAction={() => push("/(auth)/login")}
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
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 100, paddingHorizontal: spacing.lg }} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <NestLogo compact />
          <AlertsBellButton />
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
              onPress={() => { haptics.press(); push("/seller/apply"); }}
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
    <TouchableOpacity style={styles.card} onPress={() => { haptics.tap(); onPress(); }} activeOpacity={0.85} testID={testID} accessibilityRole="button" accessibilityLabel={title}>
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
  title: { ...typeTokens.display, marginTop: spacing.md, marginBottom: spacing.xs },
  subtitle: { ...typeTokens.body, color: colors.onSurfaceMuted, marginBottom: spacing.xl },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { ...typeTokens.h3 },
  cardBody: { ...typeTokens.caption, marginTop: 2 },
  rejected: { color: colors.error, marginTop: spacing.md, fontSize: 13 },
});
