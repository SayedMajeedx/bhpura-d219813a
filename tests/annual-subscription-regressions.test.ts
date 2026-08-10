import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("annual subscription lifecycle", () => {
  it("migrates normal brands to annual while preserving Pura permanently", () => {
    const migration = read(
      "supabase/migrations/20260810194500_annual_subscriptions_and_payment_iban.sql",
    );
    expect(migration).toContain("WHERE lower(slug) = 'pura'");
    expect(migration).toContain("plan_type = 'lifetime'");
    expect(migration).toContain("WHERE lower(slug) <> 'pura'");
    expect(migration).toContain("created_at + interval '1 year'");
  });

  it("extends approved renewals by one calendar year and requires a receipt", () => {
    const source = read("src/lib/saas-subscription.functions.ts");
    expect(source).toContain("PAYMENT_RECEIPT_REQUIRED");
    expect(source).toContain("baseDate.setFullYear(baseDate.getFullYear() + 1)");
    expect(source).toContain('rpc("is_super_admin")');
    expect(source).not.toContain('rpc("is_admin")');
  });

  it("shows merchant-controlled QR, IBAN copy, and manual receipt approval", () => {
    const card = read("src/components/subscription-card.tsx");
    const settings = read("src/routes/_authenticated/admin.super.settings.tsx");
    const brands = read("src/routes/_authenticated/admin.brands.tsx");
    expect(card).toContain("subscription_iban");
    expect(card).toContain("copyIban");
    expect(card).toContain("Upload renewal receipt");
    expect(settings).toContain("setSubscriptionIban");
    expect(brands).toContain("Approval extends the subscription by one calendar year");
  });
});
