import { describe, expect, it } from "vitest";
import {
  HOLD_TOP_MS,
  linkToShownPage,
  opensAtTop,
} from "../src/features/storefront-shell/lib/scroll-to-top";

// A tapped storefront page opens at its top (the owner's report of 2026-11-12: "Gift cards" from
// the footer sometimes opened at the bottom). `useScrollToTop` in the store shell holds the top
// after a new page by these rules, and a link to the page already shown goes back to its top.

describe("when a page opens at its top", () => {
  it("is a new page opened by a tap or a redirect", () => {
    expect(opensAtTop({ action: "PUSH", pathChanged: true, hash: "" })).toBe(true);
    expect(opensAtTop({ action: "REPLACE", pathChanged: true, hash: "" })).toBe(true);
  });

  it("is never a move back or forward, which keeps where the shopper was", () => {
    for (const action of ["BACK", "FORWARD", "GO"] as const) {
      expect(opensAtTop({ action, pathChanged: true, hash: "" })).toBe(false);
    }
  });

  it("is never a filter or a sort on the same page, nor a link to a place on it", () => {
    expect(opensAtTop({ action: "PUSH", pathChanged: false, hash: "" })).toBe(false);
    expect(opensAtTop({ action: "PUSH", pathChanged: true, hash: "reviews" })).toBe(false);
    // The first page drawn after loading: the browser's own.
    expect(opensAtTop({ action: null, pathChanged: true, hash: "" })).toBe(false);
  });

  it("holds the top through a glide's last frames, under a second", () => {
    expect(HOLD_TOP_MS[0]).toBe(0);
    expect(HOLD_TOP_MS[HOLD_TOP_MS.length - 1]).toBeLessThan(1000);
  });
});

describe("a link to the page already shown", () => {
  const shown = { origin: "https://pura.boutq.store", pathname: "/pura", search: "" };
  const plain = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };

  it("is the same address and query, written either way", () => {
    expect(linkToShownPage({ href: "/pura" }, plain, shown)).toBe(true);
    expect(linkToShownPage({ href: "/pura/" }, plain, shown)).toBe(true);
    expect(linkToShownPage({ href: "https://pura.boutq.store/pura" }, plain, shown)).toBe(true);
  });

  it("is not another page, another query, a place on the page or another site", () => {
    expect(linkToShownPage({ href: "/pura/gift-cards" }, plain, shown)).toBe(false);
    expect(linkToShownPage({ href: "/pura?cat=sale" }, plain, shown)).toBe(false);
    expect(linkToShownPage({ href: "/pura#reviews" }, plain, shown)).toBe(false);
    expect(linkToShownPage({ href: "https://boutq.store/pura" }, plain, shown)).toBe(false);
  });

  it("is not a tap that opens a new tab or a file", () => {
    expect(linkToShownPage({ href: "/pura", target: "_blank" }, plain, shown)).toBe(false);
    expect(linkToShownPage({ href: "/pura", download: true }, plain, shown)).toBe(false);
    expect(linkToShownPage({ href: "/pura" }, { ...plain, metaKey: true }, shown)).toBe(false);
    expect(linkToShownPage({ href: "/pura" }, { ...plain, button: 1 }, shown)).toBe(false);
  });
});
