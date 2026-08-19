// v1.0.91 — Seller canned-reply templates sheet. Shows a list of stored
// templates; tapping one inserts its body into the composer. "Manage"
// pushes to /seller/message-templates for CRUD. Seller-only — the
// message thread mounts this component conditionally.
import React, { useEffect, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { colors, radius, shadows, spacing } from "@/src/theme";
import { loadTemplates, type MessageTemplate } from "@/src/utils/message-templates";
import { haptics } from "@/src/utils/haptics";

type Props = {
  visible: boolean;
  onClose: () => void;
  onPick: (body: string) => void;
  userId: string | number;
};

export function TemplatesSheet({ visible, onClose, onPick, userId }: Props) {
  const router = useRouter();
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);

  useEffect(() => {
    if (visible) {
      loadTemplates(userId).then(setTemplates).catch(() => setTemplates([]));
    }
  }, [visible, userId]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <Text style={styles.title}>Quick replies</Text>
            <TouchableOpacity
              style={styles.manageBtn}
              onPress={() => {
                haptics.tap();
                onClose();
                router.push("/seller/message-templates");
              }}
              testID="templates-manage"
              accessibilityRole="button"
              accessibilityLabel="Manage templates"
            >
              <Ionicons name="settings-outline" size={16} color={colors.brand} />
              <Text style={styles.manageBtnText}>Manage</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={templates}
            keyExtractor={(t) => t.id}
            contentContainerStyle={{ paddingBottom: spacing.lg }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.row}
                activeOpacity={0.7}
                onPress={() => { haptics.tap(); onPick(item.body); onClose(); }}
                testID={`template-pick-${item.id}`}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>{item.label}</Text>
                  <Text style={styles.preview} numberOfLines={2}>{item.body}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceMuted} />
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No templates yet.</Text>
                <TouchableOpacity onPress={() => { haptics.tap(); onClose(); router.push("/seller/message-templates"); }}>
                  <Text style={styles.emptyLink}>Create one</Text>
                </TouchableOpacity>
              </View>
            }
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.lg, maxHeight: "70%" },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: spacing.md },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  title: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  manageBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.brand + "12" },
  manageBtnText: { fontSize: 12, fontWeight: "700", color: colors.brand },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, marginBottom: spacing.sm, ...shadows.card },
  label: { fontSize: 14, fontWeight: "800", color: colors.onSurface, marginBottom: 2 },
  preview: { fontSize: 12, color: colors.onSurfaceMuted },
  empty: { padding: spacing.lg, alignItems: "center" },
  emptyText: { color: colors.onSurfaceMuted, fontSize: 13, marginBottom: spacing.sm },
  emptyLink: { color: colors.brand, fontWeight: "700", fontSize: 13 },
});
