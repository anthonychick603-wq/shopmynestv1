import React, { useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { nest, ApiError } from "@/src/api/nest";
import { useAuth } from "@/src/context/AuthContext";
import { colors, radius, spacing } from "@/src/theme";
import { haptics } from "@/src/utils/haptics";
import { toast } from "./Toast";

/**
 * v1.0.76 — 3-dot menu on blog posts.
 *
 * - The author (or an admin) sees "Edit" and "Delete".
 * - Everyone else who is logged in sees "Report".
 * - Not-logged-in viewers see the button but tapping "Report" nudges them to sign in.
 *
 * The parent supplies the post id + author id; this component derives capabilities
 * itself so it can be dropped into any blog surface (detail screen, feed card,
 * favorites list). onDeleted is called after a successful delete so the parent
 * can pop the screen or remove the row from a list without a full refetch.
 */
type Props = {
  postId: string | number;
  authorId: string | number;
  onDeleted?: () => void;
  /** Optional style override so the button can be color-matched to a header row. */
  color?: string;
  testID?: string;
};

export function BlogPostMenu({ postId, authorId, onDeleted, color, testID }: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const isAuthor = !!user && String(user.id) === String(authorId);
  // Signed-in admins can also manage — the server enforces this, so we mirror
  // it here for the sheet copy. `is_approved_seller` is not admin, so we key
  // off `role`.
  const isAdmin = user?.role === "admin";
  const canManage = isAuthor || isAdmin;

  const openSheet = () => {
    haptics.tap();
    setOpen(true);
  };

  const closeSheet = () => setOpen(false);

  const goEdit = () => {
    closeSheet();
    router.push({ pathname: "/(tabs)/(more)/blog/compose", params: { edit: String(postId) } });
  };

  const goReport = () => {
    closeSheet();
    if (!user) {
      toast.error("Please sign in to report a post.");
      return;
    }
    router.push({ pathname: "/(tabs)/(more)/report/[id]", params: { id: String(postId), type: "blog_post" } });
  };

  const confirmDelete = () => {
    closeSheet();
    Alert.alert(
      "Delete this post?",
      "This can't be undone. Comments and favorites will be removed with it.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            haptics.warning();
            setBusy(true);
            try {
              await nest.deleteBlogPost(postId);
              haptics.success();
              toast.show("Post deleted", "success");
              onDeleted?.();
            } catch (e) {
              haptics.error();
              toast.show(e instanceof ApiError ? e.friendly : "Could not delete post", "error");
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  return (
    <>
      <TouchableOpacity
        onPress={openSheet}
        accessibilityRole="button"
        accessibilityLabel="More options"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={styles.btn}
        testID={testID ?? "blog-post-menu"}
        disabled={busy}
      >
        <Ionicons name="ellipsis-vertical" size={20} color={color ?? colors.onSurfaceMuted} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={closeSheet}>
        <Pressable style={styles.backdrop} onPress={closeSheet}>
          <View style={styles.sheet} onStartShouldSetResponder={() => true}>
            <View style={styles.handle} />
            {canManage ? (
              <>
                <MenuRow icon="create-outline" label="Edit post" onPress={goEdit} testID="blog-menu-edit" />
                <MenuRow icon="trash-outline" label="Delete post" onPress={confirmDelete} destructive testID="blog-menu-delete" />
              </>
            ) : (
              <MenuRow icon="flag-outline" label="Report post" onPress={goReport} testID="blog-menu-report" />
            )}
            <TouchableOpacity onPress={closeSheet} style={styles.cancelBtn} testID="blog-menu-cancel" accessibilityRole="button">
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

function MenuRow({
  icon,
  label,
  onPress,
  destructive,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  testID?: string;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.row} testID={testID} accessibilityRole="button">
      <Ionicons name={icon} size={22} color={destructive ? colors.error : colors.onSurface} />
      <Text style={[styles.rowLabel, destructive && { color: colors.error }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: radius.pill },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingBottom: spacing["2xl"],
  },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.md },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  rowLabel: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  cancelBtn: {
    marginTop: spacing.sm,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    backgroundColor: colors.surfaceTertiary,
  },
  cancelText: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
});
