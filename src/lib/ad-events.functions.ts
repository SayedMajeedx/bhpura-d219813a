import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { allowTry, clientIp } from "@/lib/request-tries";
import { receiptOpen } from "@/features/order-receipt/lib/order-receipt";
import {
  AD_PLATFORMS,
  AD_PLATFORM_KEYS,
  PIXEL_COLUMNS,
  pixelOf,
  type AdPlatformKey,
  type AdResults,
} from "@/lib/ad-events/platforms";
import {
  cleanToken,
  purchaseEventId,
  type AdEvent,
  type AdRequest,
  type SendResult,
  type Visit,
} from "@/lib/ad-events/shared";

/**
 * The store's server sends its ad platforms (Meta, TikTok, Snapchat) the storefront's events,
 * beside their browser pixels. Called from the shopper's page only while they allowed marketing
 * (as the pixels are), and sent only to a platform whose pixel the store turned on and whose
 * token it saved on its Integrations page. A purchase is read from the order the database wrote,
 * while it is fresh (`receiptOpen`), so its value cannot be made up in a browser; each platform
 * counts it once with its pixel's own (the same event id). Nothing here ever stops the page: an
 * answer, never a throw.
 */

type Setup = { key: AdPlatformKey; pixelId: string; token: string };
const SETUP_TTL_MS = 5 * 60 * 1000;
const setups = new Map<string, { at: number; setup: Setup[] }>();

type Rpc = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

const TRACKING_COLUMNS = AD_PLATFORM_KEYS.flatMap((key) => [
  PIXEL_COLUMNS[key].enabled,
  PIXEL_COLUMNS[key].id,
]).join(", ");

/** The platforms a store set up (pixel on, token saved), kept a few minutes per worker. */
async function storeSetup(brandId: string, fresh = false): Promise<Setup[]> {
  const now = Date.now();
  const kept = setups.get(brandId);
  if (!fresh && kept && now - kept.at < SETUP_TTL_MS) return kept.setup;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const rpc = supabaseAdmin.rpc as unknown as Rpc;
  const [{ data: tracking }, ...credentials] = await Promise.all([
    supabaseAdmin
      .from("brand_tracking_settings")
      .select(TRACKING_COLUMNS)
      .eq("brand_id", brandId)
      .maybeSingle(),
    ...AD_PLATFORM_KEYS.map((key) =>
      rpc("get_integration_credential_secret", {
        p_brand_id: brandId,
        p_provider: AD_PLATFORMS[key].credential,
      }),
    ),
  ]);
  const setup: Setup[] = [];
  AD_PLATFORM_KEYS.forEach((key, index) => {
    const data = credentials[index]?.data;
    const row = Array.isArray(data)
      ? (data[0] as { api_key?: string; is_active?: boolean } | undefined)
      : undefined;
    const token = row?.is_active === false ? null : cleanToken(row?.api_key);
    const pixelId = pixelOf(key, tracking as Record<string, unknown> | null);
    if (token && pixelId) setup.push({ key, pixelId, token });
  });
  if (setups.size > 5_000) setups.clear();
  setups.set(brandId, { at: now, setup });
  return setup;
}

async function send(key: AdPlatformKey, request: AdRequest): Promise<SendResult> {
  try {
    const response = await fetch(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal: AbortSignal.timeout(8_000),
    });
    const body = await response.json().catch(() => null);
    const result = AD_PLATFORMS[key].readAnswer(response.status, body);
    if (!result.sent) console.warn(`[ad-events] ${key} refused`, result.detail);
    return result;
  } catch (error) {
    console.warn(`[ad-events] ${key} unreachable`, error);
    return { sent: false, reason: "unreachable" };
  }
}

/** Every platform the store set up gets the event; each answers on its own. */
async function sendToAll(setup: Setup[], event: AdEvent): Promise<AdResults> {
  const answers = await Promise.all(
    setup.map(async ({ key, pixelId, token }) => {
      const request = await AD_PLATFORMS[key].request(pixelId, token, event);
      return [key, await send(key, request)] as const;
    }),
  );
  return Object.fromEntries(answers);
}

/** Every platform's answer, or why none was asked. */
export type AdAnswer = AdResults | { skipped: "too_many" | "not_found" | "off" };

const cookie = z.string().max(600).nullish();
const visitFields = {
  pageUrl: z.string().max(2000).nullish(),
  fbp: cookie,
  fbc: cookie,
  ttp: cookie,
  ttclid: cookie,
  scid: cookie,
  scClickId: cookie,
};
type VisitInput = { [K in keyof typeof visitFields]?: string | null };

