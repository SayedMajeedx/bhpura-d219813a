import { countOf } from "@/lib/arabic-count";
import { storeAddress } from "@/lib/platform-host";

/**
 * A member's referral link (migration 20261228100000): the store's address with `?ref=<code>`.
 * The storefront keeps a link's code in this browser for the store (`rememberReferral`, read by
 * the checkout with `readReferral`), and the checkout's server function records it on the new
 * customer's first order. The database decides everything else (a member's own code, a customer
 * who ordered before), so a code here is only what the visitor came with.
 */

export const REFERRAL_PARAM = "ref";
/** How long a link's code is kept in the browser. */
export const REFERRAL_KEEP_DAYS = 30;

const KEY = (slug: string) => `boutq:referral:${slug}`;

/** A code as the database writes it, or null for anything that is not one. */
export function cleanReferralCode(raw: string | null | undefined): string | null {
  const code = String(raw ?? "")
    .trim()
    .toUpperCase();
  return /^[A-Z0-9]{6,12}$/.test(code) ? code : null;
}

/** The member's link to share. */
export function referralLink(slug: string, code: string): string {
  return `${storeAddress(slug)}?${REFERRAL_PARAM}=${encodeURIComponent(code)}`;
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function storage(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Keeps a link's code for the store (the latest link wins). */
export function rememberReferral(
  slug: string,
  raw: string | null,
  now: number,
  store: Store | null = storage(),
): void {
  const code = cleanReferralCode(raw);
  if (!code || !store) return;
  try {
    store.setItem(KEY(slug), JSON.stringify({ code, at: now }));
  } catch {
    // A full or blocked storage keeps nothing; the referral is simply not recorded.
  }
}

/** The code this browser came with for the store, while it is fresh. */
export function readReferral(
  slug: string,
  now: number,
  store: Store | null = storage(),
): string | null {
  try {
    const saved = JSON.parse(store?.getItem(KEY(slug)) ?? "null") as {
      code?: string;
      at?: number;
    } | null;
    if (!saved || !(Number(saved.at) > 0)) return null;
    if (now - Number(saved.at) > REFERRAL_KEEP_DAYS * 86_400_000) return null;
    return cleanReferralCode(saved.code);
  } catch {
    return null;
  }
}

export function forgetReferral(slug: string, store: Store | null = storage()): void {
  try {
    store?.removeItem(KEY(slug));
  } catch {
    // Nothing to forget.
  }
}

/** The message a member sends a friend with their link, in the reader's language. */
export function inviteMessage(
  link: string,
  storeName: string,
  points: number,
  lang: "ar" | "en",
): string {
  return lang === "ar"
    ? `أنصح بـ ${storeName} 🤍\nأول طلب من رابطي، ولكلٍّ منّا ${countOf(points, "point", "ar")} ولاء بعد اكتماله:\n${link}`
    : `I think you'll love ${storeName} 🤍\nPlace your first order through my link and we each get ${countOf(points, "point", "en")} once it's completed:\n${link}`;
}
