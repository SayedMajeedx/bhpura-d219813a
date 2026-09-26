import { applyRememberMe } from "@/lib/session-persistence";
import {
  readStorefrontOAuthReturn,
  rememberStorefrontOAuthReturn,
} from "@/lib/storefront-oauth-return";
import { getCurrentSession } from "./session";
import { onAuthChange } from "./sign-in";

/**
 * Google sign-in from a storefront leaves the site and comes back through
 * Supabase, which may land on the admin sign-in page. These keep the shopper
 * signed in and send them back to their store.
 */

/** Before leaving for Google: keep the shopper signed in and remember where to return. */
export function prepareStorefrontGoogleSignIn(callbackPath: string) {
  applyRememberMe(true);
  rememberStorefrontOAuthReturn(callbackPath);
}

/**
 * On the admin sign-in page: when a storefront return is pending, go to it as
 * soon as a session exists (already, or when the sign-in completes). Returns
 * the cleanup, or nothing when no return is pending.
 */
export function continueToStorefrontWhenSignedIn(go: (path: string) => void) {
  const returnPath = readStorefrontOAuthReturn();
  if (!returnPath) return undefined;
  let active = true;
  const continueToStorefront = () => {
    if (active) go(returnPath);
  };
  void getCurrentSession().then((session) => {
    if (session?.user) continueToStorefront();
  });
  const { data: listener } = onAuthChange((_event, session) => {
    if (session?.user) continueToStorefront();
  });
  return () => {
    active = false;
    listener.subscription.unsubscribe();
  };
}
