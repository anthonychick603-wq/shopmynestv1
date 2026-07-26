import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { colors, radius, shadows, spacing } from "@/src/theme";
import { stripHtml } from "@/src/utils/html";
import type { Post } from "@/src/types";

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
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w ago`;
  return new Date(then).toLocaleDateString();
}

export function PostCard({ post, onPressAuthor }: { post: Post; onPressAuthor?: () => void }) {
  const router = useRouter();
  const body = stripHtml(post.content) || post.excerpt;
  return (
    <View style={styles.card} testID={`post-card-${post.id}`}>
      <TouchableOpacity style={styles.head} onPress={onPressAuthor} activeOpacity={onPressAuthor ? 0.7 : 1} disabled={!onPressAuthor} testID={`post-author-${post.id}`}>
        {post.author.profile_photo ? (
          <Image source={{ uri: post.author.profile_photo }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}><Ionicons name="leaf" size={18} color={colors.brand} /></View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.author} numberOfLines={1}>{post.author.name || "Seller"}</Text>
          {post.date ? <Text style={styles.date}>{timeAgo(post.date)}</Text> : null}
        </View>
      </TouchableOpacity>

      {post.title ? <Text style={styles.title}>{post.title}</Text> : null}
      {body ? <Text style={styles.body} numberOfLines={6}>{body}</Text> : null}

      {post.image ? <Image source={{ uri: post.image }} style={styles.image} /> : null}

      <TouchableOpacity style={styles.footer} onPress={() => router.push(`/post/${post.id}/comments`)} activeOpacity={0.7} testID={`post-comments-${post.id}`}>
        <Ionicons name="chatbubble-outline" size={16} color={colors.onSurfaceMuted} />
        <Text style={styles.footerText}>{post.comments} {post.comments === 1 ? "comment" : "comments"}</Text>
      </TouchableOpacity>
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
  title: { fontSize: 16, fontWeight: "800", color: colors.onSurface, marginBottom: spacing.xs },
  body: { fontSize: 14, color: colors.onSurface, lineHeight: 20 },
  image: { width: "100%", height: 200, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary, marginTop: spacing.md },
  footer: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.md },
  footerText: { fontSize: 13, color: colors.onSurfaceMuted, fontWeight: "600" },
});
