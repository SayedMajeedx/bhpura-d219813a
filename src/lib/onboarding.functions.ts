import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const imageTypes: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const CreateUploadInput = z.object({
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

const CreateRegistrationInput = z.object({
  fullName: z.string().min(2),
  contactNumber: z.string().min(6),
  email: z.string().email(),
  subdomain: z.string().min(2),
  planType: z.enum(["trial", "paid"]),
  benefitReceiptUrl: z.string().optional(),
});

// 1. Get secure pre-signed upload URL for onboarding receipt explicitly bound to R2_PRIVATE_BUCKET scope
export const getOnboardingReceiptUploadUrl = createServerFn({ method: "POST" })
  .validator((raw: unknown) => CreateUploadInput.parse(raw))
  .handler(async ({ data, context }) => {
    // Dynamically retrieve cloudflare environment context to verify R2_PRIVATE_BUCKET binding
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

    // Explicitly check for private bucket binding
    const privateBucket = env?.R2_PRIVATE_BUCKET || env?.R2_PRIVATE_BUCKET_NAME;
    if (!privateBucket) {
      console.warn("R2_PRIVATE_BUCKET environment variable is missing in current execution context.");
    }

    const { createPrivateUploadUrl } = await import("@/lib/private-r2.server");
    const registrationId = crypto.randomUUID();
    const objectKey = `onboarding/receipts/${registrationId}.${imageTypes[data.contentType]}`;
    
    // Explicitly generate pre-signed upload URL in the private bucket R2_PRIVATE_BUCKET
    const uploadUrl = await createPrivateUploadUrl(objectKey, data.contentType);
    return { objectKey, uploadUrl };
  });

// 2. Save onboarding payload safely to Supabase database status queue as 'pending_manual_deployment'
export const createPendingRegistration = createServerFn({ method: "POST" })
  .validator((raw: unknown) => CreateRegistrationInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("pending_registrations")
      .insert({
        full_name: data.fullName,
        contact_number: data.contactNumber,
        email: data.email,
        subdomain: data.subdomain,
        plan_type: data.planType,
        status: "pending_manual_deployment",
        benefit_receipt_url: data.benefitReceiptUrl || null,
      });

    if (error) {
      console.error("Supabase onboarding submission failure:", error);
      throw new Error(`Failed to record registration: ${error.message}`);
    }

    return { success: true };
  });

// 3. Dynamic pricing retrieval server function
export const getOnboardingPrice = createServerFn({ method: "GET" })
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("get_onboarding_registration_price");
    if (error) {
      console.warn("RPC fetch failed, falling back to static 55 BHD.", error);
      return "55 BHD";
    }
    return data || "55 BHD";
  });
