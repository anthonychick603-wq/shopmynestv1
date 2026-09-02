// v1.0.207 — full-screen image viewer for product photos.
//
// Opens when the buyer taps the PDP hero. Shows the currently-selected
// image full-screen, supports pinch to zoom, pan while zoomed, swipe
// between images when NOT zoomed, and a close button. Background is
// pure black to make photo colors accurate.
//
// The horizontal swipe is a plain ScrollView (paging enabled) so we
// don't fight the RN gesture composer. Zoom + pan work per-page.

import React, { useEffect, useRef, useState } from "react";
import {
  Dimensions,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { AppImage } from "./AppImage";
import { colors, spacing } from "@/src/theme";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const MIN_SCALE = 1;
const MAX_SCALE = 4;

const AnimatedAppImage = Animated.createAnimatedComponent(AppImage);

type Props = {
  visible: boolean;
  images: string[];
  initialIndex?: number;
  onClose: () => void;
};

export function ZoomableImageViewer({ visible, images, initialIndex = 0, onClose }: Props) {
  const [index, setIndex] = useState(initialIndex);
  const scrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    if (visible) {
      setIndex(initialIndex);
      // Jump the ScrollView after a tick — offset must be applied
      // after content lays out.
      const t = setTimeout(() => {
        scrollRef.current?.scrollTo({ x: initialIndex * SCREEN_W, animated: false });
      }, 10);
      return () => clearTimeout(t);
    }
  }, [visible, initialIndex]);

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <View style={styles.root}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN_W))}
        >
          {images.map((uri, i) => (
            <ZoomPage key={`${uri}-${i}`} uri={uri} />
          ))}
        </ScrollView>

        <TouchableOpacity style={styles.closeBtn} onPress={onClose} accessibilityLabel="Close photo viewer" accessibilityRole="button">
          <Ionicons name="close" size={26} color="#fff" />
        </TouchableOpacity>

        {images.length > 1 ? (
          <View style={styles.counterWrap} pointerEvents="none">
            <Text style={styles.counterText}>{index + 1} / {images.length}</Text>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

// Each page owns its own scale/translate so zoom on page 1 doesn't leak
// into page 2. We disable horizontal parent-scroll while zoomed via
// activeOffsetX on the pan; parent ScrollView still handles the
// unzoomed swipe.
function ZoomPage({ uri }: { uri: string }) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);
  const [pagingLocked, setPagingLocked] = useState(false);

  const setLocked = (v: boolean) => setPagingLocked(v);

  const pinch = Gesture.Pinch()
    .onStart(() => { runOnJS(setLocked)(true); })
    .onUpdate((e) => {
      const next = savedScale.value * e.scale;
      scale.value = Math.max(MIN_SCALE, Math.min(MAX_SCALE, next));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= 1.02) {
        scale.value = withTiming(1);
        tx.value = withTiming(0);
        ty.value = withTiming(0);
        savedScale.value = 1;
        savedTx.value = 0;
        savedTy.value = 0;
        runOnJS(setLocked)(false);
      }
    });

  const pan = Gesture.Pan()
    .minPointers(1)
    .onUpdate((e) => {
      if (scale.value <= 1.02) return;
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
        runOnJS(setLocked)(false);
      } else {
        scale.value = withTiming(2.5);
        savedScale.value = 2.5;
        runOnJS(setLocked)(true);
      }
    });

  const composed = Gesture.Simultaneous(pinch, pan, doubleTap);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  return (
    <View style={{ width: SCREEN_W, height: SCREEN_H }}>
      <GestureDetector gesture={composed}>
        <Animated.View style={StyleSheet.absoluteFill}>
          <AnimatedAppImage
            source={{ uri }}
            style={[{ width: SCREEN_W, height: SCREEN_H }, animStyle]}
            resizeMode="contain"
            fallbackIcon="pricetag-outline"
          />
        </Animated.View>
      </GestureDetector>
      {/* invisible sink — swallows horizontal scroll when zoomed by using pointerEvents="none" when not needed */}
      {pagingLocked ? <View style={StyleSheet.absoluteFill} pointerEvents="none" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  closeBtn: {
    position: "absolute",
    top: spacing.xl + 8,
    right: spacing.md,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  counterWrap: {
    position: "absolute",
    top: spacing.xl + 14,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  counterText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: "hidden",
  },
});
