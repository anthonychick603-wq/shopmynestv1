/**
 * useUnsavedGuard \u2014 v1.0.166
 *
 * Opt-in "Discard changes?" prompt for form screens. When the user
 * presses the hardware / gesture back button while `isDirty` is true,
 * we intercept the pop, show an Alert, and only navigate away after
 * the user taps Discard. Keep Editing keeps them on the form.
 *
 * Usage:
 *   const dirty = title !== initialTitle || body !== initialBody;
 *   useUnsavedGuard(dirty);
 *
 * The header chevron in each form calls safeBack() from a press
 * handler, so it also needs to consult the same guard \u2014 wrap the
 * safeBack call in `guardAndBack()` returned by this hook.
 */
import { useCallback, useEffect } from "react";
import { Alert, BackHandler, Platform } from "react-native";
import { useNavigation } from "expo-router";
import type { EventArg } from "@react-navigation/native";

import { safeBack } from "@/src/utils/nav";
import { useRouter } from "expo-router";

type Options = {
  message?: string;
  discardLabel?: string;
  keepLabel?: string;
};

export function useUnsavedGuard(isDirty: boolean, opts: Options = {}) {
  const navigation = useNavigation();
  const router = useRouter();
  const {
    message = "You have unsaved changes. Are you sure you want to leave?",
    discardLabel = "Discard",
    keepLabel = "Keep Editing",
  } = opts;

  // React Navigation beforeRemove \u2014 covers the header chevron, iOS
  // swipe-back, and expo-router's stack pop. Fires whenever the screen
  // is about to be popped for any reason.
  useEffect(() => {
    if (!isDirty) return;
    const sub = navigation.addListener(
      "beforeRemove" as never,
      (e: EventArg<"beforeRemove", true, { action: unknown }>) => {
        e.preventDefault();
        Alert.alert("Discard changes?", message, [
          { text: keepLabel, style: "cancel" },
          {
            text: discardLabel,
            style: "destructive",
            onPress: () => navigation.dispatch(e.data.action as never),
          },
        ]);
      },
    );
    return sub;
  }, [isDirty, navigation, message, keepLabel, discardLabel]);

  // Android hardware back \u2014 the beforeRemove listener above already
  // fires for hardware back inside a Stack, but our custom
  // useHardwareBack hook calls safeBack directly on tab-root screens,
  // so we also register a BackHandler here as a safety net.
  useEffect(() => {
    if (!isDirty || Platform.OS !== "android") return;
    const onBack = (): boolean => {
      Alert.alert("Discard changes?", message, [
        { text: keepLabel, style: "cancel" },
        {
          text: discardLabel,
          style: "destructive",
          onPress: () => safeBack(router),
        },
      ]);
      return true; // consume the back press
    };
    const sub = BackHandler.addEventListener("hardwareBackPress", onBack);
    return () => sub.remove();
  }, [isDirty, message, keepLabel, discardLabel, router]);

  // For explicit press handlers (header chevron) that call safeBack
  // themselves. Returns a wrapped function the caller can drop in.
  const guardAndBack = useCallback(() => {
    if (!isDirty) {
      safeBack(router);
      return;
    }
    Alert.alert("Discard changes?", message, [
      { text: keepLabel, style: "cancel" },
      {
        text: discardLabel,
        style: "destructive",
        onPress: () => safeBack(router),
      },
    ]);
  }, [isDirty, message, keepLabel, discardLabel, router]);

  return { guardAndBack };
}
