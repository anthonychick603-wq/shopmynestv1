import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { Button, Field, Loading, Screen } from '../components/UI';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { colors, radii, spacing } from '../theme';

const defaultProfile = {
  ship_from_name: '',
  ship_from_company: '',
  ship_from_street1: '',
  ship_from_street2: '',
  ship_from_city: '',
  ship_from_state: '',
  ship_from_zip: '',
  ship_from_country: 'US',
  ship_from_phone: '',
  processing_time: '3-5 business days',
  default_weight_oz: '8',
  default_length_in: '8',
  default_width_in: '6',
  default_height_in: '2',
  free_shipping_allowed: false,
};

export default function ShippingProfileScreen() {
  const { token } = useAuth();
  const [profile, setProfile] = useState(defaultProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    api.getShippingProfile(token)
      .then((result) => {
        if (active) setProfile({ ...defaultProfile, ...(result?.profile || result || {}) });
      })
      .catch((err) => Alert.alert('Shipping settings unavailable', err.message || 'The shipping profile could not be loaded.'))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [token]);

  function setField(key, value) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  function validate() {
    const required = [
      ['ship_from_name', 'ship-from name'],
      ['ship_from_street1', 'street address'],
      ['ship_from_city', 'city'],
      ['ship_from_state', 'state'],
      ['ship_from_zip', 'ZIP code'],
      ['ship_from_country', 'country code'],
    ];
    const missing = required.filter(([key]) => !String(profile[key] || '').trim()).map(([, label]) => label);
    if (missing.length) {
      Alert.alert('Ship-from address incomplete', `Add your ${missing.join(', ')} before saving.`);
      return false;
    }

    const packageFields = ['default_weight_oz', 'default_length_in', 'default_width_in', 'default_height_in'];
    if (packageFields.some((key) => !Number.isFinite(Number(profile[key])) || Number(profile[key]) <= 0)) {
      Alert.alert('Package defaults needed', 'Default weight, length, width, and height must all be greater than zero.');
      return false;
    }
    return true;
  }

  async function save() {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        ...profile,
        ship_from_name: profile.ship_from_name.trim(),
        ship_from_company: profile.ship_from_company.trim(),
        ship_from_street1: profile.ship_from_street1.trim(),
        ship_from_street2: profile.ship_from_street2.trim(),
        ship_from_city: profile.ship_from_city.trim(),
        ship_from_state: profile.ship_from_state.trim().toUpperCase(),
        ship_from_zip: profile.ship_from_zip.trim(),
        ship_from_country: profile.ship_from_country.trim().toUpperCase(),
        ship_from_phone: profile.ship_from_phone.trim(),
        processing_time: profile.processing_time.trim(),
      };
      const result = await api.saveShippingProfile(payload, token);
      setProfile({ ...defaultProfile, ...(result?.profile || payload) });
      Alert.alert('Shipping settings saved', 'Your ship-from address and default package information are ready for shipping rates and labels.');
    } catch (err) {
      Alert.alert('Could not save shipping settings', err.message || 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Loading label="Loading shipping settings…" />;

  return (
    <Screen scroll contentContainerStyle={styles.content}>
      <Text style={styles.title}>Shipping settings</Text>
      <Text style={styles.subtitle}>Shippo uses this return address and these package defaults when you compare rates and purchase labels.</Text>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Ship-from address</Text>
        <Field label="Name" value={profile.ship_from_name} onChangeText={(value) => setField('ship_from_name', value)} autoComplete="name" />
        <Field label="Company (optional)" value={profile.ship_from_company} onChangeText={(value) => setField('ship_from_company', value)} />
        <Field label="Street address" value={profile.ship_from_street1} onChangeText={(value) => setField('ship_from_street1', value)} autoComplete="street-address" />
        <Field label="Apartment, suite, etc. (optional)" value={profile.ship_from_street2} onChangeText={(value) => setField('ship_from_street2', value)} />
        <Field label="City" value={profile.ship_from_city} onChangeText={(value) => setField('ship_from_city', value)} autoComplete="postal-address-locality" />
        <View style={styles.row}>
          <Field label="State" value={profile.ship_from_state} onChangeText={(value) => setField('ship_from_state', value.toUpperCase())} autoCapitalize="characters" maxLength={2} containerStyle={styles.half} />
          <Field label="ZIP code" value={profile.ship_from_zip} onChangeText={(value) => setField('ship_from_zip', value)} keyboardType="number-pad" autoComplete="postal-code" containerStyle={styles.half} />
        </View>
        <View style={styles.row}>
          <Field label="Country" value={profile.ship_from_country} onChangeText={(value) => setField('ship_from_country', value.toUpperCase())} autoCapitalize="characters" maxLength={2} containerStyle={styles.half} />
          <Field label="Phone" value={profile.ship_from_phone} onChangeText={(value) => setField('ship_from_phone', value)} keyboardType="phone-pad" autoComplete="tel" containerStyle={styles.half} />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Default package</Text>
        <Text style={styles.help}>These values are used when a listing does not have its own weight and dimensions.</Text>
        <View style={styles.row}>
          <Field label="Weight (oz)" value={String(profile.default_weight_oz)} onChangeText={(value) => setField('default_weight_oz', value)} keyboardType="decimal-pad" containerStyle={styles.half} />
          <Field label="Length (in)" value={String(profile.default_length_in)} onChangeText={(value) => setField('default_length_in', value)} keyboardType="decimal-pad" containerStyle={styles.half} />
        </View>
        <View style={styles.row}>
          <Field label="Width (in)" value={String(profile.default_width_in)} onChangeText={(value) => setField('default_width_in', value)} keyboardType="decimal-pad" containerStyle={styles.half} />
          <Field label="Height (in)" value={String(profile.default_height_in)} onChangeText={(value) => setField('default_height_in', value)} keyboardType="decimal-pad" containerStyle={styles.half} />
        </View>
        <Field label="Processing time" value={profile.processing_time} onChangeText={(value) => setField('processing_time', value)} />
        <View style={styles.switchRow}>
          <View style={styles.switchText}>
            <Text style={styles.switchTitle}>Allow free-shipping listings</Text>
            <Text style={styles.help}>This preference is saved for marketplace shipping rules.</Text>
          </View>
          <Switch
            accessibilityLabel="Allow free-shipping listings"
            value={Boolean(profile.free_shipping_allowed)}
            onValueChange={(value) => setField('free_shipping_allowed', value)}
            trackColor={{ false: colors.border, true: colors.accent }}
            thumbColor={colors.surface}
          />
        </View>
      </View>

      <Button title="Save shipping settings" icon="save-outline" onPress={save} loading={saving} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: 54 },
  title: { color: colors.text, fontSize: 30, fontWeight: '900' },
  subtitle: { color: colors.muted, lineHeight: 21, marginTop: 6, marginBottom: spacing.xl },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.lg, marginBottom: spacing.lg },
  sectionTitle: { color: colors.text, fontSize: 19, fontWeight: '900', marginBottom: spacing.md },
  help: { color: colors.muted, fontSize: 12, lineHeight: 18, marginBottom: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1, minWidth: 0 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.sm },
  switchText: { flex: 1 },
  switchTitle: { color: colors.text, fontWeight: '900' },
});
