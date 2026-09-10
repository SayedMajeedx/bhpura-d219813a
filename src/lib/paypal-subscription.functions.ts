import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getEnvVariable } from "@/lib/runtime-env";

const PAYPAL_API_BASE = "https://api-m.paypal.com";

export const PAYPAL_LIVE_CLIENT_ID =
  getEnvVariable("PAYPAL_CLIENT_ID") ||
  "BAAI2iTpf55TCHp77dNaAo7t53STx7fRZCxzvZmyrWj_xIQGUQSq5ybTueyYUJSEE3d17iJ-W5hP3-tWwU";

const PAYPAL_LIVE_CLIENT_SECRET =
  getEnvVariable("PAYPAL_CLIENT_SECRET") ||
  "EABCCQbgWwBemZixfWqrcATr4vo-EmE4X6IcG6bHKBDYxzQM0niaTKM3oLobLBoRXkIi_LZ9mpMNALMl";

export const BHD_TO_USD_RATE = 2.65;

export function convertBhdToUsd(bhdAmount: number): string {
  return (Math.round(bhdAmount * BHD_TO_USD_RATE * 100) / 100).toFixed(2);
}

async function getPayPalAccessToken(): Promise<string> {
  const credentials = Buffer.from(
    `${PAYPAL_LIVE_CLIENT_ID}:${PAYPAL_LIVE_CLIENT_SECRET}`,
  ).toString("base64");

  const response = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`PAYPAL_AUTH_FAILED: ${errorText}`);
  }

  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

const CreateOrderInput = z.object({
  brandId: z.string().uuid(),
  targetPlanId: z.string().uuid(),
  billingInterval: z.enum(["monthly", "annual"]),
});

const CaptureOrderInput = z.object({
  brandId: z.string().uuid(),
  orderId: z.string().min(5),
  targetPlanId: z.string().uuid(),
  billingInterval: z.enum(["monthly", "annual"]),
});

// 1. Get Public PayPal Config
export const getPayPalConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    return {
      clientId: PAYPAL_LIVE_CLIENT_ID,
      currency: "USD",
      exchangeRate: BHD_TO_USD_RATE,
    };
  });

// 2. Create PayPal Subscription Order
export const createPayPalSubscriptionOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => CreateOrderInput.parse(raw))
  .handler(async ({ data, context }) => {
    // Check user access to brand
    const { data: hasAccess } = await context.supabase.rpc("can_access_brand", {
      _brand_id: data.brandId,
    });
    if (!hasAccess) throw new Error("UNAUTHORIZED_BRAND_ACCESS");

    // Fetch target plan and current version
    const { data: plan, error: planError } = await context.supabase
      .from("saas_plans")
      .select("id, code, name_ar, name_en")
      .eq("id", data.targetPlanId)
      .single();

    if (planError || !plan) throw new Error("TARGET_PLAN_NOT_FOUND");

    const { data: version, error: verError } = await context.supabase
      .from("saas_plan_versions")
      .select("id, price_monthly, price_annual")
      .eq("plan_id", data.targetPlanId)
      .eq("is_current", true)
      .maybeSingle();

    if (verError || !version) throw new Error("PLAN_VERSION_NOT_FOUND");

    const bhdPrice =
      data.billingInterval === "annual"
        ? Number(version.price_annual ?? 0)
        : Number(version.price_monthly ?? 0);

    if (bhdPrice <= 0) throw new Error("INVALID_PLAN_PRICE");

    const usdPrice = convertBhdToUsd(bhdPrice);
    const accessToken = await getPayPalAccessToken();

    const orderPayload = {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: `sub_${data.brandId.slice(0, 8)}`,
          description: `Boutq OS - ${plan.name_en || plan.name_ar} (${data.billingInterval})`,
          custom_id: `${data.brandId}:${data.targetPlanId}:${data.billingInterval}`,
          amount: {
            currency_code: "USD",
            value: usdPrice,
          },
        },
      ],
      application_context: {
        brand_name: "Boutq OS",
        landing_page: "NO_PREFERENCE",
        user_action: "PAY_NOW",
      },
    };

    const res = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(orderPayload),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`PAYPAL_ORDER_CREATION_FAILED: ${err}`);
    }

    const orderData = (await res.json()) as { id: string };

    return {
      orderId: orderData.id,
      amountUsd: usdPrice,
      amountBhd: bhdPrice,
      targetPlanId: data.targetPlanId,
      billingInterval: data.billingInterval,
    };
  });

