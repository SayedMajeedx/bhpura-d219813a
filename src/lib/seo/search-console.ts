/**
 * Google Search Console proves a store is its owner's with a tag in the page's head:
 * `<meta name="google-site-verification" content="TOKEN" />`. A merchant pastes either the whole
 * tag Google shows or just the token; the store keeps the token (the database accepts only
 * letters, digits, "-" and "_", 10 to 100 of them) and the storefront writes the tag.
 */

const TOKEN = /^[A-Za-z0-9_-]{10,100}$/;

export type VerificationInput =
  { status: "empty" } | { status: "ok"; token: string } | { status: "invalid" };

/** The token in what the merchant pasted: the token itself, or the tag Google gave them. */
export function parseVerificationInput(input: string | null | undefined): VerificationInput {
  const text = (input ?? "").trim();
  if (!text) return { status: "empty" };
  const fromTag = /content\s*=\s*["']([^"']+)["']/i.exec(text)?.[1];
  const token = (fromTag ?? text).trim();
  return TOKEN.test(token) ? { status: "ok", token } : { status: "invalid" };
}

/** Where a store submits its sitemap once it is verified. */
export const SEARCH_CONSOLE_URL = "https://search.google.com/search-console";
