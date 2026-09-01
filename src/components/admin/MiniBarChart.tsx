// v1.0.195 — Zero-dependency bar chart. We deliberately avoid pulling in
// a chart lib (victory-native / react-native-svg-charts / react-native-
// chart-kit / react-native-skia) for two reasons: (1) it keeps the mobile
// bundle 300–600 KB lighter, and (2) our use case here is showing at most
// ~90 daily buckets in a card-height area, which View-based bars render
// pixel-perfect for.
//
// Renders as a horizontal series of rounded bars scaled to the max value
// in the series. Optional Y label at the peak and X-axis endpoint labels.
// Supports a `highlightIndex` for tooltips or a "today" marker.
import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing } from "@/src/theme";

export type BarPoint = { date: string; value: number };

export function MiniBarChart({
  points,
  height = 90,
  format = (n) => n.toLocaleString(),
  color = colors.brand,
  showPeakLabel = true,
  showEndpointLabels = true,
  testID,
}: {
  points: BarPoint[];
  height?: number;
  format?: (n: number) => string;
  color?: string;
  showPeakLabel?: boolean;
  showEndpointLabels?: boolean;
  testID?: string;
}) {
  const { max, peakIdx } = useMemo(() => {
    let m = 0;
    let idx = -1;
    points.forEach((p, i) => { if (p.value > m) { m = p.value; idx = i; } });
    return { max: m, peakIdx: idx };
  }, [points]);

  if (points.length === 0) {
    return (
      <View style={[styles.wrap, { height }]} testID={testID}>
        <Text style={styles.empty}>No data</Text>
      </View>
    );
  }

  return (
    <View testID={testID}>
      <View style={[styles.wrap, { height }]}>
        {points.map((p, i) => {
          const h = max > 0 ? Math.max(2, (p.value / max) * (height - 12)) : 2;
          const isPeak = i === peakIdx;
          return (
            <View
              key={p.date + i}
              style={[
                styles.bar,
                {
                  height: h,
                  backgroundColor: isPeak ? color : color + "55",
                  flex: 1,
                },
              ]}
              accessibilityLabel={`${p.date}: ${format(p.value)}`}
            />
          );
        })}
      </View>
      {showEndpointLabels && points.length >= 2 ? (
        <View style={styles.xAxis}>
          <Text style={styles.xLabel}>{fmtDate(points[0].date)}</Text>
          {showPeakLabel && max > 0 ? (
            <Text style={styles.peakLabel}>peak {format(max)}</Text>
          ) : null}
          <Text style={styles.xLabel}>{fmtDate(points[points.length - 1].date)}</Text>
        </View>
      ) : null}
    </View>
  );
}

// v1.0.195 — short YYYY-MM-DD → "Sep 1" formatting. We keep this local so
// the chart can be dropped into other screens without pulling a date lib.
function fmtDate(iso: string): string {
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  const d = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 2,
    paddingHorizontal: 2,
  },
  bar: {
    borderTopLeftRadius: radius.sm,
    borderTopRightRadius: radius.sm,
    minWidth: 3,
  },
  xAxis: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.xs,
  },
  xLabel: { fontSize: 10, color: colors.onSurfaceMuted },
  peakLabel: { fontSize: 10, color: colors.onSurfaceMuted, fontWeight: "700" },
  empty: { alignSelf: "center", color: colors.onSurfaceMuted, fontSize: 12 },
});
