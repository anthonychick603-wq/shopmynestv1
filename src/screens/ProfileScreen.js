import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Avatar, Button, Field, Screen } from '../components/UI';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { colors, spacing } from '../theme';

const blankAddress = {
  first_name: '',
  last_name: '',
  address_1: '',
  address_2: '',
  city: '',
  state: '',
  postcode: '',
  country: 'US',
  email: '',
  phone: '',
};

export default function ProfileScreen() {
  const { user, token, updateUser, refreshUser } = useAuth();
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [address, setAddress] = useState({ ...blankAddress, email: user?.email || '' });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    let active = true;
    api.getAddresses(token)
      .then((saved) => {
        if (!active) return;
        const next = saved?.shipping || saved?.billing || saved || {};
        setAddress({
          ...blankAddress,
          ...next,
          country: next.country || 'US',
          email: next.email || user?.email || '',
        });
      })
      .catch(() => {});
    return () => { active = false; };
  }, [token, user?.email]);

  useEffect(() => {
    setDisplayName(user?.display_name || '');
    setEmail(user?.email || '');
  }, [user?.display_name, user?.email]);

  function setAddressField(key, value) {
    setAddress((current) => ({ ...current, [key]: value }));
  }

  async function choosePhoto() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Photo permission needed', 'Allow photo access to choose a profile image.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;

      const asset = result.assets[0];
      setUploading(true);
      await api.uploadAccountPhoto({
        uri: asset.uri,
        name: asset.fileName || 'profile.jpg',
        type: asset.mimeType || 'image/jpeg',
      }, token);
      await refreshUser();
      Alert.alert('Photo updated', 'Your new account photo is ready.');
    } catch (err) {
      Alert.alert('Photo not uploaded', err.message || 'The selected photo could not be uploaded.');
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!displayName.trim() || !email.trim()) {
      Alert.alert('Account details needed', 'Enter your display name and email address.');
      return;
    }

    setSaving(true);
    try {
      const normalizedAddress = {
        ...address,
        country: String(address.country || 'US').trim().toUpperCase(),
        state: String(address.state || '').trim().toUpperCase(),
        email: String(address.email || email).trim(),
      };
      await updateUser({ display_name: displayName.trim(), email: email.trim() });
      await api.saveAddresses({ billing: normalizedAddress, shipping: normalizedAddress }, token);
      setAddress(normalizedAddress);
      Alert.alert('Saved', 'Your profile and address were updated.');
    } catch (err) {
      Alert.alert('Could not save', err.message || 'Your profile could not be updated.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen scroll contentContainerStyle={styles.content}>
      <View style={styles.photoWrap}>
        <View style={styles.photo}><Avatar uri={user?.avatar} name={user?.display_name} size={106} /></View>
        <Button title="Change photo" variant="outline" onPress={choosePhoto} loading={uploading} style={{ marginTop: spacing.md }} />
      </View>
      <Text style={styles.heading}>Account</Text>
      <Field label="Display name" value={displayName} onChangeText={setDisplayName} autoComplete="name" />
      <Field label="Account email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
      <Text style={styles.heading}>Default shipping address</Text>
      <View style={styles.row}>
        <Field label="First name" value={address.first_name || ''} onChangeText={(v) => setAddressField('first_name', v)} containerStyle={styles.half} autoComplete="given-name" />
        <Field label="Last name" value={address.last_name || ''} onChangeText={(v) => setAddressField('last_name', v)} containerStyle={styles.half} autoComplete="family-name" />
      </View>
      <Field label="Street" value={address.address_1 || ''} onChangeText={(v) => setAddressField('address_1', v)} autoComplete="street-address" />
      <Field label="Apartment / suite" value={address.address_2 || ''} onChangeText={(v) => setAddressField('address_2', v)} />
      <Field label="City" value={address.city || ''} onChangeText={(v) => setAddressField('city', v)} autoComplete="postal-address-locality" />
      <View style={styles.row}>
        <Field label="State" value={address.state || ''} onChangeText={(v) => setAddressField('state', v.toUpperCase())} autoCapitalize="characters" maxLength={2} containerStyle={styles.half} />
        <Field label="ZIP" value={address.postcode || ''} onChangeText={(v) => setAddressField('postcode', v)} keyboardType="number-pad" autoComplete="postal-code" containerStyle={styles.half} />
      </View>
      <Field label="Country code" value={address.country || 'US'} onChangeText={(v) => setAddressField('country', v.toUpperCase())} autoCapitalize="characters" maxLength={2} />
      <Field label="Shipping email" value={address.email || ''} onChangeText={(v) => setAddressField('email', v)} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
      <Field label="Phone" value={address.phone || ''} onChangeText={(v) => setAddressField('phone', v)} keyboardType="phone-pad" autoComplete="tel" />
      <Button title="Save profile" onPress={save} loading={saving} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: 50 },
  photoWrap: { alignItems: 'center', marginBottom: spacing.xl },
  photo: { width: 112, height: 112, borderRadius: 56, backgroundColor: colors.surfaceMuted, borderWidth: 3, borderColor: colors.surface },
  heading: { color: colors.text, fontSize: 21, fontWeight: '900', marginBottom: spacing.md, marginTop: spacing.lg },
  row: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1, minWidth: 0 },
});
