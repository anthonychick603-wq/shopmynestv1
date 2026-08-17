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
import { useAuth } from "@/src/context/AuthContext";
import { safeBack } from "@/src/utils/nav";

export default function BlogComposer() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const [caption, setCaption] = useState("");
  const [localImage, setLocalImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return toast.error("Photo permission is needed to add a photo.");
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8, allowsEditing: true });
    if (!result.canceled && result.assets?.[0]) setLocalImage(result.assets[0]);
  };

  const submit = async () => {
    if (!caption.trim()) return toast.error("Write a caption for your post.");
    setBusy(true);
    try {
      const form = new FormData();
      form.append("caption", caption.trim());
      if (localImage) {
        const uri = localImage.uri;
        const name = localImage.fileName || uri.split("/").pop() || `photo-${Date.now()}.jpg`;
        const type = localImage.mimeType || "image/jpeg";
        form.append("image", { uri, name, type } as unknown as Blob);
      }
      await nest.createBlogPost(form);
      setSubmitted(true);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.friendly : "Could not submit your post.");
    } finally {
      setBusy(false);
    }
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Top onBack={() => safeBack(router, "/(tabs)")} />
        <EmptyState
          icon="log-in-outline"
          title="Sign in to post"
          message="Log in to share a photo and caption with the Nest."
          actionLabel="Sign in"
          onAction={() => router.replace("/(auth)/login")}
          testID="blog-compose-signed-out"
        />
      </SafeAreaView>
    );
  }

  if (submitted) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Top onBack={() => safeBack(router, "/(tabs)")} />
        <EmptyState
          icon="hourglass-outline"
          title="Sent for review"
          message="Thanks for posting. An admin needs to approve it before it appears on the blog, so it isn't visible yet."
          actionLabel="Done"
          onAction={() => safeBack(router, "/(tabs)")}
          testID="blog-compose-pending"
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Top onBack={() => safeBack(router, "/(tabs)")} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.note}>Posts are reviewed by an admin before they appear on the blog.</Text>

          <Input
            label="Post"
            value={caption}
            onChangeText={setCaption}
            multiline
            style={{ height: 140, textAlignVertical: "top" }}
            testID="blog-compose-caption"
          />

          <TouchableOpacity style={styles.photo} onPress={pickImage} testID="blog-compose-photo">
            {localImage ? (
              <Image source={{ uri: localImage.uri }} style={styles.photoImg} />
            ) : (
              <View style={styles.photoEmpty}>
                <Ionicons name="image-outline" size={26} color={colors.onSurfaceMuted} />
                <Text style={styles.photoText}>Add a photo (optional)</Text>
              </View>
            )}
          </TouchableOpacity>

          <Button title="Submit for review" onPress={submit} loading={busy} testID="blog-compose-submit" style={{ marginTop: spacing.md }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Top({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.top}>
      <TouchableOpacity onPress={onBack} style={styles.topBtn} testID="blog-compose-back">
        <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
      </TouchableOpacity>
      <Text style={styles.topTitle}>New post</Text>
      <View style={{ width: 40 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md },
  topTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  topBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, ...shadows.card },
  note: { fontSize: 13, color: colors.onSurfaceMuted, marginBottom: spacing.md },
  photo: { height: 180, borderRadius: radius.lg, backgroundColor: colors.surfaceTertiary, overflow: "hidden", marginTop: spacing.md, alignItems: "center", justifyContent: "center" },
  photoImg: { width: "100%", height: "100%" },
  photoEmpty: { alignItems: "center", gap: spacing.sm },
  photoText: { color: colors.onSurfaceMuted, fontWeight: "700" },
});
