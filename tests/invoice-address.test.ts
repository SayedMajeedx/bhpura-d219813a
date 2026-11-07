import { describe, expect, it } from "vitest";
import { invoiceAddress } from "../src/lib/platform-host";
import { invoiceAddress as emailTwin } from "../supabase/functions/send-order-email/store-address";

// An invoice link names the store that sent it: the admin is on the platform's address, so links
// built from the page's address read boutq.store for every store (the owner's report of 2026-11-07).

describe("an invoice's address", () => {
  it("is the store's own subdomain", () => {
    expect(invoiceAddress({ slug: "pura" }, "tok")).toBe("https://pura.boutq.store/invoice/tok");
  });

  it("is the store's own domain when it has one", () => {
    expect(invoiceAddress({ slug: "pura", custom_domain: "https://pura.bh/" }, "tok")).toBe(
      "https://pura.bh/invoice/tok",
    );
  });

  it("reads the same in the order email", () => {
    for (const store of [
      { slug: "pura" },
      { slug: "PURA " },
      { slug: "pura", custom_domain: null },
      { slug: "pura", custom_domain: " pura.bh" },
      { slug: "pura", custom_domain: "https://pura.bh/" },
    ]) {
      expect(emailTwin(store, "tok")).toBe(invoiceAddress(store, "tok"));
    }
    expect(emailTwin(null, "tok")).toBe("https://boutq.store/invoice/tok");
  });
});

describe("the screens staff send invoices from", () => {
  const sources = import.meta.glob(
    [
      "../src/components/orders/**/*.{ts,tsx}",
      "../src/features/orders/**/*.{ts,tsx}",
      "../src/features/bookings/**/*.{ts,tsx}",
      "../src/features/finance-reports/**/*.{ts,tsx}",
      "../src/features/advance-report/**/*.{ts,tsx}",
    ],
    { query: "?raw", import: "default", eager: true },
  ) as Record<string, string>;

  it("never build the link from the page's own address", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(50);
    const offenders = Object.entries(sources)
      .filter(([, text]) => /\/invoice\/\$\{|location\.origin.*invoice/.test(text))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });
});
