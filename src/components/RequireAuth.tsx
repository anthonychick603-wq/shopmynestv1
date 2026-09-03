// v1.0.241 — Guard for private buyer routes.
//
// Wrap the body of any screen that requires an authenticated user. When
// the user is null, we render a friendly sign-in prompt instead of
// letting the screen fire authenticated API calls that will 401/403 and
// then be mis-rendered as an empty state.
//
// Usage:
//
//   return (
//     <RequireAuth message="Sign in to view your orders.">
//       <ActualOrdersScreen />
//     </RequireAuth>
//   );
//
// The wrapped screen only mounts once `user` is present, which also
// means the private load effects inside it never fire for guests.
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/context/AuthContext";
import { Button } from "@/src/components/Button";
import { colors, radius, spacing, type as typeTokens } from "@/src/theme";
import { haptics } from "@/src/utils/haptics";

type Props = {
  children: React.ReactNode;
  /** Prompt shown in the sign-in card. */
  message?: string;
};

export function RequireAuth({
  children,
  message = "Sign in to continue.",
}: Props) {
  const { user, loading } = useAuth();
  const router = useRouter();

  // While the AuthProvider is hydrating, render nothing to avoid
  // flashing the sign-in card before the token is read.
  if (loading) {
    return <SafeAreaView style={styles.safe} />;
  }

  if (user) return <>{children}</>;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.wrap}>
        <View style={styles.iconCircle}>
          <Ionicons name="lock-closed-outline" size={28} color={colors.brand} />
        </View>
        <Text style={styles.title}>Sign in required</Text>
        <Text style={styles.body}>{message}</Text>
        <Button
          title="Sign in"
          onPress={() => { haptics.press(); router.push("/(auth)/login"); }}
          testID="require-auth-signin"
        />
        <View style={{ height: spacing.sm }} />
        <Button
          title="Create account"
          variant="secondary"
          onPress={() => { haptics.tap(); router.push("/(auth)/register"); }}
          testID="require-auth-register"
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: radius.pill ?? 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.peach,
    marginBottom: spacing.md,
  },
  title: {
    ...typeTokens.h2,
    textAlign: "center",
    color: colors.onSurface,
  },
  body: {
    ...typeTokens.body,
    textAlign: "center",
    color: colors.onSurfaceMuted,
    marginBottom: spacing.lg,
    maxWidth: 320,
  },
});
