import React from "react";
import { View, StyleSheet, ScrollView, ScrollViewProps, ViewStyle } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing } from "@/src/theme";

type Props = {
  /**
   * Contents. When `scroll` is true the children live inside a
   * ScrollView; otherwise they live directly in the SafeAreaView.
   */
  children: React.ReactNode;
  /**
   * When true (default), children are placed inside a ScrollView with
   * the shared 16px horizontal gutter and cream background. When false,
   * children fill the SafeAreaView directly — use this for screens that
   * host FlatList / SectionList, chat views, or full-bleed hero content.
   */
  scroll?: boolean;
  /**
   * Applied to the inner content container (or scroll container when
   * scrolling). Useful for tightening padding on dense screens.
   */
  contentStyle?: ViewStyle;
  /**
   * Extra bottom inset beyond the safe area — usually the height of a
   * sticky action bar or the tab bar when the screen has to peek out
   * from underneath it.
   */
  bottomInset?: number;
  /**
   * ScrollView props forwarded when `scroll` is true.
   */
  scrollProps?: Omit<ScrollViewProps, "children">;
  /**
   * When true, applies default horizontal gutter (spacing.lg). Defaults
   * to true. Screens that need edge-to-edge cards (Discover, media
   * grids) can set false and manage their own padding.
   */
  padded?: boolean;
};

// v1.0.224 — Screen primitive.
//
// Wraps SafeAreaView + optional ScrollView + shared gutter + shared
// background. This is the shell every refined screen uses so the app
// stops re-declaring the same three-view boilerplate on every route.
export function Screen({
  children,
  scroll = true,
  contentStyle,
  bottomInset,
  scrollProps,
  padded = true,
}: Props) {
  const insets = useSafeAreaInsets();
  const paddingBottom = (bottomInset ?? 0) + Math.max(insets.bottom, spacing.lg);

  if (!scroll) {
    return (
      <SafeAreaView edges={["left", "right"]} style={styles.safe}>
        <View
          style={[
            styles.flex,
            padded && styles.padded,
            { paddingBottom },
            contentStyle,
          ]}
        >
          {children}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["left", "right"]} style={styles.safe}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        {...scrollProps}
        contentContainerStyle={[
          padded && styles.padded,
          { paddingBottom },
          scrollProps?.contentContainerStyle,
          contentStyle,
        ]}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  padded: { paddingHorizontal: spacing.lg },
});
