// v1.0.175 — Drop-in replacement for the <KeyboardAvoidingView><ScrollView>
// pair used across every form screen. Solves two long-standing UX bugs at once:
//
//   1) On Android, `<KeyboardAvoidingView behavior={undefined}>` (the pattern
//      most screens ship today) does literally nothing, so focused inputs get
//      buried under the keyboard.
//   2) On iOS, `behavior="padding"` shrinks the container but does NOT scroll
//      the focused input into view — a long form still buries the bottom
//      fields when the keyboard opens.
//
// This component:
//   - Uses `KeyboardAvoidingView` with the right per-platform behavior.
//   - Listens for keyboard show/hide.
//   - Tracks the currently focused native input via
//     TextInput.State.currentlyFocusedInput() and scrolls the input to sit
//     ~SCROLL_MARGIN pixels above the top of the keyboard whenever the
//     keyboard rises OR the focus changes.
//   - Adds a bottom content pad equal to the keyboard height so the last
//     input can always scroll fully clear.
//
// Zero dependencies beyond RN core + react-native-safe-area-context (already
// in the tree). Drop it in place of the existing <KeyboardAvoidingView>
// wrapper — the children API is the same as ScrollView's.

import React, { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  KeyboardEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  ScrollViewProps,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = ScrollViewProps & {
  /** Extra vertical offset added to KeyboardAvoidingView on iOS
   *  (usually the header height). Defaults to 0. */
  keyboardVerticalOffset?: number;
  /** Extra space to keep between the top of the keyboard and the focused
   *  input. Defaults to 24px. */
  scrollMargin?: number;
  children: React.ReactNode;
};

export const KeyboardAwareScroll = forwardRef<ScrollView, Props>(function KeyboardAwareScroll(
  {
    children,
    keyboardVerticalOffset = 0,
    scrollMargin = 24,
    contentContainerStyle,
    keyboardShouldPersistTaps = "handled",
    ...scrollProps
  },
  externalRef,
) {
  const insets = useSafeAreaInsets();
  const localRef = useRef<ScrollView | null>(null);
  const setRefs = useCallback(
    (node: ScrollView | null) => {
      localRef.current = node;
      if (typeof externalRef === "function") externalRef(node);
      else if (externalRef) (externalRef as React.MutableRefObject<ScrollView | null>).current = node;
    },
    [externalRef],
  );

  const [kbHeight, setKbHeight] = useState(0);
  const [kbScreenY, setKbScreenY] = useState<number | null>(null);

  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const changeEvt = Platform.OS === "ios" ? "keyboardWillChangeFrame" : "keyboardDidShow";

    const onShow = (e: KeyboardEvent) => {
      const h = e.endCoordinates?.height ?? 0;
      const y = e.endCoordinates?.screenY ?? null;
      setKbHeight(h);
      setKbScreenY(y);
      // Give layout a beat then scroll the focused input above the keyboard.
      requestAnimationFrame(() => scrollFocusedIntoView(y ?? undefined));
    };
    const onChange = (e: KeyboardEvent) => {
      const h = e.endCoordinates?.height ?? 0;
      const y = e.endCoordinates?.screenY ?? null;
      setKbHeight(h);
      setKbScreenY(y);
      requestAnimationFrame(() => scrollFocusedIntoView(y ?? undefined));
    };
    const onHide = () => {
      setKbHeight(0);
      setKbScreenY(null);
    };

    const subs = [
      Keyboard.addListener(showEvt, onShow),
      Keyboard.addListener(changeEvt, onChange),
      Keyboard.addListener(hideEvt, onHide),
    ];
    return () => subs.forEach((s) => s.remove());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollMargin]);

  const scrollFocusedIntoView = useCallback(
    (kbScreenYArg?: number) => {
      const scroll = localRef.current;
      if (!scroll) return;
      // `currentlyFocusedInput` returns the native ref of the focused input,
      // if any. It's an internal-ish API but has been stable since RN 0.63.
      // The `State` sub-object is not part of the public typings, so we cast
      // through a narrow shape rather than reaching for `any`.
      type FocusedNode = { measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void };
      type TextInputState = {
        State?: {
          currentlyFocusedInput?: () => FocusedNode | null;
          currentlyFocusedField?: () => FocusedNode | null;
        };
      };
      const State = (TextInput as unknown as TextInputState).State;
      const focused: FocusedNode | null =
        State?.currentlyFocusedInput?.() ?? State?.currentlyFocusedField?.() ?? null;
      if (!focused) return;

      // Ask the input where it is on the screen.
      const measure =
        typeof focused.measureInWindow === "function"
          ? focused.measureInWindow.bind(focused)
          : null;
      if (!measure) return;

      measure((x: number, y: number, w: number, h: number) => {
        const inputBottomScreenY = y + h;
        const kbTopScreenY = kbScreenYArg ?? kbScreenY;
        if (kbTopScreenY == null) return;
        const overlap = inputBottomScreenY + scrollMargin - kbTopScreenY;
        if (overlap > 0) {
          // Nudge the scroll offset down by the overlap. `_lastContentOffsetY`
          // is a private field we stash on the ScrollView in onScroll below.
          const scrollWithCache = scroll as ScrollView & { _lastContentOffsetY?: number };
          scroll.scrollTo({
            y: scrollWithCache._lastContentOffsetY
              ? scrollWithCache._lastContentOffsetY + overlap
              : overlap,
            animated: true,
          });
        }
      });
    },
    [kbScreenY, scrollMargin],
  );

  // Keep a running cache of the last content offset so we can add `overlap`
  // to it above without a second measure round-trip.
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const node = localRef.current as (ScrollView & { _lastContentOffsetY?: number }) | null;
      if (node) node._lastContentOffsetY = e.nativeEvent.contentOffset.y;
      scrollProps.onScroll?.(e);
    },
    [scrollProps],
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={keyboardVerticalOffset}
    >
      <ScrollView
        {...scrollProps}
        ref={setRefs}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        contentContainerStyle={[
          contentContainerStyle,
          // Keep enough room below the last input so it can always scroll clear.
          { paddingBottom: (kbHeight > 0 ? kbHeight : insets.bottom + 24) + 40 },
        ]}
      >
        {children}
        {/* Spacer that mirrors the keyboard on Android where
            KeyboardAvoidingView is a no-op. */}
        {Platform.OS === "android" && kbHeight > 0 ? <View style={{ height: kbHeight }} /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
});
