import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../lib/api';
import { colors, radii, spacing } from '../theme';

const TIER_META = {
  trusted_seller: { icon: 'shield-checkmark', color: colors.success, bg: colors.successSoft },
  rising_seller: { icon: 'trending-up', color: colors.warning, bg: colors.warningSoft },
};

function metricRows(metrics = {}) {
  return [
    ['On-time rate', metrics.on_time_rate != null ? `${metrics.on_time_rate}%` : null],
    ['Avg rating', metrics.avg_rating != null ? `${metrics.avg_rating}★` : null],
    ['Response rate', metrics.response_rate != null ? `${metrics.response_rate}%` : null],
    ['Completed orders', metrics.completed_orders != null ? String(metrics.completed_orders) : null],
  ].filter(([, value]) => value != null);
}

export default function SellerBadge({ sellerId, compact = false, style }) {
  const [badge, setBadge] = useState(null);

  useEffect(() => {
    let active = true;
    if (!sellerId) return undefined;
    api.getSellerBadge(sellerId)
      .then((result) => { if (active) setBadge(result); })
      .catch(() => {});
    return () => { active = false; };
  }, [sellerId]);

  if (!badge || !badge.tier || badge.tier === 'none') return null;
  const meta = TIER_META[badge.tier] || { icon: 'ribbon', color: colors.primary, bg: colors.surfaceMuted };

  if (compact) {
    return (
      <View style={[styles.chip, { backgroundColor: meta.bg }, style]}>
        <Ionicons name={meta.icon} size={13} color={meta.color} />
        <Text style={[styles.chipText, { color: meta.color }]}>{badge.tier_label || 'Seller'}</Text>
      </View>
    );
  }

  const rows = metricRows(badge.metrics);
  return (
    <View style={[styles.card, style]}>
      <View style={styles.header}>
        <View style={[styles.iconWrap, { backgroundColor: meta.bg }]}>
          <Ionicons name={meta.icon} size={22} color={meta.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.tierLabel}>{badge.tier_label || 'Seller performance'}</Text>
          <Text style={styles.subLabel}>{badge.meets_minimum_volume ? 'Rolling 90-day performance' : 'Building performance history'}</Text>
        </View>
      </View>
      {rows.length ? (
        <View style={styles.metrics}>
          {rows.map(([label, value]) => (
            <View key={label} style={styles.metric}>
              <Text style={styles.metricValue}>{value}</Text>
              <Text style={styles.metricLabel}>{label}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', borderRadius: radii.pill, paddingHorizontal: 9, paddingVertical: 4 },
  chipText: { fontWeight: '900', fontSize: 11 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  tierLabel: { color: colors.text, fontWeight: '900', fontSize: 17 },
  subLabel: { color: colors.muted, fontSize: 12, marginTop: 2 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.md, gap: spacing.md },
  metric: { minWidth: '40%', flexGrow: 1 },
  metricValue: { color: colors.primary, fontWeight: '900', fontSize: 18 },
  metricLabel: { color: colors.muted, fontSize: 12, marginTop: 2 },
});
