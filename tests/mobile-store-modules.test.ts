import { describe, expect, it } from "vitest";
import {
  MOBILE_MODULE_IDS,
  resolveMobileModules,
} from "../apps/boutq-os-mobile/src/lib/store-modules";
import { resolveStoreModules } from "../src/lib/store-profile";
import { VERTICAL_DEFINITIONS } from "../src/lib/verticals/registry";

// Services vertical, step S6: the merchant app shows a services store its
// bookings and services, not stock or incubators. The app keeps its own small
// copy of the module rules; these keep it in step with the web registry.

describe("the merchant app's store modules", () => {
  it("match the web registry for every vertical", () => {
    for (const vertical of VERTICAL_DEFINITIONS) {
      const mobile = resolveMobileModules(vertical.id);
      for (const id of MOBILE_MODULE_IDS) {
        expect(mobile[id], `${vertical.id}.${id}`).toBe(vertical.modules[id]);
      }
    }
  });

  it("match the web for a store's own on/off choices", () => {
    const overrides = { stock: true, returns: true, incubators: false, bookings: false };
    for (const vertical of ["services", "fashion"]) {
      const web = resolveStoreModules({ store_vertical: vertical, store_modules: overrides });
      const mobile = resolveMobileModules(vertical, overrides);
      for (const id of MOBILE_MODULE_IDS) expect(mobile[id], `${vertical}.${id}`).toBe(web[id]);
    }
  });

  it("treat an unknown or missing vertical as a shop, and ignore junk overrides", () => {
    expect(resolveMobileModules(null).stock).toBe(true);
    expect(resolveMobileModules("no-such-vertical").incubators).toBe(true);
    expect(resolveMobileModules("services", "nonsense").stock).toBe(false);
    expect(resolveMobileModules("services", { stock: "yes", bookings: 1 })).toMatchObject({
      stock: false,
      bookings: true,
    });
    expect(resolveMobileModules("services", null).bookings).toBe(true);
  });
});
