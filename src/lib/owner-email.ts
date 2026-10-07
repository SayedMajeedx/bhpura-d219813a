import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Whether the person behind a team account has shown they own its email address.
 *
 * The instant trial signs its owner in at once without proof of the address, so its profile starts
 * unverified (`profiles.email_verified_at` is null). Until they enter a code Supabase Auth emails
 * them, the account can run the trial but cannot pay for a plan or invite staff. Every other
 * account is verified from the start.
 */

export const OWNER_EMAIL_NOT_VERIFIED = "OWNER_EMAIL_NOT_VERIFIED";

/** Ways of signing in that prove the person can read the account's email. A password does not. */
const EMAIL_PROOF_METHODS = new Set(["otp", "magiclink", "email/signup", "recovery", "invite"]);
const EMAIL_PROOF_MAX_AGE_MS = 30 * 60 * 1000;

type AmrEntry = { method?: unknown; timestamp?: unknown };

/** True when the session was started, within the last half hour, by a code or link sent by email. */
export function emailProofIsFresh(claims: { amr?: unknown } | null | undefined, now = Date.now()) {
  const amr = Array.isArray(claims?.amr) ? (claims.amr as AmrEntry[]) : [];
  return amr.some((entry) => {
    if (typeof entry?.method !== "string" || !EMAIL_PROOF_METHODS.has(entry.method)) return false;
    const at = Number(entry.timestamp) * 1000;
    return Number.isFinite(at) && now - at >= -60_000 && now - at <= EMAIL_PROOF_MAX_AGE_MS;
  });
}

/** The claims inside an access token (read, not verified: the server verifies it). */
export function claimsOfAccessToken(token: string | null | undefined): { amr?: unknown } | null {
  try {
    const payload = token?.split(".")[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as { amr?: unknown };
  } catch {
    return null;
  }
}

/**
 * Stops an account that has not verified its email from paying or inviting. A missing profile is
 * not stopped here (the brand checks that come with these actions already refuse it).
 */
export async function requireVerifiedOwner(context: {
  supabase: SupabaseClient<Database>;
  userId: string;
}) {
  const { data } = await context.supabase
    .from("profiles")
    .select("email_verified_at")
    .eq("id", context.userId)
    .maybeSingle();
  if (data && data.email_verified_at === null) throw new Error(OWNER_EMAIL_NOT_VERIFIED);
}

/** The shopper-facing message for a stop, or null for any other error. */
export function ownerEmailErrorMessage(error: unknown, isAr: boolean): string | null {
  const text = error instanceof Error ? error.message : String(error ?? "");
  if (!text.includes(OWNER_EMAIL_NOT_VERIFIED) && !text.includes("EMAIL_NOT_VERIFIED")) return null;
  return isAr
    ? "أكّد بريدك الإلكتروني أولاً (اللافتة أعلى الصفحة) ثم أعد المحاولة."
    : "Verify your email first (the banner at the top of the page), then try again.";
}
