import React, { useEffect } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { colors, radius, shadows, spacing } from "@/src/theme";
import { haptics } from "@/src/utils/haptics";

type Toast = { id: string; message: string; type: "info" | "success" | "error" };

let listeners: ((t: Toast) => void)[] = [];
let counter = 0;

function safeToastMessage(message: unknown, type: Toast["type"]): string {
  const raw = String(message ?? "").trim();
  const looksLikeServerDump =
    /<\s*(?:!doctype|html|head|body|style|script|div)\b/i.test(raw) ||
    /wpcomsh-fatal|php\s+(?:fatal\s+)?error|stack\s+trace:|\/wp-(?:includes|content)\/|\.wpcomsh-[\w-]+\s*\{|font-family\s*:/i.test(raw);

  if (looksLikeServerDump) {
    return type === "error"
      ? "The website is having trouble responding. Please try again."
      : "Something went wrong. Please try again.";
  }

  const compact = raw.replace(/\s+/g, " ").trim();
  if (!compact) return type === "error" ? "Something went wrong. Please try again." : "Done.";
  return compact.length > 320 ? `${compact.slice(0, 317)}…` : compact;
}

export const toast = {
  show(message: string, type: Toast["type"] = "info") {
    // v1.0.173-dev r2 — server/host failures can arrive as WordPress.com fatal
    // HTML+CSS even when an endpoint was expected to return JSON. Sanitize at
    // the final user-facing boundary so no screen can dump PHP, CSS, stack
    // traces, paths, or oversized server responses into a toast.
    const safeMessage = safeToastMessage(message, type);
    const t: Toast = { id: `${++counter}`, message: safeMessage, type };
    // v1.0.69 — pair every toast with a matching haptic so state changes
    // register even when a user is looking away from the screen briefly.
    if (type === "success") haptics.success();
    else if (type === "error") haptics.error();
    else haptics.tap();
    listeners.forEach((l) => l(t));
  },
  info(m: string) {
    this.show(m, "info");
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
