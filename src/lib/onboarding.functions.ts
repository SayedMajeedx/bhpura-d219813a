import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { verifyOnboardingTurnstile } from "@/lib/turnstile.server";

const imageTypes: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const CreateUploadInput = z.object({
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  size: z
    .number()
    .int()
    .positive()
    .max(5 * 1024 * 1024),
  turnstileToken: z.string().min(1).max(2048),
});

const CreateRequestInput = z.object({
  fullName: z.string().min(2),
  contactNumber: z.string().min(6),
  email: z.string().email(),
  desiredSubdomain: z.string().min(2),
  requestType: z.enum(["trial", "paid"]),
  selectedPlanId: z.string().uuid().optional(),
  selectedPlanVersionId: z.string().uuid().optional(),
  billingInterval: z.enum(["monthly", "annual", "trial"]).optional(),
  benefitReceiptUrl: z.string().optional(),
  businessType: z.string().optional(),
  turnstileToken: z.string().min(1).max(2048),
});

async function requireValidTurnstile(token: string) {
  let secret: string | undefined;
  try {
    const g = globalThis as any;
    const env = g["__CLOUDFLARE_ENV__"] || g["process"]?.["env"] || process.env;
    secret = env?.TURNSTILE_SECRET;
  } catch {
    // Verification fails closed below when runtime bindings are unavailable.
  }

  if (!(await verifyOnboardingTurnstile({ token, secret }))) {
    throw new Error("TURNSTILE_VERIFICATION_FAILED");
  }
}

const AdminActionInput = z.object({
  requestId: z.string().uuid(),
  planId: z.string().uuid().optional(),
  planVersionId: z.string().uuid().optional(),
  billingInterval: z.enum(["monthly", "annual", "trial"]).optional(),
});

const UpdatePriceInput = z.object({
  newPrice: z.string().min(2),
});

// Helper to assert superadmin authorization
async function requireSuperAdmin(context: any) {
  const { data: isSuperAdmin, error } = await context.supabase.rpc("is_super_admin");
  if (error || !isSuperAdmin) {
    throw new Error("UNAUTHORIZED_SUPER_ADMIN_ONLY");
  }
}

// 1. Get secure pre-signed upload URL for onboarding receipt screenshot explicitly bound to R2_PRIVATE_BUCKET scope
export const getOnboardingReceiptUploadUrl = createServerFn({ method: "POST" })
  .validator((raw: unknown) => CreateUploadInput.parse(raw))
  .handler(async ({ data, context }) => {
    await requireValidTurnstile(data.turnstileToken);
    let env: any = null;
    try {
      const { getEvent } = await import(/* @vite-ignore */ "vinxi/http");
      const event = getEvent();
      env =
        event?.context?.cloudflare?.env ||
        event?.context?.env ||
        event?.context?.cloudflare ||
        (event?.context as any)?.cloudflare?.env;
    } catch {
      // Fall back to the globally-bound Worker environment below.
    }

    if (!env) {
      try {
        const g = globalThis as any;
        env = g["__CLOUDFLARE_ENV__"] || g["__env__"] || g["process"]?.["env"] || process.env;
      } catch {
        // Missing runtime bindings are handled by the existing upload error path.
      }
    }

    const privateBucket = env?.R2_PRIVATE_BUCKET || env?.R2_PRIVATE_BUCKET_NAME;
    if (!privateBucket) {
      console.warn(
        "R2_PRIVATE_BUCKET environment variable is missing in current execution context.",
      );
    }

    const { createPrivateUploadUrl } = await import("@/lib/private-r2.server");
    const registrationId = crypto.randomUUID();
    const objectKey = `onboarding/receipts/${registrationId}.${imageTypes[data.contentType]}`;

    const uploadUrl = await createPrivateUploadUrl(objectKey, data.contentType);
    return { objectKey, uploadUrl };
  });

