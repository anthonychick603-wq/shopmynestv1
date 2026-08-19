import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { AppImage } from "@/src/components/AppImage";
import { BlogPostMenu } from "@/src/components/BlogPostMenu";
import { Ionicons } from "@expo/vector-icons";

import { colors, radius, shadows, spacing } from "@/src/theme";
import { stripHtml } from "@/src/utils/html";
import { shareBlogPost } from "@/src/utils/share";
import type { BlogPost } from "@/src/types";

function timeAgo(iso?: string): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(then).toLocaleDateString();
}

export function BlogPostCard({
  post,
  footer,
  isFavorite,
  onToggleFavorite,
  onDeleted,
}: {
  post: BlogPost;
  footer?: React.ReactNode;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  /** v1.0.76 — called after a successful in-menu delete so the parent list
   *  can remove the row without a full refetch. */
  onDeleted?: (id: string) => void;
}) {
  const caption = stripHtml(post.caption);
  return (
    <View style={styles.card} testID={`blog-card-${post.id}`}>
      <View style={styles.head}>
        {post.author.profile_photo ? (
          <AppImage source={{ uri: post.author.profile_photo }} style={styles.avatar} fallbackIcon="person-outline" />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Ionicons name="person" size={16} color={colors.onSurface} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.author} numberOfLines={1}>{post.author.name || "My Nest member"}</Text>
          {post.date ? <Text style={styles.date}>{timeAgo(post.date)}</Text> : null}
        </View>
        {post.status !== "approved" ? (
          <View style={styles.statusPill}>
            <Text style={styles.statusText}>{post.status.toUpperCase()}</Text>
          </View>
        ) : null}
        {/* v1.0.76 — 3-dot menu. Wrapped in a stopPropagation View so tapping
            the menu does not also open the detail screen through the card's
            outer TouchableOpacity. */}
        <View onStartShouldSetResponder={() => true}>
          <BlogPostMenu
            postId={post.id}
            authorId={post.author.id}
            onDeleted={() => onDeleted?.(post.id)}
            testID={`blog-card-menu-${post.id}`}
          />
        </View>
      </View>

      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
      {post.image ? <AppImage source={{ uri: post.image }} style={styles.image} fallbackIcon="image-outline" /> : null}
      {/* v1.0.54 - surface the comment count so buyers can see there's a
          conversation on this post. Tapping the card takes them to the
          detail screen with the composer. */}
      {post.status === "approved" ? (
        <View style={styles.metaRow}>
          <View style={styles.metaGroup}>
            {/* v1.0.55 — heart on Fresh from the Nest cards. Stops propagation
                so tapping the heart doesn't also open the detail screen. */}
            {onToggleFavorite ? (
              <TouchableOpacity
                onPress={(e) => { e.stopPropagation?.(); onToggleFavorite(); }}
                hitSlop={8}
                style={styles.metaChip}
                testID={`blog-card-favorite-${post.id}`}
              >
                <Ionicons
                  name={isFavorite ? "heart" : "heart-outline"}
                  size={16}
                  color={isFavorite ? colors.brand : colors.onSurfaceMuted}
                />
                <Text style={styles.metaText}>{post.favorites_count ?? 0}</Text>
              </TouchableOpacity>
            ) : null}
            <View style={styles.metaChip}>
              <Ionicons name="chatbubble-outline" size={14} color={colors.onSurfaceMuted} />
              <Text style={styles.metaText}>
                {(post.comment_count ?? 0) === 1
                  ? "1 comment"
                  : `${post.comment_count ?? 0} comments`}
              </Text>
            </View>
            {/* v1.0.56 - share the post from the feed. */}
            <TouchableOpacity
              onPress={(e) => { e.stopPropagation?.(); shareBlogPost(post); }}
              hitSlop={8}
              style={styles.metaChip}
              testID={`blog-card-share-${post.id}`}
              accessibilityLabel="Share post"
              accessibilityRole="button"
            >
              <Ionicons name="share-outline" size={14} color={colors.onSurfaceMuted} />
            </TouchableOpacity>
          </View>
          <Text style={styles.metaCta}>View</Text>
        </View>
      ) : null}
      {footer}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceTertiary },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  author: { fontSize: 14, fontWeight: "800", color: colors.onSurface },
  date: { fontSize: 12, color: colors.onSurfaceMuted, marginTop: 1 },
  statusPill: { backgroundColor: colors.yellow, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  statusText: { fontSize: 10, fontWeight: "800", color: colors.onBrand, letterSpacing: 0.5 },
  caption: { fontSize: 14, color: colors.onSurface, lineHeight: 20 },
  image: { width: "100%", height: 220, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary, marginTop: spacing.md },
  metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  metaGroup: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  metaChip: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaText: { fontSize: 12, color: colors.onSurfaceMuted, fontWeight: "700" },
  metaCta: { fontSize: 12, color: colors.brand, fontWeight: "800", letterSpacing: 0.2 },
});
