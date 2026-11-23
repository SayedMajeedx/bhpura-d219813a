import React from "react";
import { render, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// The admin's motion (the animation review of 2026-11-22): what waited for its data fades in
// instead of popping, an order arriving live slides into the list instead of jumping it, and the save
// bar's label changes in place. Pages do not cross-fade: a view transition held each page back
// about 270ms (tests/navigation-perf.spec.ts).

const { newArrivals, useArrivals, useArrivedAfterWait } =
  await import("../src/lib/motion/use-arrived");
const { SettingsStickySaveBar } = await import("../src/components/settings/SettingsStickySaveBar");

describe("a part that waited for its data", () => {
  it("fades in once loaded, and one shown from the cache stays still", () => {
    const waited = renderHook(({ loading }) => useArrivedAfterWait(loading), {
      initialProps: { loading: true },
    });
    expect(waited.result.current).toBe(false);
    waited.rerender({ loading: false });
    expect(waited.result.current).toBe(true);

    const cached = renderHook(() => useArrivedAfterWait(false));
    expect(cached.result.current).toBe(false);
  });
});

describe("an order arriving live", () => {
  it("is new only after the list was first drawn", () => {
    expect(newArrivals(null, ["a", "b"])).toEqual(new Set());
    expect(newArrivals(new Set(["a"]), ["b", "a"])).toEqual(new Set(["b"]));
  });

  it("slides in once, and a list read again marks nothing it already had", () => {
    const list = renderHook(({ ids }) => useArrivals(ids), {
      initialProps: { ids: undefined as string[] | undefined },
    });
    list.rerender({ ids: ["o1", "o2"] });
    expect([...list.result.current]).toEqual([]);
    list.rerender({ ids: ["o3", "o1", "o2"] });
    expect([...list.result.current]).toEqual(["o3"]);
    list.rerender({ ids: ["o3", "o1", "o2"] });
    expect([...list.result.current]).toEqual(["o3"]);
    list.rerender({ ids: ["o3", "o1"] });
    expect([...list.result.current]).toEqual([]);
  });
});

describe("the settings save bar", () => {
  it("changes its label in place while saving", () => {
    const onSave = vi.fn();
    const { container, rerender } = render(
      <SettingsStickySaveBar activeTab="identity" isDirty isSaving={false} onSave={onSave} />,
    );
    expect(container.querySelector(".t-morph")?.textContent).toBe("حفظ");
    rerender(<SettingsStickySaveBar activeTab="identity" isDirty isSaving onSave={onSave} />);
    expect(container.textContent).toContain("جارٍ الحفظ…");
  });
});
