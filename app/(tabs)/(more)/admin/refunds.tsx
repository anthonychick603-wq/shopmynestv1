// v1.0.192 — Full rewrite from one-line minified blob to a first-class
// admin surface. Uses the shared admin UI kit (AdminHeader, AdminCard,
// FilterBar, AdminStatusPill, InfiniteList) and now supports:
//   - Status chip filter (all / requested / approved / processing /
//     completed / denied) with server-side paging
//   - Search across order number, buyer name, buyer email
//   - Per-row admin note field (persists locally per row while the list
//     is on screen)
//   - Deep-link to the underlying order for full context
//   - Optimistic list refresh after every mutation via reloadToken
import React, { useCallback, useMemo, useState } from "react";
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { nest, ApiError, type AdminRefund, type AdminRefundList } from "@/src/api/nest";
import { Button } from "@/src/components/Button";
import { EmptyState } from "@/src/components/EmptyState";
import { toast } from "@/src/components/Toast";
import { AdminHeader } from "@/src/components/admin/AdminHeader";
import { AdminCard } from "@/src/components/admin/AdminCard";
import { AdminStatusPill } from "@/src/components/admin/AdminStatusPill";
import { FilterBar, type FilterChip } from "@/src/components/admin/FilterBar";
import { InfiniteList, type InfiniteFetcher } from "@/src/components/admin/InfiniteList";
import { useAuth } from "@/src/context/AuthContext";
import { colors, radius, spacing, type as typeTokens } from "@/src/theme";
import { pushFromTab } from "@/src/utils/nav";
import { parseServerDate } from "@/src/utils/datetime";

type RefundStatus = "open" | "all" | AdminRefund["state"];

const CHIPS: readonly FilterChip<RefundStatus>[] = [
  // "open" is a synthetic bucket for anything still actionable — the
  // default view so admins land on "what needs my attention right now".
  { value: "open", label: "Open" },
  { value: "requested", label: "Requested" },
  { value: "approved", label: "Approved" },
  { value: "processing", label: "Processing" },
  { value: "completed", label: "Completed" },
  { value: "denied", label: "Denied" },
  { value: "all", label: "All" },
];

const money = (n: number, c: string) => `${c || "USD"} ${Number(n || 0).toFixed(2)}`;

