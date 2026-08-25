import { Tabs, useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import { Animated, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, shadows, spacing } from "@/src/theme";
import { useAuth } from "@/src/context/AuthContext";
import { pushFromTab } from "@/src/utils/nav";
import { haptics } from "@/src/utils/haptics";

const TAB_BAR_HEIGHT = 64;

function TabIcon({
  name,
  color,
  focused,
}: {
  name: keyof typeof Ionicons.glyphMap;
  color: string;
  focused: boolean;
}) {
  return (
    <View style={{ alignItems: "center", justifyContent: "center", width: 44 }}>
      <Ionicons name={name} size={focused ? 26 : 24} color={color} />
    </View>
  );
}

// The centered "+" is an action launcher, not a direct navigation. For Makers it
// reveals two pills ("Blog" / "List"); for everyone else it goes straight to the
// blog composer, since none of the seller actions are available to them.
// "Blog" always means the moderated flow — posts are reviewed before they appear
// publicly, so the older unmoderated composer is not offered here.
function CreatePlusButton() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isMaker = user?.is_approved_seller === true;
  const [open, setOpen] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;

  const show = () => {
    setOpen(true);
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 7, tension: 90 }).start();
  };

  const hide = (after?: () => void) => {
    Animated.timing(anim, { toValue: 0, duration: 140, useNativeDriver: true }).start(() => {
      setOpen(false);
      after?.();
    });
  };

  const go = (mode?: "blog") => {
    hide(() => {
      if (mode === "blog") pushFromTab(router, "/blog/compose");
      else router.push("/(tabs)/create");
    });
  };

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });
  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] });

  return (
    <>
      <Pressable
        style={styles.createBtnWrap}
        onPress={() => { haptics.press(); isMaker ? show() : pushFromTab(router, "/blog/compose"); }}
        testID="tab-create"
        accessibilityLabel="Create"
        accessibilityRole="button"
      >
        <View style={styles.createBtn}>
          <Ionicons name="add" size={30} color={colors.onBrand} />
        </View>
      </Pressable>

      <Modal visible={open} transparent animationType="none" onRequestClose={() => hide()}>
        <Pressable style={styles.menuBackdrop} onPress={() => hide()} testID="create-menu-backdrop" accessibilityLabel="Close create menu" accessibilityRole="button">
          <Animated.View
            style={[
              styles.menuRow,
              { bottom: insets.bottom + TAB_BAR_HEIGHT + 16, opacity: anim, transform: [{ translateY }, { scale }] },
            ]}
          >
            <TouchableOpacity style={styles.pill} onPress={() => { haptics.tap(); go("blog"); }} testID="create-menu-blog" activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Create a blog post">
              <Ionicons name="newspaper-outline" size={18} color={colors.onSurface} />
              <Text style={styles.pillText}>Blog</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.pill} onPress={() => { haptics.tap(); go(); }} testID="create-menu-sell" activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="List a new product">
              <Ionicons name="pricetag-outline" size={18} color={colors.onSurface} />
              <Text style={styles.pillText}>List</Text>
            </TouchableOpacity>
          </Animated.View>
        </Pressable>
      </Modal>
    </>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // v1.0.163 — Stop random tab-swap crashes.
        // freezeOnBlur pauses inactive tab subtrees so their timers, animated
        // values, and pending image loads don't keep churning in the
        // background — the biggest source of memory pressure on mid-range
        // Android devices, which was manifesting as silent app closes when
        // switching between the bottom tabs.
        // lazy defers mounting a tab until the user visits it, so first
        // launch doesn't fire every screen's on-mount fetches at once.
        freezeOnBlur: true,
        lazy: true,
        tabBarShowLabel: true,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.onSurfaceMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700", marginTop: 2 },
        tabBarStyle: {
          backgroundColor: colors.surfaceSecondary,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          height: TAB_BAR_HEIGHT + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: 6,
          ...shadows.card,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Blog",
          tabBarIcon: ({ focused, color }) => <TabIcon name={focused ? "home" : "home-outline"} color={color} focused={focused} />,
          tabBarButtonTestID: "tab-blog",
          tabBarAccessibilityLabel: "Blog tab",
        }}
      />
      <Tabs.Screen
        name="browse"
        options={{
          title: "Browse",
          tabBarIcon: ({ focused, color }) => <TabIcon name={focused ? "grid" : "grid-outline"} color={color} focused={focused} />,
          tabBarButtonTestID: "tab-browse",
          tabBarAccessibilityLabel: "Browse tab",
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: "",
          tabBarButton: () => <CreatePlusButton />,
        }}
      />
      <Tabs.Screen
        name="seller/dashboard"
        options={{
          title: "My Nest",
          tabBarIcon: ({ focused, color }) => <TabIcon name={focused ? "storefront" : "storefront-outline"} color={color} focused={focused} />,
          tabBarButtonTestID: "tab-seller-dashboard",
          tabBarAccessibilityLabel: "My Nest seller dashboard tab",
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "Account",
          tabBarIcon: ({ focused, color }) => <TabIcon name={focused ? "person" : "person-outline"} color={color} focused={focused} />,
          tabBarButtonTestID: "tab-account",
          tabBarAccessibilityLabel: "Account tab",
        }}
      />

      {/* Registered as tabs (so entering them is a tab switch, no back arrow)
          but hidden from the visible bar; reached via header icons.
          `tabBarItemStyle: display none` removes their flex slot entirely so the
          visible tabs split the full width evenly instead of leaving empty gaps. */}
      <Tabs.Screen name="alerts" options={{ title: "Alerts", tabBarButton: () => null, tabBarItemStyle: { display: "none" } }} />
      <Tabs.Screen name="cart" options={{ title: "Cart", tabBarButton: () => null, tabBarItemStyle: { display: "none" } }} />

      {/* The nested Stack holding every pushed screen (product detail, seller
          tools, orders, disputes, composers…). Hidden from the bar the same way,
          but registered here so those screens render inside the Tabs layout and
          keep the tab bar visible. */}
      <Tabs.Screen name="(more)" options={{ tabBarButton: () => null, tabBarItemStyle: { display: "none" } }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  createBtnWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  createBtn: {
    width: 54,
    height: 54,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -18,
    ...shadows.strong,
  },
  menuBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.25)" },
  menuRow: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    gap: spacing.md,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minWidth: 96,
    justifyContent: "center",
    ...shadows.strong,
  },
  pillText: { fontSize: 15, fontWeight: "800", color: colors.onSurface },
});