// 3. Capture PayPal Subscription Order & Auto-Activate Plan
export const capturePayPalSubscriptionOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => CaptureOrderInput.parse(raw))
  .handler(async ({ data, context }) => {
    // Check user access to brand
    const { data: hasAccess } = await context.supabase.rpc("can_access_brand", {
      _brand_id: data.brandId,
    });
    if (!hasAccess) throw new Error("UNAUTHORIZED_BRAND_ACCESS");

    const { enforceMutationSafeguard } = await import("@/lib/impersonation.server");
    await enforceMutationSafeguard(context.supabase, context.userId, data.brandId);

    const accessToken = await getPayPalAccessToken();

    // Call PayPal Capture endpoint
    const captureRes = await fetch(
      `${PAYPAL_API_BASE}/v2/checkout/orders/${data.orderId}/capture`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!captureRes.ok) {
      const err = await captureRes.text();
      throw new Error(`PAYPAL_CAPTURE_FAILED: ${err}`);
    }

    const captureData = (await captureRes.json()) as {
      status: string;
      id: string;
      purchase_units?: Array<{
        payments?: {
          captures?: Array<{
            id: string;
            status: string;
            amount?: { value: string; currency_code: string };
          }>;
        };
      }>;
    };

    if (captureData.status !== "COMPLETED") {
      throw new Error(`PAYPAL_TRANSACTION_NOT_COMPLETED: status is ${captureData.status}`);
    }

    // Fetch target plan
    const { data: targetPlan } = await context.supabase
      .from("saas_plans")
      .select("id, code, name_ar, name_en")
      .eq("id", data.targetPlanId)
      .single();

    const { data: ver } = await context.supabase
      .from("saas_plan_versions")
      .select("id")
      .eq("plan_id", data.targetPlanId)
      .eq("is_current", true)
      .maybeSingle();

    const { data: brand } = await context.supabase
      .from("brands")
      .select("id, subscription_expires_at")
      .eq("id", data.brandId)
      .single();

    // Calculate new expiration date
    let baseDate = new Date();
    if (
      brand?.subscription_expires_at &&
      new Date(brand.subscription_expires_at).getTime() > Date.now()
    ) {
      baseDate = new Date(brand.subscription_expires_at);
    }

    if (data.billingInterval === "monthly") {
      baseDate.setMonth(baseDate.getMonth() + 1);
    } else {
      baseDate.setFullYear(baseDate.getFullYear() + 1);
    }
    const newExpiresAt = baseDate.toISOString();

    const planCode = targetPlan?.code || "pro";

    // 1. Update brands table
    const { error: brandUpdateError } = await context.supabase
      .from("brands")
      .update({
        subscription_tier: planCode,
        subscription_status: "active",
        plan_type: data.billingInterval,
        subscription_expires_at: newExpiresAt,
        trial_ends_at: null, // Fully clear trial
        payment_receipt_url: null,
        payment_receipt_uploaded_at: null,
        renewal_intent: null,
        renewal_intent_recorded_at: null,
      })
      .eq("id", data.brandId);

    if (brandUpdateError) throw brandUpdateError;

    // 2. Synchronize brand_subscriptions table
    const { data: sub } = await context.supabase
      .from("brand_subscriptions")
      .select("id")
      .eq("brand_id", data.brandId)
      .maybeSingle();

    if (sub) {
      // plan_version_id is NOT NULL in brand_subscriptions — omit it rather
      // than writing null when no current version exists for the plan.
      const { error: subUpdateError } = await context.supabase
        .from("brand_subscriptions")
        .update({
          plan_id: data.targetPlanId,
          ...(ver?.id ? { plan_version_id: ver.id } : {}),
          billing_interval: data.billingInterval,
          status: "active",
          current_period_start: new Date().toISOString(),
          current_period_end: newExpiresAt,
          trial_ends_at: null,
          renewal_intent: null,
          renewal_target_plan_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sub.id);

      if (subUpdateError) throw subUpdateError;
    }

    return {
      success: true,
      brandId: data.brandId,
      planCode,
      newExpiresAt,
      orderId: data.orderId,
    };
  });
