// v1.0.91 — Seller message-templates manager. Local CRUD backed by
// AsyncStorage (see src/utils/message-templates.ts). Seller-only.
import React, { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { colors, radius, shadows, spacing } from "@/src/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { toast } from "@/src/components/Toast";
import { useAuth } from "@/src/context/AuthContext";
import { safeBack } from "@/src/utils/nav";
import { haptics } from "@/src/utils/haptics";
import { DEFAULT_TEMPLATES, loadTemplates, resetTemplates, saveTemplates, type MessageTemplate } from "@/src/utils/message-templates";

export default function SellerMessageTemplates() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [editing, setEditing] = useState<MessageTemplate | null>(null);
  const [label, setLabel] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    if (!user) return;
    loadTemplates(user.id).then(setTemplates).catch(() => setTemplates([]));
  }, [user]);

  const persist = useCallback(async (next: MessageTemplate[]) => {
    if (!user) return;
    setTemplates(next);
    await saveTemplates(user.id, next);
  }, [user]);

  const startNew = () => { haptics.tap(); setEditing({ id: `t-${Date.now()}`, label: "", body: "" }); setLabel(""); setBody(""); };
  const startEdit = (t: MessageTemplate) => { haptics.tap(); setEditing(t); setLabel(t.label); setBody(t.body); };
  const cancel = () => { setEditing(null); setLabel(""); setBody(""); };
  const save = async () => {
    const trimmedLabel = label.trim();
    const trimmedBody = body.trim();
    if (!trimmedLabel || !trimmedBody) {
      toast.error("Label and body are required.");
      return;
    }
    if (!editing) return;
    const next = editing.id.startsWith("t-") && !templates.find((t) => t.id === editing.id)
      ? [...templates, { ...editing, label: trimmedLabel, body: trimmedBody }]
      : templates.map((t) => (t.id === editing.id ? { ...t, label: trimmedLabel, body: trimmedBody } : t));
    await persist(next);
    haptics.success();
    toast.success("Template saved");
    cancel();
  };
  const remove = (t: MessageTemplate) => {
    haptics.warning();
    Alert.alert("Delete template", `Remove "${t.label}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await persist(templates.filter((x) => x.id !== t.id));
          haptics.success();
        },
      },
    ]);
  };
  const restoreDefaults = () => {
    haptics.warning();
    Alert.alert("Restore defaults", "This replaces all templates with the starter set. Custom templates will be lost.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Restore",
        style: "destructive",
        onPress: async () => {
          if (!user) return;
          await resetTemplates(user.id);
          setTemplates(DEFAULT_TEMPLATES);
          haptics.success();
          toast.success("Defaults restored");
        },
      },
    ]);
  };

  if (!user || (user.role !== "seller" && user.role !== "admin")) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Top onBack={() => safeBack(router, "/seller/dashboard")} onAdd={undefined} />
        <EmptyState icon="lock-closed-outline" title="Maker only" message="Quick replies are for approved sellers." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Top onBack={() => safeBack(router, "/seller/dashboard")} onAdd={startNew} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        {editing ? (
          <View style={styles.editor}>
            <Text style={styles.editorLabel}>Label</Text>
            <TextInput
              style={styles.input}
              value={label}
              onChangeText={setLabel}
              placeholder="Shipped today"
              placeholderTextColor={colors.onSurfaceMuted}
              maxLength={40}
              testID="template-label-input"
            />
            <Text style={styles.editorLabel}>Message</Text>
            <TextInput
              style={[styles.input, styles.inputMulti]}
              value={body}
              onChangeText={setBody}
              placeholder="Your order shipped today…"
              placeholderTextColor={colors.onSurfaceMuted}
              multiline
              maxLength={800}
              textAlignVertical="top"
              testID="template-body-input"
            />
            <View style={styles.editorActions}>
              <TouchableOpacity onPress={cancel} style={[styles.actionBtn, styles.actionGhost]} testID="template-cancel">
                <Text style={styles.actionGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={save} style={[styles.actionBtn, styles.actionPrimary]} testID="template-save">
                <Text style={styles.actionPrimaryText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        <FlatList
          data={templates}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardLabel}>{item.label}</Text>
                <Text style={styles.cardBody} numberOfLines={3}>{item.body}</Text>
              </View>
              <View style={styles.cardActions}>
                <TouchableOpacity onPress={() => startEdit(item)} style={styles.iconBtn} testID={`template-edit-${item.id}`} accessibilityLabel="Edit template">
                  <Ionicons name="create-outline" size={18} color={colors.onSurface} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => remove(item)} style={styles.iconBtn} testID={`template-delete-${item.id}`} accessibilityLabel="Delete template">
                  <Ionicons name="trash-outline" size={18} color={colors.error} />
                </TouchableOpacity>
              </View>
            </View>
          )}
          ListFooterComponent={
            templates.length > 0 ? (
              <TouchableOpacity onPress={restoreDefaults} style={styles.restoreBtn} testID="template-restore">
                <Ionicons name="refresh-outline" size={14} color={colors.onSurfaceMuted} />
                <Text style={styles.restoreText}>Restore starter set</Text>
              </TouchableOpacity>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon="chatbubbles-outline"
              title="No templates yet"
              message="Save common replies once and tap to insert them in any conversation."
              actionLabel="New template"
              onAction={startNew}
            />
          }
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Top({ onBack, onAdd }: { onBack: () => void; onAdd?: () => void }) {
  return (
    <View style={styles.top}>
      <TouchableOpacity onPress={() => { haptics.tap(); onBack(); }} style={styles.topBtn} testID="templates-back" accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8}>
        <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
      </TouchableOpacity>
      <Text style={styles.topTitle}>Quick replies</Text>
      {onAdd ? (
        <TouchableOpacity onPress={onAdd} style={styles.topBtn} testID="templates-add" accessibilityRole="button" accessibilityLabel="New template" hitSlop={8}>
          <Ionicons name="add" size={22} color={colors.onSurface} />
        </TouchableOpacity>
      ) : <View style={{ width: 40 }} />}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md },
  topTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  topBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, ...shadows.card },

  editor: { backgroundColor: colors.surfaceSecondary, marginHorizontal: spacing.lg, marginBottom: spacing.md, padding: spacing.md, borderRadius: radius.lg, ...shadows.card },
  editorLabel: { fontSize: 11, fontWeight: "800", color: colors.onSurfaceMuted, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: spacing.xs, marginTop: spacing.sm },
  input: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 14, color: colors.onSurface, borderWidth: 1, borderColor: colors.border },
  inputMulti: { minHeight: 90, textAlignVertical: "top" },
  editorActions: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.sm, marginTop: spacing.md },
  actionBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill },
  actionGhost: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  actionGhostText: { fontSize: 13, fontWeight: "700", color: colors.onSurface },
  actionPrimary: { backgroundColor: colors.brand },
  actionPrimaryText: { fontSize: 13, fontWeight: "800", color: colors.onBrand },

  card: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, ...shadows.card },
  cardLabel: { fontSize: 14, fontWeight: "800", color: colors.onSurface, marginBottom: 2 },
  cardBody: { fontSize: 12, color: colors.onSurfaceMuted },
  cardActions: { flexDirection: "row", gap: 4 },
  iconBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: radius.pill },

  restoreBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, paddingVertical: spacing.md },
  restoreText: { fontSize: 12, color: colors.onSurfaceMuted, fontWeight: "600" },
});
