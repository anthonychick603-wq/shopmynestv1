import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, EmptyState, Loading } from '../components/UI';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { colors, radii, spacing } from '../theme';

export default function ConversationScreen({ route }) {
  const { token, user } = useAuth();
  const other = route.user;
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const result = await api.getConversation(other.id, token);
      setMessages(Array.isArray(result) ? result : []);
      setError('');
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 50);
    } catch (err) {
      setError(err.message || 'This conversation could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [other.id, token]);

  useEffect(() => { load(); }, [load]);

  async function send() {
    const message = text.trim();
    if (!message || sending) return;
    setSending(true);
    try {
      await api.sendMessage(other.id, message, token);
      setText('');
      await load();
    } catch (err) {
      Alert.alert('Message not sent', err.message || 'Try again in a moment.');
    } finally {
      setSending(false);
    }
  }

  if (loading) return <Loading label="Opening conversation…" />;
  if (error) {
    return (
      <View style={styles.screen}>
        <EmptyState icon="cloud-offline-outline" title="Conversation unavailable" message={error} action="Try again" onAction={load} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.messages} keyboardShouldPersistTaps="handled">
        {!messages.length ? <Text style={styles.emptyText}>Start the conversation with {other.store_name || other.display_name}.</Text> : null}
        {messages.map((message) => {
          const mine = Number(message.sender_id) === Number(user?.id);
          return (
            <View key={message.id} style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
              <Text style={[styles.text, mine && styles.mineText]}>{message.message}</Text>
            </View>
          );
        })}
      </ScrollView>
      <View style={styles.composer}>
        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          maxLength={2000}
          placeholder={`Message ${other.store_name || other.display_name}`}
          placeholderTextColor={colors.placeholder}
          style={styles.input}
        />
        <Pressable accessibilityRole="button" accessibilityLabel="Send message" disabled={sending || !text.trim()} onPress={send} style={[styles.send, (sending || !text.trim()) && styles.sendDisabled]}>
          <Ionicons name="send" size={21} color={colors.onPrimary} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  messages: { flexGrow: 1, padding: spacing.lg, paddingBottom: spacing.xl },
  emptyText: { color: colors.muted, textAlign: 'center', marginTop: spacing.xl },
  bubble: { maxWidth: '82%', paddingHorizontal: 14, paddingVertical: 11, borderRadius: radii.md, marginBottom: 8 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 4 },
  text: { color: colors.text, lineHeight: 20 },
  mineText: { color: colors.onPrimary },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  input: { flex: 1, maxHeight: 120, minHeight: 46, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 23, paddingHorizontal: 16, paddingTop: 12, color: colors.text },
  send: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  sendDisabled: { opacity: 0.5 },
});
