import { supabase } from "@/integrations/supabase/client";

/**
 * Two-factor sign-in for staff: a code from an authenticator app (TOTP, Supabase Auth's MFA),
 * optional, each member turning it on (the owner's decision of 2026-10-27). The database grants a
 * member who has it on nothing until the session gave its code (migration 20261027150000); these
 * are the calls the account settings and the code screen make. Supabase's results are returned
 * as they are, apart from the shapes below.
 */

export type TwoFactorStatus = {
  /** An authenticator app is confirmed for this account. */
  enabled: boolean;
  /** The confirmed app's id, to turn it off. */
  factorId: string | null;
  /** This session has not given its code yet (it must, before the admin opens). */
  needsCode: boolean;
};

export async function twoFactorStatus(): Promise<TwoFactorStatus> {
  const [{ data: factors, error }, { data: level, error: levelError }] = await Promise.all([
    supabase.auth.mfa.listFactors(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  if (error) throw error;
  if (levelError) throw levelError;
  const verified = (factors?.totp ?? []).find((f) => f.status === "verified") ?? null;
  return {
    enabled: Boolean(verified),
    factorId: verified?.id ?? null,
    needsCode: level?.nextLevel === "aal2" && level?.currentLevel !== "aal2",
  };
}

export type TwoFactorSetup = { factorId: string; qrCode: string; secret: string };

/**
 * Starts adding an authenticator app: a QR code to scan and the key to type. An earlier start
 * that was never confirmed is cleared first (Supabase keeps one per name).
 */
export async function startTwoFactorSetup(): Promise<TwoFactorSetup> {
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const factor of factors?.all ?? []) {
    if (factor.factor_type === "totp" && factor.status !== "verified") {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "Boutq",
    issuer: "Boutq",
  });
  if (error) throw error;
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

/** Confirms the app with its first code; from then on, signing in asks for a code. */
export async function confirmTwoFactor(factorId: string, code: string) {
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId,
    code: code.replace(/\s+/g, ""),
  });
  if (error) throw error;
}

/** Gives this session's code (after a password or a passkey), raising it to aal2. */
export async function giveSignInCode(code: string) {
  const status = await twoFactorStatus();
  if (!status.factorId) throw new Error("NO_TWO_FACTOR");
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: status.factorId,
    code: code.replace(/\s+/g, ""),
  });
  if (error) throw error;
}

/** Turns two-factor off for this account (a session that gave its code may). */
export async function turnOffTwoFactor(factorId: string) {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw error;
}

/** A code as typed is six digits (spaces allowed). */
export const isCode = (value: string) => /^\d{6}$/.test(value.replace(/\s+/g, ""));
