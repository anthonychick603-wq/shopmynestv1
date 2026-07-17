import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Button, EmptyState, Field, Loading, Pill, Screen } from '../components/UI';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { dateLabel, humanize, money } from '../lib/format';
import { colors, radii, spacing } from '../theme';

const OPEN_STATES = new Set(['open', 'awaiting_seller', 'awaiting_buyer']);

export default function DisputeDetailScreen({ navigation, route }) {
  const { token, isSeller } = useAuth();
  const [dispute, setDispute] = useState(route.dispute || null);
  const [loading, setLoading] = useState(!route.dispute);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [responding, setResponding] = useState(false);
  const [escalating, setEscalating] = useState(false);

  const disputeId = route.disputeId || route.dispute?.id;

  const load = useCallback(async () => {
    if (!disputeId) return;
    try {
      const result = await api.getDispute(disputeId, token);
      setDispute(result?.dispute || result);
      setError('');
    } catch (err) {
      setError(err.message || 'This dispute could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [disputeId, token]);

  useEffect(() => { load(); }, [load]);

  async function respond() {
    if (!note.trim()) {
      Alert.alert('Add a response', 'Write a note for the buyer before submitting.');
      return;
    }
    setResponding(true);
    try {
      const result = await api.updateDispute(dispute.id, { resolution_note: note.trim() }, token);
      setDispute(result?.dispute || result);
      setNote('');
      route.onUpdated?.();
      Alert.alert('Response sent', 'Your response was shared with the buyer.');
    } catch (err) {
      Alert.alert('Could not respond', err.message || 'Please try again.');
    } finally {
      setResponding(false);
    }
  }

  async function escalate() {
    setEscalating(true);
    try {
      const result = await api.escalateDispute(dispute.id, token);
      setDispute(result?.dispute || result);
      route.onUpdated?.();
      Alert.alert('Escalated to MyNest', 'Our team will review this dispute and follow up.');
    } catch (err) {
      Alert.alert('Could not escalate', err.message || 'Escalation may not be available yet. Please try again later.');
    } finally {
      setEscalating(false);
    }
  }

  if (loading) return <Loading label="Loading dispute…" />;
  if (error || !dispute) return <EmptyState icon="alert-circle-outline" title="Dispute unavailable" message={error} action="Go back" onAction={navigation.goBack} />;

  const isOpen = OPEN_STATES.has(dispute.status);

  return (
    <Screen scroll contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Order #{dispute.order_number || dispute.order_id}</Text>
        <Pill label={humanize(dispute.status)} active />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Reason</Text>
        <Text style={styles.body}>{humanize(dispute.reason)}</Text>
        {dispute.description ? <Text style={[styles.body, { marginTop: spacing.sm }]}>{dispute.description}</Text> : null}
        {dispute.created_at || dispute.date ? <Text style={styles.meta}>Opened {dateLabel(dispute.created_at || dispute.date)}</Text> : null}
        {dispute.contacted_seller_at ? <Text style={styles.meta}>Seller contacted {dateLabel(dispute.contacted_seller_at)}</Text> : null}
      </View>

      {Array.isArray(dispute.evidence) && dispute.evidence.length ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Evidence</Text>
          {dispute.evidence.map((url, index) => <Text key={`${url}-${index}`} style={styles.link}>{url}</Text>)}
        </View>
      ) : null}

      {dispute.resolution_note ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Latest response</Text>
          <Text style={styles.body}>{dispute.resolution_note}</Text>
        </View>
      ) : null}

      {dispute.refund_amount ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Refund</Text>
          <Text style={styles.refund}>{money(dispute.refund_amount, dispute.currency)}</Text>
        </View>
      ) : null}

      {isSeller && isOpen ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Respond to the buyer</Text>
          <Field label="Response note" value={note} onChangeText={setNote} multiline placeholder="Explain how you'll resolve this…" />
          <Button title="Send response" onPress={respond} loading={responding} />
        </View>
      ) : null}

      {isOpen ? (
        <Button title="Escalate to MyNest review" variant="outline" icon="flag-outline" onPress={escalate} loading={escalating} style={{ marginTop: spacing.sm }} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: 50 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: spacing.lg },
  title: { color: colors.text, fontSize: 24, fontWeight: '900', flexShrink: 1 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.lg, marginBottom: spacing.lg },
  sectionTitle: { color: colors.text, fontWeight: '900', fontSize: 16, marginBottom: spacing.sm },
  body: { color: colors.muted, lineHeight: 22 },
  meta: { color: colors.muted, fontSize: 12, marginTop: spacing.sm },
  link: { color: colors.info, marginTop: 4 },
  refund: { color: colors.primary, fontWeight: '900', fontSize: 20 },
});
