import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Field, Loading, Screen } from '../components/UI';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { colors, radii, spacing } from '../theme';

export default function SellerApplicationScreen({ navigation }) {
  const { token, isSeller, refreshUser } = useAuth();
  const [status, setStatus] = useState('none');
  const [storeName, setStoreName] = useState('');
  const [about, setAbout] = useState('');
  const [products, setProducts] = useState('');
  const [website, setWebsite] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isSeller) {
      setStatus('approved');
      setLoading(false);
      return;
    }
    api.getSellerApplicationStatus(token)
      .then((result) => setStatus(result?.status || 'none'))
      .catch(() => setStatus('none'))
      .finally(() => setLoading(false));
  }, [isSeller, token]);

  async function submit() {
    if (!storeName.trim() || !about.trim() || !products.trim() || !accepted) {
      Alert.alert('Application incomplete', 'Store name, about, products, and seller terms acceptance are required.');
      return;
    }
    setSubmitting(true);
    try {
      await api.submitSellerApplication({
        store_name: storeName,
        about,
        products,
        website,
        accept_terms: true,
      }, token);
      setStatus('pending');
      Alert.alert('Application submitted', 'The MyNest team will review your application. You will receive a notification after a decision.');
    } catch (err) {
      if (err.code === 'application_exists') setStatus('pending');
      Alert.alert('Could not submit', err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <Loading label="Checking seller status…" />;
  if (status === 'approved' || isSeller) return (
    <Screen scroll contentContainerStyle={styles.content}>
      <View style={styles.statusCard}><Ionicons name="checkmark-circle" size={58} color={colors.success} /><Text style={styles.statusTitle}>Your seller account is active</Text><Text style={styles.statusText}>Open your Seller Dashboard to manage products, orders, earnings, and payouts.</Text><Button title="Open seller dashboard" onPress={() => { refreshUser().catch(() => {}); navigation.replace('SellerDashboard'); }} /></View>
    </Screen>
  );
  if (status === 'pending') return (
    <Screen scroll contentContainerStyle={styles.content}>
      <View style={styles.statusCard}><Ionicons name="time-outline" size={58} color={colors.warning} /><Text style={styles.statusTitle}>Application pending</Text><Text style={styles.statusText}>Your application has been received. The seller button will be replaced by the dashboard automatically after approval.</Text><Button title="Return to account" variant="outline" onPress={navigation.goBack} /></View>
    </Screen>
  );

  return (
    <Screen scroll contentContainerStyle={styles.content}>
      <Text style={styles.title}>Start Your Nest</Text>
      <Text style={styles.subtitle}>Tell us about what you make and the shop you want to build.</Text>
      <Field label="Store name" value={storeName} onChangeText={setStoreName} />
      <Field label="About you and your shop" value={about} onChangeText={setAbout} multiline />
      <Field label="What products will you sell?" value={products} onChangeText={setProducts} multiline />
      <Field label="Website or social page (optional)" value={website} onChangeText={setWebsite} autoCapitalize="none" keyboardType="url" />
      <Pressable style={styles.termsRow} onPress={() => setAccepted((value) => !value)}>
        <View style={[styles.checkbox, accepted && styles.checkboxActive]}>{accepted ? <Ionicons name="checkmark" size={18} color={colors.onPrimary} /> : null}</View>
        <Text style={styles.termsText}>I accept the MyNest Seller Terms and agree that each listing must follow marketplace policies.</Text>
      </Pressable>
      <Button title="Submit application" onPress={submit} loading={submitting} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: 52 },
  title: { color: colors.text, fontSize: 30, fontWeight: '900' },
  subtitle: { color: colors.muted, lineHeight: 22, marginTop: 6, marginBottom: spacing.xl },
  termsRow: { flexDirection: 'row', alignItems: 'flex-start', marginVertical: spacing.lg },
  checkbox: { width: 25, height: 25, borderRadius: 7, borderWidth: 1, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  checkboxActive: { backgroundColor: colors.primary },
  termsText: { flex: 1, color: colors.muted, lineHeight: 20, marginLeft: spacing.md },
  statusCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.xl, alignItems: 'center', marginTop: spacing.xl },
  statusTitle: { color: colors.text, fontWeight: '900', fontSize: 24, textAlign: 'center', marginTop: spacing.lg },
  statusText: { color: colors.muted, lineHeight: 22, textAlign: 'center', marginVertical: spacing.lg },
});
