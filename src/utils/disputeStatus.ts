import { colors } from "@/src/theme";
import type { DisputeStatus } from "@/src/types";

const MAP: Record<DisputeStatus, { label: string; color: string }> = {
  open: { label: "Open", color: colors.brand },
  awaiting_seller: { label: "Awaiting seller", color: colors.yellow },
  awaiting_buyer: { label: "Awaiting you", color: colors.yellow },
  escalated: { label: "Escalated", color: colors.error },
  resolved_refund: { label: "Refunded", color: colors.green },
  resolved_partial: { label: "Partial refund", color: colors.green },
  resolved_no_refund: { label: "Closed — no refund", color: colors.onSurfaceMuted },
  closed: { label: "Closed", color: colors.onSurfaceMuted },
};

const FALLBACK = { label: "Open", color: colors.brand };

export function statusStyle(status: string): { label: string; color: string } {
  return MAP[status as DisputeStatus] ?? FALLBACK;
}

export function statusLabel(status: string): string {
  return statusStyle(status).label;
}

export function isResolved(status: string): boolean {
  return status.startsWith("resolved") || status === "closed";
}
