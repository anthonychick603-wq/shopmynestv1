import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing } from '../theme';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    if (__DEV__) {
      console.error('The Nest render error', error, info);
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <View style={styles.screen}>
        <View style={styles.card}>
          <View style={styles.icon}>
            <Ionicons name="alert-circle-outline" size={34} color={colors.primary} />
          </View>
          <Text style={styles.title}>The Nest hit an unexpected error</Text>
          <Text style={styles.message}>Try opening this screen again. Your account and cart are stored separately and should remain available.</Text>
          <Pressable style={styles.button} onPress={() => this.setState({ hasError: false })}>
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  card: { width: '100%', maxWidth: 520, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.xl, alignItems: 'center' },
  icon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontSize: 22, fontWeight: '900', textAlign: 'center', marginTop: spacing.lg },
  message: { color: colors.muted, lineHeight: 21, textAlign: 'center', marginTop: spacing.sm },
  button: { minHeight: 48, alignSelf: 'stretch', backgroundColor: colors.primary, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', marginTop: spacing.xl },
  buttonText: { color: colors.onPrimary, fontWeight: '900', fontSize: 15 },
});