// 2. Save onboarding payload safely to Supabase database status queue 'tenant_requests' as 'pending'
export const createTenantRequest = createServerFn({ method: "POST" })
  .validator((raw: unknown) => CreateRequestInput.parse(raw))
  .handler(async ({ data }) => {
    await requireValidTurnstile(data.turnstileToken);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let selectedPlan: any = null;
    let selectedVersion: any = null;
    let billingInterval = data.requestType === "trial" ? "trial" : data.billingInterval;
    if (data.requestType === "paid" && billingInterval !== "monthly" && billingInterval !== "annual") {
      throw new Error("INVALID_BILLING_INTERVAL");
    }

    if (data.selectedPlanId || data.selectedPlanVersionId) {
      if (!data.selectedPlanId || !data.selectedPlanVersionId || !billingInterval) {
        throw new Error("INVALID_PLAN_SELECTION");
      }
      const { data: plan } = await (supabaseAdmin.from("saas_plans" as never) as any)
        .select("id,code,name_ar,name_en,is_active,is_public,trial_days")
        .eq("id", data.selectedPlanId)
        .eq("is_active", true)
        .eq("is_public", true)
        .maybeSingle();
      const { data: version } = await (supabaseAdmin.from("saas_plan_versions" as never) as any)
        .select("id,plan_id,version_number,currency,price_monthly,price_annual,is_current")
        .eq("id", data.selectedPlanVersionId)
        .eq("plan_id", data.selectedPlanId)
        .eq("is_current", true)
        .lte("effective_from", new Date().toISOString())
        .or(`effective_until.is.null,effective_until.gt.${new Date().toISOString()}`)
        .maybeSingle();
      if (!plan || !version) throw new Error("PLAN_NOT_AVAILABLE");
      selectedPlan = plan;
      selectedVersion = version;
    } else if (data.requestType === "paid") {
      throw new Error("PLAN_SELECTION_REQUIRED");
    }

    const quotedPrice = selectedVersion
      ? billingInterval === "monthly"
        ? Number(selectedVersion.price_monthly)
        : billingInterval === "annual"
          ? Number(selectedVersion.price_annual)
          : 0
      : 0;
    if (data.requestType === "paid" && quotedPrice <= 0) {
      throw new Error("PLAN_INTERVAL_NOT_FOR_SALE");
    }
    const { error } = await (supabaseAdmin.from("tenant_requests") as any).insert({
      full_name: data.fullName,
      email: data.email,
      contact_number: data.contactNumber,
      desired_subdomain: data.desiredSubdomain,
      request_type: data.requestType,
      status: "pending",
      benefit_receipt_url: data.benefitReceiptUrl || null,
      payment_verified: false,
      business_type: data.businessType || null,
      selected_plan_id: selectedPlan?.id ?? null,
      selected_plan_version_id: selectedVersion?.id ?? null,
      billing_interval: billingInterval ?? null,
      quoted_price: quotedPrice,
      quoted_currency: selectedVersion?.currency ?? "BHD",
      selected_plan_snapshot: selectedPlan
        ? {
            code: selectedPlan.code,
            name_ar: selectedPlan.name_ar,
            name_en: selectedPlan.name_en,
            version_number: selectedVersion.version_number,
          }
        : null,
    });

    if (error) {
      console.error("Supabase tenant request insert failure:", error);
      throw new Error("TENANT_REQUEST_CREATE_FAILED");
    }

    return { success: true };
  });

