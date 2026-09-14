import React from "react";
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AddonErrorBoundary } from "../src/components/addons/AddonErrorBoundary";
import { AddonSlot } from "../src/components/addons/AddonSlot";
import { AddonsProvider } from "../src/components/addons/AddonsProvider";
import type { BrandAddonRow } from "../src/lib/addons/addon-types";

function CrashingComponent(): React.ReactElement {
  throw new Error("Simulated addon slot crash");
}

describe("AddonErrorBoundary", () => {
  test("renders children normally when no error occurs", () => {
    render(
      <AddonErrorBoundary addonId="test-addon" slotId="test-slot">
        <div data-testid="child">Hello World</div>
      </AddonErrorBoundary>,
    );

    expect(screen.getByTestId("child").textContent).toBe("Hello World");
  });

  test("catches error from child and renders fallback without throwing", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const onError = vi.fn();

    render(
      <AddonErrorBoundary
        addonId="test-addon"
        slotId="test-slot"
        fallback={<div data-testid="fallback">Addon temporarily unavailable</div>}
        onError={onError}
      >
        <CrashingComponent />
      </AddonErrorBoundary>,
    );

    expect(screen.getByTestId("fallback").textContent).toBe("Addon temporarily unavailable");
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toBe("Simulated addon slot crash");

    consoleSpy.mockRestore();
  });

  test("renders null fallback when none is provided upon crash", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { container } = render(
      <AddonErrorBoundary addonId="test-addon" slotId="test-slot">
        <CrashingComponent />
      </AddonErrorBoundary>,
    );

    expect(container.innerHTML).toBe("");
    consoleSpy.mockRestore();
  });
});

describe("AddonSlot integration with AddonsProvider", () => {
  test("renders nothing when no addon is installed for slot placement", () => {
    const addons: BrandAddonRow[] = [];

    const { container } = render(
      <AddonsProvider addons={addons}>
        <AddonSlot placement="storefront.product.optionsAside" />
      </AddonsProvider>,
    );

    expect(container.innerHTML).toBe("");
  });

  test("renders nothing when addon is disabled", () => {
    const addons: BrandAddonRow[] = [
      {
        brand_id: "brand-1",
        addon_id: "size-guides",
        status: "disabled",
        version: 1,
        settings: {},
        public_settings: {},
        seeded_keys: [],
        source: "onboarding",
        installed_at: "2026-09-14",
        updated_at: "2026-09-14",
      },
    ];

    const { container } = render(
      <AddonsProvider addons={addons}>
        <AddonSlot placement="storefront.product.optionsAside" />
      </AddonsProvider>,
    );

    expect(container.innerHTML).toBe("");
  });
});
