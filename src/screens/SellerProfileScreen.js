import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
import { Button, Field, Loading, Screen } from '../components/UI';
import SellerBadge from '../components/SellerBadge';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { colors, spacing } from '../theme';

export default function SellerProfileScreen() {
  const { token, user } = useAuth();
  const [storeName, setStoreName] = useState('');
  const [about, setAbout] = useState('');
  const [paypalEmail, setPaypalEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getSellerProfile(token).then((profile) => {
      setStoreName(profile.store_name || '');
      setAbout(profile.about || '');
      setPaypalEmail(profile.paypal_email || '');
    }).catch((err) => Alert.alert('Profile unavailable', err.message)).finally(() => setLoading(false));
  }, [token]);
  if (loading) return <Loading label="Loading shop profile…" />;

  async function save() {
    setSaving(true);
    try {
      await api.updateSellerProfile({ store_name: storeName, about, paypal_email: paypalEmail }, token);
      Alert.alert('Shop profile saved', 'Your public seller profile was updated.');
    } catch (err) { Alert.alert('Could not save profile', err.message); }
    finally { setSaving(false); }
  }

  return (
    <Screen scroll contentContainerStyle={styles.content}>
      <Text style={styles.title}>Shop profile</Text>
      {user?.id ? <SellerBadge sellerId={user.id} style={styles.badge} /> : null}
      <Field label="Store name" value={storeName} onChangeText={setStoreName} />
      <Field label="About your shop" value={about} onChangeText={setAbout} multiline />
      <Field label="PayPal email (when PayPal payouts are enabled)" value={paypalEmail} onChangeText={setPaypalEmail} keyboardType="email-address" autoCapitalize="none" />
      <Button title="Save shop profile" onPress={save} loading={saving} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: 50 },
  title: { color: colors.text, fontSize: 30, fontWeight: '900', marginBottom: spacing.xl },
  badge: { marginBottom: spacing.xl },
});
