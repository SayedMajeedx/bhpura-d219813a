import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import migration from "../supabase/migrations/20261013130000_a_permanent_store_is_a_lifetime_plan.sql?raw";

// A permanent store is one whose plan is "lifetime". Two functions also gave everything, for
// ever, to one store by its address. The migration in a real Postgres (PGlite): the plan decides,
// the name decides nothing, and every other store's entitlements are worked out as before.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

let db: PGlite;
let counter = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;

const brand = async (slug: string, planType: string, tier: string | null = null) => {
  const id = uuid();
  await db.query(
    "INSERT INTO public.brands (id, slug, plan_type, subscription_tier, created_at) VALUES ($1, $2, $3, $4, now())",
    [id, slug, planType, tier],
  );
  return id;
};
const entitlements = async (brandId: string) =>
  (
    await db.query<{
      e: Record<
        string,
        { enabled: boolean; is_unlimited: boolean; limit_value: number; source: string }
      >;
    }>("SELECT public.rpc_evaluate_brand_entitlements_unchecked($1) AS e", [brandId])
  ).rows[0].e;
const subscription = async (brandId: string) =>
  (
    await db.query<{ code: string; billing_interval: string; status: string }>(
      `SELECT p.code, s.billing_interval, s.status FROM public.brand_subscriptions s
       JOIN public.saas_plans p ON p.id = s.plan_id WHERE s.brand_id = $1`,
      [brandId],
    )
  ).rows[0];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE TABLE public.brands (
      id uuid PRIMARY KEY, slug text UNIQUE, plan_type text, subscription_tier text,
      subscription_status text, subscription_expires_at timestamptz, trial_ends_at timestamptz,
      created_at timestamptz
    );
    CREATE TABLE public.saas_features (key text PRIMARY KEY, value_type text NOT NULL);
    CREATE TABLE public.saas_plans (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text UNIQUE);
    CREATE TABLE public.saas_plan_versions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), plan_id uuid NOT NULL, is_current boolean DEFAULT true
    );
    CREATE TABLE public.saas_plan_features (
      plan_version_id uuid NOT NULL, feature_key text NOT NULL, boolean_value boolean, numeric_value bigint
    );
    CREATE TABLE public.brand_subscriptions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid UNIQUE NOT NULL, plan_id uuid,
      plan_version_id uuid, billing_interval text, status text, current_period_start timestamptz,
      current_period_end timestamptz, trial_ends_at timestamptz
    );
    CREATE TABLE public.saas_addons (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), target_feature_key text, grant_type text,
      grant_numeric_amount bigint
    );
    CREATE TABLE public.brand_subscription_addons (
      brand_id uuid, addon_id uuid, quantity integer DEFAULT 1, status text
    );
    CREATE TABLE public.brand_entitlement_overrides (
      brand_id uuid, feature_key text, override_type text, boolean_value boolean,
      numeric_value bigint, expires_at timestamptz
    );
    INSERT INTO public.saas_features VALUES ('max_products', 'numeric_limit'), ('custom_domain', 'boolean');
  `);
  // The plans, each with one current version: growth allows 200 products and no custom domain.
  for (const code of ["lifetime_founder", "trial", "starter", "growth", "enterprise"]) {
    const plan = uuid();
    const version = uuid();
    await db.query("INSERT INTO public.saas_plans (id, code) VALUES ($1, $2)", [plan, code]);
    await db.query("INSERT INTO public.saas_plan_versions (id, plan_id) VALUES ($1, $2)", [
      version,
      plan,
    ]);
    await db.query(
      "INSERT INTO public.saas_plan_features VALUES ($1, 'max_products', NULL, $2), ($1, 'custom_domain', false, NULL)",
      [version, code === "growth" ? 200 : 50],
    );
  }
  await db.exec(migration);
});

describe("what a store may use", () => {
  it("gives a store on the lifetime plan everything, whatever it is called", async () => {
    for (const slug of ["pura", "any-other-store"]) {
      const granted = await entitlements(await brand(`${slug}-lifetime`, "lifetime"));
      expect(granted.max_products).toMatchObject({
        enabled: true,
        is_unlimited: true,
        source: "lifetime_founder",
      });
      expect(granted.custom_domain.enabled).toBe(true);
    }
  });

  it("gives a store called by that name nothing its plan does not give", async () => {
    // The address the functions once named, on an ordinary annual plan.
    const named = await entitlements(await brand("pura", "annual", "growth"));
    expect(named.max_products).toMatchObject({
      enabled: true,
      is_unlimited: false,
      limit_value: 200,
      source: "plan_version",
    });
    expect(named.custom_domain.enabled).toBe(false);
  });

  it("works out every other store's plan as before", async () => {
    const id = await brand("growing", "annual", "growth");
    await db.query(
      "INSERT INTO public.brand_entitlement_overrides VALUES ($1, 'custom_domain', 'set_boolean', true, NULL, NULL)",
      [id],
    );
    const granted = await entitlements(id);
    expect(granted.max_products.limit_value).toBe(200);
    expect(granted.custom_domain).toMatchObject({ enabled: true, source: "override" });
    expect(await entitlements(uuid())).toEqual({ error: "BRAND_NOT_FOUND" });
  });
});

describe("giving a store its subscription row", () => {
  it("puts a lifetime store on the founder plan, and a store by its own plan otherwise", async () => {
    const founder = await brand("founder", "lifetime");
    const sameName = await brand("pura-two", "trial");
    const annual = await brand("annual-store", "annual", "basic");
    await db.query("SELECT public.rpc_sync_legacy_brands_to_subscriptions()");
    expect(await subscription(founder)).toEqual({
      code: "lifetime_founder",
      billing_interval: "lifetime",
      status: "active",
    });
    expect(await subscription(sameName)).toMatchObject({
      code: "trial",
      billing_interval: "trial",
    });
    expect(await subscription(annual)).toMatchObject({
      code: "starter",
      billing_interval: "annual",
    });
  });
});

describe("the migration itself", () => {
  it("names no store", () => {
    expect(migration.replace(/^--.*$/gm, "")).not.toMatch(/pura/i);
  });
});
