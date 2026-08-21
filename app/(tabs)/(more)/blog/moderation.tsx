import React, { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";

import { nest, ApiError } from "@/src/api/nest";
import { toBlogPost } from "@/src/api/adapters";
import { colors, radius, shadows, spacing } from "@/src/theme";
import type { BlogPost } from "@/src/types";
import { BlogPostCard } from "@/src/components/BlogPostCard";
import { EmptyState } from "@/src/components/EmptyState";
import { toast } from "@/src/components/Toast";
import { useAuth } from "@/src/context/AuthContext";
import { safeBack } from "@/src/utils/nav";
import { haptics } from "@/src/utils/haptics";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";

type Status = "pending" | "approved" | "rejected";
const TABS: Status[] = ["pending", "approved", "rejected"];

export default function BlogModeration() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const [status, setStatus] = useState<Status>("pending");
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async (next: Status) => {
    setLoading(true);
    setError(null);
    try {
      const res = await nest.getBlogModerationPosts({ status: next, per_page: 20 });
      setPosts((res.items || []).map(toBlogPost));
    } catch (e) {
      setError(e instanceof ApiError ? e.friendly : "Could not load posts for review.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(status);
    }, [load, status]),
  );

  const moderate = async (id: string, action: "approve" | "reject") => {
    setActing(id);
    try {
      if (action === "approve") await nest.approveBlogPost(id);
      else await nest.rejectBlogPost(id);
      setPosts((prev) => prev.filter((p) => p.id !== id));
      toast.success(action === "approve" ? "Post approved" : "Post rejected");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.friendly : "Could not update that post.");
    } finally {
      setActing(null);
    }
  };

  // The API's only "can manage the store" signal is is_approved_seller, which the
  // backend sets for admins/managers as well as approved sellers. See the report
  // note: this screen is unlisted, but the server is the real gate (its routes
  // return 403 for non-admins).
  if (!user?.is_approved_seller) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Top onBack={() => safeBack(router, "/(tabs)")} />
        <EmptyState
          icon="lock-closed-outline"
          title="Not available"
          message="Blog moderation is limited to My Nest admins."
          testID="blog-moderation-forbidden"
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Top onBack={() => safeBack(router, "/(tabs)")} />

      <View style={styles.tabs}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t}
            onPress={() => { haptics.tap(); setStatus(t); }}
            style={[styles.tab, status === t && styles.tabActive]}
            testID={`blog-moderation-tab-${t}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: status === t }}
            accessibilityLabel={`${t.charAt(0).toUpperCase() + t.slice(1)} posts${status === t ? ", selected" : ""}`}
          >
            <Text style={[styles.tabText, status === t && styles.tabTextActive]}>{t.toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.onSurface} /></View>
      ) : error ? (
        <EmptyState icon="cloud-offline-outline" title="We couldn't load these posts" message={error} actionLabel="Retry" onAction={() => load(status)} testID="blog-moderation-error" />
      ) : (
        <FlatList
          testID="blog-moderation-list"
          data={posts}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + 40 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load(status);
              }}
              tintColor={colors.brand}
              colors={[colors.brand]}
            />
          }
          renderItem={({ item }) => (
            <BlogPostCard
              post={item}
              footer={
                status === "pending" ? (
                  <View style={styles.actions}>
                    <TouchableOpacity
                      style={[styles.action, styles.approve]}
                      onPress={() => { haptics.success(); moderate(item.id, "approve"); }}
                      disabled={acting === item.id}
                      testID={`blog-moderation-approve-${item.id}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Approve post: ${item.caption ? item.caption.slice(0, 50) : "untitled"}`}
                      accessibilityState={{ disabled: acting === item.id }}
                    >
                      <Text style={styles.approveText}>Approve</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.action, styles.reject]}
                      onPress={() => { haptics.warning(); moderate(item.id, "reject"); }}
                      disabled={acting === item.id}
                      testID={`blog-moderation-reject-${item.id}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Reject post: ${item.caption ? item.caption.slice(0, 50) : "untitled"}`}
                      accessibilityState={{ disabled: acting === item.id }}
                    >
                      <Text style={styles.rejectText}>Reject</Text>
                    </TouchableOpacity>
                  </View>
                ) : null
              }
            />
          )}
          ListEmptyComponent={
            <EmptyState icon="checkmark-done-outline" title={`Nothing ${status}`} message="Posts will appear here as members submit them." testID="blog-moderation-empty" />
          }
        />
      )}
    </SafeAreaView>
  );
}

function Top({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.top}>
      <TouchableOpacity onPress={() => { haptics.tap(); onBack(); }} style={styles.topBtn} testID="blog-moderation-back" accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8}>
        <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
      </TouchableOpacity>
      <Text style={styles.topTitle}>Blog moderation</Text>
      <AlertsBellButton />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md },
  topTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  topBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, ...shadows.card },
  tabs: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  tab: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary },
  tabActive: { backgroundColor: colors.brand },
  tabText: { fontSize: 11, fontWeight: "800", color: colors.onSurface, letterSpacing: 0.5 },
  tabTextActive: { color: colors.onBrand },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  action: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: spacing.md, borderRadius: radius.pill },
  approve: { backgroundColor: colors.green },
  approveText: { fontWeight: "800", fontSize: 14, color: colors.onBrand },
  reject: { backgroundColor: colors.error },
  rejectText: { fontWeight: "800", fontSize: 14, color: colors.onBrand },
});
