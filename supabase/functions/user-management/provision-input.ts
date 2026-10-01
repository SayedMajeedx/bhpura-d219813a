// Checks a brand-provisioning request before anything is created. Plain
// TypeScript (no Deno APIs) so the Vitest suite can run it too.

/**
 * Every store vertical the database accepts (business_settings'
 * store_vertical check). The app's list is src/lib/store-profile.ts
 * (STORE_VERTICALS); tests/provision-input.test.ts keeps the two equal.
 */
export const PROVISIONABLE_VERTICALS = [
  "abayas",
  "fashion",
  "beauty",
  "fragrance",
  "coffee",
  "food",
  "gifts",
  "print",
  "jewelry",
  "home",
  "electronics",
  "digital",
  "services",
  "general",
] as const;

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export type ProvisionStoreInput = {
  storeVertical: string;
  storefrontAccentColor: string;
  storefrontBackgroundColor: string;
};

/**
 * The store's vertical and colours, normalised, or the error to answer with.
 * Call it before creating the owner's account: an early answer after that
 * point would skip the rollback and leave the account behind.
 */
export function parseProvisionStoreInput(
  body: Record<string, unknown>,
): { ok: true; value: ProvisionStoreInput } | { ok: false; error: string } {
  const storeVertical = String(body.store_vertical ?? "general")
    .trim()
    .toLowerCase();
  if (!(PROVISIONABLE_VERTICALS as readonly string[]).includes(storeVertical)) {
    return { ok: false, error: "Invalid store vertical" };
  }
  const accent = String(body.storefront_accent_color ?? body.primary_color ?? "#800020").trim();
  const background = String(body.storefront_background_color ?? "#ffffff").trim();
  if (!HEX_COLOR.test(accent) || !HEX_COLOR.test(background)) {
    return { ok: false, error: "Colours must be 6-digit hex values" };
  }
  return {
    ok: true,
    value: {
      storeVertical,
      storefrontAccentColor: accent.toLowerCase(),
      storefrontBackgroundColor: background.toLowerCase(),
    },
  };
}
