import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { emailProofIsFresh } from "@/lib/owner-email";

/**
 * Marks the signed-in account's email as verified, once the session itself shows the person just
 * read a code or link Supabase Auth emailed to that address (the token's `amr`, which the server
 * has checked) and the address in the token is the one on the profile. The browser cannot set the
 * mark itself: the database refuses a signed-in user's change to `email_verified_at`.
 */
export const confirmOwnerEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!emailProofIsFresh(context.claims)) throw new Error("EMAIL_PROOF_REQUIRED");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email, email_verified_at")
      .eq("id", context.userId)
      .maybeSingle();
    if (!profile) throw new Error("PROFILE_NOT_FOUND");

    const proven = String(context.claims.email ?? "").toLowerCase();
    if (!proven || proven !== String(profile.email ?? "").toLowerCase()) {
      throw new Error("EMAIL_MISMATCH");
    }
    if (profile.email_verified_at) return { verified: true as const };

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ email_verified_at: new Date().toISOString() })
      .eq("id", context.userId);
    if (error) throw new Error("EMAIL_VERIFICATION_FAILED");
    return { verified: true as const };
  });
