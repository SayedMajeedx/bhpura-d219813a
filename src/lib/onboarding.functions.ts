import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const imageTypes: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const CreateUploadInput = z.object({
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

const CreateRequestInput = z.object({
  fullName: z.string().min(2),
  contactNumber: z.string().min(6),
  email: z.string().email(),
  desiredSubdomain: z.string().min(2),
  requestType: z.enum(["trial", "paid"]),
  benefitReceiptUrl: z.string().optional(),
});

const AdminActionInput = z.object({
  requestId: z.string().uuid(),
});

const UpdatePriceInput = z.object({
  newPrice: z.string().min(2),
});

// Helper to assert superadmin authorization
async function requireSuperAdmin(context: any) {
  const { data: isSuperAdmin } = await context.supabase.rpc("is_admin");
  const email = (context.claims?.email || "").toLowerCase();
  const isFixedSuperAdmin = email === "majeed@hotmail.it" || email === "majeed@hotmail.com";
  
  if (!isSuperAdmin && !isFixedSuperAdmin) {
    throw new Error("UNAUTHORIZED_SUPER_ADMIN_ONLY");
  }
}

// 1. Get secure pre-signed upload URL for onboarding receipt screenshot explicitly bound to R2_PRIVATE_BUCKET scope
export const getOnboardingReceiptUploadUrl = createServerFn({ method: "POST" })
  .validator((raw: unknown) => CreateUploadInput.parse(raw))
  .handler(async ({ data, context }) => {
    let env: any = null;
    try {
      const { getEvent } = await import("vinxi/http");
      const event = getEvent();
      env = event?.context?.cloudflare?.env || 
            event?.context?.env || 
            event?.context?.cloudflare || 
            (event?.context as any)?.cloudflare?.env;
    } catch {}

    if (!env) {
      try {
        const g = globalThis as any;
        env = g["__CLOUDFLARE_ENV__"] || g["__env__"] || g["process"]?.["env"] || process.env;
      } catch {}
    }

    const privateBucket = env?.R2_PRIVATE_BUCKET || env?.R2_PRIVATE_BUCKET_NAME;
    if (!privateBucket) {
      console.warn("R2_PRIVATE_BUCKET environment variable is missing in current execution context.");
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("tenant_requests")
      .insert({
        full_name: data.fullName,
        email: data.email,
        contact_number: data.contactNumber,
        desired_subdomain: data.desiredSubdomain,
        request_type: data.requestType,
        status: "pending",
        benefit_receipt_url: data.benefitReceiptUrl || null,
        payment_verified: false
      });

    if (error) {
      console.error("Supabase tenant request insert failure:", error);
      throw new Error(`Failed to record tenant request: ${error.message}`);
    }

    return { success: true };
  });

// 3. Dynamic pricing retrieval server function (reading from system_settings)
export const getOnboardingPrice = createServerFn({ method: "GET" })
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("get_onboarding_active_price");
    if (error) {
      console.warn("RPC get_onboarding_active_price failed, falling back to database query.", error);
      const { data: row } = await supabaseAdmin
        .from("system_settings")
        .select("value")
        .eq("key", "onboarding_registration_price")
        .maybeSingle();
      return row?.value || "55 BHD";
    }
    return data || "55 BHD";
  });

// 4. Update onboarding registration price in system_settings (Superadmin only)
export const updateRegistrationPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => UpdatePriceInput.parse(raw))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context);

    const { error } = await context.supabase
      .from("system_settings")
      .upsert({
        key: "onboarding_registration_price",
        value: data.newPrice,
        updated_at: new Date().toISOString()
      }, { onConflict: "key" });

    if (error) throw error;
    return { success: true, updatedPrice: data.newPrice };
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

    // Update status to 'approved' and payment_verified to true
    const { error } = await context.supabase
      .from("tenant_requests")
      .update({
        status: "approved",
        payment_verified: true,
        updated_at: new Date().toISOString()
      })
      .eq("id", data.requestId);

    if (error) throw error;
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
        updated_at: new Date().toISOString()
      })
      .eq("id", data.requestId);

    if (error) throw error;
    return { success: true };
  });

const LogImpersonationInput = z.object({
  targetTenantId: z.string().uuid(),
  reason: z.string().optional()
});

// 7. Log Impersonation Start (Superadmin only)
export const logImpersonationStart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => LogImpersonationInput.parse(raw))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context);

    const { error } = await context.supabase
      .from("system_audit_logs")
      .insert({
        operator_id: context.userId,
        target_tenant_id: data.targetTenantId,
        action_type: "impersonation_start",
        reason: data.reason || "Superadmin troubleshooting session initialized."
      });

    if (error) {
      console.error("Audit logging failed:", error);
      throw error;
    }
    return { success: true };
  });
