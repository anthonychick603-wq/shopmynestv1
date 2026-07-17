import React, { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppHeader from '../components/AppHeader';
import { Avatar, Button, EmptyState } from '../components/UI';
import { SITE_URL } from '../config';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { colors, radii, spacing } from '../theme';

const MenuItem = ({ icon, title, subtitle, onPress }) => (
  <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.75 }]}>
    <View style={styles.menuIcon}><Ionicons name={icon} size={22} color={colors.primary} /></View>
    <View style={styles.menuText}>
      <Text style={styles.menuTitle}>{title}</Text>
      {subtitle ? <Text style={styles.menuSubtitle}>{subtitle}</Text> : null}
    </View>
    <Ionicons name="chevron-forward" size={20} color={colors.muted} />
  </Pressable>
);

async function openExternal(url) {
  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) throw new Error('unsupported');
    await Linking.openURL(url);
  } catch {
    Alert.alert('Could not open page', 'The website page could not be opened on this device.');
  }
}

export default function AccountScreen({ navigation }) {
  const { user, token, isSeller, logout } = useAuth();
  const [pages, setPages] = useState({});
  const [applicationStatus, setApplicationStatus] = useState('none');

  useEffect(() => {
    let active = true;
    api.getConfig()
      .then((config) => {
        if (active) setPages(config?.pages || {});
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!token || isSeller) {
      setApplicationStatus(isSeller ? 'approved' : 'none');
      return undefined;
    }

    let active = true;
    api.getSellerApplicationStatus(token)
      .then((result) => {
        if (active) setApplicationStatus(result?.status || 'none');
      })
      .catch(() => {
        if (active) setApplicationStatus('none');
      });
    return () => { active = false; };
  }, [isSeller, token, user?.is_seller]);

  const privacyUrl = pages.privacy_policy || `${SITE_URL}/privacy-policy/`;
  const termsUrl = pages.terms || `${SITE_URL}/terms-of-service/`;
  const refundUrl = pages.refund_policy || `${SITE_URL}/refund-policy/`;

  const sellerTitle = applicationStatus === 'pending'
    ? 'Application pending'
    : applicationStatus === 'rejected'
      ? 'Review seller application'
      : 'Become a seller';

  const sellerMessage = applicationStatus === 'pending'
    ? 'Your application is being reviewed. This section changes to the Seller Dashboard after approval.'
    : applicationStatus === 'rejected'
      ? 'Your previous application was not approved. Open it to review the status and apply again.'
      : 'Apply to open your own Nest. This section disappears after your seller account is approved.';

  return (
    <View style={styles.screen}>
      <AppHeader title="Account" subtitle={user ? `Signed in as ${user.display_name}` : 'Your MyNest account'} />
      {!token ? (
        <EmptyState icon="person-circle-outline" title="Welcome to The Nest" message="Sign in to check out, follow sellers, receive notifications, and manage orders." action="Sign in" onAction={() => navigation.push('Auth', { mode: 'login' })} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.profileCard}>
            <Avatar uri={user?.avatar} name={user?.display_name} size={70} />
            <View style={styles.profileText}>
              <Text style={styles.name}>{user?.display_name}</Text>
              <Text style={styles.email}>{user?.email}</Text>
              {isSeller ? <View style={styles.sellerBadge}><Ionicons name="storefront" size={14} color={colors.onSuccess} /><Text style={styles.sellerBadgeText}>Approved seller</Text></View> : null}
            </View>
          </View>

          <View style={styles.menuCard}>
            <MenuItem icon="receipt-outline" title="My orders" subtitle="Purchase history and tracking" onPress={() => navigation.push('BuyerOrders')} />
            <MenuItem icon="heart-outline" title="Favorites" subtitle="Items you've saved" onPress={() => navigation.push('Favorites')} />
            <MenuItem icon="pricetags-outline" title="Offers & bundles" subtitle="Offers you've made or received" onPress={() => navigation.push('Offers')} />
            <MenuItem icon="shield-checkmark-outline" title="Buyer protection" subtitle="Open and track disputes" onPress={() => navigation.push('Disputes')} />
            <MenuItem icon="chatbubbles-outline" title="Messages" subtitle="Conversations with buyers and sellers" onPress={() => navigation.push('Messages')} />
            <MenuItem icon="person-outline" title="Profile and addresses" subtitle="Update your account details" onPress={() => navigation.push('Profile')} />
          </View>

          {isSeller ? (
            <View style={styles.menuCard}>
              <MenuItem icon="storefront-outline" title="Seller dashboard" subtitle="Products, orders, earnings, and payouts" onPress={() => navigation.push('SellerDashboard')} />
            </View>
          ) : (
            <View style={styles.sellerCallout}>
              <Ionicons name={applicationStatus === 'pending' ? 'time-outline' : 'sparkles-outline'} size={28} color={colors.primary} />
              <Text style={styles.calloutTitle}>{sellerTitle}</Text>
              <Text style={styles.calloutText}>{sellerMessage}</Text>
              <Button title={sellerTitle} variant="outline" onPress={() => navigation.push('SellerApplication')} style={{ marginTop: spacing.md }} />
            </View>
          )}

          <View style={styles.menuCard}>
            <MenuItem icon="shield-checkmark-outline" title="Privacy policy" onPress={() => openExternal(privacyUrl)} />
            <MenuItem icon="document-text-outline" title="Terms of service" onPress={() => openExternal(termsUrl)} />
            <MenuItem icon="return-down-back-outline" title="Refund policy" onPress={() => openExternal(refundUrl)} />
          </View>
          <Button title="Sign out" variant="danger" onPress={logout} />
        </ScrollView>
      )}
      {!token ? (
        <View style={styles.signUpWrap}><Button title="Create account" variant="outline" onPress={() => navigation.push('Auth', { mode: 'register' })} /></View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 50 },
  signUpWrap: { paddingHorizontal: spacing.lg, marginTop: -8 },
  profileCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.lg, marginBottom: spacing.lg },
  profileText: { flex: 1, marginLeft: spacing.lg },
  name: { color: colors.text, fontSize: 21, fontWeight: '900' },
  email: { color: colors.muted, marginTop: 3 },
  sellerBadge: { alignSelf: 'flex-start', backgroundColor: colors.success, borderRadius: radii.pill, flexDirection: 'row', gap: 5, alignItems: 'center', paddingHorizontal: 9, paddingVertical: 5, marginTop: spacing.sm },
  sellerBadgeText: { color: colors.onSuccess, fontWeight: '900', fontSize: 11 },
  menuCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, overflow: 'hidden', marginBottom: spacing.lg },
  menuItem: { minHeight: 74, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  menuIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  menuText: { flex: 1, marginHorizontal: spacing.md },
  menuTitle: { color: colors.text, fontWeight: '900' },
  menuSubtitle: { color: colors.muted, fontSize: 12, marginTop: 3 },
  sellerCallout: { backgroundColor: colors.peachtree, borderRadius: radii.lg, padding: spacing.lg, marginBottom: spacing.lg },
  calloutTitle: { color: colors.text, fontWeight: '900', fontSize: 18, marginTop: spacing.sm },
  calloutText: { color: colors.muted, lineHeight: 20, marginTop: 5 },
});
