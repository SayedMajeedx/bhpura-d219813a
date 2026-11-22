import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { releaseNativePushDevice } from "@/lib/native-push";

/**
 * The signed-in session as screens and actions read it. Route guards that
 * need caching and retries use `ensureSessionUser` instead.
 *
 * Each helper keeps the fallback the screens relied on: an unreadable user or
 * session reads as none (the Supabase client returns errors, it does not
 * throw), and callers decide what "none" means (redirect, skip, sign in).
 */

/**
 * The signed-in user, checked on this device: the session's token is verified against the
 * project's signing key (ES256; the key is fetched once and kept), and the user is the session's
 * own. `getUser()` asked Supabase Auth in Mumbai every time, 0.4-0.6 s on the admin's opening and
 * before every save (the speed review of 2026-11-22). The database checks the token on every read
 * and write anyway. Throws when the check could not be made (a network failure fetching the key),
 * so a guard can try again; null when there is no session or the token does not verify.
 */
export async function verifiedUser(): Promise<User | null> {
  const { data, error } = await supabase.auth.getClaims();
  if (error) {
    if (isAuthTransportError(error)) throw error;
    return null;
  }
  const subject = data?.claims?.sub;
  if (!subject) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id === subject ? session.user : null;
}

/** A failure to reach Auth (retryable), as opposed to a session that is not valid. */
function isAuthTransportError(error: { name?: string; status?: number }) {
  return error.name === "AuthRetryableFetchError" || (error.status ?? 0) >= 500;
}

/** The signed-in user, or null when there is none (or it cannot be read). */
export async function getCurrentUser() {
  try {
    return await verifiedUser();
  } catch {
    return null;
  }
}

/** The current session (with its access token), or null. */
export async function getCurrentSession() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
}

/** The current access token for calling the app's own API routes, or null. */
export async function getAccessToken() {
  return (await getCurrentSession())?.access_token ?? null;
}

/**
 * Signs out of this browser only (`scope: "local"`): the person's other devices stay signed in.
 * Supabase's default ends every session the person has, so one sign-out on a laptop signed the
 * phone app out too. Inside the merchant app, the phone's notifications for this person are
 * turned off first (it needs the session, so it cannot come after).
 */
export async function signOut() {
  await releaseNativePushDevice();
  await supabase.auth.signOut({ scope: "local" });
}

/** Ends every session the person has, on every device (Settings → Account → Security). */
export async function signOutEverywhere() {
  await releaseNativePushDevice();
  const { error } = await supabase.auth.signOut({ scope: "global" });
  if (error) throw error;
}
