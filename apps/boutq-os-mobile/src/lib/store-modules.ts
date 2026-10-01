/**
 * Which parts of a store the merchant app shows. A store sells products
 * (stock, incubators, shipping, returns) or takes bookings (a services store).
 * The web app's vertical registry is the source (src/lib/verticals/registry.ts);
 * tests/mobile-store-modules.test.ts keeps this copy in step with it.
 */

export type MobileStoreModules = {
  bookings: boolean;
  stock: boolean;
  incubators: boolean;
  packaging: boolean;
  shipping: boolean;
  returns: boolean;
};

const SHOP: MobileStoreModules = {
  bookings: false,
  stock: true,
  incubators: true,
  packaging: true,
  shipping: true,
  returns: true,
};

/** A services store is booked, not stocked, shipped or returned. */
const BOOKED: MobileStoreModules = {
  bookings: true,
  stock: false,
  incubators: false,
  packaging: false,
  shipping: false,
  returns: false,
};

export const MOBILE_MODULE_IDS = Object.keys(SHOP) as Array<keyof MobileStoreModules>;

/** A store's modules: its vertical's defaults, then the store's own on/off choices. */
export function resolveMobileModules(
  vertical: string | null | undefined,
  overrides?: unknown,
): MobileStoreModules {
  const defaults = vertical === "services" ? BOOKED : SHOP;
  const chosen =
    overrides && typeof overrides === "object" ? (overrides as Record<string, unknown>) : {};
  const modules = { ...defaults };
  for (const id of MOBILE_MODULE_IDS) {
    if (typeof chosen[id] === "boolean") modules[id] = chosen[id];
  }
  return modules;
}
