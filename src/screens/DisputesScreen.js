import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { EmptyState, Loading, Pill } from '../components/UI';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { dateLabel, humanize } from '../lib/format';
import { colors, radii, spacing } from '../theme';

const FILTERS = [['', 'All'], ['open', 'Open'], ['awaiting_seller', 'Awaiting seller'], ['awaiting_buyer', 'Awaiting buyer'], ['escalated', 'Escalated']];

export default function DisputesScreen({ navigation }) {
  const { token } = useAuth();
  const [disputes, setDisputes] = useState([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const result = await api.getDisputes({ status: status || undefined }, token);
      setDisputes(Array.isArray(result) ? result : (result?.disputes || result?.items || []));
    } catch (err) {
      setError(err.message || 'Disputes could not be loaded.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [status, token]);

  useEffect(() => { load(); }, [load]);
  if (loading) return <Loading label="Loading disputes…" />;

  return (
    <View style={styles.screen}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow} style={styles.filterBar}>
        {FILTERS.map(([value, labelText]) => (
          <Pill key={value || 'all'} label={labelText} active={status === value} onPress={() => { setLoading(true); setStatus(value); }} />
        ))}
      </ScrollView>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
        {error ? <EmptyState icon="cloud-offline-outline" title="Disputes unavailable" message={error} action="Try again" onAction={load} /> : null}
        {!error && !disputes.length ? <EmptyState icon="shield-checkmark-outline" title="No disputes" message="Buyer-protection cases you open or receive will appear here." /> : null}
        {disputes.map((dispute) => (
          <Pressable key={dispute.id} style={styles.card} onPress={() => navigation.push('DisputeDetail', { disputeId: dispute.id })}>
            <View style={styles.topRow}>
              <Text style={styles.number}>Order #{dispute.order_number || dispute.order_id}</Text>
              <Pill label={humanize(dispute.status)} active />
            </View>
            <Text style={styles.reason}>{humanize(dispute.reason)}</Text>
            {dispute.description ? <Text numberOfLines={2} style={styles.description}>{dispute.description}</Text> : null}
            {dispute.created_at || dispute.date ? <Text style={styles.date}>Opened {dateLabel(dispute.created_at || dispute.date)}</Text> : null}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  filterBar: { flexGrow: 0, flexShrink: 0 },
  filterRow: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: 8, alignItems: 'center' },
  content: { paddingHorizontal: spacing.lg, paddingBottom: 45 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.lg, marginBottom: spacing.md },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  number: { color: colors.text, fontWeight: '900', fontSize: 16, flexShrink: 1 },
  reason: { color: colors.primary, fontWeight: '800', marginTop: spacing.sm },
  description: { color: colors.muted, lineHeight: 20, marginTop: 4 },
  date: { color: colors.muted, fontSize: 12, marginTop: spacing.sm },
});
