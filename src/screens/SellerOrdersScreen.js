import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { EmptyState, Loading, Pill } from '../components/UI';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { dateLabel, money } from '../lib/format';
import { colors, radii, spacing } from '../theme';

export default function SellerOrdersScreen({ navigation }) {
  const { token } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { const result = await api.getSellerOrders({ page: 1, per_page: 100 }, token); setOrders(result?.orders || []); }
    finally { setLoading(false); setRefreshing(false); }
  }, [token]);
  useEffect(() => { load().catch(() => setLoading(false)); }, [load]);
  if (loading) return <Loading label="Loading seller orders…" />;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
      {!orders.length ? <EmptyState icon="cube-outline" title="No orders yet" message="Orders containing your products will appear here." /> : null}
      {orders.map((order) => (
        <Pressable key={order.id} style={styles.card} onPress={() => navigation.push('SellerOrderDetail', { order, onUpdated: load })}>
          <View style={styles.topRow}><View><Text style={styles.number}>Order #{order.number}</Text><Text style={styles.date}>{dateLabel(order.date_created)}</Text></View><Pill label={order.seller_status || 'processing'} active /></View>
          <Text style={styles.customer}>{order.customer?.name || 'Customer'}</Text>
          {order.items?.map((item) => <Text key={item.item_id} style={styles.item}>{item.quantity} × {item.name}</Text>)}
          <View style={styles.totalRow}><Text style={styles.totalLabel}>Your net before shipping</Text><Text style={styles.total}>{money(order.net_before_shipping, order.currency)}</Text></View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 50 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.lg, marginBottom: spacing.md },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  number: { color: colors.text, fontWeight: '900', fontSize: 18 },
  date: { color: colors.muted, fontSize: 12, marginTop: 3 },
  customer: { color: colors.primary, fontWeight: '800', marginTop: spacing.md },
  item: { color: colors.muted, lineHeight: 21, marginTop: 3 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.md, paddingTop: spacing.md },
  totalLabel: { color: colors.muted, fontSize: 12 },
  total: { color: colors.primary, fontWeight: '900' },
});
