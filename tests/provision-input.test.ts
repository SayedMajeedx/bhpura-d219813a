import { describe, expect, it } from "vitest";
import {
  parseProvisionStoreInput,
  PROVISIONABLE_VERTICALS,
} from "../supabase/functions/user-management/provision-input";
import { STORE_VERTICALS } from "../src/lib/store-profile";

// Creating a brand for a services store failed with "Invalid store vertical":
// the user-management function kept its own list of verticals, which missed
// the two added later (fragrance, services). It also answered after creating
// the owner's account, which skipped the rollback and left the account behind.

describe("the verticals a brand can be created with", () => {
  it("are exactly the app's store verticals", () => {
    expect([...PROVISIONABLE_VERTICALS].sort()).toEqual([...STORE_VERTICALS].sort());
  });

  it("accept every one of them, services and fragrance included", () => {
    for (const vertical of [...STORE_VERTICALS, " Services "]) {
      const result = parseProvisionStoreInput({ store_vertical: vertical });
      expect(result.ok, vertical).toBe(true);
    }
    expect(parseProvisionStoreInput({ store_vertical: "services" })).toMatchObject({
      ok: true,
      value: { storeVertical: "services" },
    });
  });

  it("refuses an unknown vertical", () => {
    expect(parseProvisionStoreInput({ store_vertical: "spaceships" })).toEqual({
      ok: false,
      error: "Invalid store vertical",
    });
  });
});

describe("the store's colours", () => {
  it("default, and are lower-cased", () => {
    expect(parseProvisionStoreInput({})).toEqual({
      ok: true,
      value: {
        storeVertical: "general",
        storefrontAccentColor: "#800020",
        storefrontBackgroundColor: "#ffffff",
      },
    });
    expect(parseProvisionStoreInput({ storefront_accent_color: " #AABBCC " })).toMatchObject({
      value: { storefrontAccentColor: "#aabbcc" },
    });
    expect(parseProvisionStoreInput({ primary_color: "#112233" })).toMatchObject({
      value: { storefrontAccentColor: "#112233" },
    });
  });

  it("must be 6-digit hex", () => {
    for (const body of [
      { storefront_accent_color: "red" },
      { storefront_background_color: "#fff" },
    ]) {
      expect(parseProvisionStoreInput(body)).toEqual({
        ok: false,
        error: "Colours must be 6-digit hex values",
      });
    }
  });
});
