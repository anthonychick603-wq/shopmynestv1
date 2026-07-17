import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar, Button, EmptyState, Loading, Screen } from '../components/UI';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { api } from '../lib/api';
import { decodeHtml, money } from '../lib/format';
import { colors, radii, spacing } from '../theme';

function availableQuantity(product) {
  const stock = Number(product?.stock_quantity);
  if (Number.isFinite(stock)) return Math.max(0, Math.min(99, Math.floor(stock)));
  return product?.stock_status === 'outofstock' ? 0 : 99;
}

export default function ProductScreen({ navigation, route }) {
  const { token } = useAuth();
  const { addItem } = useCart();
  const [product, setProduct] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api.getProduct(route.productId)
      .then((result) => {
        if (active) setProduct(result);
      })
      .catch((err) => {
        if (active) setError(err.message || 'Product not found.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [route.productId]);

  const maxQuantity = useMemo(() => availableQuantity(product), [product]);
  const isAvailable = product?.stock_status === 'instock' && maxQuantity > 0;

  useEffect(() => {
    if (isAvailable) setQuantity((current) => Math.max(1, Math.min(current, maxQuantity)));
  }, [isAvailable, maxQuantity]);

  function addToCart(goToCart = false) {
    if (!product || !isAvailable) return;
    const added = addItem(product, Math.min(quantity, maxQuantity));
    if (!added) {
      Alert.alert('Item unavailable', 'This item is no longer available to add to your cart.');
      return;
    }
    if (goToCart) navigation.switchTab('Cart');
    else Alert.alert('Added to cart', `${decodeHtml(product.name)} is in your cart.`);
  }

  function report() {
    if (!token) {
      navigation.push('Auth', { mode: 'login' });
      return;
    }
    Alert.alert('Report this listing', 'Choose the reason that best describes the problem.', [
      { text: 'Cancel', style: 'cancel' },
      ...['Prohibited item', 'Misleading listing', 'Copyright concern', 'Other'].map((reason) => ({
        text: reason,
        onPress: async () => {
          try {
            await api.reportProduct(product.id, reason, '', token);
            Alert.alert('Report received', 'Thank you. The MyNest team will review this listing.');
          } catch (err) {
            Alert.alert('Could not report', err.message || 'The report could not be submitted.');
          }
        },
      })),
    ]);
  }

  if (loading) return <Loading label="Loading product…" />;
  if (error || !product) return <EmptyState icon="alert-circle-outline" title="Product unavailable" message={error} action="Go back" onAction={navigation.goBack} />;

  const gallery = [product.image, ...(product.gallery || [])]
    .filter(Boolean)
    .filter((image, index, images) => images.indexOf(image) === index);

  return (
    <Screen scroll contentContainerStyle={styles.content}>
      <Image source={{ uri: product.image }} resizeMode="cover" style={styles.hero} />
      {gallery.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.galleryRow}>
          {gallery.map((image, index) => <Image key={`${image}-${index}`} source={{ uri: image }} style={styles.galleryImage} />)}
        </ScrollView>
      ) : null}
      <View style={styles.titleRow}>
        <View style={styles.titleWrap}>
          <Text style={styles.title}>{decodeHtml(product.name)}</Text>
          <Text style={styles.price}>{money(product.price, product.currency)}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Report listing" onPress={report} style={styles.reportButton}>
          <Ionicons name="flag-outline" size={20} color={colors.muted} />
        </Pressable>
      </View>
      <View style={styles.sellerCard}>
        <Avatar uri={product.seller?.avatar} name={product.seller?.store_name} size={48} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.sellerLabel}>Sold by</Text>
          <Text style={styles.sellerName}>{decodeHtml(product.seller?.store_name || 'MyNest seller')}</Text>
        </View>
      </View>
      <Text style={styles.description}>{decodeHtml(product.description || product.short_description || 'No description provided.')}</Text>
      <View style={styles.stockRow}>
        <Ionicons name={isAvailable ? 'checkmark-circle' : 'close-circle'} size={20} color={isAvailable ? colors.success : colors.danger} />
        <Text style={[styles.stockText, { color: isAvailable ? colors.success : colors.danger }]}>
          {isAvailable
            ? Number.isFinite(Number(product.stock_quantity)) ? `${maxQuantity} in stock` : 'In stock'
            : 'Out of stock'}
        </Text>
      </View>
      {isAvailable ? (
        <View style={styles.quantityRow}>
          <Text style={styles.quantityLabel}>Quantity</Text>
          <View style={styles.stepper}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Decrease quantity"
              disabled={quantity <= 1}
              style={[styles.stepperButton, quantity <= 1 && styles.disabled]}
              onPress={() => setQuantity((value) => Math.max(1, value - 1))}
            >
              <Ionicons name="remove" size={20} color={colors.primary} />
            </Pressable>
            <Text accessibilityLabel={`Quantity ${quantity}`} style={styles.quantity}>{quantity}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Increase quantity"
              disabled={quantity >= maxQuantity}
              style={[styles.stepperButton, quantity >= maxQuantity && styles.disabled]}
              onPress={() => setQuantity((value) => Math.min(maxQuantity, value + 1))}
            >
              <Ionicons name="add" size={20} color={colors.primary} />
            </Pressable>
          </View>
        </View>
      ) : null}
      <Button title="Add to cart" icon="bag-add-outline" onPress={() => addToCart(false)} disabled={!isAvailable} />
      <Button title="Buy now" variant="outline" onPress={() => addToCart(true)} disabled={!isAvailable} style={{ marginTop: 10 }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: 50 },
  hero: { width: '100%', aspectRatio: 1, borderRadius: radii.lg, backgroundColor: colors.surfaceMuted },
  galleryRow: { gap: spacing.sm, paddingTop: spacing.sm },
  galleryImage: { width: 90, height: 90, borderRadius: radii.md, backgroundColor: colors.surfaceMuted },
  titleRow: { flexDirection: 'row', marginTop: spacing.xl, alignItems: 'flex-start' },
  titleWrap: { flex: 1, paddingRight: spacing.md },
  title: { color: colors.text, fontSize: 28, lineHeight: 33, fontWeight: '900' },
  price: { color: colors.primary, fontSize: 23, fontWeight: '900', marginTop: spacing.sm },
  reportButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  sellerCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.md, marginTop: spacing.lg },
  sellerLabel: { color: colors.muted, fontSize: 12 },
  sellerName: { color: colors.text, fontWeight: '900', marginTop: 2 },
  description: { color: colors.muted, lineHeight: 24, fontSize: 16, marginTop: spacing.xl },
  stockRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: spacing.lg },
  stockText: { fontWeight: '900' },
  quantityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: spacing.xl },
  quantityLabel: { color: colors.text, fontWeight: '900', fontSize: 16 },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radii.pill, backgroundColor: colors.surface },
  stepperButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  quantity: { minWidth: 34, textAlign: 'center', fontWeight: '900', color: colors.text },
  disabled: { opacity: 0.35 },
});
