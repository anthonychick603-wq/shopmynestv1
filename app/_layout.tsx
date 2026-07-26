import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { LogBox, StatusBar, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider } from "@/src/context/AuthContext";
import { CartProvider } from "@/src/context/CartContext";
import { FavoritesProvider } from "@/src/context/FavoritesContext";
import { StripePaymentProvider } from "@/src/context/StripePayment";
import { ToastHost } from "@/src/components/Toast";
import { colors } from "@/src/theme";

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useIconFonts();

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <CartProvider>
          <FavoritesProvider>
            <StripePaymentProvider>
            <View style={styles.root}>
              <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }}>
                {/* Only the entry redirect, the tab layout and the auth modal
                    live at the root. Every other screen sits in the nested Stack
                    at app/(tabs)/(more)/ so the tab bar stays visible on it. */}
                <Stack.Screen name="index" />
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="(auth)" options={{ presentation: "modal" }} />
              </Stack>
              <ToastHost />
            </View>
            </StripePaymentProvider>
          </FavoritesProvider>
        </CartProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
});
