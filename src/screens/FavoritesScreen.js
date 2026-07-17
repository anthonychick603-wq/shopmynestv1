import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import ProductCard from '../components/ProductCard';
import { EmptyState, Loading } from '../components/UI';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useFavorites } from '../context/FavoritesContext';
import { api } from '../lib/api';
import { decodeHtml } from '../lib/format';
import { colors, spacing } from '../theme';

export default function FavoritesScreen({ navigation }) {
  const { token } = useAuth();
  const { addItem } = useCart();
  const { favoriteIds, loaded, refresh } = useFavorites();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) { setLoading(false); setRefreshing(false); return; }
    const ids = Array.from(favoriteIds);
    if (!ids.length) { setProducts([]); setLoading(false); setRefreshing(false); return; }
    try {
      const results = await Promise.all(ids.map((id) => api.getProduct(id).catch(() => null)));
      setProducts(results.filter(Boolean));
    } catch {
      // Keep whatever loaded successfully.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [favoriteIds, token]);

  useEffect(() => { if (loaded) load(); }, [load, loaded]);

  if (!token) {
    return <EmptyState icon="heart-outline" title="Sign in to see favorites" message="Save the pieces you love and find them here." action="Sign in" onAction={() => navigation.push('Auth', { mode: 'login' })} />;
  }
  if (loading) return <Loading label="Loading your favorites…" />;

  return (
    <View style={styles.screen}>
      <FlatList
        data={products}
        numColumns={2}
        keyExtractor={(item) => String(item.id)}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.content}
        refreshing={refreshing}
        onRefresh={() => { setRefreshing(true); refresh().then(load); }}
        ListEmptyComponent={<EmptyState icon="heart-outline" title="No favorites yet" message="Tap the heart on any listing to save it here." action="Browse the shop" onAction={() => navigation.resetToTab('Shop')} />}
        renderItem={({ item }) => (
          <View style={styles.cardSlot}>
            <ProductCard
              compact
              product={item}
              onPress={() => navigation.push('Product', { productId: item.id })}
              onAdd={() => {
                const added = addItem(item, 1);
                Alert.alert(
                  added ? 'Added to cart' : 'Item unavailable',
                  added ? `${decodeHtml(item.name)} is in your cart.` : 'This item is no longer available to add to your cart.'
                );
              }}
            />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 34 },
  row: { gap: spacing.md, marginBottom: spacing.md },
  cardSlot: { flex: 1, maxWidth: '50%' },
});