// Public catalog used by onboarding. Only active, public plans and their current
// immutable versions are returned, so the super-admin catalog remains authoritative.
export const getPublicOnboardingPlans = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = new Date().toISOString();
  const { data: plans, error } = await (supabaseAdmin.from("saas_plans" as never) as any)
    .select("id,code,name_en,name_ar,description_en,description_ar,sort_order,trial_days,badge_color")
    .eq("is_active", true)
    .eq("is_public", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error("PUBLIC_PLAN_CATALOG_UNAVAILABLE");

  const result = [];
  for (const plan of plans ?? []) {
    const { data: version } = await (supabaseAdmin.from("saas_plan_versions" as never) as any)
      .select("id,version_number,currency,price_monthly,price_annual,effective_from,effective_until")
      .eq("plan_id", plan.id)
      .eq("is_current", true)
      .lte("effective_from", now)
      .or(`effective_until.is.null,effective_until.gt.${now}`)
      .maybeSingle();
    if (!version) continue;
    const { data: allocations } = await (supabaseAdmin.from("saas_plan_features" as never) as any)
      .select("feature_key,boolean_value,numeric_value")
      .eq("plan_version_id", version.id);
    const featureKeys = (allocations ?? [])
      .filter((item: any) => item.boolean_value !== false && item.numeric_value !== 0)
      .map((item: any) => item.feature_key);
    const { data: features } = featureKeys.length
      ? await (supabaseAdmin.from("saas_features" as never) as any)
          .select("key,name_en,name_ar,unit,sort_order")
          .in("key", featureKeys)
          .order("sort_order", { ascending: true })
      : { data: [] };
    const featureMap = new Map<string, any>(
      (features ?? []).map((feature: any) => [feature.key, feature]),
    );
    result.push({
      ...plan,
      version,
      features: (allocations ?? [])
        .filter((item: any) => featureMap.has(item.feature_key))
        .map((item: any) => ({ ...featureMap.get(item.feature_key), ...item })),
    });
  }
  return result;
});

// Trial duration is managed by Super Admin and must never be duplicated in the
// public experience. Keep this separate from the public paid-plan catalog because
// the trial plan is intentionally allowed to remain hidden from paid pricing.
export const getOnboardingTrialDays = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin.from("saas_plans" as never) as any)
    .select("trial_days")
    .eq("code", "trial")
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw new Error("TRIAL_CONFIGURATION_UNAVAILABLE");
  return Math.max(1, Number(data?.trial_days || 3));
});

// 3. Dynamic pricing retrieval server function (reading from system_settings)
export const getOnboardingPrice = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("system_settings")
    .select("base_price_bhd, discount_price_bhd")
    .eq("id", 1)
    .maybeSingle();

  if (error || !data) {
    try {
      const { data: rpcVal } = await supabaseAdmin.rpc("get_onboarding_active_price");
      if (rpcVal) return rpcVal;
    } catch {
      // Preserve the public fallback price when the optional RPC is unavailable.
    }
    return "55 BHD";
  }

  const active = data.discount_price_bhd !== null ? data.discount_price_bhd : data.base_price_bhd;
  return `${active} BHD`;
});

// 4. Update onboarding registration price in system_settings (Superadmin only)
export const updateRegistrationPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => UpdatePriceInput.parse(raw))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context);

    const parsedVal = parseFloat(data.newPrice.replace(/[^0-9.]/g, "")) || 55.0;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("system_settings").upsert(
      {
        id: 1,
        base_price_bhd: parsedVal,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

    if (error) throw error;
    return { success: true, updatedPrice: data.newPrice };
  });

// 4.1. Get full platform settings (Public)
export const getPlatformSettings = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("system_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    console.error("Failed to query platform system_settings:", error);
    return null;
  }
  return data;
});

// 4.2. Update platform settings (Superadmin only)
const UpdatePlatformSettingsInput = z.object({
  basePriceBhd: z.number(),
  discountPriceBhd: z.number().nullable(),
  platformIconUrl: z.string().nullable(),
  benefitPayQrUrl: z.string().nullable(),
  merchantAccountName: z.string().min(1),
  subscriptionIban: z.string().trim().min(12).max(64),
  whatsappSupportNumber: z.string().min(5),
  superadminImpersonationMutationAllowed: z.boolean(),
});

export const updatePlatformSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => UpdatePlatformSettingsInput.parse(raw))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("system_settings").upsert(
      {
        id: 1,
        base_price_bhd: data.basePriceBhd,
        discount_price_bhd: data.discountPriceBhd,
        platform_icon_url: data.platformIconUrl,
        benefit_pay_qr_url: data.benefitPayQrUrl,
        merchant_account_name: data.merchantAccountName,
        subscription_iban: data.subscriptionIban.replace(/\s+/g, "").toUpperCase(),
        whatsapp_support_number: data.whatsappSupportNumber,
        superadmin_impersonation_mutation_allowed: data.superadminImpersonationMutationAllowed,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

    if (error) {
      console.error("Failed to update platform settings:", error);
      throw error;
    }
    return { success: true };
  });

