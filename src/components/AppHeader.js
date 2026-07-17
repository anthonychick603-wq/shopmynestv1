import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme';
import { IconButton } from './UI';

export default function AppHeader({ title = 'The Nest', subtitle, onProfile, cartCount, onCart }) {
  return (
    <View style={styles.header}>
      <View style={styles.titleWrap}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text numberOfLines={1} style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <View style={styles.actions}>
        {onCart ? <IconButton icon="bag-outline" label="Cart" onPress={onCart} badge={cartCount} /> : null}
        {onProfile ? <IconButton icon="person-outline" label="Profile" onPress={onProfile} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md, backgroundColor: colors.background, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleWrap: { flex: 1, paddingRight: 12 },
  title: { color: colors.primary, fontSize: 28, fontWeight: '900', letterSpacing: -0.7 },
  subtitle: { color: colors.muted, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 8 },
});
