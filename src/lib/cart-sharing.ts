import { supabase } from "@/integrations/supabase/client";
import type { CartItem, CustomFieldValue } from "./storefront-context";

export type CompactCustomField = {
  k: string; // key
  v: string; // value
  la?: string | null; // label_ar
  le?: string | null; // label_en
};

export type CompactCartItem = {
  p: string; // product_id
  v?: string | null; // variant_id
  n: string; // name
  na?: string | null; // name_ar
  ne?: string | null; // name_en
  img?: string | null; // image
  pr: number; // price
  op?: number | null; // original_price
  s?: string | null; // size
  c?: string | null; // color
  f?: string | null; // fabric
  q: number; // qty
  m: number; // max_stock
  cf?: CompactCustomField[]; // custom_fields
};

const SHORT_CODE_CHARS = "23456789abcdefghjkmnpqrstuvwxyz";

/**
 * Generates a clean, unambiguous 6-character short code.
 */
export function generateShortCartCode(length: number = 6): string {
  let result = "";
  const bytes = new Uint8Array(length);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
    for (let i = 0; i < length; i++) {
      result += SHORT_CODE_CHARS[bytes[i] % SHORT_CODE_CHARS.length];
    }
  } else {
    for (let i = 0; i < length; i++) {
      result += SHORT_CODE_CHARS[Math.floor(Math.random() * SHORT_CODE_CHARS.length)];
    }
  }
  return result;
}

/**
 * Creates a persistent short cart link in Supabase and returns the short URL.
 * Falls back to base64 URL if database insertion is unavailable.
 */
export async function createSharedCartLink(
  brandId: string,
  brandSlug: string,
  cart: CartItem[],
  baseUrl?: string,
): Promise<string> {
  if (!cart || cart.length === 0) return "";

  const origin =
    baseUrl || (typeof window !== "undefined" ? window.location.origin : "https://boutq.store");

  try {
    const code = generateShortCartCode(6);
    const { error } = await (supabase as any).from("shared_carts").insert({
      code,
      brand_id: brandId || null,
      brand_slug: brandSlug,
      items: cart,
    });

    if (!error) {
      return `${origin}/${brandSlug}?c=${code}`;
    }
    console.warn("Failed to create short cart record, falling back to base64:", error);
  } catch (err) {
    console.warn("Shared cart database error, falling back to base64:", err);
  }

  // Fallback to Base64 parameter if DB write failed
  return buildCartShareUrl(brandSlug, cart, baseUrl);
}

/**
 * Fetches a shared cart by its short code from the database.
 */
export async function fetchSharedCartByCode(code: string): Promise<CartItem[] | null> {
  if (!code || typeof code !== "string") return null;

  try {
    const cleanCode = code.trim().toLowerCase();
    const { data, error } = await (supabase as any)
      .from("shared_carts")
      .select("items, expires_at")
      .eq("code", cleanCode)
      .maybeSingle();

    if (error || !data) return null;

    if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
      console.warn("Shared cart link has expired");
      return null;
    }

    if (Array.isArray(data.items) && data.items.length > 0) {
      return data.items as CartItem[];
    }
  } catch (err) {
    console.error("Error fetching shared cart by code:", err);
  }

  return null;
}

/**
 * Compacts and encodes an array of CartItems into a URL-safe Base64 string.
 */
export function encodeCartSharePayload(cart: CartItem[]): string {
  if (!cart || cart.length === 0) return "";
  const compactList: CompactCartItem[] = cart.map((item) => ({
    p: item.product_id,
    v: item.variant_id || undefined,
    n: item.name,
    na: item.name_ar || undefined,
    ne: item.name_en || undefined,
    img: item.image || undefined,
    pr: item.price,
    op: item.original_price || undefined,
    s: item.size || undefined,
    c: item.color || undefined,
    f: item.fabric || undefined,
    q: item.qty,
    m: item.max_stock,
    cf:
      item.custom_fields && item.custom_fields.length > 0
        ? item.custom_fields.map((f) => ({
            k: f.key,
            v: f.value,
            la: f.label_ar || undefined,
            le: f.label_en || undefined,
          }))
        : undefined,
  }));

  try {
    const json = JSON.stringify(compactList);
    const utf8Bytes = new TextEncoder().encode(json);
    let binary = "";
    for (let i = 0; i < utf8Bytes.length; i++) {
      binary += String.fromCharCode(utf8Bytes[i]);
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  } catch (err) {
    console.error("Failed to encode cart share payload:", err);
    return "";
  }
}

/**
 * Decodes a URL-safe Base64 string into CartItem array.
 */
export function decodeCartSharePayload(payload: string): CartItem[] | null {
  if (!payload || typeof payload !== "string") return null;

  try {
    let base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4 !== 0) {
      base64 += "=";
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const json = new TextDecoder().decode(bytes);
    const compactList = JSON.parse(json) as CompactCartItem[];

    if (!Array.isArray(compactList) || compactList.length === 0) return null;

    return compactList.map((c) => {
      const customFields: CustomFieldValue[] | undefined = c.cf?.map((f) => ({
        key: f.k,
        value: f.v,
        label_ar: f.la ?? null,
        label_en: f.le ?? null,
      }));

      const fieldsKey = [...(customFields ?? [])]
        .map((field) => ({ key: field.key, value: field.value }))
        .sort((a, b) => a.key.localeCompare(b.key));

      const cartLineId = JSON.stringify({
        variant: c.v || null,
        size: c.s ?? "",
        color: c.c ?? "",
        fabric: c.f ?? "",
        fields: fieldsKey,
      });

      const item: CartItem = {
        cart_line_id: cartLineId,
        product_id: c.p,
        variant_id: c.v || null,
        name: c.n,
        name_ar: c.na || null,
        name_en: c.ne || null,
        image: c.img || null,
        price: Number(c.pr),
        original_price: c.op ? Number(c.op) : null,
        size: c.s || null,
        color: c.c || null,
        fabric: c.f || null,
        qty: Math.max(1, Number(c.q || 1)),
        max_stock: Math.max(1, Number(c.m || 99)),
        custom_fields: customFields,
      };

      return item;
    });
  } catch (err) {
    console.error("Failed to decode cart share payload:", err);
    return null;
  }
}

/**
 * Builds the full shareable URL for the given brand storefront and cart.
 */
export function buildCartShareUrl(brandSlug: string, cart: CartItem[], baseUrl?: string): string {
  const payload = encodeCartSharePayload(cart);
  if (!payload) return "";

  const origin =
    baseUrl || (typeof window !== "undefined" ? window.location.origin : "https://boutq.store");

  return `${origin}/${brandSlug}?share_cart=${encodeURIComponent(payload)}`;
}

/**
 * Builds the pre-filled WhatsApp share link.
 */
export function buildWhatsAppShareUrl(options: {
  shareUrl: string;
  brandName: string;
  itemCount: number;
  totalFormatted: string;
  isAr: boolean;
}): string {
  const { shareUrl, brandName, itemCount, totalFormatted, isAr } = options;
  const message = isAr
    ? `🛒 تفضل سلة المشتريات المختارة من *${brandName}* (${itemCount} ${itemCount === 1 ? "منتج" : "منتجات"} - ${totalFormatted}):\n\nاضغط على الرابط لإكمال الطلب مباشرة:\n${shareUrl}`
    : `🛒 Here is the curated shopping cart from *${brandName}* (${itemCount} items - ${totalFormatted}):\n\nClick the link to complete your order:\n${shareUrl}`;

  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
