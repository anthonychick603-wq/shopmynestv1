import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppHeader from '../components/AppHeader';
import ProductCard from '../components/ProductCard';
import { Avatar, EmptyState, Loading } from '../components/UI';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { api } from '../lib/api';
import { dateLabel, decodeHtml } from '../lib/format';
import { colors, radii, spacing } from '../theme';

export default function HomeScreen({ navigation }) {
  const { token } = useAuth();
  const { addItem, itemCount } = useCart();
  const [feed, setFeed] = useState([]);
  const [mode, setMode] = useState('discover');
  const [currency, setCurrency] = useState('USD');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const result = await api.getFeed({ page: 1, per_page: 30 }, token);
      setFeed(result?.items || []);
      setMode(result?.mode || 'discover');
    } catch (err) {
      setError(err.message || 'The feed could not be loaded.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    api.getConfig()
      .then((config) => setCurrency(config?.currency || 'USD'))
      .catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <View style={styles.screen}>
      <AppHeader
        title="The Nest"
        subtitle={mode === 'following' ? 'New from shops you follow' : 'Handmade finds and maker stories'}
        cartCount={itemCount}
        onCart={() => navigation.switchTab('Cart')}
        onProfile={() => navigation.switchTab('Account')}
      />
      {loading ? <Loading label="Building your feed…" /> : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          contentContainerStyle={styles.content}
        >
          {error ? (
            <EmptyState icon="cloud-offline-outline" title="Feed unavailable" message={error} action="Try again" onAction={load} />
          ) : null}
          {!error && !feed.length ? (
            <EmptyState icon="sparkles-outline" title="Your Nest is getting ready" message="New listings and seller posts will appear here." action="Browse the shop" onAction={() => navigation.switchTab('Shop')} />
          ) : null}
          {feed.map((item) => item.type === 'product' ? (
            <View key={`product-${item.id}`} style={styles.feedCardWrap}>
              <ProductCard
                product={{
                  ...item,
                  name: item.title,
                  seller: item.author,
                  currency,
                }}
                onPress={() => navigation.push('Product', { productId: item.id })}
                onAdd={async () => {
                  try {
                    const product = await api.getProduct(item.id);
                    const stock = Number(product.stock_quantity);
                    const unavailable = product.stock_status !== 'instock' || (Number.isFinite(stock) && stock <= 0);
                    if (unavailable) {
                      Alert.alert('Currently unavailable', 'This item is no longer in stock.');
                      return;
                    }
                    const added = addItem(product, 1);
                    Alert.alert(
                      added ? 'Added to cart' : 'Currently unavailable',
                      added ? `${decodeHtml(product.name)} is in your cart.` : 'This item is no longer available to add to your cart.'
                    );
                  } catch (err) {
                    Alert.alert('Could not add item', err.message || 'Try opening the product and adding it again.');
                  }
                }}
              />
            </View>
          ) : (
            <Pressable accessibilityRole="button" key={`post-${item.id}`} style={styles.postCard}>
              <View style={styles.authorRow}>
                <Avatar uri={item.author?.avatar} name={item.author?.store_name} size={42} />
                <View style={styles.authorText}>
                  <Text style={styles.storeName}>{decodeHtml(item.author?.store_name || 'MyNest seller')}</Text>
                  <Text style={styles.date}>{dateLabel(item.date)}</Text>
                </View>
              </View>
              <Text style={styles.postTitle}>{decodeHtml(item.title)}</Text>
              <Text style={styles.postBody}>{decodeHtml(item.excerpt || item.content)}</Text>
              {item.image ? <Image source={{ uri: item.image }} resizeMode="cover" style={styles.postImage} /> : null}
              <View style={styles.postFooter}>
                <Ionicons name="chatbubble-outline" size={17} color={colors.muted} />
                <Text style={styles.comments}>{item.comments || 0} comments</Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, paddingBottom: 36 },
  feedCardWrap: { marginBottom: spacing.lg },
  postCard: { backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.lg },
  authorRow: { flexDirection: 'row', alignItems: 'center' },
  authorText: { marginLeft: spacing.md, flex: 1 },
  storeName: { color: colors.text, fontWeight: '900' },
  date: { color: colors.muted, fontSize: 12, marginTop: 2 },
  postTitle: { color: colors.text, fontSize: 20, fontWeight: '900', marginTop: spacing.lg },
  postBody: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: spacing.sm },
  postImage: { width: '100%', aspectRatio: 1.35, borderRadius: radii.md, marginTop: spacing.lg, backgroundColor: colors.surfaceMuted },
  postFooter: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.md },
  comments: { color: colors.muted, fontSize: 12, fontWeight: '700' },
});
