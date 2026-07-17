import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppHeader from '../components/AppHeader';
import { Button, EmptyState } from '../components/UI';
import { useCart } from '../context/CartContext';
import { decodeHtml, money } from '../lib/format';
import { colors, radii, spacing } from '../theme';

function maxQuantity(product) {
  const stock = Number(product?.stock_quantity);
  if (Number.isFinite(stock)) return Math.max(0, Math.min(99, Math.floor(stock)));
  return product?.stock_status === 'outofstock' ? 0 : 99;
}

export default function CartScreen({ navigation }) {
  const { items, itemCount, subtotal, setQuantity, removeItem } = useCart();
  const currency = items[0]?.product?.currency || 'USD';
  const hasUnavailableItems = items.some(({ product }) => product.stock_status === 'outofstock' || maxQuantity(product) < 1);

  return (
    <View style={styles.screen}>
      <AppHeader title="Cart" subtitle={`${itemCount} item${itemCount === 1 ? '' : 's'}`} onProfile={() => navigation.switchTab('Account')} />
      {!items.length ? (
        <EmptyState icon="bag-outline" title="Your cart is empty" message="Browse handmade goods and add something special." action="Browse the shop" onAction={() => navigation.switchTab('Shop')} />
      ) : (
        <>
          <ScrollView style={styles.list} contentContainerStyle={styles.content}>
            {items.map(({ product, quantity }) => {
              const limit = maxQuantity(product);
              const unavailable = product.stock_status === 'outofstock' || limit < 1;
              return (
                <View key={product.id} style={styles.itemCard}>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Open ${decodeHtml(product.name || product.title)}`} onPress={() => navigation.push('Product', { productId: product.id })}>
                    <Image source={{ uri: product.image }} style={styles.image} />
                  </Pressable>
                  <View style={styles.itemBody}>
                    <Text numberOfLines={2} style={styles.name}>{decodeHtml(product.name || product.title)}</Text>
                    <Text style={styles.price}>{money(Number(product.price) * quantity, product.currency)}</Text>
                    {unavailable ? (
                      <Text style={styles.unavailable}>No longer available—remove this item to continue.</Text>
                    ) : Number.isFinite(Number(product.stock_quantity)) ? (
                      <Text style={styles.stock}>{limit} available</Text>
                    ) : null}
                    <View style={styles.actionsRow}>
                      {!unavailable ? (
                        <View style={styles.stepper}>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={quantity === 1 ? 'Remove item' : 'Decrease quantity'}
                            style={styles.stepperButton}
                            onPress={() => quantity === 1 ? removeItem(product.id) : setQuantity(product.id, quantity - 1)}
                          >
                            <Ionicons name={quantity === 1 ? 'trash-outline' : 'remove'} size={18} color={colors.primary} />
                          </Pressable>
                          <Text accessibilityLabel={`Quantity ${quantity}`} style={styles.quantity}>{quantity}</Text>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Increase quantity"
                            disabled={quantity >= limit}
                            style={[styles.stepperButton, quantity >= limit && styles.disabled]}
                            onPress={() => setQuantity(product.id, quantity + 1)}
                          >
                            <Ionicons name="add" size={18} color={colors.primary} />
                          </Pressable>
                        </View>
                      ) : <View />}
                      <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${decodeHtml(product.name || product.title)} from cart`} onPress={() => removeItem(product.id)} hitSlop={8}>
                        <Text style={styles.remove}>Remove</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              );
            })}
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Subtotal</Text><Text style={styles.summaryValue}>{money(subtotal, currency)}</Text></View>
              <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Shipping</Text><Text style={styles.estimate}>Calculated securely</Text></View>
              <Text style={styles.note}>Taxes and shipping are finalized by MyNest before payment. Checkout uses secure native Stripe payments.</Text>
            </View>
            {hasUnavailableItems ? <Text style={styles.checkoutWarning}>Remove unavailable items before continuing to checkout.</Text> : null}
          </ScrollView>

          <View style={styles.checkoutFooter}>
            <View style={styles.footerTotal}>
              <Text style={styles.footerLabel}>Cart subtotal</Text>
              <Text style={styles.footerValue}>{money(subtotal, currency)}</Text>
            </View>
            <Button
              title="Continue to checkout"
              icon="card-outline"
              onPress={() => navigation.push('Checkout')}
              disabled={hasUnavailableItems}
              style={styles.checkoutButton}
            />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.lg },
  itemCard: { flexDirection: 'row', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.md, marginBottom: spacing.md },
  image: { width: 96, height: 96, borderRadius: radii.md, backgroundColor: colors.surfaceMuted },
  itemBody: { flex: 1, marginLeft: spacing.md },
  name: { color: colors.text, fontWeight: '900', fontSize: 16 },
  price: { color: colors.primary, fontWeight: '900', marginTop: 6, fontSize: 16 },
  stock: { color: colors.muted, fontSize: 11, marginTop: 3 },
  unavailable: { color: colors.danger, fontSize: 11, lineHeight: 16, fontWeight: '800', marginTop: 4 },
  actionsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radii.pill },
  stepperButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  quantity: { minWidth: 25, textAlign: 'center', fontWeight: '900', color: colors.text },
  disabled: { opacity: 0.35 },
  remove: { color: colors.danger, fontWeight: '800', fontSize: 12 },
  summaryCard: { backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginTop: spacing.md },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  summaryLabel: { color: colors.muted, fontWeight: '700' },
  summaryValue: { color: colors.text, fontWeight: '900', fontSize: 20 },
  estimate: { color: colors.primary, fontWeight: '800' },
  note: { color: colors.muted, lineHeight: 20, fontSize: 13, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  checkoutWarning: { color: colors.danger, fontWeight: '800', textAlign: 'center', marginTop: spacing.md },
  checkoutFooter: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md },
  footerTotal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  footerLabel: { color: colors.muted, fontWeight: '800' },
  footerValue: { color: colors.text, fontWeight: '900', fontSize: 18 },
  checkoutButton: { minHeight: 52 },
});
