import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, EmptyState, Loading, Pill } from '../components/UI';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { decodeHtml, money } from '../lib/format';
import { colors, radii, spacing } from '../theme';

export default function SellerProductsScreen({ navigation }) {
  const { token } = useAuth();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { const result = await api.getMyProducts({ page: 1, per_page: 100 }, token); setProducts(result?.items || []); }
    catch (err) { Alert.alert('Products unavailable', err.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, [token]);
  useEffect(() => { load(); }, [load]);
  if (loading) return <Loading label="Loading your products…" />;

  function confirmDelete(product) {
    Alert.alert('Delete listing?', `${decodeHtml(product.name)} will be moved to Trash.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await api.deleteProduct(product.id, token); setProducts((current) => current.filter((item) => item.id !== product.id)); }
        catch (err) { Alert.alert('Could not delete', err.message); }
      } },
    ]);
  }

  return (
    <View style={styles.screen}>
      <View style={styles.toolbar}><Text style={styles.heading}>{products.length} listings</Text><Button title="Add product" icon="add" onPress={() => navigation.push('ProductEditor', { onSaved: load })} style={styles.addButton} /></View>
      <FlatList
        data={products}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.content}
        refreshing={refreshing}
        onRefresh={() => { setRefreshing(true); load(); }}
        ListEmptyComponent={<EmptyState icon="pricetag-outline" title="No products yet" message="Create your first handmade listing." action="Add product" onAction={() => navigation.push('ProductEditor', { onSaved: load })} />}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => navigation.push('ProductEditor', { product: item, onSaved: load })}>
            <Image source={{ uri: item.image }} style={styles.image} />
            <View style={styles.body}>
              <Text numberOfLines={2} style={styles.name}>{decodeHtml(item.name)}</Text>
              <Text style={styles.price}>{money(item.price, item.currency)}</Text>
              <View style={styles.metaRow}><Pill label={item.status || 'draft'} active={item.status === 'publish'} /><Text style={styles.stock}>{item.stock_quantity ?? 0} in stock</Text></View>
            </View>
            <Pressable onPress={() => confirmDelete(item)} hitSlop={8} style={styles.trash}><Ionicons name="trash-outline" size={20} color={colors.danger} /></Pressable>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg },
  heading: { color: colors.text, fontWeight: '900', fontSize: 20 },
  addButton: { minHeight: 42, paddingHorizontal: 13 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: 45 },
  card: { flexDirection: 'row', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.md, marginBottom: spacing.md },
  image: { width: 90, height: 90, borderRadius: radii.md, backgroundColor: colors.surfaceMuted },
  body: { flex: 1, marginLeft: spacing.md },
  name: { color: colors.text, fontWeight: '900', fontSize: 16 },
  price: { color: colors.primary, fontWeight: '900', marginTop: 5 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: spacing.sm },
  stock: { color: colors.muted, fontSize: 12 },
  trash: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
