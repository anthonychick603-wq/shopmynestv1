import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";

import { nest } from "@/src/api/nest";
import { colors, radius, spacing, type as typeTokens } from "@/src/theme";
import { safeBack } from "@/src/utils/nav";
import { useBackFallback } from "@/src/context/BackFallback";
import { haptics } from "@/src/utils/haptics";
import { toast } from "@/src/components/Toast";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";
import { appendFilePart } from "@/src/utils/upload";

type Phase = "idle" | "uploading" | "preview" | "running" | "done" | "error";

type UploadResult = Awaited<ReturnType<typeof nest.uploadImport>>;
type StatusResult = Awaited<ReturnType<typeof nest.getImportStatus>>;

/**
 * Bulk product import from a WooCommerce CSV export.
 *
 * Flow:
 *   1. Seller picks a .csv file.
 *   2. We POST it to /seller/import/upload — server parses, dry-runs validation,
 *      and returns a job_id + preview + column report.
 *   3. Seller reviews preview + validation errors and taps "Import N products".
 *   4. We call /seller/import/{id}/run and then poll /seller/import/{id} every
 *      2 seconds until status becomes "complete".
 */
export default function ImportScreen() {
  useBackFallback("/(tabs)/seller/dashboard");
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [upload, setUpload] = useState<UploadResult | null>(null);
  const [status, setStatus] = useState<StatusResult | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => { if (pollTimer.current) clearInterval(pollTimer.current); };
  }, []);

  const pickAndUpload = useCallback(async () => {
    setError(null);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ["text/csv", "text/comma-separated-values", "application/vnd.ms-excel", "application/octet-stream", "*/*"],
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (picked.canceled || !picked.assets?.length) return;
      const asset = picked.assets[0];
      if (!asset.name.toLowerCase().endsWith(".csv")) {
        setError("Please pick a .csv file (WooCommerce export format).");
        return;
      }

      setPhase("uploading");
      const form = new FormData();
      // React Native FormData expects { uri, name, type }
      appendFilePart(form, "file", { uri: asset.uri, name: asset.name, type: "text/csv" });

      const result = await nest.uploadImport(form);
      setUpload(result);
      setPhase("preview");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Upload failed.";
      setError(msg);
      setPhase("error");
    }
  }, []);

  const startImport = useCallback(async () => {
    if (!upload) return;
    try {
      setPhase("running");
      await nest.runImport(upload.job_id);
      pollTimer.current = setInterval(async () => {
        try {
          const s = await nest.getImportStatus(upload.job_id);
          setStatus(s);
          if (s.status === "complete") {
            if (pollTimer.current) clearInterval(pollTimer.current);
            setPhase("done");
          }
        } catch { /* ignore transient poll errors */ }
      }, 2000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to start import.";
      setError(msg);
      setPhase("error");
    }
  }, [upload]);

  const reset = useCallback(() => {
    if (pollTimer.current) clearInterval(pollTimer.current);
    setPhase("idle");
    setUpload(null);
    setStatus(null);
    setError(null);
  }, []);

  const finish = useCallback(() => {
    toast.show(
      `Import finished: ${status?.created ?? 0} created, ${status?.updated ?? 0} updated, ${status?.failed ?? 0} failed.`,
      (status?.failed ?? 0) > 0 ? "error" : "success",
    );
    router.replace("/(tabs)/seller/dashboard" as never);
  }, [status, router]);

  const percent = status && status.total > 0 ? Math.round((status.processed / status.total) * 100) : 0;

  return (
    <SafeAreaView edges={["top"]} style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { haptics.tap(); safeBack(router, "/(tabs)/seller/dashboard"); }} accessibilityLabel="Go back" accessibilityRole="button" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={26} color={colors.brand} />
        </TouchableOpacity>
        <Text style={styles.title}>Import products</Text>
        <AlertsBellButton />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        {phase === "idle" && (
          <>
            <View style={styles.card}>
              <Text style={styles.h2}>Bulk upload from CSV</Text>
              <Text style={styles.p}>
                Upload a WooCommerce product export (.csv). Each row becomes a product in your shop. If a row's SKU matches an existing product you own, that product is updated instead of duplicated.
              </Text>
              <Text style={styles.small}>Supported columns: Name, SKU, Regular price, Sale price, Description, Short description, Stock, Categories, Tags, Images, Weight (lbs), Length/Width/Height (in). Max 500 rows, 10 MB.</Text>
            </View>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => { haptics.press(); pickAndUpload(); }} accessibilityRole="button" accessibilityLabel="Pick and upload CSV">
              <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>Choose CSV file</Text>
            </TouchableOpacity>
            {error && <Text style={styles.errorText}>{error}</Text>}
          </>
        )}

        {phase === "uploading" && (
          <View style={styles.center}>
            <ActivityIndicator color={colors.brand} />
            <Text style={styles.small}>Uploading and parsing…</Text>
          </View>
        )}

        {phase === "preview" && upload && (
          <>
            <View style={styles.card}>
              <Text style={styles.h2}>Preview — {upload.total_rows} row{upload.total_rows === 1 ? "" : "s"} found</Text>
              {upload.preview.map((p) => (
                <View key={p.row} style={styles.previewRow}>
                  <Text style={styles.previewName} numberOfLines={1}>{p.name || "(unnamed)"}</Text>
                  <Text style={styles.previewMeta}>${p.price || "?"} · stock {p.stock || "0"} · {p.images_count} img</Text>
                </View>
              ))}
              {upload.total_rows > upload.preview.length && (
                <Text style={styles.small}>…and {upload.total_rows - upload.preview.length} more.</Text>
              )}
            </View>

            {upload.unrecognized_columns.length > 0 && (
              <View style={[styles.card, styles.warnCard]}>
                <Text style={styles.warnTitle}>Some columns will be ignored</Text>
                <Text style={styles.small}>{upload.unrecognized_columns.slice(0, 8).join(", ")}{upload.unrecognized_columns.length > 8 ? "…" : ""}</Text>
              </View>
            )}

            {upload.validation_errors.length > 0 && (
              <View style={[styles.card, styles.errorCard]}>
                <Text style={styles.errorTitle}>{upload.validation_errors.length} row{upload.validation_errors.length === 1 ? "" : "s"} need attention</Text>
                {upload.validation_errors.slice(0, 5).map((ve) => (
                  <Text key={ve.row} style={styles.small}>Row {ve.row} ({ve.name || "?"}): {ve.problems.join(" ")}</Text>
                ))}
                <Text style={styles.small}>Fix the CSV and upload again, or continue — bad rows will be skipped.</Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.primaryBtn, upload.total_rows === 0 && styles.disabledBtn]}
              onPress={() => { haptics.press(); startImport(); }}
              disabled={upload.total_rows === 0}
              accessibilityRole="button"
              accessibilityLabel={`Import ${upload.total_rows} products`}
            >
              <Ionicons name="rocket-outline" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>Import {upload.total_rows} product{upload.total_rows === 1 ? "" : "s"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.linkBtn} onPress={() => { haptics.tap(); reset(); }} accessibilityRole="button" accessibilityLabel="Pick a different file">
              <Text style={styles.linkText}>Pick a different file</Text>
            </TouchableOpacity>
          </>
        )}

        {phase === "running" && (
          <View style={styles.card}>
            <Text style={styles.h2}>Importing…</Text>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${percent}%` }]} />
            </View>
            <Text style={styles.small}>
              {status?.processed ?? 0} of {status?.total ?? upload?.total_rows ?? 0} processed · {status?.created ?? 0} created · {status?.updated ?? 0} updated · {status?.failed ?? 0} failed
            </Text>
            <Text style={styles.small}>You can leave this screen — the import continues in the background.</Text>
          </View>
        )}

        {phase === "done" && status && (
          <>
            <View style={styles.card}>
              <Text style={styles.h2}>Import complete</Text>
              <Text style={styles.p}>{status.created} created · {status.updated} updated · {status.failed} failed</Text>
              {status.errors.length > 0 && (
                <>
                  <Text style={styles.warnTitle}>Errors</Text>
                  {status.errors.slice(0, 10).map((er, i) => (
                    <Text key={`${er.row}-${i}`} style={styles.small}>Row {er.row}: {er.error}</Text>
                  ))}
                </>
              )}
            </View>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => { haptics.press(); finish(); }} accessibilityRole="button" accessibilityLabel="Back to dashboard">
              <Text style={styles.primaryBtnText}>Back to dashboard</Text>
            </TouchableOpacity>
          </>
        )}

        {phase === "error" && (
          <>
            <View style={[styles.card, styles.errorCard]}>
              <Text style={styles.errorTitle}>Something went wrong</Text>
              <Text style={styles.small}>{error}</Text>
            </View>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => { haptics.press(); reset(); }} accessibilityRole="button" accessibilityLabel="Try again">
              <Text style={styles.primaryBtnText}>Try again</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// v1.0.228 — Seller import (CSV/products) refinement. Cards white on
// cream with hairline; warn/error strokes preserved on the left rail
// so status is still legible; preview rows use hairline dividers.
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.hairline,
  },
  title: { ...typeTokens.h2, fontSize: 18 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  warnCard: { borderLeftWidth: 4, borderLeftColor: "#E8A54B" },
  errorCard: { borderLeftWidth: 4, borderLeftColor: "#D94F4F" },
  h2: { ...typeTokens.h3, fontSize: 16, marginBottom: spacing.sm },
  p: { ...typeTokens.body, marginBottom: spacing.sm, lineHeight: 20 },
  small: { ...typeTokens.caption, lineHeight: 18, marginTop: 2 },
  warnTitle: { ...typeTokens.body, fontWeight: "700", color: "#8C5B10", marginTop: spacing.sm, marginBottom: 4 },
  errorTitle: { ...typeTokens.body, fontWeight: "700", color: "#7A2323", marginBottom: 4 },
  errorText: { ...typeTokens.caption, color: "#7A2323", marginTop: spacing.md, textAlign: "center" },
  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: colors.brand, borderRadius: radius.pill,
    paddingVertical: 14, paddingHorizontal: spacing.lg, gap: 8,
  },
  primaryBtnText: { ...typeTokens.body, color: colors.onBrand, fontWeight: "700" },
  disabledBtn: { opacity: 0.4 },
  linkBtn: { alignSelf: "center", padding: spacing.md },
  linkText: { ...typeTokens.body, color: colors.brand },
  center: { alignItems: "center", justifyContent: "center", paddingVertical: spacing.xl, gap: spacing.sm },
  previewRow: { paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  previewName: { ...typeTokens.body, fontWeight: "500" },
  previewMeta: { ...typeTokens.caption, marginTop: 2 },
  progressBar: { height: 8, backgroundColor: colors.hairline, borderRadius: 4, overflow: "hidden", marginVertical: spacing.md },
  progressFill: { height: "100%", backgroundColor: colors.brand },
});