export default function AdminRefundsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [status, setStatus] = useState<RefundStatus>("open");
  const [query, setQuery] = useState("");
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [working, setWorking] = useState<number | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((t) => t + 1), []);

  const fetcher: InfiniteFetcher<AdminRefund> = useCallback(
    async (page) => {
      const res: AdminRefundList = await nest.adminListRefunds({ status, page, per_page: 25 });
      const q = query.trim().toLowerCase();
      const items = q
        ? (res.items || []).filter(
            (r) =>
              r.order_number?.toLowerCase().includes(q) ||
              r.buyer_name?.toLowerCase().includes(q) ||
              r.buyer_email?.toLowerCase().includes(q),
          )
        : res.items || [];
      return { items, total_pages: res.total_pages, total: res.total };
    },
    [status, query],
  );

  const processRefund = useCallback((r: AdminRefund) => {
    Alert.alert(
      "Process refund?",
      `Refund ${money(r.requested_amount, r.currency)} for order #${r.order_number}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Refund",
          onPress: async () => {
            setWorking(r.order_id);
            try {
              await nest.adminProcessRefund(r.order_id, {
                amount: r.requested_amount,
                note: (notes[r.order_id] || "").trim() || "Approved by MyNest operations.",
              });
              toast.success("Refund submitted");
              reload();
            } catch (e) {
              toast.error(e instanceof ApiError ? e.friendly : "Could not process refund");
            } finally {
              setWorking(null);
            }
          },
        },
      ],
    );
  }, [notes, reload]);

  const denyRefund = useCallback((r: AdminRefund) => {
    Alert.alert(
      "Deny refund?",
      "The buyer will receive the decision and can use buyer protection as the escalation path.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Deny",
          style: "destructive",
          onPress: async () => {
            setWorking(r.order_id);
            try {
              await nest.adminDenyRefund(r.order_id, (notes[r.order_id] || "").trim() || "Refund request denied after review.");
              toast.success("Refund denied");
              reload();
            } catch (e) {
              toast.error(e instanceof ApiError ? e.friendly : "Could not deny refund");
            } finally {
              setWorking(null);
            }
          },
        },
      ],
    );
  }, [notes, reload]);

  if (user?.role !== "admin") {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <AdminHeader title="Refund review" backTo="/admin/operations" />
        <EmptyState icon="lock-closed-outline" title="Not available" message="Admin access is required." testID="admin-forbidden" />
      </SafeAreaView>
    );
  }

  const header = (
    <FilterBar<RefundStatus>
      query={query}
      onQueryChange={setQuery}
      placeholder="Search order #, buyer, email"
      chips={CHIPS}
      activeChip={status}
      onChipChange={(v) => { setStatus(v); reload(); }}
    />
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <AdminHeader title="Refund review" backTo="/admin/operations" />
      <InfiniteList<AdminRefund>
        fetcher={fetcher}
        keyExtractor={(r) => String(r.order_id)}
        headerComponent={header}
        reloadToken={`${status}|${query}|${reloadToken}`}
        emptyIcon="checkmark-circle-outline"
        emptyTitle="Queue clear"
        emptyMessage="No refunds match this filter."
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + 40 }}
        renderItem={({ item: r }) => (
          <RefundRow
            refund={r}
            note={notes[r.order_id] ?? ""}
            onNoteChange={(v) => setNotes((n) => ({ ...n, [r.order_id]: v }))}
            working={working === r.order_id}
            onProcess={() => processRefund(r)}
            onDeny={() => denyRefund(r)}
            onOpenOrder={() => pushFromTab(router, `/order/${r.order_id}`)}
          />
        )}
      />
    </SafeAreaView>
  );
}

function RefundRow({
  refund: r,
  note,
  onNoteChange,
  working,
  onProcess,
  onDeny,
  onOpenOrder,
}: {
  refund: AdminRefund;
  note: string;
  onNoteChange: (v: string) => void;
  working: boolean;
  onProcess: () => void;
  onDeny: () => void;
  onOpenOrder: () => void;
}) {
  const requestedAt = useMemo(() => {
    const d = parseServerDate(r.requested_at);
    return d ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
  }, [r.requested_at]);

  // Deny only makes sense on requested refunds; approved/processing/etc
  // have already been actioned or are in flight with the payment provider.
  const canDeny = r.state === "requested";
  const canProcess = r.state === "requested" || r.state === "approved";

  return (
    <AdminCard>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>Order #{r.order_number}</Text>
          <Text style={styles.sub} numberOfLines={1}>
            {r.buyer_name || r.buyer_email}
            {requestedAt ? ` · ${requestedAt}` : ""}
          </Text>
        </View>
        <TouchableOpacity onPress={onOpenOrder} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.link}>Open</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.amountRow}>
        <Text style={styles.amount}>{money(r.requested_amount, r.currency)} requested</Text>
        <AdminStatusPill status={r.state} />
      </View>

      <Text style={styles.body}>
        {r.reason.replace(/_/g, " ")}{r.details ? ` — ${r.details}` : ""}
      </Text>

      {canProcess ? (
        <TextInput
          value={note}
          onChangeText={onNoteChange}
          placeholder="Admin note (recommended)…"
          placeholderTextColor={colors.onSurfaceMuted}
          multiline
          style={styles.input}
          returnKeyType="done"
        />
      ) : null}

      {canProcess || canDeny ? (
        <View style={styles.actions}>
          {canProcess ? (
            <Button title="Process refund" size="sm" onPress={onProcess} loading={working} style={{ flex: 1 }} />
          ) : null}
          {canDeny ? (
            <Button title="Deny" size="sm" variant="outline" onPress={onDeny} disabled={working} style={{ flex: 1 }} />
          ) : null}
        </View>
      ) : null}
    </AdminCard>
  );
}

// v1.0.229 — Admin Refunds refinement. Type tokens applied throughout;
// note textarea uses field radius on a white surface with hairlineStrong.
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  title: { ...typeTokens.h2, fontSize: 16 },
  sub: { ...typeTokens.caption, marginTop: 2 },
  link: { ...typeTokens.caption, fontWeight: "800", color: colors.brand },
  amountRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.md, gap: spacing.md },
  amount: { ...typeTokens.display, fontSize: 20 },
  body: { ...typeTokens.caption, color: colors.onSurfaceMuted, lineHeight: 19, marginTop: spacing.sm, textTransform: "capitalize" },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    borderRadius: radius.field,
    padding: spacing.md,
    minHeight: 64,
    color: colors.onSurface,
    textAlignVertical: "top",
    marginTop: spacing.md,
  },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
});
