import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { allowTry, clientIp } from "@/lib/request-tries";
import { receiptOpen } from "@/features/order-receipt/lib/order-receipt";
import {
  META_CAPI_PROVIDER,
  browsingData,
  cleanToken,
  eventsBody,
  eventsEndpoint,
  metaEvent,
  purchaseData,
  purchaseEventId,
  readMetaAnswer,
  userData,
  validPixelId,
  type MetaEvent,
  type SendResult,
} from "@/lib/ad-events/meta-conversions";

/**
 * The store's server sends Meta the storefront's events (Conversions API), beside the browser
 * pixel. Called from the shopper's page only while they allowed marketing (as the pixel is), and
 * only for a store that turned the pixel on and saved a Conversions API token on its
 * Integrations page. A purchase is read from the order the database wrote, while it is fresh
 * (`receiptOpen`), so its value cannot be made up in a browser; Meta counts it once with the
 * pixel's own (same `event_id`). Nothing here ever stops the page: an answer, never a throw.
 */

type Setup = { pixelId: string; token: string };
const SETUP_TTL_MS = 5 * 60 * 1000;
const setups = new Map<string, { at: number; setup: Setup | null }>();

type Rpc = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

/** The store's pixel and token, or null when either is missing (kept a few minutes per worker). */
async function storeSetup(brandId: string, fresh = false): Promise<Setup | null> {
  const now = Date.now();
  const kept = setups.get(brandId);
  if (!fresh && kept && now - kept.at < SETUP_TTL_MS) return kept.setup;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: tracking }, { data: credential }] = await Promise.all([
    supabaseAdmin
      .from("brand_tracking_settings")
      .select("meta_pixel_enabled, meta_pixel_id")
      .eq("brand_id", brandId)
      .maybeSingle(),
    (supabaseAdmin.rpc as unknown as Rpc)("get_integration_credential_secret", {
      p_brand_id: brandId,
      p_provider: META_CAPI_PROVIDER,
    }),
  ]);
  const row = Array.isArray(credential)
    ? (credential[0] as { api_key?: string; is_active?: boolean } | undefined)
    : undefined;
  const token = row?.is_active === false ? null : cleanToken(row?.api_key);
  const pixelId = tracking?.meta_pixel_enabled ? tracking.meta_pixel_id : null;
  const setup = token && validPixelId(pixelId) ? { pixelId, token } : null;
  if (setups.size > 5_000) setups.clear();
  setups.set(brandId, { at: now, setup });
  return setup;
}

async function send(
  setup: Setup,
  events: MetaEvent[],
  testEventCode?: string,
): Promise<SendResult> {
  try {
    const response = await fetch(eventsEndpoint(setup.pixelId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(eventsBody(events, setup.token, testEventCode)),
      signal: AbortSignal.timeout(8_000),
    });
    const body = await response.json().catch(() => null);
    const result = readMetaAnswer(response.status, body);
    if (!result.sent) console.warn("[meta-capi] refused", result.detail);
    return result;
  } catch (error) {
    console.warn("[meta-capi] unreachable", error);
    return { sent: false, reason: "unreachable" };
  }
}

function visitOf(cookies: { fbp?: string | null; fbc?: string | null }) {
  let userAgent: string | null = null;
  try {
    userAgent = getRequest()?.headers.get("user-agent") ?? null;
  } catch {
    userAgent = null;
  }
  return { ip: clientIp(), userAgent, fbp: cookies.fbp, fbc: cookies.fbc };
}

const cookie = z.string().max(600).nullish();
const pageUrl = z.string().max(2000).nullish();

const ORDER_COLUMNS = `
  id, brand_id, channel, created_at, currency, total, customer_id, destination_country,
  customer_email_snapshot, customer_name_snapshot, customer_phone_snapshot,
  customers(name, email, phone),
  order_items(product_id, quantity, line_total)
`;

type OrderRow = {
  id: string;
  brand_id: string;
  channel: string | null;
  created_at: string | null;
  currency: string | null;
  total: number | null;
  customer_id: string | null;
  destination_country: string | null;
  customer_email_snapshot: string | null;
  customer_name_snapshot: string | null;
  customer_phone_snapshot: string | null;
  customers: { name: string | null; email: string | null; phone: string | null } | null;
  order_items: { product_id: string | null; quantity: number; line_total: number }[] | null;
};

