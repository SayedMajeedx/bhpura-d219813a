/**
 * The storefront's events in Meta's words. The storefront describes an event as Google does
 * (`items` with `item_id`, `price`, `quantity`); Meta reads `content_ids`, `contents` and
 * `num_items`, so both the pixel and the server are given those beside it. Pure.
 */

type Item = { item_id?: unknown; price?: unknown; quantity?: unknown };

export type MetaPayload = {
  currency?: string;
  value?: number;
  content_type: "product";
  content_ids?: string[];
  contents?: { id: string; quantity: number; item_price?: number }[];
  num_items?: number;
  order_id?: string;
};

export function metaPayload(payload: Record<string, unknown>): MetaPayload {
  const items = (Array.isArray(payload.items) ? payload.items : []) as Item[];
  const contents = items
    .filter((item) => typeof item.item_id === "string" && item.item_id)
    .map((item) => ({
      id: String(item.item_id),
      quantity: Number(item.quantity) > 0 ? Math.floor(Number(item.quantity)) : 1,
      ...(Number.isFinite(Number(item.price)) ? { item_price: Number(item.price) } : {}),
    }));
  const given = Array.isArray(payload.content_ids)
    ? payload.content_ids.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  const ids = [...new Set([...given, ...contents.map((item) => item.id)])];
  const out: MetaPayload = { content_type: "product" };
  if (typeof payload.currency === "string" && payload.currency) out.currency = payload.currency;
  if (typeof payload.value === "number" && Number.isFinite(payload.value))
    out.value = payload.value;
  if (ids.length) out.content_ids = ids;
  if (contents.length) {
    out.contents = contents;
    out.num_items = contents.reduce((sum, item) => sum + item.quantity, 0);
  }
  if (typeof payload.transaction_id === "string" && payload.transaction_id)
    out.order_id = payload.transaction_id;
  return out;
}

/** One cookie's value from `document.cookie`, or null. */
export function readCookie(cookies: string, name: string): string | null {
  for (const part of cookies.split(";")) {
    const at = part.indexOf("=");
    if (at < 0) continue;
    if (part.slice(0, at).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(at + 1).trim()) || null;
    } catch {
      return null;
    }
  }
  return null;
}
