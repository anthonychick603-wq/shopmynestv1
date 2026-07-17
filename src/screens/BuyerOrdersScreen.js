import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EmptyState, Loading, Pill } from '../components/UI';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { dateLabel, money } from '../lib/format';
import { colors, radii, spacing } from '../theme';

export default function BuyerOrdersScreen({ navigation }) {
  const { token } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const result = await api.getBuyerOrders({ page: 1, per_page: 50 }, token);
      setOrders(result?.orders || []);
      setError('');
    } catch (err) {
      setError(err.status === 404
        ? 'Install the included MyNest Mobile App Bridge plugin on WordPress to enable native buyer order history.'
        : err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);
  if (loading) return <Loading label="Loading your orders…" />;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
      {!error && orders.length ? (
        <Pressable accessibilityRole="button" style={styles.protectionBanner} onPress={() => navigation.push('Disputes')}>
          <Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} />
          <Text style={styles.protectionText}>Buyer protection & disputes</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>
      ) : null}
      {error ? <EmptyState icon="extension-puzzle-outline" title="Order history needs the bridge" message={error} /> : null}
      {!error && !orders.length ? <EmptyState icon="receipt-outline" title="No orders yet" message="Your completed purchases will appear here." action="Browse the shop" onAction={() => navigation.resetToTab('Shop')} /> : null}
      {orders.map((order) => (
        <View key={order.id} style={styles.card}>
          <View style={styles.topRow}>
            <View><Text style={styles.number}>Order #{order.number}</Text><Text style={styles.date}>{dateLabel(order.date_created)}</Text></View>
            <Pill label={String(order.status || '').replace(/-/g, ' ')} active />
          </View>
          {order.items?.map((item) => <Text key={item.item_id} style={styles.item}>{item.quantity} × {item.name}</Text>)}
          <View style={styles.totalRow}><Text style={styles.totalLabel}>Total</Text><Text style={styles.total}>{money(order.total, order.currency)}</Text></View>
          {order.tracking?.length ? <Text style={styles.tracking}>Tracking: {order.tracking.map((item) => item.number).join(', ')}</Text> : null}
          <Pressable accessibilityRole="button" style={styles.disputeLink} onPress={() => navigation.push('NewDispute', { order, onCreated: load })}>
            <Ionicons name="shield-outline" size={16} color={colors.muted} />
            <Text style={styles.disputeText}>Open a dispute</Text>
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 45 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.lg, marginBottom: spacing.md },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: spacing.md },
  number: { color: colors.text, fontWeight: '900', fontSize: 18 },
  date: { color: colors.muted, fontSize: 12, marginTop: 3 },
  item: { color: colors.muted, lineHeight: 22 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.md, paddingTop: spacing.md },
  totalLabel: { color: colors.text, fontWeight: '800' },
  total: { color: colors.primary, fontWeight: '900', fontSize: 18 },
  tracking: { color: colors.success, fontWeight: '800', marginTop: spacing.md },
  protectionBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.md, marginBottom: spacing.md },
  protectionText: { color: colors.text, fontWeight: '800', flex: 1 },
  disputeLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.md, alignSelf: 'flex-start' },
  disputeText: { color: colors.muted, fontWeight: '700', fontSize: 13 },
});
