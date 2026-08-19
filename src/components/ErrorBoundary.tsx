// v1.0.73 — Root error boundary. Prevents a single render exception from
// leaving the user on a white screen with no recovery path. Reset button
// clears the caught error and forces a re-render of the subtree.
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, type as typography } from "@/src/theme";

type Props = { children: React.ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Best-effort log; a Sentry / Bugsnag hook can be wired in here later.
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn("[ErrorBoundary]", error?.message, info?.componentStack?.slice(0, 500));
    }
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.root}>
        <View style={styles.content}>
          <View style={styles.iconWrap}>
            <Ionicons name="alert-circle-outline" size={40} color={colors.error} />
          </View>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.body}>
            The app hit an unexpected error. Tapping below will try to recover without losing your place.
          </Text>
          {__DEV__ ? (
            <ScrollView style={styles.debug} contentContainerStyle={{ padding: spacing.sm }}>
              <Text style={styles.debugText}>{this.state.error.message}</Text>
            </ScrollView>
          ) : null}
          <TouchableOpacity
            onPress={this.reset}
            style={styles.btn}
            accessibilityRole="button"
            accessibilityLabel="Try again"
          >
            <Text style={styles.btnText}>Try again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  content: {
    maxWidth: 320,
    alignItems: "center",
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  title: {
    ...typography.h2,
    color: colors.onSurface,
    marginBottom: spacing.sm,
    textAlign: "center",
  },
  body: {
    ...typography.body,
    color: colors.onSurfaceMuted,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  debug: {
    maxHeight: 120,
    width: "100%",
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.sm,
    marginBottom: spacing.md,
  },
  debugText: {
    fontFamily: "Menlo",
    fontSize: 11,
    color: colors.onSurfaceMuted,
  },
  btn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
  },
  btnText: {
    color: colors.onBrand,
    fontWeight: "700",
    fontSize: 15,
  },
});
