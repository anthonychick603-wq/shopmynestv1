import React, { useEffect, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Button, Field, Pill, Screen } from '../components/UI';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { decodeHtml } from '../lib/format';
import { colors, radii, spacing } from '../theme';

const emptyShipping = {
  weight_oz: '',
  length_in: '',
  width_in: '',
  height_in: '',
  processing_time: '',
  shipping_profile: '',
};

export default function ProductEditorScreen({ navigation, route }) {
  const { token } = useAuth();
  const product = route.product;
  const [name, setName] = useState(product?.name ? decodeHtml(product.name) : '');
  const [description, setDescription] = useState(product?.description || '');
  const [price, setPrice] = useState(product?.price != null ? String(product.price) : '');
  const [stock, setStock] = useState(product?.stock_quantity != null ? String(product.stock_quantity) : '1');
  const [sku, setSku] = useState(product?.sku || '');
  const [status, setStatus] = useState(product?.status || 'publish');
  const [categories, setCategories] = useState([]);
  const [categoryIds, setCategoryIds] = useState((product?.categories || []).map((item) => item.id));
  const [image, setImage] = useState(product?.image || '');
  const [imageId, setImageId] = useState(0);
  const [shipping, setShipping] = useState(emptyShipping);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    api.getCategories().then((items) => setCategories(Array.isArray(items) ? items : [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!product?.id) return;
    let active = true;
    api.getProductShipping(product.id, token)
      .then((result) => {
        if (active) setShipping({ ...emptyShipping, ...(result?.shipping || result || {}) });
      })
      .catch(() => {});
    return () => { active = false; };
  }, [product?.id, token]);

  function toggleCategory(id) {
    setCategoryIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function setShippingField(key, value) {
    setShipping((current) => ({ ...current, [key]: value }));
  }

  async function chooseImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo permission needed', 'Allow photo access to add a listing image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.88 });
    if (result.canceled) return;
    const asset = result.assets[0];
    setImage(asset.uri);
    setUploading(true);
    try {
      const uploaded = await api.uploadMedia({ uri: asset.uri, name: asset.fileName || 'listing.jpg', type: asset.mimeType || 'image/jpeg' }, token);
      setImageId(uploaded.id);
      setImage(uploaded.url || uploaded.thumbnail || asset.uri);
    } catch (err) {
      setImageId(0);
      Alert.alert('Image not uploaded', err.message || 'Try again.');
    } finally {
      setUploading(false);
    }
  }

  function validate() {
    if (!name.trim() || price === '' || !Number.isFinite(Number(price)) || Number(price) < 0) {
      Alert.alert('Listing incomplete', 'A product name and valid price are required.');
      return false;
    }
    if (!Number.isInteger(Number(stock)) || Number(stock) < 0) {
      Alert.alert('Stock is invalid', 'Stock must be a whole number of zero or more.');
      return false;
    }
    for (const key of ['weight_oz', 'length_in', 'width_in', 'height_in']) {
      if (shipping[key] !== '' && (!Number.isFinite(Number(shipping[key])) || Number(shipping[key]) <= 0)) {
        Alert.alert('Package information is invalid', 'Any package weight or dimension you enter must be greater than zero.');
        return false;
      }
    }
    return true;
  }

  async function save() {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description,
        price: Number(price),
        stock: Number.parseInt(stock || '0', 10),
        sku: sku.trim(),
        status,
        category_ids: categoryIds,
      };
      if (imageId) payload.image_id = imageId;

      const savedProduct = product?.id
        ? await api.updateProduct(product.id, payload, token)
        : await api.createProduct(payload, token);

      let shippingWarning = '';
      try {
        await api.saveProductShipping(savedProduct.id, {
          weight_oz: shipping.weight_oz,
          length_in: shipping.length_in,
          width_in: shipping.width_in,
          height_in: shipping.height_in,
          processing_time: shipping.processing_time.trim(),
          shipping_profile: shipping.shipping_profile.trim(),
        }, token);
      } catch (err) {
        shippingWarning = ` The listing was saved, but its package information was not: ${err.message || 'unknown error'}`;
      }

      route.onSaved?.();
      Alert.alert(
        'Listing saved',
        `${product?.id ? 'Your product was updated.' : 'Your product was created.'}${shippingWarning}`,
        [{ text: 'Done', onPress: navigation.goBack }]
      );
    } catch (err) {
      Alert.alert('Could not save listing', err.message || 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen scroll contentContainerStyle={styles.content}>
      <Text style={styles.title}>{product?.id ? 'Edit product' : 'New product'}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Choose product photo" style={styles.imagePicker} onPress={chooseImage}>
        {image ? <Image source={{ uri: image }} style={styles.image} /> : <View style={styles.imagePlaceholder}><Ionicons name="camera-outline" size={40} color={colors.primary} /><Text style={styles.imageText}>Choose product photo</Text></View>}
        {uploading ? <View style={styles.uploadOverlay}><Text style={styles.uploadText}>Uploading…</Text></View> : null}
      </Pressable>
      <Field label="Product name" value={name} onChangeText={setName} />
      <Field label="Description" value={description} onChangeText={setDescription} multiline />
      <View style={styles.row}>
        <Field label="Price" value={price} onChangeText={setPrice} keyboardType="decimal-pad" containerStyle={styles.half} />
        <Field label="Stock" value={stock} onChangeText={setStock} keyboardType="number-pad" containerStyle={styles.half} />
      </View>
      <Field label="SKU (optional)" value={sku} onChangeText={setSku} autoCapitalize="characters" />
      <Text style={styles.label}>Listing status</Text>
      <View style={styles.pills}>{['publish', 'draft', 'pending'].map((item) => <Pill key={item} label={item} active={status === item} onPress={() => setStatus(item)} />)}</View>
      <Text style={styles.label}>Categories</Text>
      <View style={styles.pills}>{categories.map((item) => <Pill key={item.id} label={decodeHtml(item.name)} active={categoryIds.includes(item.id)} onPress={() => toggleCategory(item.id)} />)}</View>

      <View style={styles.shippingCard}>
        <Text style={styles.shippingTitle}>Package and shipping</Text>
        <Text style={styles.shippingHelp}>Enter the packed size for accurate label rates. Blank values use your seller shipping defaults.</Text>
        <View style={styles.row}>
          <Field label="Weight (oz)" value={shipping.weight_oz} onChangeText={(value) => setShippingField('weight_oz', value)} keyboardType="decimal-pad" containerStyle={styles.half} />
          <Field label="Length (in)" value={shipping.length_in} onChangeText={(value) => setShippingField('length_in', value)} keyboardType="decimal-pad" containerStyle={styles.half} />
        </View>
        <View style={styles.row}>
          <Field label="Width (in)" value={shipping.width_in} onChangeText={(value) => setShippingField('width_in', value)} keyboardType="decimal-pad" containerStyle={styles.half} />
          <Field label="Height (in)" value={shipping.height_in} onChangeText={(value) => setShippingField('height_in', value)} keyboardType="decimal-pad" containerStyle={styles.half} />
        </View>
        <Field label="Processing time (optional)" value={shipping.processing_time} onChangeText={(value) => setShippingField('processing_time', value)} placeholder="Example: 3-5 business days" />
      </View>

      <Button title="Save listing" onPress={save} loading={saving} disabled={uploading} style={{ marginTop: spacing.xl }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: 54 },
  title: { color: colors.text, fontWeight: '900', fontSize: 29, marginBottom: spacing.lg },
  imagePicker: { width: '100%', aspectRatio: 1.35, borderRadius: radii.lg, overflow: 'hidden', backgroundColor: colors.surfaceMuted, marginBottom: spacing.xl },
  image: { width: '100%', height: '100%' },
  imagePlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  imageText: { color: colors.primary, fontWeight: '900' },
  uploadOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center' },
  uploadText: { color: colors.white, fontWeight: '900' },
  row: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1, minWidth: 0 },
  label: { color: colors.text, fontWeight: '900', marginBottom: spacing.sm, marginTop: spacing.md },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  shippingCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.lg, marginTop: spacing.xl },
  shippingTitle: { color: colors.text, fontWeight: '900', fontSize: 19 },
  shippingHelp: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 5, marginBottom: spacing.lg },
});
