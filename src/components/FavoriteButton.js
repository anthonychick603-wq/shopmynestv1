import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useFavorites } from '../context/FavoritesContext';
import { colors } from '../theme';

export default function FavoriteButton({ productId, size = 22, style, onRequireAuth }) {
  const { token } = useAuth();
  const { isFavorite, toggle } = useFavorites();
  const [busy, setBusy] = useState(false);
  const active = isFavorite(productId);

  async function onPress(event) {
    event?.stopPropagation?.();
    if (!token) {
      if (onRequireAuth) onRequireAuth();
      else Alert.alert('Sign in to save favorites', 'Create a free account to keep track of the pieces you love.');
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      await toggle(productId);
    } catch (err) {
      Alert.alert('Could not update favorite', err.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={active ? 'Remove from favorites' : 'Add to favorites'}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.button, style, pressed && styles.pressed]}
    >
      <Ionicons name={active ? 'heart' : 'heart-outline'} size={size} color={active ? colors.danger : colors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  pressed: { opacity: 0.7 },
});
