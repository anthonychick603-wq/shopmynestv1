// v1.0.207 — inline pinch-to-zoom for the PDP hero.
//
// The buyer can pinch and pan on the hero image right where it sits. On
// release we spring the image back to identity so the layout is never
// stuck in a zoomed state. Double-tap toggles between 1x and ~2.5x.
//
// This component intentionally does NOT open a full-screen viewer — that
// lives in ZoomableImageViewer. Tapping the hero (single tap) is what
// opens the viewer; pinch stays inline for the quick-peek gesture.

import React, { ComponentProps } from "react";
import { StyleSheet, ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { AppImage } from "./AppImage";

const AnimatedAppImage = Animated.createAnimatedComponent(AppImage);

const MIN_SCALE = 1;
const MAX_SCALE = 3;
const DOUBLE_TAP_SCALE = 2.5;

type AppImageProps = ComponentProps<typeof AppImage>;

type Props = {
  uri: string;
  style?: ViewStyle;
  resizeMode?: AppImageProps["resizeMode"];
  fallbackIcon?: AppImageProps["fallbackIcon"];
  onSingleTap?: () => void;
};

export function ZoomableImage({ uri, style, resizeMode = "cover", fallbackIcon, onSingleTap }: Props) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      const next = savedScale.value * e.scale;
      scale.value = Math.max(MIN_SCALE, Math.min(MAX_SCALE, next));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      // Spring back to identity when the buyer lets go — the inline hero
      // is meant for a quick peek, not a persistent zoom state.
      scale.value = withSpring(1, { damping: 15 });
      tx.value = withSpring(0, { damping: 15 });
      ty.value = withSpring(0, { damping: 15 });
      savedScale.value = 1;
      savedTx.value = 0;
      savedTy.value = 0;
    });

  const pan = Gesture.Pan()
    .minPointers(2)
    .onUpdate((e) => {
      tx.value = savedTx.value + e.translationX;
      ty.value = savedTy.value + e.translationY;
    })
    .onEnd(() => {
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1.05) {
        scale.value = withTiming(1);
        tx.value = withTiming(0);
        ty.value = withTiming(0);
        savedScale.value = 1;
        savedTx.value = 0;
        savedTy.value = 0;
      } else {
        scale.value = withTiming(DOUBLE_TAP_SCALE);
        savedScale.value = DOUBLE_TAP_SCALE;
      }
    });

  const singleTap = Gesture.Tap()
    .maxDuration(250)
    .onEnd((_e, success) => {
      if (success && onSingleTap) {
        // onSingleTap can safely be called on the JS thread.
        // eslint-disable-next-line no-undef
        (globalThis as any).setImmediate
          ? (globalThis as any).setImmediate(onSingleTap)
          : setTimeout(onSingleTap, 0);
      }
    });

  // singleTap must fail before doubleTap can be recognized, otherwise
  // every double-tap fires as two singles first.
  const composed = Gesture.Simultaneous(pinch, pan, Gesture.Exclusive(doubleTap, singleTap));

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={[styles.wrap, style]}>
        <AnimatedAppImage
          source={{ uri }}
          style={[styles.img, animStyle]}
          resizeMode={resizeMode}
          fallbackIcon={fallbackIcon}
        />
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: "hidden" },
  img: { width: "100%", height: "100%" },
});
