import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { periodCaption } from "../src/components/expenses/ExpensesScopeSwitcher";
import { SettingsStickySaveBar } from "../src/components/settings/SettingsStickySaveBar";

// Refinements from the pre-launch walk through Pura's admin (2026-10-24).

describe("the expenses strip's period", () => {
  it("says which days its figures are, in Western digits", () => {
    const ar = periodCaption({ from: "2026-10-01", to: "2026-10-31" }, "ar");
    expect(ar).toContain("1");
    expect(ar).toContain("31");
    expect(ar).toContain("2026");
    expect(ar).not.toMatch(/[٠-٩]/);
    expect(periodCaption({ from: "2026-10-24", to: "2026-10-24" }, "en")).toBe("24 Oct 2026");
  });
});

describe("the settings' save bar", () => {
  it("is out of reach while nothing is unsaved", () => {
    const { container, rerender } = render(
      <SettingsStickySaveBar
        activeTab="identity"
        isDirty={false}
        isSaving={false}
        onSave={vi.fn()}
      />,
    );
    const bar = container.firstElementChild as HTMLElement;
    expect(bar).toHaveAttribute("aria-hidden", "true");
    expect(bar.hasAttribute("inert")).toBe(true);

    rerender(
      <SettingsStickySaveBar activeTab="identity" isDirty isSaving={false} onSave={vi.fn()} />,
    );
    expect(bar).toHaveAttribute("aria-hidden", "false");
    expect(bar.hasAttribute("inert")).toBe(false);
    expect(screen.getAllByRole("button").length).toBeGreaterThan(0);
  });
});
