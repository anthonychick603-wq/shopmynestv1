import React, { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";

import { nest, ApiError } from "@/src/api/nest";
import { toBlogPost } from "@/src/api/adapters";
import { colors, radius, shadows, spacing } from "@/src/theme";
import type { BlogPost } from "@/src/types";
import { BlogPostCard } from "@/src/components/BlogPostCard";
import { NestLogo } from "@/src/components/NestLogo";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { EmptyState } from "@/src/components/EmptyState";
import { Button } from "@/src/components/Button";
import { useAuth } from "@/src/context/AuthContext";

const PER_PAGE = 20;

export default function Blog() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (nextPage = 1) => {
    setError(null);
    try {
      const res = await nest.getBlogPosts({ page: nextPage, per_page: PER_PAGE });
      const items = (res.items || []).map(toBlogPost);
      setPosts((prev) => (nextPage === 1 ? items : [...prev, ...items]));
      setPage(res.page ?? nextPage);
      setTotalPages(res.total_pages ?? 1);
    } catch (e) {
      setError(e instanceof ApiError ? e.friendly : "Could not load the blog.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, []);

  // Reload on focus so a newly approved post shows up without a manual pull.
  useFocusEffect(
    useCallback(() => {
      load(1);
    }, [load]),
  );

  const showBecomeMaker = !user || (!user.is_approved_seller && user.seller_application_status !== "pending");

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <NestLogo subtitle="Handmade, with love" />
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <TouchableOpacity testID="header-search" onPress={() => router.push("/(tabs)/browse")} style={styles.iconBtn}>
            <Ionicons name="search" size={20} color={colors.onSurface} />
          </TouchableOpacity>
          <TouchableOpacity testID="header-alerts" onPress={() => router.push("/(tabs)/alerts")} style={styles.iconBtn}>
            <Ionicons name="notifications-outline" size={20} color={colors.onSurface} />
          </TouchableOpacity>
          <CartHeaderButton />
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.onSurface} /></View>
      ) : error ? (
        <EmptyState icon="cloud-offline-outline" title="We couldn't load the blog" message={error} actionLabel="Retry" onAction={() => load(1)} testID="blog-error" />
      ) : (
        <FlatList
          testID="blog-list"
          data={posts}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => <BlogPostCard post={item} />}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + 100 }}
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(1); }}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (loadingMore || page >= totalPages) return;
            setLoadingMore(true);
            load(page + 1);
          }}
          ListHeaderComponent={
            <View>
              <View style={styles.composeCard}>
                <Text style={styles.composeTitle}>Share something with the Nest</Text>
                <Text style={styles.composeBody}>Post a photo and a caption. An admin reviews every post before it goes live.</Text>
                <Button
                  title="New Post"
                  onPress={() => (user ? router.push("/blog/compose") : router.push("/(auth)/login"))}
                  style={{ marginTop: spacing.md }}
                  testID="blog-new-post"
                />
              </View>

              {showBecomeMaker ? (
                <TouchableOpacity
                  testID="become-seller-cta"
                  onPress={() => (user ? router.push("/seller/apply") : router.push("/(auth)/login"))}
                  style={styles.becomeSellerCard}
                  activeOpacity={0.85}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.becomeSellerTitle}>Build your Nest</Text>
                    <Text style={styles.becomeSellerBody}>Apply to sell your handmade goods on My Nest.</Text>
                  </View>
                  <Ionicons name="arrow-forward-circle" size={32} color={colors.onSurface} />
                </TouchableOpacity>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            <EmptyState
              icon="newspaper-outline"
              title="No posts yet"
              message="Approved posts from the My Nest community will show up here."
              testID="blog-empty"
            />
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: spacing.lg }} color={colors.onSurface} /> : null}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  iconBtn: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", ...shadows.card },
  composeCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg, ...shadows.card },
  composeTitle: { fontSize: 16, fontWeight: "800", color: colors.onSurface },
  composeBody: { fontSize: 13, color: colors.onSurfaceMuted, marginTop: 2 },
  becomeSellerCard: { padding: spacing.lg, backgroundColor: colors.surfaceTertiary, borderRadius: radius.lg, flexDirection: "row", alignItems: "center", marginBottom: spacing.lg },
  becomeSellerTitle: { fontSize: 16, fontWeight: "800", color: colors.onSurface },
  becomeSellerBody: { fontSize: 13, color: colors.onSurfaceMuted, marginTop: 2 },
});
