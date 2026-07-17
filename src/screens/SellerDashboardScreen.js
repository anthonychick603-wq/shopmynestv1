import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EmptyState, Loading, SectionTitle } from '../components/UI';
import SellerBadge from '../components/SellerBadge';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { money } from '../lib/format';
import { colors, radii, spacing } from '../theme';

function Stat({ label, value, icon }) {
  return <View style={styles.stat}><View style={styles.statIcon}><Ionicons name={icon} size={21} color={colors.primary} /></View><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}
function Action({ title, subtitle, icon, onPress }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={styles.action}><View style={styles.actionIcon}><Ionicons name={icon} size={24} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={styles.actionTitle}>{title}</Text><Text style={styles.actionSubtitle}>{subtitle}</Text></View><Ionicons name="chevron-forward" size={20} color={colors.muted} /></Pressable>;
}

export default function SellerDashboardScreen({ navigation }) {
  const { token, user, isSeller } = useAuth();
  const [data, setData] = useState(null);
  const [proSeller, setProSeller] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setData(await api.getSellerDashboard(token)); setError(''); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, [token]);
  useEffect(() => { if (isSeller) load(); else setLoading(false); }, [isSeller, load]);

  useEffect(() => {
    if (!isSeller || !user?.id) return;
    api.getSellerProStatus(user.id)
      .then((result) => setProSeller(Boolean(result?.pro_seller)))
      .catch(() => {});
  }, [isSeller, user?.id]);

  if (!isSeller) return <EmptyState icon="storefront-outline" title="Seller access required" message="Your seller application must be approved before opening this dashboard." action="Apply to sell" onAction={() => navigation.replace('SellerApplication')} />;
  if (loading) return <Loading label="Loading seller dashboard…" />;
  if (error) return <EmptyState icon="alert-circle-outline" title="Dashboard unavailable" message={error} action="Try again" onAction={load} />;

  const available = data?.balances?.available ?? data?.balances?.available_balance ?? 0;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
      <Text style={styles.kicker}>SELLER DASHBOARD</Text>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{data?.profile?.store_name || 'Your Nest'}</Text>
        {proSeller ? (
          <View style={styles.proChip}>
            <Ionicons name="star" size={13} color={colors.onAccent} />
            <Text style={styles.proChipText}>PRO</Text>
          </View>
        ) : null}
      </View>
      {user?.id ? <SellerBadge sellerId={user.id} style={styles.badge} /> : null}
      <View style={styles.statsRow}>
        <Stat icon="cube-outline" label="Products" value={data?.product_count || 0} />
        <Stat icon="receipt-outline" label="Recent orders" value={data?.recent_orders?.length || 0} />
        <Stat icon="wallet-outline" label="Available" value={money(available)} />
      </View>
      <View style={styles.actionCard}>
        <Action icon="pricetags-outline" title="Products" subtitle="Create and edit listings" onPress={() => navigation.push('SellerProducts')} />
        <Action icon="cube-outline" title="Orders" subtitle="Fulfill purchases and add tracking" onPress={() => navigation.push('SellerOrders')} />
        <Action icon="pricetag-outline" title="Offers & bundles" subtitle="Review buyer offers and bundle deals" onPress={() => navigation.push('Offers')} />
        <Action icon="shield-checkmark-outline" title="Buyer protection" subtitle="Respond to disputes on your orders" onPress={() => navigation.push('Disputes')} />
        <Action icon="cash-outline" title="Earnings and payouts" subtitle={`${data?.fee?.label || 'Marketplace fee'}: ${data?.fee?.percent || 0}%`} onPress={() => navigation.push('SellerEarnings')} />
        <Action icon="storefront-outline" title="Shop profile" subtitle="Store name, about, and payout details" onPress={() => navigation.push('SellerProfile')} />
        <Action icon="car-outline" title="Shipping settings" subtitle="Ship-from address, package defaults, and labels" onPress={() => navigation.push('ShippingProfile')} />
      </View>
      <SectionTitle title="Recent orders" action="View all" onAction={() => navigation.push('SellerOrders')} />
      {!data?.recent_orders?.length ? <EmptyState icon="cube-outline" title="No seller orders yet" message="New purchases containing your items will appear here." /> : null}
      {data?.recent_orders?.map((order) => (
        <Pressable key={order.id} style={styles.orderCard} onPress={() => navigation.push('SellerOrderDetail', { order })}>
          <View><Text style={styles.orderNumber}>Order #{order.number}</Text><Text style={styles.orderCustomer}>{order.customer?.name || 'Customer'}</Text></View>
          <View style={{ alignItems: 'flex-end' }}><Text style={styles.orderTotal}>{money(order.net_before_shipping, order.currency)}</Text><Text style={styles.orderStatus}>{order.seller_status}</Text></View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 50 },
  kicker: { color: colors.accent, fontWeight: '900', letterSpacing: 1.4, fontSize: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 4, marginBottom: spacing.lg },
  title: { color: colors.text, fontSize: 30, fontWeight: '900', flexShrink: 1 },
  proChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.accent, borderRadius: radii.pill, paddingHorizontal: 9, paddingVertical: 4 },
  proChipText: { color: colors.onAccent, fontWeight: '900', fontSize: 11, letterSpacing: 0.5 },
  badge: { marginBottom: spacing.lg },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  stat: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.md },
  statIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  statValue: { color: colors.text, fontWeight: '900', fontSize: 17, marginTop: spacing.sm },
  statLabel: { color: colors.muted, fontSize: 11, marginTop: 2 },
  actionCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, overflow: 'hidden', marginBottom: spacing.xl },
  action: { flexDirection: 'row', alignItems: 'center', minHeight: 78, padding: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  actionIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  actionTitle: { color: colors.text, fontWeight: '900' },
  actionSubtitle: { color: colors.muted, fontSize: 12, marginTop: 3 },
  orderCard: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.md },
  orderNumber: { color: colors.text, fontWeight: '900' },
  orderCustomer: { color: colors.muted, fontSize: 12, marginTop: 3 },
  orderTotal: { color: colors.primary, fontWeight: '900' },
  orderStatus: { color: colors.muted, fontSize: 11, marginTop: 3, textTransform: 'capitalize' },
});
