// v1.0.192 — Full rewrite. Previously this file was a single-line minified
// blob that worked but was unreadable and inconsistent with the rest of
// the app. Now it uses the shared admin UI kit (AdminHeader, AdminCard,
// FilterBar, AdminStatusPill, InfiniteList) so the payouts queue feels
// like a first-class admin surface, not a debugging screen.
//
// Feature list:
//   - Status chip filter (all / requested / processing / paid / failed /
//     returned / cancelled) that pages server-side
//   - Manual ACH payouts get an inline reference-number input; PayPal
//     payouts skip that field
//   - Confirmed cancel with destructive Alert; optimistic list removal
//   - Retry action for failed / returned payouts
//   - Empty state uses the shared component so it matches every other
//     admin queue
import React, { useCallback, useMemo, useState } from "react";
import { Alert, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { nest, ApiError, type AdminPayout, type AdminPayoutList } from "@/src/api/nest";
import { Button } from "@/src/components/Button";
import { EmptyState } from "@/src/components/EmptyState";
import { toast } from "@/src/components/Toast";
import { AdminHeader } from "@/src/components/admin/AdminHeader";
import { AdminCard } from "@/src/components/admin/AdminCard";
import { AdminStatusPill } from "@/src/components/admin/AdminStatusPill";
import { FilterBar, type FilterChip } from "@/src/components/admin/FilterBar";
import { InfiniteList, type InfiniteFetcher } from "@/src/components/admin/InfiniteList";
import { useAuth } from "@/src/context/AuthContext";
import { useAdminFocusRefetch } from "@/src/hooks/use-admin-focus-refetch";
import { useInvalidateOnFocus } from "@/src/state/mutationBus";
import { useLatestRequest } from "@/src/hooks/use-latest-request";
import { colors, radius, spacing, type as typeTokens } from "@/src/theme";
import { parseServerDate } from "@/src/utils/datetime";
import { useBackFallback } from "@/src/context/BackFallback";

type PayoutStatus = "all" | AdminPayout["status"];

const CHIPS: readonly FilterChip<PayoutStatus>[] = [
  { value: "all", label: "All" },
  { value: "requested", label: "Requested" },
  { value: "processing", label: "Processing" },
  { value: "failed", label: "Failed" },
  { value: "returned", label: "Returned" },
  { value: "paid", label: "Paid" },
  { value: "cancelled", label: "Cancelled" },
];

const money = (n: number, c: string) => `${c || "USD"} ${Number(n || 0).toFixed(2)}`;

export default function AdminPayoutsScreen() {
  useBackFallback("/admin/operations");
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [status, setStatus] = useState<PayoutStatus>("requested");
  const [query, setQuery] = useState("");
  const [refs, setRefs] = useState<Record<number, string>>({});
  const [working, setWorking] = useState<number | null>(null);
  // v1.0.192 — bump on every mutating action so the InfiniteList refetches
  // from page 1. Cheap way to keep the list in sync without an imperative
  // ref API on InfiniteList.
  const [reloadToken, setReloadToken] = useState(0);
  const { begin, isCurrent } = useLatestRequest();
  const reload = useCallback(() => {
    // v1.0.249 — clear any typed-but-un-saved reference chips on every
    // reload so a stale ref number can't accidentally pollute a payout
    // that came back with a new external_id from the server.
    setRefs({});
    setReloadToken((t) => t + 1);
  }, []);
  useAdminFocusRefetch(reload); // v1.0.236 admin console focus refetch
  const invalidate = useCallback(async () => { reload(); }, [reload]);
  useInvalidateOnFocus(["orders"], invalidate);

  // Fetcher captures the current filter state; changing status/query
  // triggers a reload via reloadToken so the fetcher itself doesn't need
  // to live inside useCallback with a stale-closure concern.
  const fetcher: InfiniteFetcher<AdminPayout> = useCallback(
    async (page) => {
      const res: AdminPayoutList = await nest.adminListPayouts({ status, page, per_page: 25 });
      // Client-side query filter — the server doesn't accept a `q` param
      // here, but the list is bounded (paginated) so filtering the current
      // page is fine and lets the search bar work like elsewhere.
      const q = query.trim().toLowerCase();
      const items = q
        ? (res.items || []).filter(
            (p) =>
              p.seller_name?.toLowerCase().includes(q) ||
              p.seller_email?.toLowerCase().includes(q) ||
              String(p.id).includes(q) ||
              p.destination?.toLowerCase().includes(q),
          )
        : res.items || [];
      return { items, total_pages: res.total_pages, total: res.total };
    },
    [status, query],
  );

  // v1.0.249 — all three mutations now short-circuit their `setWorking`
  // reset if we've unmounted between the network round-trip and the
  // finally block. useLatestRequest gives us both cancellation and
  // unmount signalling from a single primitive.
  const doProcess = useCallback(async (p: AdminPayout) => {
    if (p.method === "manual" && !String(refs[p.id] || p.external_id || "").trim()) {
      toast.error("Enter the ACH / bank confirmation reference first");
      return;
    }
    const id = begin();
    setWorking(p.id);
    try {
      await nest.adminProcessPayout(p.id, {
        external_id: String(refs[p.id] || p.external_id || "").trim(),
        notes: "Processed from MyNest mobile operations.",
      });
      if (!isCurrent(id)) return;
      toast.success(p.method === "manual" ? "Payout marked paid" : "Payout submitted");
      reload();
    } catch (e) {
      if (!isCurrent(id)) return;
      toast.error(e instanceof ApiError ? e.friendly : "Could not process payout");
    } finally {
      if (isCurrent(id)) setWorking(null);
    }
  }, [refs, reload, begin, isCurrent]);

  // v1.0.249 — wrap manual mark-paid in a confirmation prompt, since a
  // misclick would move real money in the seller's ledger. PayPal /
  // provider-submitted payouts skip this prompt.
  const processPayout = useCallback((p: AdminPayout) => {
    if (p.method === "manual") {
      Alert.alert(
        "Mark payout paid?",
        `Confirm ${money(p.amount, p.currency)} to ${p.destination || p.seller_email || "seller"} as paid.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Mark paid", onPress: () => { void doProcess(p); } },
        ],
      );
    } else {
      void doProcess(p);
    }
  }, [doProcess]);

  const retryPayout = useCallback(async (p: AdminPayout) => {
    const id = begin();
    setWorking(p.id);
    try {
      await nest.adminRetryPayout(p.id);
      if (!isCurrent(id)) return;
      toast.success("Payout returned to processing queue");
      reload();
    } catch (e) {
      if (!isCurrent(id)) return;
      toast.error(e instanceof ApiError ? e.friendly : "Could not retry payout");
    } finally {
      if (isCurrent(id)) setWorking(null);
    }
  }, [reload, begin, isCurrent]);

  const cancelPayout = useCallback((p: AdminPayout) => {
    Alert.alert(
      "Cancel payout?",
      "The reserved balance will be returned to the seller's available balance.",
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Cancel payout",
          style: "destructive",
          onPress: async () => {
            const id = begin();
            setWorking(p.id);
            try {
              await nest.adminCancelPayout(p.id, "Cancelled from MyNest mobile operations.");
              if (!isCurrent(id)) return;
              toast.success("Payout cancelled");
              reload();
            } catch (e) {
              if (!isCurrent(id)) return;
              toast.error(e instanceof ApiError ? e.friendly : "Could not cancel payout");
            } finally {
              if (isCurrent(id)) setWorking(null);
            }
          },
        },
      ],
    );
  }, [reload, begin, isCurrent]);

  if (user?.role !== "admin") {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <AdminHeader title="Payouts" backTo="/admin/operations" />
        <EmptyState icon="lock-closed-outline" title="Not available" message="Admin access is required." testID="admin-forbidden" />
      </SafeAreaView>
    );
  }

  const header = (
    <FilterBar<PayoutStatus>
      query={query}
      onQueryChange={setQuery}
      placeholder="Search by seller, email, or destination"
      chips={CHIPS}
      activeChip={status}
      onChipChange={(v) => { setStatus(v); reload(); }}
    />
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <AdminHeader title="Payouts" backTo="/admin/operations" />
      <InfiniteList<AdminPayout>
        fetcher={fetcher}
        keyExtractor={(p) => String(p.id)}
        headerComponent={header}
        reloadToken={`${status}|${query}|${reloadToken}`}
        emptyIcon="cash-outline"
        emptyTitle="Queue clear"
        emptyMessage="No payouts match this filter."
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + 40 }}
        renderItem={({ item: p }) => (
          <PayoutRow
            payout={p}
            reference={refs[p.id] ?? p.external_id ?? ""}
            onReferenceChange={(v) => setRefs((r) => ({ ...r, [p.id]: v }))}
            working={working === p.id}
            onProcess={() => processPayout(p)}
            onRetry={() => retryPayout(p)}
            onCancel={() => cancelPayout(p)}
          />
        )}
      />
    </SafeAreaView>
  );
}

// Extracted so the fetch loop stays readable. Row owns its own layout,
// action wiring, and inline reference input.
function PayoutRow({
  payout: p,
  reference,
  onReferenceChange,
  working,
  onProcess,
  onRetry,
  onCancel,
}: {
  payout: AdminPayout;
  reference: string;
  onReferenceChange: (v: string) => void;
  working: boolean;
  onProcess: () => void;
  onRetry: () => void;
  onCancel: () => void;
}) {
  const requestedAt = useMemo(() => {
    const d = parseServerDate(p.requested_at);
    return d ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
  }, [p.requested_at]);

  const showManualInput = p.method === "manual" && (p.status === "requested" || p.status === "processing");
  const paypalPending = p.method === "paypal" && p.status === "processing" && !!p.external_id;
  const canProcess = (p.status === "requested" || p.status === "processing") && !paypalPending;
  const canRetry = p.status === "failed" || p.status === "returned";
  const canCancel = p.status !== "paid" && p.status !== "cancelled" && !paypalPending;

  return (
    <AdminCard>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {p.seller_name || `Seller #${p.seller_id}`}
          </Text>
          <View style={styles.metaRow}>
            <AdminStatusPill status={p.status} />
            <Text style={styles.metaText}>· {p.method}</Text>
            {requestedAt ? <Text style={styles.metaText}>· requested {requestedAt}</Text> : null}
          </View>
        </View>
        <Text style={styles.amount}>{money(p.amount, p.currency)}</Text>
      </View>

      <Text style={styles.destination} numberOfLines={2}>
        {p.destination || p.seller_email}
      </Text>

      {showManualInput ? (
        <TextInput
          value={reference}
          onChangeText={onReferenceChange}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="ACH / bank confirmation reference"
          placeholderTextColor={colors.onSurfaceMuted}
          style={styles.input}
          returnKeyType="done"
        />
      ) : null}

      {paypalPending ? (
        <View style={styles.providerWait}>
          <Ionicons name="time-outline" size={16} color={colors.brand} />
          <Text style={styles.providerWaitText}>Submitted to PayPal · awaiting provider confirmation</Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        {canProcess ? (
          <Button
            title={p.method === "manual" ? "Mark paid" : "Process payout"}
            size="sm"
            onPress={onProcess}
            loading={working}
            style={{ flex: 1 }}
          />
        ) : canRetry ? (
          <Button title="Retry payout" size="sm" onPress={onRetry} loading={working} style={{ flex: 1 }} />
        ) : null}
        {canCancel ? (
          <Button title="Cancel" size="sm" variant="ghost" onPress={onCancel} disabled={working} style={{ flex: canProcess || canRetry ? 0 : 1 }} />
        ) : null}
      </View>
    </AdminCard>
  );
}

// v1.0.229 — Admin Payouts refinement. Type tokens applied; note input
// and provider-wait strip move to white cards with hairline borders.
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  headerRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  title: { ...typeTokens.h2, fontSize: 16 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: 4, flexWrap: "wrap" },
  metaText: { ...typeTokens.caption },
  amount: { ...typeTokens.display, fontSize: 18 },
  destination: { ...typeTokens.caption, marginTop: spacing.sm },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    borderRadius: radius.field,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    color: colors.onSurface,
    marginTop: spacing.md,
    fontSize: 14,
  },
  providerWait: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.card,
  },
  providerWaitText: { flex: 1, ...typeTokens.caption, lineHeight: 17 },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
});
