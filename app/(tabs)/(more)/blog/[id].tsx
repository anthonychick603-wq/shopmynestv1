import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";

import { nest, ApiError, type NestBlogCommentRaw } from "@/src/api/nest";
import { toBlogPost } from "@/src/api/adapters";
import { colors, radius, shadows, spacing } from "@/src/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { toast } from "@/src/components/Toast";
import { useAuth } from "@/src/context/AuthContext";
import { useFavorites } from "@/src/context/FavoritesContext";
import { safeBack } from "@/src/utils/nav";
import { shareBlogPost } from "@/src/utils/share";
import { stripHtml } from "@/src/utils/html";
import type { BlogPost } from "@/src/types";

// v1.0.54 - blog post detail with comment thread. Mirrors the community-post
// comments screen so both flows read/write with the same UX: header +
// scrollable list + sticky composer + sign-in prompt for anonymous users.

const MAX_LENGTH = 2000;

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

export default function BlogPostDetail() {
  const router = useRouter();
  const { id, post: postJson } = useLocalSearchParams<{ id: string; post?: string }>();
  const { user } = useAuth();
  const { isBlogFavorite, toggleBlog: toggleBlogFavorite } = useFavorites();

  // The Fresh from the Nest feed passes the full BlogPost JSON as a param so we
  // can render the post header instantly. If the deep-link comes from
  // somewhere else (share sheet in a future release, notification tap) we
  // fall back to loading the feed and matching the id.
  const initial = useMemo<BlogPost | null>(() => {
    if (!postJson) return null;
    try {
      return JSON.parse(String(postJson)) as BlogPost;
    } catch {
      return null;
    }
  }, [postJson]);

  const [post, setPost] = useState<BlogPost | null>(initial);
  const [comments, setComments] = useState<NestBlogCommentRaw[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const res = await nest.getBlogPostComments(id, { page: 1, per_page: 50 });
      setComments(res.comments || []);
      // Refresh post header if we didn't receive it via params.
      if (!post) {
        try {
          const feed = await nest.getBlogPosts({ page: 1, per_page: 50 });
          const raw = (feed.items || []).find((p) => String(p.id) === String(id));
          if (raw) setPost(toBlogPost(raw));
        } catch {
          // header is optional; comments still render
        }
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.friendly : "Could not load comments.");
    } finally {
      setLoading(false);
    }
  }, [id, post]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    if (!user) return router.push("/(auth)/login");
    const content = draft.trim();
    if (!content) return toast.error("Write a comment first.");
    if (content.length > MAX_LENGTH) return toast.error(`Comments can be up to ${MAX_LENGTH} characters.`);
    setSending(true);
    try {
      const created = await nest.createBlogPostComment(id!, content);
      setComments((prev) => [...prev, created]);
      setDraft("");
      toast.success("Comment posted");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.friendly : "Could not post your comment.");
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.top}>
        <TouchableOpacity onPress={() => safeBack(router, "/(tabs)")} style={styles.topBtn} testID="blog-detail-back">
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.topTitle} numberOfLines={1}>Post</Text>
        <View style={styles.topRight}>
          {/* v1.0.56 - share the blog post. Only rendered once the header is
              hydrated so we can pass caption/author into the share sheet. */}
          {post ? (
            <TouchableOpacity
              onPress={() => shareBlogPost(post)}
              style={styles.topBtn}
              testID="blog-detail-share"
            >
              <Ionicons name="share-outline" size={20} color={colors.onSurface} />
            </TouchableOpacity>
          ) : null}
          <CartHeaderButton />
        </View>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        {loading && !post ? (
          <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
        ) : error && !post ? (
          <EmptyState icon="cloud-offline-outline" title="Couldn't load post" message={error} actionLabel="Retry" onAction={load} testID="blog-detail-error" />
        ) : (
          <FlatList
            testID="blog-detail-list"
            data={comments}
            keyExtractor={(c) => String(c.id)}
            contentContainerStyle={{ paddingBottom: spacing.lg, flexGrow: 1 }}
            ListHeaderComponent={
              post ? (
                <View style={styles.postCard} testID={`blog-post-${post.id}`}>
                  <View style={styles.postHead}>
                    {post.author.profile_photo ? (
                      <Image source={{ uri: post.author.profile_photo }} style={styles.postAvatar} />
                    ) : (
                      <View style={[styles.postAvatar, styles.avatarFallback]}>
                        <Ionicons name="person" size={16} color={colors.onSurface} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.postAuthor} numberOfLines={1}>{post.author.name || "My Nest member"}</Text>
                      {post.date ? <Text style={styles.postDate}>{timeAgo(post.date)}</Text> : null}
                    </View>
                  </View>
                  {post.caption ? <Text style={styles.postCaption}>{stripHtml(post.caption)}</Text> : null}
                  {post.image ? <Image source={{ uri: post.image }} style={styles.postImage} /> : null}
                  <View style={styles.commentsHeader}>
                    {/* v1.0.55 — heart on the blog detail screen mirrors the
                        Fresh from the Nest card. Only rendered when the user
                        is signed in — anonymous viewers get a sign-in prompt
                        through the composer footer instead. */}
                    {user ? (
                      <TouchableOpacity
                        onPress={() => toggleBlogFavorite(post.id)}
                        hitSlop={8}
                        style={styles.metaChip}
                        testID={`blog-detail-favorite-${post.id}`}
                      >
                        <Ionicons
                          name={isBlogFavorite(post.id) ? "heart" : "heart-outline"}
                          size={18}
                          color={isBlogFavorite(post.id) ? colors.brand : colors.onSurfaceMuted}
                        />
                        <Text style={styles.commentsHeaderText}>{post.favorites_count ?? 0}</Text>
                      </TouchableOpacity>
                    ) : null}
                    <View style={styles.metaChip}>
                      <Ionicons name="chatbubble-outline" size={16} color={colors.onSurfaceMuted} />
                      <Text style={styles.commentsHeaderText}>
                        {comments.length === 1 ? "1 comment" : `${comments.length} comments`}
                      </Text>
                    </View>
                  </View>
                </View>
              ) : null
            }
            renderItem={({ item }) => <CommentRow comment={item} />}
            ListEmptyComponent={
              !loading ? (
                <EmptyState
                  icon="chatbubble-outline"
                  title="No comments yet"
                  message="Be the first to comment on this post."
                  testID="blog-comments-empty"
                />
              ) : null
            }
          />
        )}

        {user ? (
          <View style={[styles.composer, { paddingBottom: spacing.sm }]}>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder="Add a comment…"
              placeholderTextColor={colors.onSurfaceMuted}
              multiline
              maxLength={MAX_LENGTH}
              testID="blog-comments-input"
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!draft.trim() || sending) && styles.sendBtnDisabled]}
              onPress={submit}
              disabled={!draft.trim() || sending}
              testID="blog-comments-send"
            >
              {sending ? <ActivityIndicator color={colors.onBrand} size="small" /> : <Ionicons name="send" size={18} color={colors.onBrand} />}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.signIn, { paddingBottom: spacing.sm }]}>
            <Text style={styles.signInText}>Sign in to join the conversation.</Text>
            <TouchableOpacity style={styles.signInBtn} onPress={() => router.push("/(auth)/login")} testID="blog-comments-signin">
              <Text style={styles.signInBtnText}>Sign in</Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function CommentRow({ comment }: { comment: NestBlogCommentRaw }) {
  return (
    <View style={styles.row} testID={`blog-comment-${comment.id}`}>
      {comment.author?.avatar ? (
        <Image source={{ uri: comment.author.avatar }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}><Ionicons name="leaf" size={16} color={colors.brand} /></View>
      )}
      <View style={{ flex: 1 }}>
        <View style={styles.rowHead}>
          <Text style={styles.author} numberOfLines={1}>{comment.author?.name || "Someone"}</Text>
          <Text style={styles.date}>{timeAgo(comment.created_at)}</Text>
        </View>
        <Text style={styles.content}>{comment.content}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md },
  topRight: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  topTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  topBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, ...shadows.card },
  postCard: { backgroundColor: colors.surfaceSecondary, marginHorizontal: spacing.lg, marginBottom: spacing.md, borderRadius: radius.lg, padding: spacing.lg, ...shadows.card },
  postHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
  postAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceTertiary },
  postAuthor: { fontSize: 15, fontWeight: "800", color: colors.onSurface },
  postDate: { fontSize: 12, color: colors.onSurfaceMuted, marginTop: 1 },
  postCaption: { fontSize: 15, color: colors.onSurface, lineHeight: 22 },
  postImage: { width: "100%", height: 240, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary, marginTop: spacing.md },
  commentsHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  metaChip: { flexDirection: "row", alignItems: "center", gap: 6 },
  commentsHeaderText: { fontSize: 13, fontWeight: "700", color: colors.onSurfaceMuted },
  row: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg, paddingHorizontal: spacing.lg },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceTertiary },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  rowHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  author: { fontSize: 14, fontWeight: "800", color: colors.onSurface, flexShrink: 1 },
  date: { fontSize: 12, color: colors.onSurfaceMuted },
  content: { fontSize: 14, color: colors.onSurface, lineHeight: 20, marginTop: 2 },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.surface },
  input: { flex: 1, maxHeight: 120, minHeight: 44, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.onSurface, fontSize: 14, ...shadows.card },
  sendBtn: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  sendBtnDisabled: { opacity: 0.5 },
  signIn: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.surface },
  signInText: { flex: 1, fontSize: 14, color: colors.onSurfaceMuted },
  signInBtn: { backgroundColor: colors.brand, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  signInBtnText: { color: colors.onBrand, fontWeight: "800", fontSize: 14 },
});
