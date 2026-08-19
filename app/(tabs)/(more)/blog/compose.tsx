import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";

import { nest, ApiError } from "@/src/api/nest";
import { toBlogPost } from "@/src/api/adapters";
import { colors, radius, shadows, spacing } from "@/src/theme";
import { Button } from "@/src/components/Button";
import { Input } from "@/src/components/Input";
import { toast } from "@/src/components/Toast";
import { EmptyState } from "@/src/components/EmptyState";
import { AppImage } from "@/src/components/AppImage";
import { useAuth } from "@/src/context/AuthContext";
import { safeBack } from "@/src/utils/nav";
import { haptics } from "@/src/utils/haptics";
import { stripHtml } from "@/src/utils/html";

export default function BlogComposer() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  // v1.0.76 — same route serves both "new" and "edit". Presence of ?edit=<id>
  // switches to caption-edit mode: prefill from the server (or last-known feed
  // data if it was passed in), PUT on submit, jump back to the detail screen.
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const isEdit = !!edit;

  const [caption, setCaption] = useState("");
  const [existingImage, setExistingImage] = useState<string | null>(null);
  const [localImage, setLocalImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [busy, setBusy] = useState(false);
  // v1.0.79 — removed the "submitted" interstitial. Blog posts auto-approve
  // (MNU v3.7.109+) so "Sent for review / an admin needs to approve" was
  // factually wrong. Post → toast → jump back to the blog index.
  const [loadingPost, setLoadingPost] = useState(isEdit);

  useEffect(() => {
    if (!isEdit || !edit) return;
    let cancelled = false;
    (async () => {
      setLoadingPost(true);
      try {
        // v1.0.76 — the public feed already returns the post via a single
        // /blog/posts?ids= filter, but the mobile client keeps that as a
        // list call. Simplest: fetch a page of the user's own posts and
        // pick the one that matches. If the API grows a /blog/posts/:id
        // GET we can swap this out.
        const list = await nest.getBlogPosts({ per_page: 100 });
        const raw = list.items.find((p) => String(p.id) === String(edit));
        if (!raw) {
          if (!cancelled) toast.error("Post not found.");
          if (!cancelled) safeBack(router, "/(tabs)");
          return;
        }
        const post = toBlogPost(raw);
        if (cancelled) return;
        setCaption(stripHtml(post.caption));
        setExistingImage(post.image ?? null);
      } catch (e) {
        if (!cancelled) toast.error(e instanceof ApiError ? e.friendly : "Could not load post.");
      } finally {
        if (!cancelled) setLoadingPost(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isEdit, edit, router]);

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
      if (isEdit && edit) {
        // v1.0.76 — caption-only edit. Image edit is deferred: the composer
        // shows the existing image as a read-only preview in edit mode.
        await nest.updateBlogPost(edit, { caption: caption.trim() });
        toast.success("Post updated");
        safeBack(router, `/(tabs)/(more)/blog/${edit}`);
        return;
      }
      const form = new FormData();
      form.append("caption", caption.trim());
      if (localImage) {
        const uri = localImage.uri;
        const name = localImage.fileName || uri.split("/").pop() || `photo-${Date.now()}.jpg`;
        const type = localImage.mimeType || "image/jpeg";
        form.append("image", { uri, name, type } as unknown as Blob);
      }
      await nest.createBlogPost(form);
      toast.success("Posted");
      safeBack(router, "/(tabs)/(more)/blog");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.friendly : isEdit ? "Could not save your changes." : "Could not submit your post.");
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

  if (loadingPost) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Top onBack={() => safeBack(router, "/(tabs)")} title="Edit post" />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Top onBack={() => safeBack(router, "/(tabs)")} title={isEdit ? "Edit post" : "New post"} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
          {!isEdit ? (
            <Text style={styles.note}>Share what you’re nesting today — your post appears in Fresh from the Nest as soon as you submit.</Text>
          ) : (
            <Text style={styles.note}>You can update the caption. Photo changes aren’t supported yet — delete the post and re-post if you need a new photo.</Text>
          )}

          <Input
            label="Post"
            value={caption}
            onChangeText={setCaption}
            multiline
            style={{ height: 140, textAlignVertical: "top" }}
            testID="blog-compose-caption"
          />

          {isEdit ? (
            existingImage ? (
              <View style={styles.photo} testID="blog-compose-existing-photo">
                <AppImage source={{ uri: existingImage }} style={styles.photoImg} fallbackIcon="image-outline" />
              </View>
            ) : null
          ) : (
            <TouchableOpacity style={styles.photo} onPress={() => { haptics.tap(); pickImage(); }} testID="blog-compose-photo" accessibilityRole="button" accessibilityLabel={localImage ? "Change photo" : "Add a photo"}>
              {localImage ? (
                <AppImage source={{ uri: localImage.uri }} style={styles.photoImg} fallbackIcon="image-outline" />
              ) : (
                <View style={styles.photoEmpty}>
                  <Ionicons name="image-outline" size={26} color={colors.onSurfaceMuted} />
                  <Text style={styles.photoText}>Add a photo (optional)</Text>
                </View>
              )}
            </TouchableOpacity>
          )}

          <Button
            title={isEdit ? "Save changes" : "Post to the Nest"}
            onPress={() => { haptics.press(); submit(); }}
            loading={busy}
            testID="blog-compose-submit"
            style={{ marginTop: spacing.md }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Top({ onBack, title = "New post" }: { onBack: () => void; title?: string }) {
  return (
    <View style={styles.top}>
      <TouchableOpacity onPress={() => { haptics.tap(); onBack(); }} style={styles.topBtn} testID="blog-compose-back" accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8}>
        <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
      </TouchableOpacity>
      <Text style={styles.topTitle}>{title}</Text>
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
