import React, { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, EmptyState, Field, Loading, Pill } from '../components/UI';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { api } from '../lib/api';
import { dateLabel, humanize, money } from '../lib/format';
import { colors, radii, spacing } from '../theme';

const FILTERS = [['', 'All'], ['pending', 'Pending'], ['countered', 'Countered'], ['accepted', 'Accepted'], ['declined', 'Declined']];

export default function OffersScreen({ navigation }) {
  const { token, user } = useAuth();
  const { addItem } = useCart();
  const [offers, setOffers] = useState([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [counteringId, setCounteringId] = useState('');
  const [counterPrice, setCounterPrice] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const result = await api.getOffers({ status: status || undefined }, token);
      setOffers(Array.isArray(result) ? result : (result?.offers || result?.items || []));
    } catch (err) {
      setError(err.message || 'Your offers could not be loaded.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [status, token]);

  useEffect(() => { load(); }, [load]);

  async function act(offer, action, price) {
    setBusyId(String(offer.id));
    try {
      const payload = { action };
      if (action === 'counter') payload.counter_price = price;
      await api.updateOffer(offer.id, payload, token);
      setCounteringId('');
      setCounterPrice('');
      await load();
    } catch (err) {
      Alert.alert('Could not update offer', err.message || 'Please try again.');
    } finally {
      setBusyId('');
    }
  }

  function submitCounter(offer) {
    const price = Number(String(counterPrice).replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(price) || price <= 0) {
      Alert.alert('Enter a counter price', 'Type the price you would like to counter with.');
      return;
    }
    act(offer, 'counter', price);
  }

  async function completePurchase(offer) {
    const ids = offer.product_ids || (offer.products || []).map((item) => item.id || item.product_id);
    if (!ids?.length) {
      Alert.alert('Offer unavailable', 'This offer has no items to purchase.');
      return;
    }
    setBusyId(String(offer.id));
    try {
      const products = await Promise.all(ids.map((id) => api.getProduct(id)));
      let addedAny = false;
      products.forEach((product) => { if (addItem(product, 1)) addedAny = true; });
      if (!addedAny) throw new Error('These items are no longer available.');
      navigation.push('Checkout', { offerToken: offer.checkout_token || offer.token, offerId: offer.id });
    } catch (err) {
      Alert.alert('Could not start checkout', err.message || 'Please try again.');
    } finally {
      setBusyId('');
    }
  }

  if (loading) return <Loading label="Loading your offers…" />;

  return (
    <View style={styles.screen}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow} style={styles.filterBar}>
        {FILTERS.map(([value, labelText]) => (
          <Pill key={value || 'all'} label={labelText} active={status === value} onPress={() => { setLoading(true); setStatus(value); }} />
        ))}
      </ScrollView>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
        {error ? <EmptyState icon="cloud-offline-outline" title="Offers unavailable" message={error} action="Try again" onAction={load} /> : null}
        {!error && !offers.length ? <EmptyState icon="pricetags-outline" title="No offers yet" message="Offers you make or receive will appear here." /> : null}
        {offers.map((offer) => {
          const amSeller = String(offer.seller_id ?? offer.seller?.id) === String(user?.id);
          const price = offer.counter_price || offer.offer_price;
          const busy = busyId === String(offer.id);
          return (
            <View key={offer.id} style={styles.card}>
              <View style={styles.topRow}>
                <Text style={styles.type}>{offer.type === 'bundle' ? 'Bundle offer' : 'Offer'}</Text>
                <Pill label={humanize(offer.status)} active />
              </View>
              {(offer.products || []).map((item) => (
                <Text key={item.id || item.product_id} style={styles.item} numberOfLines={1}>{item.name}</Text>
              ))}
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>{offer.counter_price ? 'Counter price' : 'Offer price'}</Text>
                <Text style={styles.price}>{money(price, offer.currency)}</Text>
              </View>
              {offer.created_at || offer.date ? <Text style={styles.date}>Sent {dateLabel(offer.created_at || offer.date)}</Text> : null}

              {offer.status === 'pending' && amSeller ? (
                counteringId === String(offer.id) ? (
                  <View style={styles.actionsCol}>
                    <Field label="Counter price" value={counterPrice} onChangeText={setCounterPrice} keyboardType="decimal-pad" placeholder="0.00" containerStyle={{ marginBottom: spacing.sm }} />
                    <Button title="Send counter" onPress={() => submitCounter(offer)} loading={busy} />
                    <Button title="Cancel" variant="ghost" onPress={() => { setCounteringId(''); setCounterPrice(''); }} style={{ marginTop: spacing.xs }} />
                  </View>
                ) : (
                  <View style={styles.actionsRow}>
                    <Button title="Accept" onPress={() => act(offer, 'accept')} loading={busy} style={styles.actionButton} />
                    <Button title="Counter" variant="secondary" onPress={() => { setCounteringId(String(offer.id)); setCounterPrice(''); }} style={styles.actionButton} />
                    <Button title="Decline" variant="outline" onPress={() => act(offer, 'decline')} loading={busy} style={styles.actionButton} />
                  </View>
                )
              ) : null}

              {offer.status === 'countered' && !amSeller ? (
                <View style={styles.actionsRow}>
                  <Button title="Accept counter" onPress={() => act(offer, 'accept')} loading={busy} style={styles.actionButton} />
                  <Button title="Decline" variant="outline" onPress={() => act(offer, 'decline')} loading={busy} style={styles.actionButton} />
                </View>
              ) : null}

              {offer.status === 'accepted' && !amSeller && (offer.checkout_token || offer.token) ? (
                <Button title="Complete purchase" icon="bag-check-outline" onPress={() => completePurchase(offer)} loading={busy} style={{ marginTop: spacing.md }} />
              ) : null}

              {offer.status === 'pending' && !amSeller ? <Text style={styles.waiting}>Waiting for the seller to respond.</Text> : null}
              {offer.status === 'countered' && amSeller ? <Text style={styles.waiting}>Waiting for the buyer to respond.</Text> : null}
            </View>
          );
        })}
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
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: spacing.sm },
  type: { color: colors.text, fontWeight: '900', fontSize: 16 },
  item: { color: colors.muted, lineHeight: 21 },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md },
  priceLabel: { color: colors.text, fontWeight: '800' },
  price: { color: colors.primary, fontWeight: '900', fontSize: 18 },
  date: { color: colors.muted, fontSize: 12, marginTop: spacing.sm },
  actionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  actionsCol: { marginTop: spacing.md },
  actionButton: { flex: 1, minWidth: 0, paddingHorizontal: spacing.sm },
  waiting: { color: colors.muted, fontStyle: 'italic', marginTop: spacing.md, fontSize: 13 },
});
