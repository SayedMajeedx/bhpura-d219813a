import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { customFieldPresetsFrom } from "../src/lib/addons/addon-registry";
import type { BrandAddonRow } from "../src/lib/addons/addon-types";
import { CUSTOMIZER_PRESETS } from "../src/lib/addons/addon-presets";
import {
  galleryMaxWidth,
  galleryRatioClass,
  galleryRatioValue,
} from "../src/features/product-page/lib/product-media";
import { ProductGallery } from "../src/features/product-page/components/ProductGallery";
import type { PdpMediaItem } from "../src/features/product-page/types";

const installed = (...ids: string[]) =>
  ids.map((addon_id) => ({ addon_id, status: "installed" }) as BrandAddonRow);

describe("the product editor's quick presets", () => {
  const keys = (...ids: string[]) => customFieldPresetsFrom(installed(...ids)).map((p) => p.key);

  it("list the Fit Passport presets once the add-on is installed", () => {
    const list = keys("fashion-core", "fit-passport");
    expect(list).toEqual(
      expect.arrayContaining(["fit_measurements", "fashion", "passport_abaya", "passport_dress"]),
    );
  });

  it("list every Fit Passport preset the store's static list has, with its fields", () => {
    const contributed = customFieldPresetsFrom(installed("fit-passport"));
    for (const [key, preset] of Object.entries(CUSTOMIZER_PRESETS)) {
      if (!key.startsWith("passport_")) continue;
      const found = contributed.find((p) => p.key === key);
      expect(found, key).toBeDefined();
      expect(found?.label).toEqual({ ar: preset.label_ar, en: preset.label_en });
      expect(found?.fields).toEqual(preset.fields);
    }
  });

  it("name them and measure in numbers a customer's passport can fill", () => {
    const abaya = customFieldPresetsFrom(installed("fit-passport")).find(
      (p) => p.key === "passport_abaya",
    );
    expect(abaya?.label.en).toBe("Fit Passport — Abaya");
    expect(
      (abaya?.fields as Array<{ key: string; type: string }>).every(
        (f) => f.key.startsWith("passport_abaya_") && f.type === "number",
      ),
    ).toBe(true);
  });

  it("do not appear without the add-on", () => {
    expect(keys("fashion-core")).not.toContain("passport_abaya");
    expect(keys()).toEqual([]);
  });
});

describe("the product gallery frame's ratio", () => {
  it("reads the setting as a number, portrait 3:4 by default", () => {
    expect(galleryRatioValue(undefined)).toBe(0.75);
    expect(galleryRatioValue("1:1")).toBe(1);
    expect(galleryRatioValue("4:5")).toBe(0.8);
    expect(galleryRatioValue("3:4")).toBe(0.75);
  });

  it("limits the frame's width so that, at its ratio, it is never taller than the screen allows", () => {
    expect(galleryMaxWidth("3:4")).toBe("calc(min(78vh, 700px) * 0.75)");
    expect(galleryMaxWidth("1:1")).toBe("calc(min(78vh, 700px) * 1)");
    // The three settings now give three different frames, not one capped box.
    expect(new Set(["3:4", "1:1", "4:5"].map(galleryMaxWidth)).size).toBe(3);
  });

  const MEDIA = [
    { type: "image", url: "https://cdn.test/a.jpg" },
    { type: "image", url: "https://cdn.test/b.jpg" },
  ] as unknown as PdpMediaItem[];
  const gallery = (ratio: string) =>
    render(
      <ProductGallery
        displayName="Abaya"
        galleryRatioClass={galleryRatioClass(ratio)}
        galleryMaxWidth={galleryMaxWidth(ratio)}
        galleryTouchStartX={{ current: null }}
        media={MEDIA}
        mediaIdx={0}
        primary="red"
        product={{ id: "p1" } as never}
        setMediaIdx={vi.fn()}
        settings={{} as never}
        t={((_ar: string, en: string) => en) as never}
      />,
    );

  it("keeps the frame at its ratio (no height cap) and the strip at the frame's width", () => {
    const { container } = gallery("4:5");
    const wrapper = container.querySelector("[style]") as HTMLElement;
    // (the browser re-spaces the expression)
    expect(wrapper.style.maxWidth.replace(/\s+/g, "")).toBe("calc(min(78vh,700px)*0.8)");
    const frame = wrapper.firstElementChild as HTMLElement;
    expect(frame.className).toContain("aspect-[4/5]");
    expect(frame.className).not.toMatch(/max-h-/);
    // The thumbnails live in the same width-limited wrapper as the frame.
    expect(wrapper.querySelectorAll("button[aria-label^='Show']").length).toBe(2);
  });
});

const media = vi.hoisted(() => ({ lang: "en" as "en" | "ar" }));
vi.mock("../src/components/responsive-media", () => ({
  OptimizedVideo: () => <div />,
  ResponsiveImage: () => <img alt="" />,
}));
vi.mock("@/components/responsive-media", () => ({
  OptimizedVideo: () => <div />,
  ResponsiveImage: () => <img alt="" />,
}));
const { ProductMediaTab } = await import("../src/features/inventory/components/ProductMediaTab");

describe("the product editor's media cards", () => {
  beforeEach(() => {
    media.lang = "en";
  });
  const tab = (isAr = false, move = vi.fn()) =>
    render(
      <ProductMediaTab
        isAr={isAr}
        form={
          {
            media: [
              { type: "image", url: "a" },
              { type: "image", url: "b" },
            ],
          } as never
        }
        uploading={false}
        handleFilePicked={async () => undefined}
        removeMedia={vi.fn()}
        moveMedia={move}
      />,
    );

  it("lay out by the room the editor has, each card wide enough for its buttons", () => {
    const { container } = tab();
    const grid = container.querySelector(".grid") as HTMLElement;
    expect(grid.className).toContain("grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]");
    expect(grid.className).not.toMatch(/(^|\s)(sm|md):grid-cols/);
  });

  it("let a card's buttons wrap instead of running past its edge", () => {
    const { container } = tab();
    const actions = container.querySelector("button[aria-label='Move earlier']")?.parentElement
      ?.parentElement as HTMLElement;
    expect(actions.className).toContain("flex-wrap");
  });

  it("name the move buttons for order, not for a side, and flip their arrows in Arabic", () => {
    const move = vi.fn();
    const view = tab(false, move);
    // The first card cannot move earlier; the second can.
    const earlier = screen.getAllByRole("button", { name: "Move earlier" });
    const later = screen.getAllByRole("button", { name: "Move later" });
    expect(earlier[0]).toBeDisabled();
    expect(earlier[1]).not.toBeDisabled();
    expect(later[1]).toBeDisabled();
    fireEvent.click(earlier[1]);
    expect(move).toHaveBeenCalledWith(1, -1);
    view.unmount();
    tab(true);
    expect(screen.getAllByRole("button", { name: "تقديم" }).length).toBe(2);
    expect(document.querySelector("svg.rtl\\:rotate-180")).not.toBeNull();
  });
});