// 4.3. Get platform logo upload pre-signed URL (Superadmin only)
export const getPlatformLogoUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => z.object({ contentType: z.string() }).parse(raw))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context);

    const { createR2PresignedPutUrl, mimeToExtension } = await import("@/lib/r2-upload.functions");

    const extension = mimeToExtension[data.contentType.toLowerCase()] || "png";
    const key = `platform/logo-${crypto.randomUUID()}.${extension}`;

    const { uploadUrl } = await createR2PresignedPutUrl(key, data.contentType, 3600);
    return { uploadUrl, publicUrl: `/${key}`, key };
  });

// 4.4. Get platform QR upload pre-signed URL (Superadmin only)
export const getPlatformQrUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => z.object({ contentType: z.string() }).parse(raw))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context);

    const { createR2PresignedPutUrl, mimeToExtension } = await import("@/lib/r2-upload.functions");

    const extension = mimeToExtension[data.contentType.toLowerCase()] || "png";
    const key = `platform/qr-${crypto.randomUUID()}.${extension}`;

    const { uploadUrl } = await createR2PresignedPutUrl(key, data.contentType, 3600);
    return { uploadUrl, publicUrl: `/${key}`, key };
  });

// 5. Approve Tenant Request & Mark Deployed (Superadmin only)
export const approveTenantRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => AdminActionInput.parse(raw))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context);

    // Get current record first
    const { data: request, error: fetchError } = await context.supabase
      .from("tenant_requests")
      .select("*")
      .eq("id", data.requestId)
      .single();

    if (fetchError || !request) throw new Error("REQUEST_NOT_FOUND");

    let resolvedPlanId = data.planId || (request as any).selected_plan_id || null;
    let resolvedPlanVersionId =
      data.planVersionId || (request as any).selected_plan_version_id || null;
    const resolvedInterval =
      data.billingInterval ||
      (request as any).billing_interval ||
      (request.request_type === "trial" ? "trial" : "annual");

    if (!resolvedPlanId && request.request_type === "trial") {
      const { data: trialPlan } = await (context.supabase.from("saas_plans" as never) as any)
        .select("id")
        .eq("code", "trial")
        .eq("is_active", true)
        .maybeSingle();
      resolvedPlanId = trialPlan?.id ?? null;
    }
    if (resolvedPlanId && !resolvedPlanVersionId) {
      const { data: currentVersion } = await (
        context.supabase.from("saas_plan_versions" as never) as any
      )
        .select("id")
        .eq("plan_id", resolvedPlanId)
        .eq("is_current", true)
        .maybeSingle();
      resolvedPlanVersionId = currentVersion?.id ?? null;
    }
    if (!resolvedPlanId || !resolvedPlanVersionId) throw new Error("PLAN_SELECTION_REQUIRED");
    let resolvedTrialDays = 3;
    if (request.request_type === "trial") {
      const { data: trialConfiguration } = await (
        context.supabase.from("saas_plans" as never) as any
      )
        .select("trial_days")
        .eq("id", resolvedPlanId)
        .single();
      resolvedTrialDays = Math.max(1, Number(trialConfiguration?.trial_days || 3));
    }
    const { data: validatedVersion } = await (
      context.supabase.from("saas_plan_versions" as never) as any
    )
      .select("id,plan_id,price_monthly,price_annual")
      .eq("id", resolvedPlanVersionId)
      .eq("plan_id", resolvedPlanId)
      .maybeSingle();
    if (!validatedVersion) throw new Error("SELECTED_PLAN_VERSION_NOT_FOUND");
    const activationPrice =
      resolvedInterval === "monthly"
        ? Number(validatedVersion.price_monthly)
        : resolvedInterval === "annual"
          ? Number(validatedVersion.price_annual)
          : 0;
    if (request.request_type === "paid" && activationPrice <= 0) {
      throw new Error("PLAN_INTERVAL_NOT_FOR_SALE");
    }

    // Update status to 'approved' and payment_verified to true
    const { error } = await context.supabase
      .from("tenant_requests")
      .update({
        status: "approved",
        payment_verified: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.requestId);

    if (error) throw error;

    // Fetch the created brand by slug to set its plan details
    const brandSlug = request.desired_subdomain.toLowerCase().trim();
    const approvedPlanType = request.request_type === "trial" ? "trial" : "annual";
    const trialEndsAt =
      approvedPlanType === "trial"
        ? new Date(Date.now() + resolvedTrialDays * 24 * 60 * 60 * 1000).toISOString()
        : null;

    // Since database triggers create the brand row, let's query it and update it
    const { data: brandRow } = await context.supabase
      .from("brands")
      .select("id")
      .eq("slug", brandSlug)
      .maybeSingle();

    if (brandRow) {
      const { error: brandUpdateErr } = await context.supabase
        .from("brands")
        .update({
          plan_type: approvedPlanType,
          trial_ends_at: trialEndsAt,
          subscription_status: approvedPlanType === "trial" ? "active" : "active",
          subscription_expires_at:
            approvedPlanType === "annual"
              ? new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString()
              : null,
          business_type: (request as any).business_type || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", brandRow.id);

      if (brandUpdateErr) {
        console.error("Failed to update brand plan details upon request approval:", brandUpdateErr);
      }

      if (resolvedPlanId && resolvedPlanVersionId) {
        const periodEnd =
          resolvedInterval === "trial"
            ? trialEndsAt
            : resolvedInterval === "monthly"
              ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
              : new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString();
        const { error: subscriptionError } = await (context.supabase.from("brand_subscriptions" as never) as any)
          .upsert(
            {
              brand_id: brandRow.id,
              plan_id: resolvedPlanId,
              plan_version_id: resolvedPlanVersionId,
              billing_interval: resolvedInterval,
              status: resolvedInterval === "trial" ? "trialing" : "active",
              current_period_start: new Date().toISOString(),
              current_period_end: periodEnd,
              trial_ends_at: resolvedInterval === "trial" ? trialEndsAt : null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "brand_id" },
          );
        if (subscriptionError) throw new Error("SUBSCRIPTION_ACTIVATION_FAILED");
      }
    }

    return { success: true };
  });

// 6. Reject/Dismiss Tenant Request (Superadmin only)
export const rejectTenantRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => AdminActionInput.parse(raw))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context);

    const { error } = await context.supabase
      .from("tenant_requests")
      .update({
        status: "rejected",
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.requestId);

    if (error) throw error;
    return { success: true };
  });

