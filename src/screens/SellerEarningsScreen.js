import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Button, EmptyState, Field, Loading, Screen } from '../components/UI';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { dateLabel, money } from '../lib/format';
import { colors, radii, spacing } from '../theme';

export default function SellerEarningsScreen() {
  const { token } = useAuth();
  const [earnings, setEarnings] = useState(null);
  const [payouts, setPayouts] = useState(null);
  const [amount, setAmount] = useState('');
  const [destination, setDestination] = useState('');
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [earningsResult, payoutsResult] = await Promise.all([
        api.getSellerEarnings({ page: 1, per_page: 50 }, token),
        api.getSellerPayouts(token),
      ]);
      setEarnings(earningsResult);
      setPayouts(payoutsResult);
    } finally { setLoading(false); }
  }, [token]);
  useEffect(() => { load().catch(() => setLoading(false)); }, [load]);
  if (loading) return <Loading label="Loading earnings…" />;

  const balances = payouts?.balances || earnings?.balances || {};
  const available = balances.available ?? balances.available_balance ?? 0;
  const pending = balances.pending ?? balances.pending_balance ?? 0;

  async function requestPayout() {
    setRequesting(true);
    try {
      await api.requestPayout({ amount: Number(amount), method: 'manual', destination }, token);
      setAmount('');
      Alert.alert('Payout requested', 'Your payout request was submitted for review.');
      await load();
    } catch (err) { Alert.alert('Could not request payout', err.message); }
    finally { setRequesting(false); }
  }

  return (
    <Screen scroll contentContainerStyle={styles.content}>
      <Text style={styles.title}>Earnings</Text>
      <View style={styles.balanceRow}>
        <View style={styles.balanceCard}><Text style={styles.balanceLabel}>Available</Text><Text style={styles.balance}>{money(available)}</Text></View>
        <View style={styles.balanceCard}><Text style={styles.balanceLabel}>Pending</Text><Text style={styles.balance}>{money(pending)}</Text></View>
      </View>
      <View style={styles.requestCard}>
        <Text style={styles.sectionTitle}>Request payout</Text>
        <Text style={styles.help}>Minimum payout: {money(payouts?.minimum || 0)}</Text>
        <Field label="Amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder={String(available)} />
        <Field label="Payout destination" value={destination} onChangeText={setDestination} placeholder="PayPal email or payment note" autoCapitalize="none" />
        <Button title="Request payout" onPress={requestPayout} loading={requesting} disabled={!amount || Number(amount) <= 0} />
      </View>
      <Text style={styles.sectionTitle}>Payout history</Text>
      {!payouts?.payouts?.length ? <EmptyState icon="wallet-outline" title="No payouts yet" message="Your payout history will appear here." /> : null}
      {payouts?.payouts?.map((item) => (
        <View key={item.id} style={styles.historyCard}>
          <View><Text style={styles.historyAmount}>{money(item.amount)}</Text><Text style={styles.historyDate}>{dateLabel(item.created_at)}</Text></View>
          <Text style={styles.historyStatus}>{item.status}</Text>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: 52 },
  title: { color: colors.text, fontSize: 30, fontWeight: '900', marginBottom: spacing.lg },
  balanceRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  balanceCard: { flex: 1, backgroundColor: colors.primary, borderRadius: radii.lg, padding: spacing.lg },
  balanceLabel: { color: colors.mist, fontWeight: '700' },
  balance: { color: colors.onPrimary, fontWeight: '900', fontSize: 23, marginTop: spacing.sm },
  requestCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.lg, marginBottom: spacing.xl },
  sectionTitle: { color: colors.text, fontWeight: '900', fontSize: 20, marginBottom: spacing.md },
  help: { color: colors.muted, marginBottom: spacing.md },
  historyCard: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.md },
  historyAmount: { color: colors.primary, fontWeight: '900', fontSize: 18 },
  historyDate: { color: colors.muted, fontSize: 12, marginTop: 3 },
  historyStatus: { color: colors.text, fontWeight: '800', textTransform: 'capitalize' },
});