/** The shopper's purchase, sent from the order itself. */
export const sendMetaPurchase = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ orderId: z.string().uuid(), pageUrl, fbp: cookie, fbc: cookie }).parse(data),
  )
  .handler(async ({ data }): Promise<SendResult> => {
    if (!allowTry(`meta-purchase:${clientIp()}`, Date.now(), 30))
      return { sent: false, reason: "too_many" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("orders")
      .select(ORDER_COLUMNS)
      .eq("id", data.orderId)
      .maybeSingle();
    const order = row as unknown as OrderRow | null;
    if (!order || !receiptOpen(order, Date.now())) return { sent: false, reason: "not_found" };
    const setup = await storeSetup(order.brand_id);
    if (!setup) return { sent: false, reason: "off" };
    const { data: settings } = await supabaseAdmin
      .from("business_settings")
      .select("currency")
      .eq("brand_id", order.brand_id)
      .maybeSingle();
    const user = await userData(
      {
        email: order.customer_email_snapshot || order.customers?.email,
        phone: order.customer_phone_snapshot || order.customers?.phone,
        name: order.customer_name_snapshot || order.customers?.name,
        country: order.destination_country,
        customerId: order.customer_id,
      },
      visitOf(data),
    );
    const custom = purchaseData({
      id: order.id,
      currency: order.currency || settings?.currency || "BHD",
      total: Number(order.total ?? 0),
      lines: (order.order_items ?? []).map((line) => ({
        productId: line.product_id,
        quantity: Number(line.quantity ?? 0),
        lineTotal: Number(line.line_total ?? 0),
      })),
    });
    const event = metaEvent({
      event: "purchase",
      eventId: purchaseEventId(order.id),
      now: Date.now(),
      pageUrl: data.pageUrl,
      user,
      custom,
    });
    return send(setup, [event]);
  });

/** A product viewed, added to the bag, or checkout begun, as the storefront saw it. */
export const sendMetaBrowsingEvent = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        brandId: z.string().uuid(),
        event: z.enum(["view_item", "add_to_cart", "begin_checkout"]),
        eventId: z.string().min(8).max(100),
        pageUrl,
        fbp: cookie,
        fbc: cookie,
        currency: z.string().max(3).nullish(),
        value: z.number().min(0).max(10_000_000).nullish(),
        contentIds: z.array(z.string().max(64)).max(50).optional(),
        numItems: z.number().int().min(0).max(10_000).nullish(),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<SendResult> => {
    if (!allowTry(`meta-browse:${clientIp()}`, Date.now(), 600))
      return { sent: false, reason: "too_many" };
    const setup = await storeSetup(data.brandId);
    if (!setup) return { sent: false, reason: "off" };
    const event = metaEvent({
      event: data.event,
      eventId: data.eventId,
      now: Date.now(),
      pageUrl: data.pageUrl,
      user: await userData({}, visitOf(data)),
      custom: browsingData(data),
    });
    return send(setup, [event]);
  });

/**
 * The Integrations page's check: one test event under the code Meta's Events Manager shows
 * (Test events tab), read fresh, so a wrong token or pixel is told now rather than in a week of
 * missing sales. Store admins only, as the page.
 */
export const testMetaConversions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({ brandId: z.string().uuid(), testEventCode: z.string().trim().min(3).max(40) })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<SendResult> => {
    const [{ data: access }, { data: admin }] = await Promise.all([
      context.supabase.rpc("can_access_brand", { _brand_id: data.brandId }),
      context.supabase.rpc("is_admin"),
    ]);
    if (!access || !admin) throw new Error("FORBIDDEN");
    const setup = await storeSetup(data.brandId, true);
    if (!setup) return { sent: false, reason: "off" };
    const event = metaEvent({
      event: "view_item",
      eventId: `test:${crypto.randomUUID()}`,
      now: Date.now(),
      user: await userData({}, visitOf({})),
      custom: { content_type: "product" },
    });
    return send(setup, [event], data.testEventCode);
  });
