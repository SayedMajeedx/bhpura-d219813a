import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildBreadcrumbs } from "../src/lib/admin-breadcrumbs";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to?: string }) => (
    <a href={to}>{children}</a>
  ),
  useNavigate: () => vi.fn(),
}));

const { OsMenuBar } = await import("../src/components/os/os-menu-bar");
const { ThemeProvider } = await import("../src/lib/theme-context");

const base = {
  activeSlug: "pura",
  lang: "en" as const,
  isOrderRoute: false,
  isCustomerRoute: false,
};
const orders = { label: "Orders", href: "/admin/b/pura/orders" };

describe("OS menu breadcrumbs", () => {
  it("starts at Boutq OS, links back home, and leaves the current page unlinked", () => {
    expect(
      buildBreadcrumbs({
        ...base,
        pathname: "/admin/b/pura/orders",
        section: orders,
        trailingSegment: undefined,
      }),
    ).toEqual([
      { label: "Boutq OS", href: "/admin/b/pura/dashboard" },
      { label: "Orders", href: undefined },
    ]);
    // On the dashboard itself, home is the only crumb and is not a link.
    expect(
      buildBreadcrumbs({
        ...base,
        pathname: "/admin/b/pura/dashboard",
        section: { label: "Dashboard", href: "/admin/b/pura/dashboard" },
        trailingSegment: undefined,
      }),
    ).toEqual([{ label: "Boutq OS", href: undefined }]);
    // The super admin's platform workspace starts at the brand list.
    expect(
      buildBreadcrumbs({
        ...base,
        activeSlug: null,
        pathname: "/admin/super/health",
        section: null,
        trailingSegment: undefined,
      })[0],
    ).toEqual({ label: "Boutq OS", href: "/admin/brands" });
  });

  it("names orders by invoice number and customers by name instead of raw UUIDs", () => {
    const orderId = "5f1c0e7a-9b2d-4c1e-8f3a-2b6d7c8e9f01";
    const order = (invoiceNumber: number | null, lang: "ar" | "en") =>
      buildBreadcrumbs({
        ...base,
        lang,
        pathname: `/admin/b/pura/orders/${orderId}`,
        section: orders,
        trailingSegment: orderId,
        isOrderRoute: true,
        invoiceNumber,
      }).at(-1);
    expect(order(1042, "en")).toEqual({ label: "Order #1042" });
    expect(order(1042, "ar")).toEqual({ label: "الطلب #1042" });
    // Before the number loads, a short id (never the full UUID).
    expect(order(null, "en")).toEqual({ label: "Order #5f1c0e7a" });

    const customer = buildBreadcrumbs({
      ...base,
      pathname: "/admin/b/pura/customers/c1",
      section: { label: "Customers", href: "/admin/b/pura/customers" },
      trailingSegment: "c1",
      isCustomerRoute: true,
      customerName: "Fatima Al-Mansoor",
    });
    expect(customer).toEqual([
      { label: "Boutq OS", href: "/admin/b/pura/dashboard" },
      { label: "Customers", href: "/admin/b/pura/customers" },
      { label: "Fatima Al-Mansoor" },
    ]);
  });

  it("labels known sub-pages in the UI language", () => {
    const newOrder = buildBreadcrumbs({
      ...base,
      lang: "ar",
      pathname: "/admin/b/pura/orders/new",
      section: orders,
      trailingSegment: "new",
    }).at(-1);
    expect(newOrder).toEqual({ label: "طلب جديد" });
  });

  it("renders the trail as localized navigation, with the brand as secondary context", () => {
    render(
      <ThemeProvider>
        <OsMenuBar
          brandLabel="Pura"
          breadcrumbs={[
            { label: "Boutq OS", href: "/admin/b/pura/dashboard" },
            { label: "Orders", href: "/admin/b/pura/orders" },
            { label: "Order #1042" },
          ]}
          lang="ar"
          onSetLang={() => undefined}
          onOpenSpotlight={() => undefined}
          onSignOut={() => undefined}
          activeSlug="pura"
        />
      </ThemeProvider>,
    );
    const trail = screen.getByRole("navigation", { name: "مسار الصفحة" });
    expect(within(trail).getByRole("link", { name: /Boutq OS/ })).toHaveAttribute(
      "href",
      "/admin/b/pura/dashboard",
    );
    expect(within(trail).getByRole("link", { name: "Orders" })).toHaveAttribute(
      "href",
      "/admin/b/pura/orders",
    );
    // The current page is text, not a link.
    expect(within(trail).queryByRole("link", { name: "Order #1042" })).toBeNull();
    expect(within(trail).getByText("Order #1042")).toBeInTheDocument();
    expect(screen.getAllByText("Pura").length).toBeGreaterThan(0);
  });
});
