import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppHeader from '../components/AppHeader';
import { Button, EmptyState, Loading } from '../components/UI';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { dateLabel } from '../lib/format';
import { colors, radii, spacing } from '../theme';

export default function NotificationsScreen({ navigation }) {
  const { token, logout } = useAuth();
  const [data, setData] = useState({ items: [], unread: 0 });
  const [loading, setLoading] = useState(Boolean(token));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [sessionExpired, setSessionExpired] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      setRefreshing(false);
      setSessionExpired(false);
      return;
    }

    try {
      const result = await api.getNotifications({ page: 1, per_page: 50 }, token);
      setData(result || { items: [], unread: 0 });
      setError('');
      setSessionExpired(false);
    } catch (err) {
      if (err?.status === 401 || err?.code === 'rest_login_required' || err?.code === 'not_logged_in') {
        setSessionExpired(true);
        setError('Your saved sign-in could not be verified. Sign in again to load alerts.');
      } else {
        setError(err.message || 'Notifications could not be loaded.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  async function signInAgain() {
    await logout();
    navigation.push('Auth', { mode: 'login' });
  }

  async function markAllRead() {
    setMarkingRead(true);
    try {
      await api.markNotificationsRead([], token);
      setData((current) => ({
        ...current,
        unread: 0,
        items: current.items.map((item) => ({ ...item, is_read: true })),
      }));
    } catch (err) {
      if (err?.status === 401 || err?.code === 'rest_login_required' || err?.code === 'not_logged_in') {
        setSessionExpired(true);
        setError('Your saved sign-in could not be verified. Sign in again to update alerts.');
      } else {
        Alert.alert('Could not update notifications', err.message || 'Try again in a moment.');
      }
    } finally {
      setMarkingRead(false);
    }
  }

  if (!token) {
    return (
      <View style={styles.screen}>
        <AppHeader title="Notifications" subtitle="Updates from your Nest" onProfile={() => navigation.switchTab('Account')} />
        <EmptyState icon="notifications-outline" title="Sign in for notifications" message="Get seller posts, order updates, messages, and follower activity." action="Sign in" onAction={() => navigation.push('Auth', { mode: 'login' })} />
      </View>
    );
  }

  if (loading) return <Loading label="Checking notifications…" />;

  return (
    <View style={styles.screen}>
      <AppHeader title="Notifications" subtitle={`${data.unread || 0} unread`} onProfile={() => navigation.switchTab('Account')} />
      {!sessionExpired && data.unread ? <Button title="Mark all read" variant="ghost" onPress={markAllRead} loading={markingRead} style={styles.readButton} /> : null}
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
        contentContainerStyle={styles.content}
      >
        {sessionExpired ? (
          <EmptyState icon="lock-closed-outline" title="Sign in again" message={error} action="Sign in again" onAction={signInAgain} />
        ) : null}
        {!sessionExpired && error ? <EmptyState icon="cloud-offline-outline" title="Notifications unavailable" message={error} action="Try again" onAction={load} /> : null}
        {!sessionExpired && !error && !data.items?.length ? <EmptyState icon="notifications-off-outline" title="Nothing new" message="Order and community updates will appear here." /> : null}
        {!sessionExpired && !error && data.items?.map((item) => (
          <Pressable key={item.id} style={[styles.card, !item.is_read && styles.unreadCard]}>
            <View style={[styles.icon, !item.is_read && styles.unreadIcon]}>
              <Ionicons name={item.type === 'new_message' ? 'chatbubble-outline' : item.type?.includes('order') ? 'cube-outline' : 'notifications-outline'} size={22} color={colors.primary} />
            </View>
            <View style={styles.body}>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.message}>{item.message}</Text>
              <Text style={styles.date}>{dateLabel(item.created_at)}</Text>
            </View>
            {!item.is_read ? <View style={styles.dot} /> : null}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 48 },
  readButton: { alignSelf: 'flex-end', marginRight: spacing.lg, minHeight: 38 },
  card: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.md, marginBottom: spacing.md },
  unreadCard: { borderColor: colors.accent, backgroundColor: colors.blossom },
  icon: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  unreadIcon: { backgroundColor: colors.sunflower },
  body: { flex: 1, marginLeft: spacing.md },
  title: { color: colors.text, fontWeight: '900' },
  message: { color: colors.muted, lineHeight: 20, marginTop: 4 },
  date: { color: colors.muted, fontSize: 11, marginTop: 7 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.accent, marginTop: 4 },
});
