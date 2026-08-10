import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const imageTypes: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const CreateUploadInput = z.object({
  brandId: z.string().uuid(),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  size: z
    .number()
    .int()
    .positive()
    .max(5 * 1024 * 1024),
});

const SubmitReceiptInput = z.object({
  brandId: z.string().uuid(),
  objectKey: z.string().min(10),
});

const AdminReviewInput = z.object({
  brandId: z.string().uuid(),
  tier: z.enum(["basic", "growth", "enterprise"]).default("basic"),
});

const AdminRejectInput = z.object({
  brandId: z.string().uuid(),
});

// 1. Get secure pre-signed upload URL for subscription receipt (Private R2 Bucket)
export const getSubscriptionReceiptUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => CreateUploadInput.parse(raw))
  .handler(async ({ data, context }) => {
    // Check access to brand
    const { data: hasAccess } = await context.supabase.rpc("can_access_brand", {
      _brand_id: data.brandId,
    });
    if (!hasAccess) throw new Error("UNAUTHORIZED_BRAND_ACCESS");

    const { enforceMutationSafeguard } = await import("@/lib/impersonation.server");
    await enforceMutationSafeguard(context.supabase, context.userId, data.brandId);

    const { createPrivateUploadUrl } = await import("@/lib/private-r2.server");
    const receiptId = crypto.randomUUID();
    const objectKey = `brands/${data.brandId}/subscription-receipts/${receiptId}.${imageTypes[data.contentType]}`;

    const uploadUrl = await createPrivateUploadUrl(objectKey, data.contentType);
    return { objectKey, uploadUrl };
  });

// 2. Submit receipt and set brand subscription status to 'pending_verification'
export const submitSubscriptionReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => SubmitReceiptInput.parse(raw))
  .handler(async ({ data, context }) => {
    // Check access to brand
    const { data: hasAccess } = await context.supabase.rpc("can_access_brand", {
      _brand_id: data.brandId,
    });
    if (!hasAccess) throw new Error("UNAUTHORIZED_BRAND_ACCESS");

    // Inspect private R2 object to verify the merchant actually uploaded it
    const { inspectPrivateObject } = await import("@/lib/private-r2.server");
    if (!data.objectKey.startsWith(`brands/${data.brandId}/subscription-receipts/`)) {
      throw new Error("INVALID_RECEIPT_KEY");
    }
    const head = await inspectPrivateObject(data.objectKey);
    if (!head.ContentLength || head.ContentLength > 5 * 1024 * 1024) {
      throw new Error("RECEIPT_FILE_INVALID");
    }

    // Update brands table
    const { error } = await context.supabase
      .from("brands")
      .update({
        payment_receipt_url: data.objectKey,
        payment_receipt_uploaded_at: new Date().toISOString(),
        subscription_status: "pending_verification",
      })
      .eq("id", data.brandId);

    if (error) throw error;
    return { success: true };
  });

// 3. Generate pre-signed view URL for Super Admin to securely inspect the receipt
export const getSubscriptionReceiptViewUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => z.object({ objectKey: z.string() }).parse(raw))
  .handler(async ({ data, context }) => {
    // Restrict access ONLY to super admins
    const { data: isSuperAdmin } = await context.supabase.rpc("is_super_admin");
    if (!isSuperAdmin) {
      throw new Error("UNAUTHORIZED_SUPER_ADMIN_ONLY");
    }

    const { createPrivateViewUrl } = await import("@/lib/private-r2.server");
    const viewUrl = await createPrivateViewUrl(data.objectKey);
    return { viewUrl };
  });

// 4. Approve Subscription SaaS (Super Admin Only)
export const approveSubscriptionSaaS = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => AdminReviewInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { data: isSuperAdmin } = await context.supabase.rpc("is_super_admin");
    if (!isSuperAdmin) {
      throw new Error("UNAUTHORIZED_SUPER_ADMIN_ONLY");
    }

    const { data: brand } = await context.supabase
      .from("brands")
      .select("slug, plan_type, subscription_expires_at, payment_receipt_url")
      .eq("id", data.brandId)
      .maybeSingle();

    if (!brand) throw new Error("BRAND_NOT_FOUND");
    if (brand.slug.toLowerCase() === "pura" || brand.plan_type === "lifetime") {
      throw new Error("PERMANENT_PROJECT_DOES_NOT_REQUIRE_RENEWAL");
    }
    if (!brand.payment_receipt_url) throw new Error("PAYMENT_RECEIPT_REQUIRED");

    // Calculate new expiration date
    let baseDate = new Date();
    // If they already have an active future expiration, extend from that date!
    if (
      brand.subscription_expires_at &&
      new Date(brand.subscription_expires_at).getTime() > Date.now()
    ) {
      baseDate = new Date(brand.subscription_expires_at);
    }

    baseDate.setFullYear(baseDate.getFullYear() + 1);
    const newExpiresAt = baseDate.toISOString();

    const { error } = await context.supabase
      .from("brands")
      .update({
        subscription_tier: data.tier,
        subscription_status: "active",
        plan_type: "annual",
        subscription_expires_at: newExpiresAt,
        payment_receipt_url: null, // Processed
        payment_receipt_uploaded_at: null,
      })
      .eq("id", data.brandId);

    if (error) throw error;
    return { success: true };
  });

// 5. Reject and Suspend Subscription (Super Admin Only)
export const rejectSubscriptionSaaS = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => AdminRejectInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { data: isSuperAdmin } = await context.supabase.rpc("is_super_admin");
    if (!isSuperAdmin) {
      throw new Error("UNAUTHORIZED_SUPER_ADMIN_ONLY");
    }

    const { data: brand } = await context.supabase
      .from("brands")
      .select("payment_receipt_url, subscription_expires_at")
      .eq("id", data.brandId)
      .maybeSingle();

    if (brand?.payment_receipt_url) {
      const { deletePrivateObject } = await import("@/lib/private-r2.server");
      try {
        await deletePrivateObject(brand.payment_receipt_url);
      } catch (e) {
        console.error("Failed to delete private receipt R2 object", e);
      }
    }

    const subscriptionStillActive = Boolean(
      brand?.subscription_expires_at &&
      new Date(brand.subscription_expires_at).getTime() > Date.now(),
    );
    const { error } = await context.supabase
      .from("brands")
      .update({
        subscription_status: subscriptionStillActive ? "active" : "suspended",
        payment_receipt_url: null,
        payment_receipt_uploaded_at: null,
      })
      .eq("id", data.brandId);

    if (error) throw error;
    return { success: true };
  });
