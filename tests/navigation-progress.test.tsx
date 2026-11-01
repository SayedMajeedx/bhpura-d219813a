import React from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A tapped page that is not in the browser yet keeps the old page on screen until it is ready. On a
// phone, "Gift cards" at the foot of Pura's page left the shopper at the bottom with nothing moving
// while the page's 13 files arrived (2026-11-01). A bar at the top of the screen says it is coming.

const router = vi.hoisted(() => ({
  state: {
    isLoading: false,
    location: { pathname: "/pura" },
    resolvedLocation: { pathname: "/pura" },
  },
}));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useRouterState: ({ select }: { select: (s: typeof router.state) => unknown }) =>
    select(router.state),
}));
const storefront = () => ({ t: (_ar: string, en: string) => en, lang: "en" });
vi.mock("../src/lib/storefront-context", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useStorefront: storefront,
}));
vi.mock("@/lib/storefront-context", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useStorefront: storefront,
}));

const { NavigationProgress } =
  await import("../src/features/storefront-shell/components/NavigationProgress");
const { NAV_PROGRESS_DELAY_MS, navigationWaiting } =
  await import("../src/features/storefront-shell/lib/navigation-progress");

describe("navigationWaiting", () => {
  it("is a move to another page that is still loading", () => {
    expect(
      navigationWaiting({ isLoading: true, pathname: "/pura/gift-cards", shownPathname: "/pura" }),
    ).toBe(true);
    expect(
      navigationWaiting({ isLoading: false, pathname: "/pura/gift-cards", shownPathname: "/pura" }),
    ).toBe(false);
  });

  it("is never a filter or a sort on the page shown, nor the first page of a visit", () => {
    expect(
      navigationWaiting({
        isLoading: true,
        pathname: "/pura/abayas",
        shownPathname: "/pura/abayas",
      }),
    ).toBe(false);
    expect(
      navigationWaiting({ isLoading: true, pathname: "/pura", shownPathname: undefined }),
    ).toBe(false);
  });
});

describe("the bar at the top of the screen", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    router.state = {
      isLoading: false,
      location: { pathname: "/pura" },
      resolvedLocation: { pathname: "/pura" },
    };
  });
  afterEach(() => vi.useRealTimers());

  const go = (pathname: string, isLoading: boolean, shown = "/pura") => {
    router.state = { isLoading, location: { pathname }, resolvedLocation: { pathname: shown } };
  };

  it("shows while a tapped page takes more than a moment, then runs out and goes", () => {
    const view = render(<NavigationProgress />);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();

    go("/pura/gift-cards", true);
    view.rerender(<NavigationProgress />);
    act(() => vi.advanceTimersByTime(NAV_PROGRESS_DELAY_MS));
    expect(screen.getByRole("progressbar", { name: "Opening the page" })).toBeInTheDocument();

    go("/pura/gift-cards", false, "/pura/gift-cards");
    view.rerender(<NavigationProgress />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("never flashes for a page that opens at once", () => {
    const view = render(<NavigationProgress />);
    go("/pura/account", true);
    view.rerender(<NavigationProgress />);
    act(() => vi.advanceTimersByTime(NAV_PROGRESS_DELAY_MS - 50));
    go("/pura/account", false, "/pura/account");
    view.rerender(<NavigationProgress />);
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });
});
