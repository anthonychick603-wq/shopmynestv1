import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Field, Pill, Screen } from '../components/UI';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { money } from '../lib/format';
import { colors, radii, spacing } from '../theme';

function rateName(rate) {
  const service = rate?.servicelevel?.name || rate?.servicelevel_name || rate?.service || 'Shipping service';
  return `${rate?.provider || 'Carrier'} ${service}`.trim();
}

function rateDays(rate) {
  if (rate?.duration_terms) return rate.duration_terms;
  if (rate?.estimated_days) return `${rate.estimated_days} estimated day${Number(rate.estimated_days) === 1 ? '' : 's'}`;
  return 'Delivery estimate unavailable';
}

export default function SellerOrderDetailScreen({ navigation, route }) {
  const { token } = useAuth();
  const [order, setOrder] = useState(route.order);
  const [status, setStatus] = useState(order.seller_status || 'processing');
  const [tracking, setTracking] = useState(order.tracking_number || '');
  const [label, setLabel] = useState(null);
  const [rates, setRates] = useState([]);
  const [selectedRateId, setSelectedRateId] = useState('');
  const [loadingLabel, setLoadingLabel] = useState(true);
  const [loadingRates, setLoadingRates] = useState(false);
  const [buyingLabel, setBuyingLabel] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadLabel = useCallback(async () => {
    setLoadingLabel(true);
    try {
      const result = await api.getShippingLabel(order.id, token);
      const nextLabel = result?.label || null;
      setLabel(nextLabel);
      if (nextLabel?.tracking_number) setTracking(nextLabel.tracking_number);
      if (nextLabel?.status === 'success') setStatus('shipped');
    } catch (err) {
      if (err.status !== 404) {
        // Label support is optional until Shippo is configured. Keep manual
        // fulfillment available even if this request fails.
      }
    } finally {
      setLoadingLabel(false);
    }
  }, [order.id, token]);

  useEffect(() => {
    void loadLabel();
  }, [loadLabel]);

  async function save() {
    setSaving(true);
    try {
      const updated = await api.updateSellerOrder(order.id, { status, tracking_number: tracking.trim() }, token);
      setOrder(updated);
      route.onUpdated?.();
      Alert.alert('Order updated', `Order #${updated.number} is now ${updated.seller_status}.`);
    } catch (err) {
      Alert.alert('Could not update order', err.message || 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  async function loadRates() {
    setLoadingRates(true);
    try {
      const result = await api.getShippingRates(order.id, token);
      const nextRates = Array.isArray(result?.rates) ? result.rates : [];
      setRates(nextRates);
      setSelectedRateId(nextRates[0]?.object_id || '');
      if (!nextRates.length) Alert.alert('No rates found', 'No shipping services were returned for this order.');
    } catch (err) {
      const existingLabel = err.details?.label;
      if (existingLabel) {
        setLabel(existingLabel);
        if (existingLabel.tracking_number) setTracking(existingLabel.tracking_number);
        Alert.alert('Label already created', 'Open the existing label below.');
      } else {
        Alert.alert(
          'Could not get shipping rates',
          err.message || 'Check your ship-from address, package dimensions, and Shippo settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Shipping settings', onPress: () => navigation.push('ShippingProfile') },
          ]
        );
      }
    } finally {
      setLoadingRates(false);
    }
  }

  async function purchaseSelectedRate() {
    const selected = rates.find((rate) => rate.object_id === selectedRateId);
    if (!selected) return;

    setBuyingLabel(true);
    try {
      const result = await api.buyShippingLabel(order.id, {
        rate: selected.object_id,
        provider: selected.provider || '',
        service: selected.servicelevel?.name || selected.servicelevel_name || '',
        amount: selected.amount || '',
        currency: selected.currency || order.currency,
      }, token);
      const nextLabel = result?.label || null;
      setLabel(nextLabel);
      setRates([]);
      setSelectedRateId('');
      if (nextLabel?.tracking_number) setTracking(nextLabel.tracking_number);
      if (nextLabel?.status === 'success') {
        setStatus('shipped');
        setOrder((current) => ({ ...current, seller_status: 'shipped', tracking_number: nextLabel.tracking_number || current.tracking_number }));
      }
      route.onUpdated?.();
      Alert.alert(
        nextLabel?.label_url ? 'Shipping label ready' : 'Label is processing',
        nextLabel?.tracking_number ? `Tracking number: ${nextLabel.tracking_number}` : 'Refresh the label status in a moment.'
      );
    } catch (err) {
      Alert.alert('Could not purchase label', err.message || 'No charge was confirmed. Check Shippo and try again.');
    } finally {
      setBuyingLabel(false);
    }
  }

  function confirmPurchase() {
    const selected = rates.find((rate) => rate.object_id === selectedRateId);
    if (!selected) return;
    Alert.alert(
      'Purchase shipping label?',
      `${rateName(selected)} will cost ${money(selected.amount, selected.currency || order.currency)}. The label purchase is made through the Shippo account connected to MyNest.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Purchase label', onPress: purchaseSelectedRate },
      ]
    );
  }

  async function openLabel() {
    if (!label?.label_url) return;
    try {
      const supported = await Linking.canOpenURL(label.label_url);
      if (!supported) throw new Error('unsupported');
      await Linking.openURL(label.label_url);
    } catch {
      Alert.alert('Could not open label', 'The PDF label could not be opened on this device.');
    }
  }

  return (
    <Screen scroll contentContainerStyle={styles.content}>
      <Text style={styles.title}>Order #{order.number}</Text>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Ship to</Text>
        <Text style={styles.body}>{order.customer?.name}</Text>
        <Text style={styles.body}>{order.customer?.address || 'No shipping address provided'}</Text>
        {order.customer?.email ? <Text style={styles.body}>{order.customer.email}</Text> : null}
        {order.customer?.phone ? <Text style={styles.body}>{order.customer.phone}</Text> : null}
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Your items</Text>
        {order.items?.map((item) => (
          <View key={item.item_id} style={styles.itemRow}>
            <View style={{ flex: 1 }}><Text style={styles.itemName}>{item.quantity} × {item.name}</Text><Text style={styles.itemMeta}>Fee: {money(item.platform_fee, order.currency)}</Text></View>
            <Text style={styles.itemNet}>{money(item.net, order.currency)}</Text>
          </View>
        ))}
        <View style={styles.netRow}><Text style={styles.netLabel}>Net before shipping</Text><Text style={styles.net}>{money(order.net_before_shipping, order.currency)}</Text></View>
      </View>

      <View style={styles.card}>
        <View style={styles.labelHeader}>
          <View style={styles.labelHeaderText}>
            <Text style={styles.sectionTitle}>Shipping label</Text>
            <Text style={styles.help}>Compare Shippo rates, purchase a PDF label, and fill tracking automatically.</Text>
          </View>
          <Ionicons name="car-outline" size={27} color={colors.primary} />
        </View>

        {loadingLabel ? <Text style={styles.help}>Checking for an existing label…</Text> : null}
        {!loadingLabel && label?.label_url ? (
          <View style={styles.labelReady}>
            <Text style={styles.labelReadyTitle}>{label.carrier || 'Carrier'} {label.service || 'shipping label'}</Text>
            {label.tracking_number ? <Text style={styles.trackingText}>Tracking: {label.tracking_number}</Text> : null}
            {label.amount ? <Text style={styles.help}>Label cost: {money(label.amount, label.currency || order.currency)}</Text> : null}
            {label.test_mode ? <Text style={styles.testBadge}>TEST LABEL</Text> : null}
            <Button title="Open PDF label" icon="document-outline" onPress={openLabel} style={{ marginTop: spacing.md }} />
          </View>
        ) : null}

        {!loadingLabel && label && !label.label_url ? (
          <View style={styles.processingBox}>
            <Text style={styles.labelReadyTitle}>Label is {label.status || 'processing'}</Text>
            <Text style={styles.help}>Refresh until Shippo returns the PDF and tracking number.</Text>
            <Button title="Refresh label" variant="outline" icon="refresh-outline" onPress={loadLabel} style={{ marginTop: spacing.sm }} />
          </View>
        ) : null}

        {!loadingLabel && !label?.label_url && !rates.length ? (
          <View>
            <Button title="Get shipping rates" icon="pricetag-outline" onPress={loadRates} loading={loadingRates} />
            <Button title="Shipping settings" variant="outline" onPress={() => navigation.push('ShippingProfile')} style={{ marginTop: spacing.sm }} />
          </View>
        ) : null}

        {rates.length ? (
          <View style={styles.ratesWrap}>
            <Text style={styles.rateTitle}>Choose a shipping service</Text>
            {rates.slice(0, 8).map((rate) => {
              const selected = selectedRateId === rate.object_id;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  key={rate.object_id}
                  onPress={() => setSelectedRateId(rate.object_id)}
                  style={[styles.rateCard, selected && styles.rateCardSelected]}
                >
                  <View style={styles.radioOuter}>{selected ? <View style={styles.radioInner} /> : null}</View>
                  <View style={styles.rateBody}>
                    <Text style={styles.rateName}>{rateName(rate)}</Text>
                    <Text style={styles.help}>{rateDays(rate)}</Text>
                  </View>
                  <Text style={styles.ratePrice}>{money(rate.amount, rate.currency || order.currency)}</Text>
                </Pressable>
              );
            })}
            <Button title="Purchase selected label" icon="card-outline" onPress={confirmPurchase} loading={buyingLabel} disabled={!selectedRateId} style={{ marginTop: spacing.md }} />
            <Button title="Cancel rate selection" variant="ghost" onPress={() => { setRates([]); setSelectedRateId(''); }} style={{ marginTop: spacing.sm }} />
          </View>
        ) : null}
      </View>

      <Text style={styles.label}>Manual fulfillment status</Text>
      <View style={styles.pills}>{['processing', 'shipped', 'completed', 'cancelled'].map((item) => <Pill key={item} label={item} active={status === item} onPress={() => setStatus(item)} />)}</View>
      <Field label="Tracking number" value={tracking} onChangeText={setTracking} autoCapitalize="characters" />
      <Button title="Save order update" onPress={save} loading={saving} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: 50 },
  title: { color: colors.text, fontSize: 29, fontWeight: '900', marginBottom: spacing.lg },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.lg, marginBottom: spacing.lg },
  sectionTitle: { color: colors.text, fontWeight: '900', fontSize: 18, marginBottom: spacing.md },
  body: { color: colors.muted, lineHeight: 21 },
  itemRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: spacing.md },
  itemName: { color: colors.text, fontWeight: '800' },
  itemMeta: { color: colors.muted, fontSize: 12, marginTop: 3 },
  itemNet: { color: colors.primary, fontWeight: '900' },
  netRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.lg },
  netLabel: { color: colors.text, fontWeight: '900' },
  net: { color: colors.primary, fontWeight: '900', fontSize: 19 },
  label: { color: colors.text, fontWeight: '900', marginBottom: spacing.sm },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.lg },
  labelHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  labelHeaderText: { flex: 1 },
  help: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  labelReady: { backgroundColor: colors.meadow, borderRadius: radii.md, padding: spacing.md },
  labelReadyTitle: { color: colors.text, fontWeight: '900' },
  trackingText: { color: colors.success, fontWeight: '900', marginTop: 5, marginBottom: 3 },
  testBadge: { alignSelf: 'flex-start', color: colors.primary, backgroundColor: colors.surfaceMuted, borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 4, fontSize: 10, fontWeight: '900', marginTop: spacing.sm },
  processingBox: { backgroundColor: colors.surfaceMuted, borderRadius: radii.md, padding: spacing.md },
  ratesWrap: { marginTop: spacing.sm },
  rateTitle: { color: colors.text, fontWeight: '900', fontSize: 16, marginBottom: spacing.md },
  rateCard: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.sm },
  rateCardSelected: { borderColor: colors.primary, backgroundColor: colors.surfaceMuted },
  radioOuter: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  rateBody: { flex: 1 },
  rateName: { color: colors.text, fontWeight: '900', marginBottom: 2 },
  ratePrice: { color: colors.primary, fontWeight: '900', fontSize: 16, marginLeft: spacing.sm },
});
