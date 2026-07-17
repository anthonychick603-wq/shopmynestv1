import React, { useState } from 'react';
import { Alert, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Screen } from '../components/UI';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { decodeHtml } from '../lib/format';
import { colors, radii, spacing } from '../theme';

// Only 3day/7day are supported by the nest-trust/v1 backend today.
const TIERS = [
  ['3day', '3 days', 'Our most popular boost window.'],
  ['7day', '7 days', 'Maximum exposure for a full week.'],
];

export default function BoostScreen({ navigation, route }) {
  const { token } = useAuth();
  const product = route.product || {};
  const [tier, setTier] = useState('3day');
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      const result = await api.createBoost({ product_id: product.id, tier }, token);
      const url = result?.checkout_url;
      if (!url) throw new Error('No checkout link was returned for this boost.');
      const supported = await Linking.canOpenURL(url);
      if (!supported) throw new Error('The boost checkout page could not be opened.');
      await Linking.openURL(url);
      Alert.alert(
        'Finish your boost',
        'Complete the boost payment in your browser. Your listing is boosted automatically once the payment is confirmed.',
        [{ text: 'Done', onPress: () => navigation.goBack() }]
      );
    } catch (err) {
      Alert.alert('Could not start boost', err.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen scroll contentContainerStyle={styles.content}>
      <Text style={styles.title}>Boost this listing</Text>
      <Text style={styles.subtitle}>Boosted listings rank higher in the personalized feed and shop results.</Text>

      <View style={styles.productCard}>
        {product.image ? <Image source={{ uri: product.image }} style={styles.thumb} /> : null}
        <Text style={styles.name} numberOfLines={2}>{decodeHtml(product.name || 'Product')}</Text>
      </View>

      <Text style={styles.label}>Choose a boost length</Text>
      {TIERS.map(([value, labelText, description]) => {
        const active = tier === value;
        return (
          <Pressable
            key={value}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            onPress={() => setTier(value)}
            style={[styles.tierCard, active && styles.tierCardActive]}
          >
            <View style={styles.radioOuter}>{active ? <View style={styles.radioInner} /> : null}</View>
            <View style={{ flex: 1 }}>
              <Text style={styles.tierName}>{labelText}</Text>
              <Text style={styles.tierDesc}>{description}</Text>
            </View>
            <Ionicons name="rocket-outline" size={22} color={active ? colors.primary : colors.muted} />
          </Pressable>
        );
      })}

      <Text style={styles.help}>Boosts are purchased as a WooCommerce order. Pricing is set by MyNest and shown at checkout.</Text>
      <Button title="Continue to boost checkout" icon="rocket-outline" onPress={submit} loading={saving} style={{ marginTop: spacing.lg }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: 50 },
  title: { color: colors.text, fontSize: 27, fontWeight: '900' },
  subtitle: { color: colors.muted, lineHeight: 21, marginTop: 6, marginBottom: spacing.lg },
  productCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.md, marginBottom: spacing.lg },
  thumb: { width: 56, height: 56, borderRadius: radii.md, backgroundColor: colors.surfaceMuted },
  name: { color: colors.text, fontWeight: '900', flex: 1 },
  label: { color: colors.text, fontWeight: '900', marginBottom: spacing.sm },
  tierCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.sm, backgroundColor: colors.surface },
  tierCardActive: { borderColor: colors.primary, backgroundColor: colors.surfaceMuted },
  radioOuter: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  tierName: { color: colors.text, fontWeight: '900' },
  tierDesc: { color: colors.muted, fontSize: 12, marginTop: 2 },
  help: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: spacing.md },
});