function visitOf(input: VisitInput): Visit {
  let userAgent: string | null = null;
  try {
    userAgent = getRequest()?.headers.get("user-agent") ?? null;
  } catch {
    userAgent = null;
  }
  return {
    ip: clientIp(),
    userAgent,
    fbp: input.fbp,
    fbc: input.fbc,
    ttp: input.ttp,
    ttclid: input.ttclid,
    scid: input.scid,
    scClickId: input.scClickId,
  };
}

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
export const sendAdPurchase = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ orderId: z.string().uuid(), ...visitFields }).parse(data),
  )
  .handler(async ({ data }): Promise<AdAnswer> => {
    if (!allowTry(`ad-purchase:${clientIp()}`, Date.now(), 30)) return { skipped: "too_many" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("orders")
      .select(ORDER_COLUMNS)
      .eq("id", data.orderId)
      .maybeSingle();
    const order = row as unknown as OrderRow | null;
    if (!order || !receiptOpen(order, Date.now())) return { skipped: "not_found" };
    const setup = await storeSetup(order.brand_id);
    if (!setup.length) return { skipped: "off" };
    const { data: settings } = await supabaseAdmin
      .from("business_settings")
      .select("currency")
      .eq("brand_id", order.brand_id)
      .maybeSingle();
    return sendToAll(setup, {
      event: "purchase",
      eventId: purchaseEventId(order.id),
      now: Date.now(),
      pageUrl: data.pageUrl,
      shopper: {
        email: order.customer_email_snapshot || order.customers?.email,
        phone: order.customer_phone_snapshot || order.customers?.phone,
        name: order.customer_name_snapshot || order.customers?.name,
        country: order.destination_country,
        customerId: order.customer_id,
      },
      visit: visitOf(data),
      order: {
        id: order.id,
        currency: order.currency || settings?.currency || "BHD",
        total: Number(order.total ?? 0),
        lines: (order.order_items ?? []).map((line) => ({
          productId: line.product_id,
          quantity: Number(line.quantity ?? 0),
          lineTotal: Number(line.line_total ?? 0),
        })),
      },
    });
  });

/** A product viewed, added to the bag, or checkout begun, as the storefront saw it. */
export const sendAdBrowsingEvent = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        brandId: z.string().uuid(),
        event: z.enum(["view_item", "add_to_cart", "begin_checkout"]),
        eventId: z.string().min(8).max(100),
        ...visitFields,
        currency: z.string().max(3).nullish(),
        value: z.number().min(0).max(10_000_000).nullish(),
        contentIds: z.array(z.string().max(64)).max(50).optional(),
        numItems: z.number().int().min(0).max(10_000).nullish(),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<AdAnswer> => {
    if (!allowTry(`ad-browse:${clientIp()}`, Date.now(), 600)) return { skipped: "too_many" };
    const setup = await storeSetup(data.brandId);
    if (!setup.length) return { skipped: "off" };
    return sendToAll(setup, {
      event: data.event,
      eventId: data.eventId,
      now: Date.now(),
      pageUrl: data.pageUrl,
      shopper: {},
      visit: visitOf(data),
      browsing: data,
    });
  });

/**
 * The Integrations page's check of one platform: a test event (Meta and TikTok under the code
 * their events tools show; Snapchat at its validation address, which records nothing), read
 * fresh, so a wrong token or pixel is told now rather than in a week of missing sales. Store
 * admins only, as the page.
 */
export const testAdPlatform = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        brandId: z.string().uuid(),
        platform: z.enum(AD_PLATFORM_KEYS),
        testEventCode: z.string().trim().max(40).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<SendResult> => {
    const [{ data: access }, { data: admin }] = await Promise.all([
      context.supabase.rpc("can_access_brand", { _brand_id: data.brandId }),
      context.supabase.rpc("is_admin"),
    ]);
    if (!access || !admin) throw new Error("FORBIDDEN");
    const setup = (await storeSetup(data.brandId, true)).find((s) => s.key === data.platform);
    if (!setup) return { sent: false, reason: "off" };
    const request = await AD_PLATFORMS[setup.key].testRequest(
      setup.pixelId,
      setup.token,
      {
        event: "view_item",
        eventId: `test:${crypto.randomUUID()}`,
        now: Date.now(),
        shopper: {},
        visit: visitOf({}),
      },
      data.testEventCode,
    );
    return send(setup.key, request);
  });
