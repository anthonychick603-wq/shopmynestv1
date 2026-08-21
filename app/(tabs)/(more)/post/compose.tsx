import React, { useState } from "react";
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";

import { nest, ApiError } from "@/src/api/nest";
import { colors, radius, shadows, spacing } from "@/src/theme";
import { Button } from "@/src/components/Button";
import { Input } from "@/src/components/Input";
import { toast } from "@/src/components/Toast";
import { EmptyState } from "@/src/components/EmptyState";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";
import { AppImage } from "@/src/components/AppImage";
import { useAuth } from "@/src/context/AuthContext";
import { safeBack } from "@/src/utils/nav";
import { haptics } from "@/src/utils/haptics";

export default function PostComposer() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [localImage, setLocalImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [busy, setBusy] = useState(false);

  const isSeller = user?.role === "seller" || user?.role === "admin";

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return toast.error("Photo permission is needed to add a photo.");
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8, allowsEditing: true });
    if (!result.canceled && result.assets?.[0]) setLocalImage(result.assets[0]);
  };

  const uploadIfNeeded = async (): Promise<number | undefined> => {
    if (!localImage) return undefined;
    const uri = localImage.uri;
    const name = localImage.fileName || uri.split("/").pop() || `photo-${Date.now()}.jpg`;
    const type = localImage.mimeType || "image/jpeg";
    const form = new FormData();
    form.append("file", { uri, name, type } as unknown as Blob);
    const media = await nest.uploadMedia(form);
    return media.id;
  };

  const submit = async () => {
    if (!title.trim()) return toast.error("Add a title for your post.");
    if (!content.trim()) return toast.error("Write something to share.");
    setBusy(true);
    try {
      const image_id = await uploadIfNeeded();
      await nest.createPost({ title: title.trim(), content: content.trim(), ...(image_id ? { image_id } : {}) });
      toast.success("Posted");
      safeBack(router, "/(tabs)");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.friendly : "Could not publish your post.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Top onBack={() => safeBack(router, "/(tabs)")} />
      {!isSeller ? (
        <EmptyState
          icon="storefront-outline"
          title="Only sellers can post"
          message="Open your shop on My Nest to share posts with buyers."
          actionLabel="Build your Nest"
          onAction={() => (user ? router.replace("/seller/apply") : router.replace("/(auth)/login"))}
          testID="compose-not-seller"
        />
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
            <Input label="Title" value={title} onChangeText={setTitle} testID="compose-title" />
            <Input
              label="What's on your mind?"
              value={content}
              onChangeText={setContent}
              multiline
              style={{ height: 160, textAlignVertical: "top" }}
              testID="compose-content"
            />

            <TouchableOpacity style={styles.photo} onPress={() => { haptics.tap(); pickImage(); }} testID="compose-photo" accessibilityRole="button" accessibilityLabel={localImage ? "Change photo" : "Add a photo"}>
              {localImage ? (
                <AppImage source={{ uri: localImage.uri }} style={styles.photoImg} fallbackIcon="image-outline" />
              ) : (
                <View style={styles.photoEmpty}>
                  <Ionicons name="image-outline" size={26} color={colors.onSurfaceMuted} />
                  <Text style={styles.photoText}>Add a photo (optional)</Text>
                </View>
              )}
            </TouchableOpacity>

            <Button title="Post" onPress={() => { haptics.press(); submit(); }} loading={busy} testID="compose-submit" style={{ marginTop: spacing.md }} />
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

function Top({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.top}>
      <TouchableOpacity onPress={() => { haptics.tap(); onBack(); }} style={styles.topBtn} testID="compose-back" accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8}><Ionicons name="chevron-back" size={22} color={colors.onSurface} /></TouchableOpacity>
      <Text style={styles.topTitle}>New post</Text>
      <AlertsBellButton />
      <CartHeaderButton />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md },
  topTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  topBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, ...shadows.card },
  photo: { height: 180, borderRadius: radius.lg, backgroundColor: colors.surfaceTertiary, overflow: "hidden", marginTop: spacing.md, alignItems: "center", justifyContent: "center" },
  photoImg: { width: "100%", height: "100%" },
  photoEmpty: { alignItems: "center", gap: spacing.sm },
  photoText: { color: colors.onSurfaceMuted, fontWeight: "700" },
});
