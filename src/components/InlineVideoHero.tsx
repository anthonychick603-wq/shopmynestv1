// v1.0.213 (P0 #7) — inline autoplay muted product video for the PDP hero,
// with a tap-to-open fullscreen modal player. Uses expo-video (SDK 54's
// stable video primitive, replacing expo-av). Wrapped in a defensive
// require() so a stale dev build without expo-video installed silently
// falls back to the still-image hero instead of crash-looping.

import React, { useEffect, useRef, useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, radius, spacing } from "@/src/theme";
import { haptics } from "@/src/utils/haptics";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _expoVideo: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  _expoVideo = require("expo-video");
} catch {
  _expoVideo = null;
}

// Guarded types: expo-video's real types are only available at runtime once
// the package resolves. We type against the pieces we actually touch.
type VideoPlayerLike = {
  play: () => void;
  pause: () => void;
  loop: boolean;
  muted: boolean;
  currentTime: number;
  release?: () => void;
};

export function isVideoSupported(): boolean {
  return !!_expoVideo && !!_expoVideo.VideoView && !!_expoVideo.useVideoPlayer;
}

type InlineHeroProps = {
  uri: string;
  style?: object;
  onOpenFullscreen: () => void;
};

// Inline hero: muted, looping, autoplay, no controls. Tap-through hits the
// hero (fullscreen opens with sound); a small speaker toggle stays in the
// corner so buyers can un-mute without leaving the PDP.
export function InlineVideoHero({ uri, style, onOpenFullscreen }: InlineHeroProps) {
  const [muted, setMuted] = useState(true);
  // useVideoPlayer expects a source and an initializer. Hooks must run
  // unconditionally, so we always call it; the outer PDP already decides
  // whether to mount this component at all.
  const player: VideoPlayerLike | null = _expoVideo?.useVideoPlayer
    ? _expoVideo.useVideoPlayer(uri, (p: VideoPlayerLike) => {
        p.loop = true;
        p.muted = true;
        p.play();
      })
    : null;

  useEffect(() => {
    if (player) player.muted = muted;
  }, [player, muted]);

  if (!isVideoSupported() || !player) {
    // Nothing to render — parent will fall back to still image.
    return null;
  }
  const VideoView = _expoVideo.VideoView;
  return (
    <View style={style}>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => { haptics.tap(); onOpenFullscreen(); }}
        accessibilityRole="button"
        accessibilityLabel="Open video fullscreen"
        testID="pdp-video-open-fullscreen"
        style={StyleSheet.absoluteFill}
      >
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          nativeControls={false}
          contentFit="cover"
          allowsFullscreen={false}
          allowsPictureInPicture={false}
        />
      </TouchableOpacity>
      <View style={inlineStyles.controls} pointerEvents="box-none">
        <TouchableOpacity
          onPress={() => { haptics.tap(); setMuted((m) => !m); }}
          style={inlineStyles.chip}
          accessibilityLabel={muted ? "Unmute video" : "Mute video"}
          accessibilityRole="button"
          testID="pdp-video-mute-toggle"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name={muted ? "volume-mute" : "volume-high"} size={16} color={colors.onBrand} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => { haptics.tap(); onOpenFullscreen(); }}
          style={inlineStyles.chip}
          accessibilityLabel="Expand to fullscreen"
          accessibilityRole="button"
          testID="pdp-video-expand"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="expand" size={16} color={colors.onBrand} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

type FullscreenProps = {
  uri: string;
  visible: boolean;
  onClose: () => void;
};

// Fullscreen modal: unmuted, with native controls, tap the X to close.
export function FullscreenVideoModal({ uri, visible, onClose }: FullscreenProps) {
  const playerRef = useRef<VideoPlayerLike | null>(null);
  const player: VideoPlayerLike | null = _expoVideo?.useVideoPlayer
    ? _expoVideo.useVideoPlayer(uri, (p: VideoPlayerLike) => {
        p.loop = false;
        p.muted = false;
      })
    : null;
  useEffect(() => { playerRef.current = player; }, [player]);
  useEffect(() => {
    if (!player) return;
    if (visible) {
      player.currentTime = 0;
      player.muted = false;
      player.play();
    } else {
      try { player.pause(); } catch { /* noop */ }
    }
  }, [visible, player]);

  if (!isVideoSupported() || !player) return null;
  const VideoView = _expoVideo.VideoView;
  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={fsStyles.backdrop}>
        <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
          <View style={fsStyles.topBar}>
            <TouchableOpacity
              onPress={() => { haptics.tap(); onClose(); }}
              style={fsStyles.closeBtn}
              accessibilityLabel="Close video"
              accessibilityRole="button"
              testID="pdp-video-close"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
          <View style={fsStyles.playerWrap}>
            <VideoView
              player={player}
              style={fsStyles.player}
              nativeControls
              contentFit="contain"
              allowsFullscreen
              allowsPictureInPicture={false}
            />
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const inlineStyles = StyleSheet.create({
  controls: { position: "absolute", right: spacing.md, bottom: spacing.md, flexDirection: "row", gap: spacing.sm },
  chip: { width: 32, height: 32, borderRadius: radius.pill, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" },
});

const fsStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "#000" },
  topBar: { flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  playerWrap: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: spacing.md },
  player: { width: "100%", aspectRatio: 9 / 16, maxHeight: "100%" },
});

// Suppress unused-var lint warning for the intentionally-defensive require.
export const _hasExpoVideo = _expoVideo;
