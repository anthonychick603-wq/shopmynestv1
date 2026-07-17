import React, { useState } from 'react';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';
import { Button, Field, Screen } from '../components/UI';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { decodeHtml, money } from '../lib/format';
import { colors, radii, spacing } from '../theme';

export default function MakeOfferScreen({ navigation, route }) {
  const { token } = useAuth();
  const product = route.product || {};
  const [price, setPrice] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    const offerPrice = Number(String(price).replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(offerPrice) || offerPrice <= 0) {
      Alert.alert('Enter an offer', 'Type the price you would like to offer.');
      return;
    }
    setSaving(true);
    try {
      const result = await api.createOffer({
        type: 'single',
        product_ids: [product.id],
        offer_price: offerPrice,
      }, token);
      const offer = result?.offer || result;
      route.onCreated?.();
      Alert.alert(
        'Offer sent',
        'The seller has been notified and can accept, decline, or counter your offer.',
        [{ text: 'View my offers', onPress: () => navigation.replace('Offers', { focusId: offer?.id }) }]
      );
    } catch (err) {
      Alert.alert('Could not send offer', err.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen scroll contentContainerStyle={styles.content}>
      <Text style={styles.title}>Make an offer</Text>
      <View style={styles.productCard}>
        {product.image ? <Image source={{ uri: product.image }} style={styles.thumb} /> : null}
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={2}>{decodeHtml(product.name || 'Product')}</Text>
          <Text style={styles.listed}>Listed at {money(product.price, product.currency)}</Text>
        </View>
      </View>

      <Field
        label="Your offer"
        value={price}
        onChangeText={setPrice}
        keyboardType="decimal-pad"
        placeholder="0.00"
      />
      <Text style={styles.help}>Offers are valid for 48 hours. The seller can accept, decline, or send a counter offer.</Text>

      <Button title="Send offer" onPress={submit} loading={saving} style={{ marginTop: spacing.lg }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: 50 },
  title: { color: colors.text, fontSize: 27, fontWeight: '900', marginBottom: spacing.lg },
  productCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.md, marginBottom: spacing.lg },
  thumb: { width: 64, height: 64, borderRadius: radii.md, backgroundColor: colors.surfaceMuted },
  name: { color: colors.text, fontWeight: '900' },
  listed: { color: colors.muted, marginTop: 4 },
  help: { color: colors.muted, fontSize: 12, lineHeight: 18 },
});
