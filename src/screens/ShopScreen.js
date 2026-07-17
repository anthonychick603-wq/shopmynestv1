import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppHeader from '../components/AppHeader';
import ProductCard from '../components/ProductCard';
import { EmptyState, Loading, Pill } from '../components/UI';
import { useCart } from '../context/CartContext';
import { api } from '../lib/api';
import { decodeHtml } from '../lib/format';
import { colors, radii, spacing } from '../theme';

export default function ShopScreen({ navigation }) {
  const { addItem, itemCount } = useCart();
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [category, setCategory] = useState(0);
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [sort, setSort] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadProducts = useCallback(async () => {
    setError('');
    try {
      const result = await api.getProducts({
        per_page: 50,
        category: category || undefined,
        search: submittedSearch || undefined,
        sort: sort || undefined,
      });
      setProducts(result?.items || []);
    } catch (err) {
      setError(err.message || 'Products could not be loaded.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [category, sort, submittedSearch]);

  useEffect(() => {
    api.getCategories()
      .then((items) => setCategories(Array.isArray(items) ? items : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    loadProducts();
  }, [loadProducts]);

  if (loading && !products.length) {
    return (
      <View style={styles.screen}>
        <AppHeader
          title="Shop"
          subtitle="Find something made with care"
          cartCount={itemCount}
          onCart={() => navigation.switchTab('Cart')}
          onProfile={() => navigation.switchTab('Account')}
        />
        <Loading label="Loading the shop…" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <AppHeader
        title="Shop"
        subtitle="Find something made with care"
        cartCount={itemCount}
        onCart={() => navigation.switchTab('Cart')}
        onProfile={() => navigation.switchTab('Account')}
      />

      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={20} color={colors.muted} />
          <TextInput
            accessibilityLabel="Search products and makers"
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={() => setSubmittedSearch(search.trim())}
            returnKeyType="search"
            placeholder="Search products and makers"
            placeholderTextColor={colors.placeholder}
            style={styles.searchInput}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Search"
          style={styles.searchButton}
          onPress={() => setSubmittedSearch(search.trim())}
        >
          <Ionicons name="arrow-forward" size={22} color={colors.onPrimary} />
        </Pressable>
      </View>

      <View style={styles.filtersWrap}>
        <FlatList
          horizontal
          data={[{ id: 0, name: 'All' }, ...categories]}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.categoryList}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item }) => (
            <Pill
              label={decodeHtml(item.name)}
              active={category === item.id}
              onPress={() => setCategory(item.id)}
            />
          )}
          style={styles.categoryBar}
        />

        <View style={styles.sortRow}>
          {[['', 'Newest'], ['popular', 'Popular'], ['price_asc', 'Price ↑'], ['price_desc', 'Price ↓']].map(([value, label]) => (
            <Pill
              key={label}
              label={label}
              active={sort === value}
              onPress={() => setSort(value)}
            />
          ))}
        </View>
      </View>

      {error ? (
        <EmptyState
          icon="cloud-offline-outline"
          title="Shop unavailable"
          message={error}
          action="Try again"
          onAction={loadProducts}
        />
      ) : (
        <FlatList
          data={products}
          numColumns={2}
          keyExtractor={(item) => String(item.id)}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.productList}
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            loadProducts();
          }}
          ListEmptyComponent={(
            <EmptyState
              icon="search-outline"
              title="No products found"
              message="Try a different search or category."
            />
          )}
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
                    added
                      ? `${decodeHtml(item.name)} is in your cart.`
                      : 'This item is no longer available to add to your cart.'
                  );
                }}
              />
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 9,
    paddingHorizontal: spacing.lg,
  },
  searchBox: {
    flex: 1,
    height: 50,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    color: colors.text,
    fontSize: 15,
  },
  searchButton: {
    width: 50,
    height: 50,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filtersWrap: {
    flexShrink: 0,
    paddingTop: spacing.md,
  },
  categoryBar: {
    flexGrow: 0,
    flexShrink: 0,
    height: 48,
  },
  categoryList: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: 4,
    gap: 8,
    alignItems: 'center',
  },
  sortRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: spacing.lg,
    paddingTop: 8,
    paddingBottom: spacing.md,
  },
  productList: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 34,
  },
  row: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  cardSlot: {
    flex: 1,
    maxWidth: '50%',
  },
});
