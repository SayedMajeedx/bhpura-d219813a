import { supabase } from "@/integrations/supabase/client";

/**
 * The signed-in session as screens and actions read it. Route guards that
 * need caching and retries use `ensureSessionUser` instead.
 *
 * Each helper keeps the fallback the screens relied on: an unreadable user or
 * session reads as none (the Supabase client returns errors, it does not
 * throw), and callers decide what "none" means (redirect, skip, sign in).
 */

/** The signed-in user, or null when there is none (or it cannot be read). */
export async function getCurrentUser() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
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

/** Signs out of this browser. */
export async function signOut() {
  await supabase.auth.signOut();
}
