import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Screen } from '../components/UI';
import { colors, radii, spacing } from '../theme';

export default function OrderSuccessScreen({ navigation, route }) {
  return (
    <Screen contentContainerStyle={styles.content} style={styles.screen}>
      <View style={styles.card}>
        <View style={styles.icon}><Ionicons name="checkmark" size={46} color={colors.onSuccess} /></View>
        <Text style={styles.title}>Thank you for purchasing from MyNest</Text>
        <Text style={styles.message}>Order #{route.orderId} was paid successfully. Sellers will receive the order and you will get status updates in Notifications.</Text>
        <Button title="View my orders" onPress={() => navigation.replace('BuyerOrders')} />
        <Button title="Continue shopping" variant="outline" onPress={() => navigation.resetToTab('Shop')} style={{ marginTop: 10 }} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { justifyContent: 'center' },
  content: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.xl, alignItems: 'center' },
  icon: { width: 82, height: 82, borderRadius: 41, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xl },
  title: { color: colors.text, fontSize: 26, lineHeight: 32, fontWeight: '900', textAlign: 'center' },
  message: { color: colors.muted, lineHeight: 22, textAlign: 'center', marginVertical: spacing.lg },
});