const LogImpersonationInput = z.object({
  targetTenantId: z.string().uuid(),
  reason: z.string().optional(),
});

// 7. Log Impersonation Start (Superadmin only)
export const logImpersonationStart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => LogImpersonationInput.parse(raw))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context);

    const { error } = await context.supabase.from("system_audit_logs").insert({
      operator_id: context.userId,
      target_tenant_id: data.targetTenantId,
      action_type: "impersonation_start",
      reason: data.reason || "Superadmin troubleshooting session initialized.",
    });

    if (error) {
      console.error("Audit logging failed:", error);
      throw error;
    }
    return { success: true };
  });

// 8. Register Instant 3-Day Free Trial (Self-Service)
const RegisterInstantTrialInput = z.object({
  brandName: z.string().min(2),
  slug: z.string().min(2).max(32).regex(/^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/),
  ownerName: z.string().min(2),
  contactNumber: z.string().min(6),
  email: z.string().email(),
  password: z.string().min(6),
  businessType: z.string().optional(),
});

export const registerInstantTrial = createServerFn({ method: "POST" })
  .validator((raw: unknown) => RegisterInstantTrialInput.parse(raw))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const normalizedEmail = data.email.trim().toLowerCase();
    const normalizedSlug = data.slug.trim().toLowerCase();

    // 1. Check if slug already exists
    const { data: existingBrand } = await (supabaseAdmin.from("brands" as never) as any)
      .select("id")
      .eq("slug", normalizedSlug)
      .maybeSingle();

    if (existingBrand) {
      throw new Error("SLUG_ALREADY_TAKEN");
    }

    // 2. Check if email already exists in profiles
    const { data: existingProfile } = await (supabaseAdmin.from("profiles" as never) as any)
      .select("id, brand_id, role")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (existingProfile?.brand_id) {
      const { data: userBrand } = await (supabaseAdmin.from("brands" as never) as any)
        .select("id, slug, plan_type, trial_ends_at, subscription_status")
        .eq("id", existingProfile.brand_id)
        .maybeSingle();

      const isExpired =
        userBrand &&
        userBrand.plan_type === "trial" &&
        userBrand.trial_ends_at &&
        new Date(userBrand.trial_ends_at).getTime() <= Date.now() &&
        userBrand.subscription_status !== "active_paid";

      return {
        alreadyRegistered: true,
        isTrialExpired: Boolean(isExpired),
        brandSlug: userBrand?.slug || null,
        message: isExpired
          ? "يوجد لديك حساب مسجل بالفعل بمتجر انتهت فترته التجريبية. يرجى تسجيل الدخول لترقية اشتراكك."
          : "يوجد لديك حساب مسجل بالفعل. يرجى تسجيل الدخول للوصول إلى متجرك.",
      };
    }

    // 3. Create or fetch Auth user
    let userId: string;
    if (existingProfile?.id) {
      userId = existingProfile.id;
    } else {
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: normalizedEmail,
        password: data.password,
        email_confirm: true,
        user_metadata: {
          full_name: data.ownerName.trim(),
          phone: data.contactNumber.trim(),
        },
      });

      if (authError || !authData?.user) {
        // If auth user already exists in auth.users
        const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
        const found = listData?.users?.find(
          (u) => u.email?.toLowerCase() === normalizedEmail,
        );
        if (found) {
          userId = found.id;
        } else {
          throw new Error(authError?.message || "FAILED_TO_CREATE_USER");
        }
      } else {
        userId = authData.user.id;
      }
    }

    // 4. Ensure profile exists
    await (supabaseAdmin.from("profiles" as never) as any).upsert(
      {
        id: userId,
        email: normalizedEmail,
        full_name: data.ownerName.trim(),
        phone: data.contactNumber.trim(),
        role: "brand_admin",
        status: "active",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

    // 5. Create Brand with 3-day trial
    const trialDays = 3;
    const trialEndsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString();

    const { data: brandId, error: createError } = await (supabaseAdmin.rpc as any)(
      "create_tenant_with_defaults",
      {
        p_slug: normalizedSlug,
        p_name_en: data.brandName.trim(),
        p_name_ar: data.brandName.trim(),
        p_primary_color: "#800020",
        p_owner_id: userId,
        p_business_type: data.businessType || "Abayas & Fashion",
      },
    );

    if (createError || !brandId) {
      console.error("Failed to execute create_tenant_with_defaults:", createError);
      throw new Error(createError?.message || "FAILED_TO_CREATE_BRAND");
    }

    // 6. Update brand with trial details and ensure active status
    await (supabaseAdmin.from("brands" as never) as any)
      .update({
        plan_type: "trial",
        trial_ends_at: trialEndsAt,
        subscription_tier: "starter",
        subscription_status: "trialing",
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", brandId);

    // 7. Associate brand_id in profile
    await (supabaseAdmin.from("profiles" as never) as any)
      .update({
        brand_id: brandId,
        role: "brand_admin",
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    return {
      alreadyRegistered: false,
      isTrialExpired: false,
      brandSlug: normalizedSlug,
      brandId,
      trialDays,
    };
  });
