import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  requireSupabaseAuth,
  requireSupabaseAuthForImpersonationExit,
  requireSupabaseAuthForImpersonationLifecycle,
} from "@/integrations/supabase/auth-middleware";

const StartImpersonationInput = z.object({
  targetTenantId: z.string().uuid(),
  reason: z.string().optional(),
});

const GetAuditLogsInput = z.object({
  brandId: z.string().uuid(),
});

const ToggleSupportAccessInput = z.object({
  brandId: z.string().uuid(),
  enabled: z.boolean(),
});

// Helper to assert superadmin authorization
async function requireSuperAdmin(context: any) {
  const { data: isSuperAdmin, error } = await context.supabase.rpc("is_super_admin");
  if (error || !isSuperAdmin) {
    throw new Error("UNAUTHORIZED_SUPER_ADMIN_ONLY");
  }
}

export const startImpersonationSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuthForImpersonationLifecycle])
  .validator((raw: unknown) => StartImpersonationInput.parse(raw))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context);
    const { userId } = context;

    // Fetch target brand and verify support_access_enabled
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: brand, error: brandErr } = await supabaseAdmin
      .from("brands")
      .select("id, slug, support_access_enabled")
      .eq("id", data.targetTenantId)
      .maybeSingle();

    if (brandErr || !brand) {
      throw new Error("Access Denied: Target brand not found.");
    }

    if (brand.support_access_enabled === false) {
      throw new Error("Access Denied: Store owner has disabled technical support access.");
    }

    // Generate cryptographically signed session cookie token
    const { signImpersonationPayload, writeImpersonationCookie } =
      await import("./impersonation-cookies.server");
    const tokenStr = await signImpersonationPayload({
      operatorId: userId,
      targetTenantId: brand.id,
      issuedAt: Date.now(),
    });

    // Set cookie in response using isolated server-only module
    await writeImpersonationCookie(tokenStr);

    // Write immutable audit log
    await supabaseAdmin.from("system_audit_logs").insert({
      operator_id: userId,
      target_tenant_id: brand.id,
      action_type: "impersonation_start",
      reason: data.reason || "Technical Support Troubleshooting",
    });

    return { success: true, slug: brand.slug, token: tokenStr };
  });

export const stopImpersonationSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuthForImpersonationExit])
  .handler(async ({ context }) => {
    const { userId } = context;

    let targetTenantId: string | null = null;

    const { readImpersonationCookie, clearImpersonationCookie } =
      await import("./impersonation-cookies.server");
    const cookieVal = await readImpersonationCookie();
    if (cookieVal) {
      try {
        const payload = JSON.parse(Buffer.from(cookieVal, "base64").toString("utf-8"));
        targetTenantId = payload.targetTenantId;
      } catch {}
    }
    await clearImpersonationCookie();

    // Write audit log if we could resolve the target brand
    if (targetTenantId) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("system_audit_logs").insert({
        operator_id: userId,
        target_tenant_id: targetTenantId,
        action_type: "impersonation_stop",
        reason: "User voluntarily exited impersonation session.",
      });
    }

    return { success: true };
  });

export const getTenantAuditLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => GetAuditLogsInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("brand_id, role")
      .eq("id", userId)
      .single();

    if (!profile) {
      throw new Error("Unauthorized.");
    }

    const isSuperAdmin = profile.role === "super_admin";
    const belongsToBrand = profile.brand_id === data.brandId;

    if (!isSuperAdmin && !belongsToBrand) {
      throw new Error(
        "Access Denied: You do not have permission to view audit logs for this store.",
      );
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: logs, error } = await supabaseAdmin
      .from("system_audit_logs")
      .select(
        `
        id,
        action_type,
        reason,
        created_at,
        operator_id
      `,
      )
      .eq("target_tenant_id", data.brandId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Fetch operator profile names in a secure way
    const operatorIds = Array.from(new Set(logs?.map((l: any) => l.operator_id) || []));
    const operators: Record<string, { name: string; email: string }> = {};

    if (operatorIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, name, email")
        .in("id", operatorIds);

      profiles?.forEach((p: any) => {
        operators[p.id] = {
          name: p.name || "Boutq Engineer",
          email: p.email || "",
        };
      });
    }

    return (logs || []).map((l: any) => ({
      ...l,
      operator: operators[l.operator_id] || { name: "Boutq Engineer", email: "" },
    }));
  });

export const toggleSupportAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => ToggleSupportAccessInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("brand_id, role")
      .eq("id", userId)
      .single();

    if (!profile) {
      throw new Error("Unauthorized.");
    }

    const isSuperAdmin = profile.role === "super_admin";
    const belongsToBrand = profile.brand_id === data.brandId;

    if (!isSuperAdmin && !belongsToBrand) {
      throw new Error(
        "Access Denied: You do not have permission to modify support access settings.",
      );
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("brands")
      .update({ support_access_enabled: data.enabled })
      .eq("id", data.brandId);

    if (error) throw error;
    return { success: true };
  });

const ValidateSessionInput = z.object({
  brandId: z.string().uuid(),
});

export const validateImpersonationSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => ValidateSessionInput.parse(raw))
  .handler(async ({ data }) => {
    const { readImpersonationCookie, verifyImpersonationToken } =
      await import("./impersonation-cookies.server");
    const cookieVal = await readImpersonationCookie();
    if (!cookieVal) return { valid: false };

    const payload = await verifyImpersonationToken(cookieVal);
    if (payload && payload.targetTenantId === data.brandId) {
      return { valid: true };
    }

    return { valid: false };
  });
