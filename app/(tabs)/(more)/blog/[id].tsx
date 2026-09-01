import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";

import { nest, ApiError, type NestBlogCommentRaw } from "@/src/api/nest";
import { toBlogPost } from "@/src/api/adapters";
import { colors, radius, shadows, spacing } from "@/src/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";
import { BlogPostMenu } from "@/src/components/BlogPostMenu";
import { BlogCommentMenu } from "@/src/components/BlogCommentMenu";
import { AppImage } from "@/src/components/AppImage";
import { toast } from "@/src/components/Toast";
import { useAuth } from "@/src/context/AuthContext";
import { useFavorites } from "@/src/context/FavoritesContext";
import { safeBack } from "@/src/utils/nav";
import { shareBlogPost } from "@/src/utils/share";
import { haptics } from "@/src/utils/haptics";
import { stripHtml } from "@/src/utils/html";
import type { BlogPost } from "@/src/types";
import { parseServerDate } from "@/src/utils/datetime";

// v1.0.54 - blog post detail with comment thread. Mirrors the community-post
// comments screen so both flows read/write with the same UX: header +
// scrollable list + sticky composer + sign-in prompt for anonymous users.

const MAX_LENGTH = 2000;

function timeAgo(iso?: string): string {
  if (!iso) return "";
  const parsed = parseServerDate(iso);
  if (!parsed) return "";
  const then = parsed.getTime();
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
  // v1.0.115 — store the server's total so the header count always agrees
  // with the list we just fetched. Prevents the "blog feed says 1, detail
  // says 0" disparity when the two screens read the same data source but
  // at different moments.
  const [commentTotal, setCommentTotal] = useState<number>(initial?.comment_count ?? 0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  // v1.0.81 — when set, the composer becomes an edit-in-place field targeting
  // the given comment id. Cancel resets it back to a new-comment composer.
  const [editingId, setEditingId] = useState<string | number | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const res = await nest.getBlogPostComments(id, { page: 1, per_page: 50 });
      setComments(res.comments || []);
      // v1.0.115 — the server returns a total that comes from the same
      // filtered query as the list, so it's guaranteed to agree with the
      // rows we just rendered. Trusting this here (instead of the feed's
      // cached comment_count) is what closes the "feed shows 1, detail
      // shows 0" gap.
      setCommentTotal((res as { total?: number }).total ?? (res.comments?.length ?? 0));
      // Always refresh the post header from the feed on load. The feed
      // returns favorites_count / comment_count computed server-side, so
      // pulling on every focus keeps the header chips in sync with what
      // Blog and Fresh from the Nest show.
      try {
        const feed = await nest.getBlogPosts({ page: 1, per_page: 50 });
        const raw = (feed.items || []).find((p) => String(p.id) === String(id));
        if (raw) setPost(toBlogPost(raw));
      } catch {
        // header is optional; comments still render
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.friendly : "Could not load comments.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  // v1.0.115 — refetch every time the screen regains focus so the count
  // and list stay in sync with the blog feed (which already uses
  // useFocusEffect). Previously used useEffect(load, [load]) which only
  // fires on mount — that let the detail sit on stale 0 while the feed
  // showed 1 after a new comment landed.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const submit = async () => {
    if (!user) return router.push("/(auth)/login");
    const content = draft.trim();
    if (!content) return toast.error("Write a comment first.");
    if (content.length > MAX_LENGTH) return toast.error(`Comments can be up to ${MAX_LENGTH} characters.`);
    setSending(true);
    try {
      if (editingId !== null) {
        const updated = await nest.updateBlogComment(editingId, content);
        setComments((prev) => prev.map((c) => (String(c.id) === String(editingId) ? updated : c)));
        setEditingId(null);
        setDraft("");
        toast.success("Comment updated");
      } else {
        const created = await nest.createBlogPostComment(id!, content);
        setComments((prev) => [...prev, created]);
        setCommentTotal((n) => n + 1);
        setDraft("");
        toast.success("Comment posted");
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.friendly : editingId !== null ? "Could not update your comment." : "Could not post your comment.");
    } finally {
      setSending(false);
    }
  };

  // v1.0.81 — menu callbacks. Edit swaps the composer into edit mode with
  // the current text pre-filled. Delete removes the row locally after the
  // server confirms it (BlogCommentMenu handles the network + toast).
  const startEditComment = useCallback((commentId: string | number, current: string) => {
    setEditingId(commentId);
    setDraft(current);
  }, []);
  const cancelEdit = () => {
    haptics.tap();
    setEditingId(null);
    setDraft("");
  };
  const removeCommentLocal = useCallback((commentId: string | number) => {
    setComments((prev) => {
      const next = prev.filter((c) => String(c.id) !== String(commentId));
      // v1.0.115 — keep total in sync with the visible list.
      setCommentTotal(next.length);
      return next;
    });
    if (editingId !== null && String(editingId) === String(commentId)) {
      setEditingId(null);
      setDraft("");
    }
  }, [editingId]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.top}>
        <TouchableOpacity onPress={() => safeBack(router, "/(tabs)")} style={styles.topBtn} testID="blog-detail-back" accessibilityRole="button" accessibilityLabel="Go back" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.topTitle} numberOfLines={1}>Post</Text>
        <View style={styles.topRight}>
          {/* v1.0.56 - share the blog post. Only rendered once the header is
              hydrated so we can pass caption/author into the share sheet. */}
          {post ? (
            <TouchableOpacity
              onPress={() => { haptics.tap(); shareBlogPost(post); }}
              style={styles.topBtn}
              testID="blog-detail-share"
              accessibilityRole="button"
              accessibilityLabel="Share this post"
              hitSlop={8}
            >
              <Ionicons name="share-outline" size={20} color={colors.onSurface} />
            </TouchableOpacity>
          ) : null}
          <AlertsBellButton />
          <CartHeaderButton />
        </View>
      </View>
      {/* v1.0.113 — behavior='height' on Android so the composer isn't hidden
          by the soft keyboard under edge-to-edge layout. */}
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
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
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  load();
                }}
                tintColor={colors.brand}
                colors={[colors.brand]}
              />
            }
            ListHeaderComponent={
              post ? (
                <View style={styles.postCard} testID={`blog-post-${post.id}`}>
                  <View style={styles.postHead}>
                    {post.author.profile_photo ? (
                      <AppImage source={{ uri: post.author.profile_photo }} style={styles.postAvatar} fallbackIcon="person-outline" />
                    ) : (
                      <View style={[styles.postAvatar, styles.avatarFallback]}>
                        <Ionicons name="person" size={16} color={colors.onSurface} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.postAuthor} numberOfLines={1}>{post.author.name || "My Nest member"}</Text>
                      {post.date ? <Text style={styles.postDate}>{timeAgo(post.date)}</Text> : null}
                    </View>
                    {/* v1.0.76 — 3-dot menu. Author sees edit/delete; everyone
                        else logged in sees report. Signed-out viewers still
                        see the button but the sheet nudges them to sign in. */}
                    <BlogPostMenu
                      postId={post.id}
                      authorId={post.author.id}
                      onDeleted={() => safeBack(router, "/(tabs)/(more)/blog")}
                      testID="blog-detail-menu"
                    />
                  </View>
                  {post.caption ? <Text style={styles.postCaption}>{stripHtml(post.caption)}</Text> : null}
                  {post.image ? <AppImage source={{ uri: post.image }} style={styles.postImage} fallbackIcon="image-outline" /> : null}
                  <View style={styles.commentsHeader}>
                    {/* v1.0.55 — heart on the blog detail screen mirrors the
                        Fresh from the Nest card. Only rendered when the user
                        is signed in — anonymous viewers get a sign-in prompt
                        through the composer footer instead. */}
                    {user ? (
                      <TouchableOpacity
                        onPress={() => { haptics.tap(); toggleBlogFavorite(post.id); }}
                        hitSlop={8}
                        style={styles.metaChip}
                        testID={`blog-detail-favorite-${post.id}`}
                        accessibilityRole="button"
                        accessibilityLabel={isBlogFavorite(post.id) ? "Remove from favorites" : "Add to favorites"}
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
                        {/* v1.0.115 — show server-authoritative total from
                            the same query that populates the list, so this
                            never disagrees with the blog feed's chip. */}
                        {commentTotal === 1 ? "1 comment" : `${commentTotal} comments`}
                      </Text>
                    </View>
                  </View>
                </View>
              ) : null
            }
            renderItem={({ item }) => (
              <CommentRow
                comment={item}
                onEdit={startEditComment}
                onDeleted={removeCommentLocal}
              />
            )}
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
            {editingId !== null ? (
              <TouchableOpacity
                onPress={cancelEdit}
                style={styles.cancelEditBtn}
                testID="blog-comments-cancel-edit"
                accessibilityRole="button"
                accessibilityLabel="Cancel edit"
                hitSlop={8}
              >
                <Ionicons name="close" size={20} color={colors.onSurface} />
              </TouchableOpacity>
            ) : null}
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder={editingId !== null ? "Edit your comment…" : "Add a comment…"}
              placeholderTextColor={colors.onSurfaceMuted}
              multiline
              maxLength={MAX_LENGTH}
              testID="blog-comments-input"
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!draft.trim() || sending) && styles.sendBtnDisabled]}
              onPress={() => { haptics.press(); submit(); }}
              disabled={!draft.trim() || sending}
              testID="blog-comments-send"
              accessibilityRole="button"
              accessibilityLabel={editingId !== null ? "Save changes" : "Send comment"}
              accessibilityState={{ disabled: !draft.trim() || sending }}
             hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              {sending ? (
                <ActivityIndicator color={colors.onBrand} size="small" />
              ) : (
                <Ionicons name={editingId !== null ? "checkmark" : "send"} size={18} color={colors.onBrand} />
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.signIn, { paddingBottom: spacing.sm }]}>
            <Text style={styles.signInText}>Sign in to join the conversation.</Text>
            <TouchableOpacity style={styles.signInBtn} onPress={() => router.push("/(auth)/login")} testID="blog-comments-signin" accessibilityRole="button">
              <Text style={styles.signInBtnText}>Sign in</Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function CommentRow({
  comment,
  onEdit,
  onDeleted,
}: {
  comment: NestBlogCommentRaw;
  onEdit: (commentId: string | number, current: string) => void;
  onDeleted: (commentId: string | number) => void;
}) {
  return (
    <View style={styles.row} testID={`blog-comment-${comment.id}`}>
      {comment.author?.avatar ? (
        <AppImage source={{ uri: comment.author.avatar }} style={styles.avatar} fallbackIcon="person-outline" />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}><Ionicons name="leaf" size={16} color={colors.brand} /></View>
      )}
      <View style={{ flex: 1 }}>
        <View style={styles.rowHead}>
          <Text style={styles.author} numberOfLines={1}>{comment.author?.name || "Someone"}</Text>
          <View style={styles.rowHeadRight}>
            <Text style={styles.date}>{timeAgo(comment.created_at)}</Text>
            {/* v1.0.81 — 3-dot menu on every comment. Author (or admin) sees
                edit + delete; other logged-in viewers see report; signed-out
                viewers get a sign-in nudge from the sheet. */}
            <BlogCommentMenu
              commentId={comment.id}
              authorId={comment.author?.id ?? 0}
              content={comment.content}
              onEdit={onEdit}
              onDeleted={onDeleted}
            />
          </View>
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
  rowHeadRight: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  author: { fontSize: 14, fontWeight: "800", color: colors.onSurface, flexShrink: 1 },
  date: { fontSize: 12, color: colors.onSurfaceMuted },
  content: { fontSize: 14, color: colors.onSurface, lineHeight: 20, marginTop: 2 },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.surface },
  input: { flex: 1, maxHeight: 120, minHeight: 44, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.onSurface, fontSize: 14, ...shadows.card },
  sendBtn: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  sendBtnDisabled: { opacity: 0.5 },
  cancelEditBtn: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  signIn: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.surface },
  signInText: { flex: 1, fontSize: 14, color: colors.onSurfaceMuted },
  signInBtn: { backgroundColor: colors.brand, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  signInBtnText: { color: colors.onBrand, fontWeight: "800", fontSize: 14 },
});
