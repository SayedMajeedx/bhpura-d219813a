import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

/**
 * Public (anonymous) storefront lead capture: back-in-stock alerts and newsletter
 * signups. Runs server-side with the service role so the browser never writes
 * these tables directly, and applies a per-IP + per-brand sliding-window rate limit.
 * Mirrors the in-memory limiter used by `api.admin.nabda-otp.ts`.
 */

const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_IP_PER_HOUR = 5;
const MAX_PER_BRAND_PER_HOUR = 200;

const attemptsByKey = new Map<string, number[]>();

function pruneAndCount(key: string, now: number): number {
  const list = (attemptsByKey.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  attemptsByKey.set(key, list);
  return list.length;
}

function record(key: string, now: number) {
  const list = attemptsByKey.get(key) ?? [];
  list.push(now);
  attemptsByKey.set(key, list);
  if (attemptsByKey.size > 10_000) attemptsByKey.clear();
}

function clientIp(): string {
  try {
    const req = getRequest();
    return (
      req?.headers.get("cf-connecting-ip") ||
      req?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown"
    );
  } catch {
    return "unknown";
  }
}

function enforceRateLimit(scope: string, brandId: string) {
  const now = Date.now();
  const ip = clientIp();
  const ipKey = `${scope}:ip:${ip}`;
  const brandKey = `${scope}:brand:${brandId}`;
  if (pruneAndCount(ipKey, now) >= MAX_PER_IP_PER_HOUR) throw new Error("RATE_LIMITED");
  if (pruneAndCount(brandKey, now) >= MAX_PER_BRAND_PER_HOUR) throw new Error("RATE_LIMITED");
  record(ipKey, now);
  record(brandKey, now);
}

const Channel = z.enum(["whatsapp", "email"]);
const Lang = z.enum(["ar", "en"]).default("ar");

function normalizeContact(channel: "whatsapp" | "email", raw: string): string {
  const value = raw.trim();
  if (channel === "email") {
    const email = value.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) {
      throw new Error("INVALID_CONTACT");
    }
    return email;
  }
  const digits = value.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) throw new Error("INVALID_CONTACT");
  return digits;
}

const BackInStockInput = z.object({
  brandId: z.string().uuid(),
  productId: z.string().uuid(),
  variantId: z.string().uuid().nullable().optional(),
  channel: Channel,
  contact: z.string().min(3).max(254),
  lang: Lang,
});

export const createBackInStockRequest = createServerFn({ method: "POST" })
  .validator((raw: unknown) => BackInStockInput.parse(raw))
  .handler(async ({ data }) => {
    enforceRateLimit("back_in_stock", data.brandId);
    const contact = normalizeContact(data.channel, data.contact);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // The product must belong to the brand and be active; a variant must belong to the product.
    const { data: product } = await (supabaseAdmin.from("products") as any)
      .select("id, brand_id")
      .eq("id", data.productId)
      .eq("brand_id", data.brandId)
      .maybeSingle();
    if (!product) throw new Error("PRODUCT_NOT_FOUND");
    if (data.variantId) {
      const { data: variant } = await (supabaseAdmin.from("product_variants") as any)
        .select("id")
        .eq("id", data.variantId)
        .eq("product_id", data.productId)
        .maybeSingle();
      if (!variant) throw new Error("VARIANT_NOT_FOUND");
    }

    // Idempotent: one pending request per contact/product/variant.
    const { data: existing } = await (supabaseAdmin.from("back_in_stock_requests") as any)
      .select("id")
      .eq("brand_id", data.brandId)
      .eq("product_id", data.productId)
      .is("notified_at", null)
      .eq("channel", data.channel)
      .eq("contact", contact)
      .limit(1);
    if (existing && existing.length > 0) return { ok: true, duplicate: true };

    const { error } = await (supabaseAdmin.from("back_in_stock_requests") as any).insert({
      brand_id: data.brandId,
      product_id: data.productId,
      variant_id: data.variantId ?? null,
      channel: data.channel,
      contact,
      lang: data.lang,
    });
    if (error) throw new Error("INSERT_FAILED");
    return { ok: true, duplicate: false };
  });

const NewsletterInput = z.object({
  brandId: z.string().uuid(),
  channel: Channel,
  contact: z.string().min(3).max(254),
  lang: Lang,
  source: z.string().max(40).default("footer"),
});

export const subscribeToNewsletter = createServerFn({ method: "POST" })
  .validator((raw: unknown) => NewsletterInput.parse(raw))
  .handler(async ({ data }) => {
    enforceRateLimit("newsletter", data.brandId);
    const contact = normalizeContact(data.channel, data.contact);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: brand } = await (supabaseAdmin.from("brands") as any)
      .select("id")
      .eq("id", data.brandId)
      .eq("is_active", true)
      .maybeSingle();
    if (!brand) throw new Error("BRAND_NOT_FOUND");

    const { error } = await (supabaseAdmin.from("newsletter_subscribers") as any).upsert(
      {
        brand_id: data.brandId,
        channel: data.channel,
        contact,
        lang: data.lang,
        source: data.source.replace(/[^a-z0-9_-]/gi, "").slice(0, 40) || "footer",
      },
      { onConflict: "brand_id,channel,contact" },
    );
    if (error) throw new Error("INSERT_FAILED");
    return { ok: true };
  });
