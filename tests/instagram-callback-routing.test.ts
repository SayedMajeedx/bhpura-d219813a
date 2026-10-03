import { describe, expect, it } from "vitest";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { routeTree } from "../src/routeTree.gen";

// The Instagram callback used to fall through to the storefront layout, which
// reads the first path segment as a store name ("api") and shows "Storefront
// unavailable". These check which routes the real route tree picks.

/** The ids of the routes the real route tree matches for an address. */
function idsFor(path: string): string[] {
  const history = createMemoryHistory({ initialEntries: [path] });
  const router = createRouter({ routeTree, history });
  return router.matchRoutes(router.parseLocation(history.location)).map((m) => m.routeId);
}

describe("route matching", () => {
  it("sends the Instagram callback to its own route, not the storefront layout", () => {
    const ids = idsFor("/api/auth/instagram/callback");
    expect(ids).toContain("/api/auth/instagram/callback");
    expect(ids).not.toContain("/$slug");
  });

  it("gives the authorize address its own route too", () => {
    const ids = idsFor("/api/auth/instagram/authorize");
    expect(ids).toContain("/api/auth/instagram/authorize");
    expect(ids).not.toContain("/$slug");
  });

  it("still sends storefront addresses to the storefront", () => {
    expect(idsFor("/pura/checkout")).toContain("/$slug");
    expect(idsFor("/pura")).toContain("/$slug");
    expect(idsFor("/pura/product/123")).toContain("/$slug");
  });

  it("keeps the other API routes where they were", () => {
    expect(idsFor("/api/orders/status")).toContain("/api/orders/status");
    expect(idsFor("/api/orders/status")).not.toContain("/$slug");
  });
});
