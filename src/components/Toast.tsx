import React, { useEffect } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { colors, radius, shadows, spacing } from "@/src/theme";

type Toast = { id: string; message: string; type: "info" | "success" | "error" };

let listeners: ((t: Toast) => void)[] = [];
let counter = 0;

export const toast = {
  show(message: string, type: Toast["type"] = "info") {
    const t: Toast = { id: `${++counter}`, message, type };
    listeners.forEach((l) => l(t));
  },
  success(m: string) {
    this.show(m, "success");
  },
  error(m: string) {
    this.show(m, "error");
  },
};

export function ToastHost() {
  const [items, setItems] = React.useState<Toast[]>([]);
  const anims = React.useRef<Record<string, Animated.Value>>({}).current;

  useEffect(() => {
    const l = (t: Toast) => {
      const v = new Animated.Value(0);
      anims[t.id] = v;
      setItems((cur) => [...cur, t]);
      Animated.timing(v, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      setTimeout(() => {
        Animated.timing(v, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
          setItems((cur) => cur.filter((x) => x.id !== t.id));
          delete anims[t.id];
        });
      }, 2600);
    };
    listeners.push(l);
    return () => {
      listeners = listeners.filter((x) => x !== l);
    };
  }, [anims]);

  return (
    <View pointerEvents="box-none" style={styles.host}>
      {items.map((t) => (
        <Animated.View
          key={t.id}
          style={[
            styles.toast,
            t.type === "success" && { backgroundColor: colors.green },
            t.type === "error" && { backgroundColor: colors.error },
            {
              opacity: anims[t.id] ?? 1,
              transform: [
                {
                  translateY:
                    anims[t.id]?.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) ?? 0,
                },
              ],
            },
          ]}
        >
          <Text style={[styles.text, t.type === "success" && { color: colors.onBrand }]}>{t.message}</Text>
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    top: 50,
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 9999,
  },
  toast: {
    backgroundColor: colors.onSurface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    ...shadows.strong,
  },
  text: { color: colors.onBrand, fontWeight: "600", fontSize: 14 },
});
