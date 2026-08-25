import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { LogBox, StatusBar, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useDeepLinkRouting } from "@/src/hooks/use-deep-link-routing";
import { useHardwareBack } from "@/src/hooks/use-hardware-back";
import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { useNotificationRouting } from "@/src/hooks/use-notification-routing";
import { AuthProvider } from "@/src/context/AuthContext";
import { CartProvider } from "@/src/context/CartContext";
import { FavoritesProvider } from "@/src/context/FavoritesContext";
import { AlertsProvider } from "@/src/context/AlertsContext";
import { RestockAlertsProvider } from "@/src/context/RestockAlertsContext";
import { StripePaymentProvider } from "@/src/context/StripePayment";
import { NetworkProvider } from "@/src/context/NetworkContext";
import { ToastHost } from "@/src/components/Toast";
import { OfflineBanner } from "@/src/components/OfflineBanner";
import { ErrorBoundary } from "@/src/components/ErrorBoundary";
import { colors } from "@/src/theme";

if (!__DEV__) {
  LogBox.ignoreAllLogs(true);
}
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
      {/* v1.0.73 — ErrorBoundary at the very top so a mid-tree render throw
          shows a recovery screen instead of the white default. */}
      <ErrorBoundary>
      <NetworkProvider>
      <AuthProvider>
        <CartProvider>
          <FavoritesProvider>
            {/* v1.0.116 — AlertsProvider sits below Auth (so it can see
                the current user) and above the app tree so the header
                bell can show a live unread badge on every screen. */}
            <AlertsProvider>
            <RestockAlertsProvider>
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
              <OfflineBanner />
              {/* Needs the auth + navigation contexts, so they mount inside them. */}
              <NotificationTapRouter />
              <DeepLinkRouter />
              <HardwareBackRouter />
            </View>
            </StripePaymentProvider>
            </RestockAlertsProvider>
            </AlertsProvider>
          </FavoritesProvider>
        </CartProvider>
      </AuthProvider>
      </NetworkProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

function NotificationTapRouter() {
  useNotificationRouting();
  return null;
}

function DeepLinkRouter() {
  // v1.0.56 - routes inbound shopmynest.com URLs (Android App Links) to the
  // matching in-app screen.
  useDeepLinkRouting();
  return null;
}

function HardwareBackRouter() {
  // v1.0.57 - Android hardware / gesture back mirrors the in-app chevron:
  // pops (more) stack when there's history, routes to the natural parent
  // tab when there isn't, and stays out of the way on tab roots.
  useHardwareBack();
  return null;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
});
