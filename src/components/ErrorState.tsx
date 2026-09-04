import React from "react";
import { EmptyState } from "./EmptyState";

type Props = {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  testID?: string;
  compact?: boolean;
};

// v1.0.243 — ErrorState: a small semantic wrapper around EmptyState that
// gives every buyer-facing screen a consistent retryable error surface,
// visibly distinct from a real empty state. Fixes the 14 P1s where an
// API failure was collapsed to `setItems([])` and rendered as
// "No orders yet" / "No favorites" / "All caught up" / "No disputes"
// with no retry path — buyers could not tell whether their data had
// vanished or the network was down, and had to leave the screen to try
// again. Now every one of those screens shows an alert icon, a
// "Something went wrong" title, the underlying friendly message, and a
// Retry button that reuses the screen's existing load path.
export function ErrorState({
  title = "Something went wrong",
  message = "We couldn't load this right now. Please try again.",
  onRetry,
  retryLabel = "Retry",
  testID,
  compact,
}: Props) {
  return (
    <EmptyState
      icon="alert-circle-outline"
      title={title}
      message={message}
      actionLabel={onRetry ? retryLabel : undefined}
      onAction={onRetry}
      testID={testID ?? "error-state"}
      compact={compact}
    />
  );
}
