import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Field, Pill, Screen } from '../components/UI';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { colors, radii, spacing } from '../theme';

const REASONS = [
  ['not_arrived', 'Item never arrived'],
  ['not_as_described', 'Not as described'],
  ['damaged', 'Arrived damaged'],
  ['other', 'Something else'],
];

export default function NewDisputeScreen({ navigation, route }) {
  const { token } = useAuth();
  const order = route.order || {};
  const [reason, setReason] = useState('not_arrived');
  const [description, setDescription] = useState('');
  const [contacted, setContacted] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!description.trim()) {
      Alert.alert('Add a few details', 'Describe what went wrong so we can help resolve it.');
      return;
    }
    setSaving(true);
    try {
      const result = await api.createDispute({
        order_id: order.id,
        reason,
        description: description.trim(),
        contacted_seller_at: contacted ? new Date().toISOString() : undefined,
      }, token);
      const dispute = result?.dispute || result;
      const warning = result?.warning;
      route.onCreated?.();
      Alert.alert(
        'Dispute opened',
        warning || 'Your buyer-protection case has been opened. The seller has a chance to respond first.',
        [{ text: 'View dispute', onPress: () => navigation.replace('DisputeDetail', { disputeId: dispute?.id }) }]
      );
    } catch (err) {
      Alert.alert('Could not open dispute', err.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen scroll contentContainerStyle={styles.content}>
      <Text style={styles.title}>Open a dispute</Text>
      {order.number ? <Text style={styles.subtitle}>Order #{order.number}</Text> : null}

      <Text style={styles.label}>What went wrong?</Text>
      <View style={styles.pills}>
        {REASONS.map(([value, labelText]) => (
          <Pill key={value} label={labelText} active={reason === value} onPress={() => setReason(value)} />
        ))}
      </View>

      <Field label="Describe the problem" value={description} onChangeText={setDescription} multiline placeholder="Tell us what happened…" />

      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: contacted }} onPress={() => setContacted((value) => !value)} style={styles.checkRow}>
        <Ionicons name={contacted ? 'checkbox' : 'square-outline'} size={22} color={colors.primary} />
        <Text style={styles.checkLabel}>I already contacted the seller about this</Text>
      </Pressable>
      <Text style={styles.help}>Reaching out to the seller first helps resolve most issues faster. You can still open a dispute either way.</Text>

      <Button title="Open dispute" onPress={submit} loading={saving} style={{ marginTop: spacing.lg }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: 50 },
  title: { color: colors.text, fontSize: 27, fontWeight: '900' },
  subtitle: { color: colors.muted, marginTop: 4, marginBottom: spacing.lg },
  label: { color: colors.text, fontWeight: '900', marginTop: spacing.md, marginBottom: spacing.sm },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.lg },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.md },
  checkLabel: { color: colors.text, fontWeight: '700', flex: 1 },
  help: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: spacing.sm },
});
