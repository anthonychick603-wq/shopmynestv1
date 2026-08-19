// v1.0.91 — Seller canned-reply templates. Stored per-user in
// AsyncStorage under `msg-tpl:<userId>`; falls back to a small set of
// starter templates on first use. Seller-only feature — the
// TemplatesSheet is only mounted when the composer belongs to a seller
// account.
import { storage } from "@/src/utils/storage";

export type MessageTemplate = { id: string; label: string; body: string };

const KEY = (userId: string | number) => `msg-tpl:${userId}`;

// Starter set — five short, marketplace-appropriate canned replies.
// Sellers can edit or delete these once they hit the manager screen.
export const DEFAULT_TEMPLATES: MessageTemplate[] = [
  {
    id: "shipped-today",
    label: "Shipped today",
    body: "Your order shipped today. You'll see tracking updates in the Nest app as soon as the carrier scans it.",
  },
  {
    id: "restocking-soon",
    label: "Restocking soon",
    body: "Thanks for your interest. I'm restocking this in the next week or two. I'll message you here as soon as it's back.",
  },
  {
    id: "available-pickup",
    label: "Available for pickup",
    body: "This is available for local pickup. Message me your zip and I'll confirm whether pickup makes sense.",
  },
  {
    id: "made-to-order",
    label: "Made to order",
    body: "This is made to order. Once you buy, expect ~7 business days before it ships. I'll message you when it's on the way.",
  },
  {
    id: "thanks-order",
    label: "Thanks for the order",
    body: "Thanks so much for your order. I'll get it packed up carefully and post tracking here the moment it goes out.",
  },
];

export async function loadTemplates(userId: string | number): Promise<MessageTemplate[]> {
  const stored = await storage.getItem<MessageTemplate[] | null>(KEY(userId), null);
  if (Array.isArray(stored) && stored.length > 0) return stored;
  return DEFAULT_TEMPLATES;
}

export async function saveTemplates(userId: string | number, templates: MessageTemplate[]): Promise<boolean> {
  return storage.setItem(KEY(userId), templates);
}

export async function resetTemplates(userId: string | number): Promise<boolean> {
  return storage.setItem(KEY(userId), DEFAULT_TEMPLATES);
}
