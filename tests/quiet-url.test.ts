import { afterEach, describe, expect, it, vi } from "vitest";
import { replaceUrlQuietly } from "../src/lib/quiet-url";

// TanStack Router wraps window.history.replaceState and takes every call for a navigation (it
// re-reads the location and scrolls to the top). The listing mirrors its filters into the address
// with replaceUrlQuietly, which must change the address and wake nothing up.

describe("replaceUrlQuietly", () => {
  const original = window.history.replaceState;
  afterEach(() => {
    window.history.replaceState = original;
    window.history.replaceState({}, "", "/");
  });

  it("changes the address without calling the (router-wrapped) replaceState", () => {
    const wrapped = vi.fn();
    window.history.replaceState = wrapped; // what the router installs on the instance
    replaceUrlQuietly("/pura/abayas?size=54&size=55");
    expect(wrapped).not.toHaveBeenCalled();
    expect(window.location.pathname + window.location.search).toBe("/pura/abayas?size=54&size=55");
  });

  it("keeps the history entry's state and does not add an entry", () => {
    window.history.replaceState({ __TSR_key: "k1", __TSR_index: 3 }, "", "/pura/abayas");
    const length = window.history.length;
    replaceUrlQuietly("/pura/abayas?color=Black");
    expect(window.history.state).toEqual({ __TSR_key: "k1", __TSR_index: 3 });
    expect(window.history.length).toBe(length);
  });

  it("can put the address back to a plain path", () => {
    replaceUrlQuietly("/pura/abayas?stock=1");
    replaceUrlQuietly("/pura/abayas");
    expect(window.location.search).toBe("");
  });
});
