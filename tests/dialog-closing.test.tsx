import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useLastWhileClosing } from "../src/hooks/use-last-while-closing";

// The partner shops' dialogs emptied the moment they were closed, so the fading box shrank to a
// bare frame (2026-10-24). They now keep what they showed until they have gone.

describe("a dialog's contents while it closes", () => {
  it("stay the last thing shown, and the next opening shows its own at once", () => {
    const { result, rerender } = renderHook(({ value }) => useLastWhileClosing(value), {
      initialProps: { value: null as string | null },
    });
    expect(result.current).toBeNull();

    rerender({ value: "payment" });
    expect(result.current).toBe("payment");

    rerender({ value: null });
    expect(result.current).toBe("payment");

    rerender({ value: "edit_incubator" });
    expect(result.current).toBe("edit_incubator");
  });
});
