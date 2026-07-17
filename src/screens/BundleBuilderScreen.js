import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Image, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, EmptyState, Field, Loading } from '../components/UI';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { decodeHtml, money } from '../lib/format';
import { colors, radii, spacing } from '../theme';

function normalizeGroups(result) {
  if (!result) return [];
  if (Array.isArray(result.sellers)) {
    return result.sellers.map((group) => ({
      sellerId: group.seller_id || group.id,
      sellerName: group.seller_name || group.store_name || 'Seller',
      products: group.products || group.items || [],
    }));
  }
  const items = Array.isArray(result) ? result : (result.items || result.products || []);
  const bySeller = new Map();
  items.forEach((item) => {
    const sellerId = item.seller_id || item.seller?.id || 'unknown';
    if (!bySeller.has(sellerId)) {
      bySeller.set(sellerId, {
        sellerId,
        sellerName: item.seller_name || item.seller?.store_name || 'Seller',
        products: [],
      });
    }
    bySeller.get(sellerId).products.push(item);
  });
  return Array.from(bySeller.values());
}

export default function BundleBuilderScreen({ navigation }) {
  const { token } = useAuth();
  const [groups, setGroups] = useState([]);
  const [prices, setPrices] = useState({});
  const [submitting, setSubmitting] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const result = await api.getBundleBuilder(token);
      setGroups(normalizeGroups(result));
      setError('');
    } catch (err) {
      setError(err.message || 'Your bundle builder could not be loaded.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function propose(group) {
    const raw = prices[group.sellerId];
    const offerPrice = Number(String(raw || '').replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(offerPrice) || offerPrice <= 0) {
      Alert.alert('Enter a bundle price', 'Type the total price you would like to offer for this bundle.');
      return;
    }
    setSubmitting(String(group.sellerId));
    try {
      const result = await api.createOffer({
        type: 'bundle',
        product_ids: group.products.map((item) => item.id || item.product_id),
        offer_price: offerPrice,
      }, token);
      const offer = result?.offer || result;
      Alert.alert(
        'Bundle offer sent',
        'The seller can accept, decline, or counter your bundle offer.',
        [{ text: 'View my offers', onPress: () => navigation.replace('Offers', { focusId: offer?.id }) }]
      );
    } catch (err) {
      Alert.alert('Could not send bundle offer', err.message || 'All items must be from the same seller. Please try again.');
    } finally {
      setSubmitting('');
    }
  }

  if (loading) return <Loading label="Loading your bundle…" />;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      {error ? <EmptyState icon="cloud-offline-outline" title="Bundle unavailable" message={error} action="Try again" onAction={load} /> : null}
      {!error && !groups.length ? <EmptyState icon="albums-outline" title="No bundle items yet" message="Add items from a product page to build a bundle and make one offer to the seller." action="Browse the shop" onAction={() => navigation.resetToTab('Shop')} /> : null}
      {groups.map((group) => (
        <View key={String(group.sellerId)} style={styles.card}>
          <Text style={styles.sellerName}>{decodeHtml(group.sellerName)}</Text>
          {group.products.map((item) => (
            <View key={item.id || item.product_id} style={styles.itemRow}>
              {item.image ? <Image source={{ uri: item.image }} style={styles.thumb} /> : null}
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName} numberOfLines={2}>{decodeHtml(item.name || 'Product')}</Text>
                <Text style={styles.itemPrice}>{money(item.price, item.currency)}</Text>
              </View>
            </View>
          ))}
          <Field
            label="Your bundle offer"
            value={prices[group.sellerId] || ''}
            onChangeText={(value) => setPrices((current) => ({ ...current, [group.sellerId]: value }))}
            keyboardType="decimal-pad"
            placeholder="0.00"
            containerStyle={{ marginTop: spacing.md }}
          />
          <Button title="Send bundle offer" onPress={() => propose(group)} loading={submitting === String(group.sellerId)} />
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 45 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.lg, marginBottom: spacing.md },
  sellerName: { color: colors.text, fontWeight: '900', fontSize: 18, marginBottom: spacing.md },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  thumb: { width: 52, height: 52, borderRadius: radii.md, backgroundColor: colors.surfaceMuted },
  itemName: { color: colors.text, fontWeight: '800' },
  itemPrice: { color: colors.primary, fontWeight: '900', marginTop: 3 },
});
