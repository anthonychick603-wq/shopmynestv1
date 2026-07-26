import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { colors, radius, shadows, spacing } from "@/src/theme";
import { stripHtml } from "@/src/utils/html";
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

export function BlogPostCard({ post, footer }: { post: BlogPost; footer?: React.ReactNode }) {
  const caption = stripHtml(post.caption);
  return (
    <View style={styles.card} testID={`blog-card-${post.id}`}>
      <View style={styles.head}>
        {post.author.profile_photo ? (
          <Image source={{ uri: post.author.profile_photo }} style={styles.avatar} />
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
      </View>

      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
      {post.image ? <Image source={{ uri: post.image }} style={styles.image} /> : null}
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
});
