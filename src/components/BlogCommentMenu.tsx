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
 * v1.0.81 — 3-dot menu on blog comments (mirrors BlogPostMenu).
 *
 * - The comment author (or an admin) sees "Edit" and "Delete".
 * - Any other logged-in viewer sees "Report".
 * - Signed-out viewers get a sign-in nudge when they tap "Report".
 *
 * The parent supplies the comment id + author id + current content, plus
 * callbacks for edit and delete so the surrounding list can update in place
 * without a full refetch.
 */
type Props = {
  commentId: string | number;
  authorId: string | number;
  content: string;
  onEdit: (commentId: string | number, current: string) => void;
  onDeleted?: (commentId: string | number) => void;
  testID?: string;
};

export function BlogCommentMenu({ commentId, authorId, content, onEdit, onDeleted, testID }: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const isAuthor = !!user && String(user.id) === String(authorId);
  const isAdmin = user?.role === "admin";
  const canManage = isAuthor || isAdmin;

  const openSheet = () => {
    haptics.tap();
    setOpen(true);
  };
  const closeSheet = () => setOpen(false);

  const goEdit = () => {
    closeSheet();
    onEdit(commentId, content);
  };

  const goReport = () => {
    closeSheet();
    if (!user) {
      toast.error("Please sign in to report a comment.");
      return;
    }
    router.push({ pathname: "/(tabs)/(more)/report/[id]", params: { id: String(commentId), type: "blog_comment" } });
  };

  const confirmDelete = () => {
    closeSheet();
    Alert.alert(
      "Delete this comment?",
      "This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            haptics.warning();
            setBusy(true);
            try {
              await nest.deleteBlogComment(commentId);
              haptics.success();
              toast.show("Comment deleted", "success");
              onDeleted?.(commentId);
            } catch (e) {
              haptics.error();
              toast.show(e instanceof ApiError ? e.friendly : "Could not delete comment", "error");
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
        testID={testID ?? `blog-comment-menu-${commentId}`}
        disabled={busy}
      >
        <Ionicons name="ellipsis-horizontal" size={18} color={colors.onSurfaceMuted} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={closeSheet}>
        <Pressable style={styles.backdrop} onPress={closeSheet}>
          <View style={styles.sheet} onStartShouldSetResponder={() => true}>
            <View style={styles.handle} />
            {canManage ? (
              <>
                <MenuRow icon="create-outline" label="Edit comment" onPress={goEdit} testID={`blog-comment-menu-edit-${commentId}`} />
                <MenuRow icon="trash-outline" label="Delete comment" onPress={confirmDelete} destructive testID={`blog-comment-menu-delete-${commentId}`} />
              </>
            ) : (
              <MenuRow icon="flag-outline" label="Report comment" onPress={goReport} testID={`blog-comment-menu-report-${commentId}`} />
            )}
            <TouchableOpacity onPress={closeSheet} style={styles.cancelBtn} testID="blog-comment-menu-cancel">
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
    <TouchableOpacity onPress={onPress} style={styles.row} testID={testID}>
      <Ionicons name={icon} size={22} color={destructive ? colors.error : colors.onSurface} />
      <Text style={[styles.rowLabel, destructive && { color: colors.error }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: radius.pill },
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
