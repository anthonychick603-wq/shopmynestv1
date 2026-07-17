import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Avatar, EmptyState, Loading } from '../components/UI';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { dateLabel } from '../lib/format';
import { colors, radii, spacing } from '../theme';

export default function MessagesScreen({ navigation }) {
  const { token } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const result = await api.getConversations(token);
      setItems(Array.isArray(result) ? result : []);
      setError('');
    } catch (err) {
      setError(err.message || 'Messages could not be loaded.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);
  if (loading) return <Loading label="Loading messages…" />;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      {error ? <EmptyState icon="cloud-offline-outline" title="Messages unavailable" message={error} action="Try again" onAction={load} /> : null}
      {!error && !items.length ? <EmptyState icon="chatbubbles-outline" title="No conversations yet" message="Message a seller from their shop or listing." /> : null}
      {!error && items.map((item) => (
        <Pressable key={item.user.id} style={styles.card} onPress={() => navigation.push('Conversation', { user: item.user })}>
          <Avatar uri={item.user.avatar} name={item.user.display_name} size={52} />
          <View style={styles.body}>
            <Text style={styles.name}>{item.user.store_name || item.user.display_name}</Text>
            <Text numberOfLines={1} style={[styles.preview, item.unread && styles.unread]}>{item.last_message}</Text>
            <Text style={styles.date}>{dateLabel(item.date)}</Text>
          </View>
          {item.unread ? <View style={styles.dot} /> : null}
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 45 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.md, marginBottom: spacing.md },
  body: { flex: 1, marginLeft: spacing.md },
  name: { color: colors.text, fontWeight: '900' },
  preview: { color: colors.muted, marginTop: 4 },
  unread: { color: colors.text, fontWeight: '800' },
  date: { color: colors.muted, fontSize: 11, marginTop: 5 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
});
