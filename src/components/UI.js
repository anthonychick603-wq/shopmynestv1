import React from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing } from '../theme';

export function Screen({ children, scroll = false, contentContainerStyle, style, keyboardShouldPersistTaps = 'handled' }) {
  if (scroll) {
    return (
      <ScrollView
        style={[styles.screen, style]}
        contentContainerStyle={[styles.screenContent, contentContainerStyle]}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      >
        {children}
      </ScrollView>
    );
  }
  return <View style={[styles.screen, style]}>{children}</View>;
}

export function SectionTitle({ title, action, onAction }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action ? (
        <Pressable accessibilityRole="button" accessibilityLabel={action} onPress={onAction} hitSlop={8}>
          <Text style={styles.sectionAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Button({ title, onPress, variant = 'primary', icon, disabled, loading, style }) {
  const palette = {
    primary: [styles.buttonPrimary, styles.buttonTextPrimary],
    secondary: [styles.buttonSecondary, styles.buttonTextSecondary],
    outline: [styles.buttonOutline, styles.buttonTextOutline],
    danger: [styles.buttonDanger, styles.buttonTextDanger],
    ghost: [styles.buttonGhost, styles.buttonTextSecondary],
  }[variant] || [styles.buttonPrimary, styles.buttonTextPrimary];
  const isDisabled = Boolean(disabled || loading);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: isDisabled, busy: Boolean(loading) }}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [styles.button, palette[0], style, isDisabled && styles.disabled, pressed && styles.pressed]}
    >
      {loading ? <ActivityIndicator accessibilityLabel="Loading" color={variant === 'primary' ? colors.onPrimary : variant === 'danger' ? colors.onDanger : colors.primary} /> : null}
      {!loading && icon ? <Ionicons name={icon} size={19} color={variant === 'primary' ? colors.onPrimary : variant === 'danger' ? colors.onDanger : colors.primary} /> : null}
      {!loading ? <Text style={[styles.buttonText, palette[1]]}>{title}</Text> : null}
    </Pressable>
  );
}

export function IconButton({ icon, onPress, label, badge, style }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.iconButton, style, pressed && styles.pressed]}>
      <Ionicons name={icon} size={23} color={colors.primary} />
      {badge ? <View style={styles.badge}><Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text></View> : null}
    </Pressable>
  );
}

export function Field({ label, error, multiline, style, containerStyle, ...props }) {
  return (
    <View style={[styles.fieldWrap, containerStyle]}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <TextInput
        accessibilityLabel={props.accessibilityLabel || label}
        {...props}
        multiline={multiline}
        placeholderTextColor={colors.placeholder}
        style={[styles.field, multiline && styles.fieldMultiline, error && styles.fieldError, style]}
      />
      {error ? <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

export function Loading({ label = 'Loading…' }) {
  return (
    <View style={styles.centerState} accessibilityLiveRegion="polite">
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.stateText}>{label}</Text>
    </View>
  );
}

export function EmptyState({ icon = 'leaf-outline', title, message, action, onAction }) {
  return (
    <View style={styles.emptyCard}>
      <View style={styles.emptyIcon}><Ionicons name={icon} size={30} color={colors.primary} /></View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {message ? <Text style={styles.emptyMessage}>{message}</Text> : null}
      {action ? <Button title={action} onPress={onAction} variant="outline" style={{ marginTop: spacing.md }} /> : null}
    </View>
  );
}

export function Avatar({ uri, name, size = 42 }) {
  const initials = String(name || 'N').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  if (uri) {
    return <Image accessibilityLabel={`${name || 'User'} profile photo`} source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceMuted }} />;
  }
  return (
    <View accessibilityLabel={`${name || 'User'} profile placeholder`} style={[styles.avatarFallback, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: Math.max(12, size * 0.34) }]}>{initials}</Text>
    </View>
  );
}

export function Pill({ label, active, onPress }) {
  const content = (
    <Text
      numberOfLines={1}
      ellipsizeMode="tail"
      style={[styles.pillText, active && styles.pillTextActive]}
    >
      {label}
    </Text>
  );
  if (!onPress) return <View style={[styles.pill, active && styles.pillActive]}>{content}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: Boolean(active) }} accessibilityLabel={label} onPress={onPress} style={[styles.pill, active && styles.pillActive]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  screenContent: { padding: spacing.lg, paddingBottom: 48 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  sectionTitle: { fontSize: 21, fontWeight: '900', color: colors.text },
  sectionAction: { color: colors.primary, fontWeight: '800' },
  button: { minHeight: 48, paddingHorizontal: spacing.lg, borderRadius: radii.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonSecondary: { backgroundColor: colors.surfaceMuted },
  buttonOutline: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary },
  buttonDanger: { backgroundColor: colors.danger },
  buttonGhost: { backgroundColor: 'transparent' },
  buttonText: { fontWeight: '900', fontSize: 15 },
  buttonTextPrimary: { color: colors.onPrimary },
  buttonTextSecondary: { color: colors.primary },
  buttonTextOutline: { color: colors.primary },
  buttonTextDanger: { color: colors.onDanger },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.78 },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted },
  badge: { position: 'absolute', top: -3, right: -3, minWidth: 19, height: 19, borderRadius: 10, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: colors.onDanger, fontSize: 10, fontWeight: '900' },
  fieldWrap: { marginBottom: spacing.md },
  fieldLabel: { color: colors.text, fontWeight: '800', marginBottom: 6 },
  field: { minHeight: 50, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: 14, backgroundColor: colors.surface, color: colors.text, fontSize: 16 },
  fieldMultiline: { minHeight: 110, paddingTop: 14, textAlignVertical: 'top' },
  fieldError: { borderColor: colors.danger },
  errorText: { marginTop: 4, color: colors.danger, fontSize: 12 },
  centerState: { flex: 1, minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: 12, padding: spacing.xl },
  stateText: { color: colors.muted, fontWeight: '700' },
  emptyCard: { margin: spacing.lg, padding: spacing.xl, backgroundColor: colors.surface, borderRadius: radii.lg, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  emptyTitle: { fontSize: 19, fontWeight: '900', color: colors.text, textAlign: 'center' },
  emptyMessage: { color: colors.muted, textAlign: 'center', lineHeight: 21, marginTop: 7 },
  avatarFallback: { backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.onPrimary, fontWeight: '900' },
  pill: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: radii.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { color: colors.primary, fontWeight: '800' },
  pillTextActive: { color: colors.onPrimary },
});
