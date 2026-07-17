import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing } from '../theme';
import { decodeHtml, money } from '../lib/format';
import FavoriteButton from './FavoriteButton';

function isProductUnavailable(product) {
  const stock = Number(product?.stock_quantity);
  return product?.stock_status === 'outofstock' || (Number.isFinite(stock) && stock <= 0);
}

export default function ProductCard({ product, onPress, onAdd, compact = false }) {
  const outOfStock = isProductUnavailable(product);
  const productName = decodeHtml(product.name || product.title || 'Product');

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${productName}`} onPress={onPress} style={({ pressed }) => [styles.card, compact && styles.compactCard, pressed && styles.pressed]}>
      <View>
        <Image source={{ uri: product.image }} style={[styles.image, compact && styles.compactImage]} resizeMode="cover" />
        {outOfStock ? <View style={styles.soldOutBadge}><Text style={styles.soldOutText}>Sold out</Text></View> : null}
        {product.id ? <FavoriteButton productId={product.id} style={styles.favorite} /> : null}
      </View>
      <View style={styles.body}>
        <Text numberOfLines={2} style={styles.name}>{productName}</Text>
        <Text numberOfLines={1} style={styles.seller}>{decodeHtml(product.seller?.store_name || product.author?.store_name || 'MyNest seller')}</Text>
        <View style={styles.bottomRow}>
          <Text style={styles.price}>{money(product.price, product.currency)}</Text>
          {onAdd && !outOfStock ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`Add ${productName} to cart`} onPress={(event) => { event.stopPropagation?.(); onAdd(); }} style={styles.addButton}>
              <Ionicons name="add" size={22} color={colors.onPrimary} />
            </Pressable>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, backgroundColor: colors.surface, borderRadius: radii.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, minWidth: 0 },
  compactCard: { borderRadius: radii.md },
  image: { width: '100%', aspectRatio: 1, backgroundColor: colors.surfaceMuted },
  compactImage: { aspectRatio: 0.95 },
  favorite: { position: 'absolute', right: 9, top: 9 },
  soldOutBadge: { position: 'absolute', left: 9, top: 9, backgroundColor: 'rgba(0, 0, 0, 0.82)', borderRadius: radii.pill, paddingHorizontal: 9, paddingVertical: 5 },
  soldOutText: { color: colors.white, fontWeight: '900', fontSize: 11 },
  body: { padding: spacing.md },
  name: { color: colors.text, fontWeight: '900', fontSize: 15, minHeight: 38 },
  seller: { color: colors.muted, fontSize: 12, marginTop: 4 },
  bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md, gap: 8 },
  price: { color: colors.primary, fontWeight: '900', fontSize: 16, flexShrink: 1 },
  addButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.82 },
});
