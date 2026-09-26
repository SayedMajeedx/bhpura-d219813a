import type { AuthChangeEvent, EmailOtpType, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * The sign-in flows: admin and storefront sign-in (password, passkey,
 * Google), storefront sign-up and membership, password reset and recovery,
 * the forced first-login password change, and passkey management.
 *
 * Each function returns Supabase's own `{ data, error }` result unchanged:
 * the pages map `error` to their translated messages (`translateAuthError`),
 * so these wrappers must not throw or reshape it. Session reads and sign-out
 * live in `./session`.
 */

export function signInWithPassword(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export function signInWithPasskey() {
  return supabase.auth.signInWithPasskey();
}

/** Google sign-in; the browser leaves for Google and returns to `redirectTo`. */
export function signInWithGoogle(redirectTo: string) {
  return supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
}

/** A storefront shopper's new account, tagged with the store they signed up in. */
export function signUpStorefrontCustomer(args: {
  email: string;
  password: string;
  name?: string;
  phone?: string;
  brandSlug: string;
  emailRedirectTo: string;
}) {
  return supabase.auth.signUp({
    email: args.email,
    password: args.password,
    options: {
      data: { name: args.name, phone: args.phone, storefront_slug: args.brandSlug },
      emailRedirectTo: args.emailRedirectTo,
    },
  });
}

/** Whether the signed-in shopper is a customer of this store. */
export async function hasStorefrontMembership(brandSlug: string) {
  const { data, error } = await supabase.rpc("has_storefront_membership", {
    p_brand_slug: brandSlug,
  });
  return { isMember: data === true, error };
}

/** Makes the signed-in shopper a customer of this store (with the name and phone they gave). */
export async function activateStorefrontMembership(
  brandSlug: string,
  contact: { name?: string; phone?: string } = {},
) {
  const { error } = await supabase.rpc("activate_storefront_membership", {
    p_brand_slug: brandSlug,
    p_name: contact.name,
    p_phone: contact.phone,
  });
  return { error };
}

export function sendPasswordResetEmail(email: string, redirectTo: string) {
  return supabase.auth.resetPasswordForEmail(email, { redirectTo });
}

/** Recovery link, PKCE flow (`?code=`). */
export function exchangeRecoveryCode(code: string) {
  return supabase.auth.exchangeCodeForSession(code);
}

/** Recovery or confirmation link, token-hash flow (`?token_hash=&type=`). */
export function verifyEmailToken(tokenHash: string, type: EmailOtpType) {
  return supabase.auth.verifyOtp({ token_hash: tokenHash, type });
}

/** Recovery link, implicit flow (`#access_token=&refresh_token=`). */
export function restoreSessionFromLink(accessToken: string, refreshToken: string) {
  return supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
}

/** Sets a new password (and, optionally, account metadata). */
export function updatePassword(password: string, metadata?: Record<string, unknown>) {
  return supabase.auth.updateUser(metadata ? { password, data: metadata } : { password });
}

/** Clears the profile's forced password change after the first sign-in. */
export async function completeFirstSignInPasswordChange() {
  const { error } = await supabase.rpc("complete_first_sign_in_password_change");
  return { error };
}

/** Listens for sign-in, sign-out and recovery events; returns the subscription holder. */
export function onAuthChange(listener: (event: AuthChangeEvent, session: Session | null) => void) {
  return supabase.auth.onAuthStateChange(listener);
}

export function listPasskeys() {
  return supabase.auth.passkey.list();
}

export function registerPasskey() {
  return supabase.auth.registerPasskey();
}

export function deletePasskey(passkeyId: string) {
  return supabase.auth.passkey.delete({ passkeyId });
}
