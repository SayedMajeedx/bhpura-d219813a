import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const shell = readFileSync("src/components/app-shell.tsx", "utf8");
const menu = readFileSync("src/components/os/os-menu-bar.tsx", "utf8");

describe("OS menu breadcrumbs", () => {
  it("replaces the static OS identity with navigable route context", () => {
    expect(menu).toContain('aria-label={lang === "ar" ? "مسار الصفحة" : "Breadcrumb"}');
    expect(menu).not.toContain("<span>Boutq OS</span>");
    expect(menu).toContain("breadcrumbs.map");
  });

  it("uses localized hierarchy and keeps the brand as secondary context", () => {
    expect(shell).toContain('const homeLabel = "Boutq OS"');
    expect(menu).toContain("to={item.href as any}");
    expect(menu).not.toContain("href={item.href}");
    expect(shell).toContain('sales: { ar: "المبيعات", en: "Sales" }');
    expect(shell).toContain('new: { ar: "طلب جديد", en: "New order" }');
    expect(menu).toContain("{brandLabel}");
  });

  it("resolves dynamic order numbers and customer names instead of raw UUIDs", () => {
    // The invoice number comes from the orders data layer.
    expect(shell).toContain("ordersQueries.invoiceNumber(");
    // The customer name comes from the profile's cache entry in the customers data layer.
    expect(shell).toContain("customersQueries.detail(");
    expect(shell).toContain("customerBreadcrumbQuery.data?.name");
    expect(shell).toContain('`${lang === "ar" ? "الطلب" : "Order"} #${invoiceNum}`');
  });
});
