import { describe, it, expect } from "vitest";
import { SETTINGS_REGISTRY } from "../src/features/settings/registry";
import {
  ALL_LEGACY_SAVE_COLUMNS,
  LEGACY_GENERAL_SAVE_COLUMNS,
  LEGACY_PAYMENTS_SAVE_COLUMNS,
  LEGACY_SHIPPING_SAVE_COLUMNS,
  LEGACY_MODE_SAVE_COLUMNS,
  LEGACY_STOREFRONT_CUSTOMIZER_COLUMNS,
  LEGACY_NOTIFICATIONS_SAVE_COLUMNS,
} from "../src/features/settings/legacy-save-columns";

describe("Settings Save Payload Baseline Guard", () => {
  const settingsOwnedFields = new Set(
    SETTINGS_REGISTRY.filter((f) => f.owner === "settings" && f.table === "business_settings").map(
      (f) => f.key,
    ),
  );

  it("all general & invoice save columns are registered under owner 'settings'", () => {
    const missing = LEGACY_GENERAL_SAVE_COLUMNS.filter((col) => !settingsOwnedFields.has(col));
    expect(missing).toEqual([]);
  });

  it("all payments save columns are registered under owner 'settings'", () => {
    const missing = LEGACY_PAYMENTS_SAVE_COLUMNS.filter((col) => !settingsOwnedFields.has(col));
    expect(missing).toEqual([]);
  });

  it("all shipping & fulfillment save columns are registered under owner 'settings'", () => {
    const missing = LEGACY_SHIPPING_SAVE_COLUMNS.filter((col) => !settingsOwnedFields.has(col));
    expect(missing).toEqual([]);
  });

  it("all selling mode save columns are registered under owner 'settings'", () => {
    const missing = LEGACY_MODE_SAVE_COLUMNS.filter((col) => !settingsOwnedFields.has(col));
    expect(missing).toEqual([]);
  });

  it("all storefront customizer save columns are registered under owner 'settings'", () => {
    const missing = LEGACY_STOREFRONT_CUSTOMIZER_COLUMNS.filter(
      (col) => !settingsOwnedFields.has(col),
    );
    expect(missing).toEqual([]);
  });

  it("all notification template save columns are registered under owner 'settings'", () => {
    const missing = LEGACY_NOTIFICATIONS_SAVE_COLUMNS.filter(
      (col) => !settingsOwnedFields.has(col),
    );
    expect(missing).toEqual([]);
  });

  it("every legacy save column across all 6 handlers is accounted for under owner 'settings'", () => {
    const missing = ALL_LEGACY_SAVE_COLUMNS.filter((col) => !settingsOwnedFields.has(col));
    expect(missing).toEqual([]);
  });
});
