import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { fakeSupabase, type ServerFn } from "./helpers/server-fn";

const state = vi.hoisted(() => ({
  admin: null as unknown,
  request: new Request("https://boutq.store/_server"),
}));
// Server functions and middleware run for real (recording stand-ins); the
// service-role client, the request and the Turnstile check are faked.
vi.mock("@tanstack/react-start", async () =>
  (await import("./helpers/server-fn")).serverFnModule(),
);
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => state.request }));
const adminClient = {
  get supabaseAdmin() {
    return state.admin;
  },
};
vi.mock("../src/integrations/supabase/client.server", () => adminClient);
vi.mock("@/integrations/supabase/client.server", () => adminClient);
const turnstile = { verifyOnboardingTurnstile: async () => true };
vi.mock("../src/lib/turnstile.server", () => turnstile);
vi.mock("@/lib/turnstile.server", () => turnstile);

const { safeStorefrontRedirect } = await import("../src/routes/$slug.auth");
const { signImpersonationPayload, verifyImpersonationToken } =
  await import("../src/lib/impersonation-cookies.server");
const middleware = await import("../src/integrations/supabase/auth-middleware");
const onboarding = (await import("../src/lib/onboarding.functions")) as unknown as Record<
  string,
  ServerFn
>;
const { generateExportData } = (await import("../src/lib/export.functions")) as unknown as {
  generateExportData: ServerFn;
};

describe("launch security regressions", () => {
  it.each([
    "https://attacker.example/collect",
    "//attacker.example/collect",
    "/other-store/account",
    "/pura/auth",
    "/pura\\@attacker.example",
  ])("rejects unsafe storefront redirect %s", (redirect) => {
    expect(safeStorefrontRedirect(redirect, "pura")).toBeUndefined();
  });

  it("accepts same-store relative redirects", () => {
    expect(safeStorefrontRedirect("/pura/account?tab=orders", "pura")).toBe(
      "/pura/account?tab=orders",
    );
  });

  it("authorizes platform operations with the super-admin role only", async () => {
    const requestId = "2f2c8f7e-5a8d-4c55-9b7e-2f6f0c9f1a44";
    for (const name of ["approveTenantRequest", "rejectTenantRequest"]) {
      // A platform owner's email is not enough: only the database role counts.
      const caller = fakeSupabase({ rpc: { is_super_admin: false, is_admin: true } });
      await expect(
        onboarding[name]({
          data: { requestId },
          context: { ...caller, userId: "u1", claims: { email: "majeed@hotmail.com" } },
        }),
      ).rejects.toThrow("UNAUTHORIZED_SUPER_ADMIN_ONLY");
      expect(caller.supabase.rpc.mock.calls.map(([rpc]) => rpc)).toEqual(["is_super_admin"]);
      expect(caller.writes).toHaveLength(0);
    }
  });

  it("removes public tenant-request reads and unrestricted settings writes", () => {
    const migration = readFileSync(
      "supabase/migrations/20260808213000_lock_platform_settings_and_tenant_requests.sql",
      "utf8",
    );
    expect(migration).toContain('DROP POLICY IF EXISTS "Allow public select to tenant_requests"');
    expect(migration).toContain("REVOKE SELECT, UPDATE, DELETE");
    expect(migration).toContain("USING (public.is_super_admin())");
    expect(migration).toContain("WITH CHECK (public.is_super_admin())");
  });

  it("lets only a super admin or trusted server code change a store's vertical", () => {
    const migration = readFileSync(
      "supabase/migrations/20260929140000_guard_store_vertical.sql",
      "utf8",
    );
    // The caller's own role decides: the guard must not run as its owner.
    expect(migration).not.toMatch(/SECURITY DEFINER\s*\n\s*SET search_path/);
    expect(migration).toContain(
      "current_user NOT IN ('authenticated', 'anon') OR public.is_super_admin()",
    );
    // Only an actual change is refused, so other settings still save.
    expect(migration).toContain("NEW.store_vertical IS DISTINCT FROM OLD.store_vertical");
    // An upsert's insert only counts when the brand has no settings row yet.
    expect(migration).toMatch(/NOT EXISTS \(\s*SELECT 1 FROM public\.business_settings/);
    expect(migration).toContain("BEFORE INSERT OR UPDATE OF store_vertical");
    expect(migration).toContain("STORE_VERTICAL_SUPER_ADMIN_ONLY");
  });

  it("lets the database accept exactly the verticals the app knows", async () => {
    // The newest migration that sets the store_vertical CHECK is the live one.
    const { readdirSync } = await import("node:fs");
    const { STORE_VERTICALS } = await import("../src/lib/store-profile");
    const latest = readdirSync("supabase/migrations")
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .map((name) => readFileSync(`supabase/migrations/${name}`, "utf8"))
      .filter((sql) => sql.includes("ADD CONSTRAINT business_settings_store_vertical_check"))
      .at(-1)!;
    const check = latest.slice(
      latest.indexOf("ADD CONSTRAINT business_settings_store_vertical_check"),
    );
    const accepted = [...check.slice(0, check.indexOf(";")).matchAll(/'([a-z_]+)'/g)].map(
      (m) => m[1],
    );
    expect([...accepted].sort()).toEqual([...STORE_VERTICALS].sort());
  });

  it("keeps bookings to their store and their day's places to the database", async () => {
    const sql = readFileSync("supabase/migrations/20260930100000_bookings_engine.sql", "utf8");
    for (const table of ["booking_settings", "bookings", "booking_items", "booking_blocks"]) {
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    }
    // Staff read bookings; nobody writes them except through the functions.
    expect(sql).toContain(
      "REVOKE INSERT, UPDATE, DELETE ON public.bookings, public.booking_items FROM authenticated",
    );
    expect(sql).not.toMatch(/ON public\.(bookings|booking_items)\s+FOR (ALL|INSERT|UPDATE|DELETE)/);
    // Every staff action checks the brand and the orders permission, then
    // locks the store's settings row so one booking takes a last place.
    expect(sql).toMatch(
      /can_access_brand\(p_brand_id\) AND public\.has_permission\('manage_orders'\)[\s\S]*FOR UPDATE/,
    );
    expect(sql.match(/lock_booking_settings_for_staff\(/g)?.length).toBeGreaterThanOrEqual(4);
    // Another store's booking looks the same as a missing one.
    expect(sql.match(/NOT public\.can_access_brand\(v_booking\.brand_id\)/g)).toHaveLength(2);
    // Anonymous callers get availability and rules only (no customer data).
    const anonGrants = [
      ...sql.matchAll(/GRANT EXECUTE ON FUNCTION public\.(\w+)\([^)]*\) TO anon/g),
    ];
    expect(anonGrants.map((m) => m[1]).sort()).toEqual([
      "bookings_enabled",
      "get_booking_availability",
      "get_public_booking_rules",
    ]);
    expect(sql).toContain("p_to - p_from > 62");
    // A request takes no place; confirmed bookings and live holds do.
    expect(sql).toContain("b.status IN ('confirmed', 'completed')");
    expect(sql).toContain("b.status = 'hold' AND b.hold_expires_at > now()");
    // The SQL default for the bookings module matches the vertical registry.
    const { STORE_VERTICALS } = await import("../src/lib/store-profile");
    const { getVerticalDefinition } = await import("../src/lib/verticals/registry");
    const bookingVerticals = STORE_VERTICALS.filter(
      (v) => getVerticalDefinition(v).modules.bookings,
    );
    expect(bookingVerticals).toEqual(["services"]);
    expect(sql).toContain("ELSE bs.store_vertical = 'services'");
  });

  it("lets anyone ask for a date, at the store's prices and within limits", () => {
    const sql = readFileSync("supabase/migrations/20260930120000_booking_requests.sql", "utf8");
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("IF NOT public.bookings_enabled(p_brand_id) THEN");
    // Customer rules (notice period, horizon), not staff ones.
    expect(sql).toContain("public.booking_day_state(v_settings, p_day);");
    expect(sql).not.toMatch(/booking_day_state\([^)]*true\)/);
    // Prices come from the store's variants, never from the request.
    expect(sql).toContain("v.selling_price AS price");
    expect(sql).not.toContain("'unit_price'");
    expect(sql).toMatch(/p\.brand_id = p_brand_id\s+AND p\.is_active/);
    // A request takes no place until the store confirms it.
    expect(sql).toMatch(/'requested', p_day/);
    // Flood guards: per store and per phone.
    expect(sql).toContain("interval '10 minutes'");
    expect(sql).toContain("IF v_count >= 60 THEN");
    expect(sql).toContain("interval '1 hour'");
    expect(sql).toContain("IF v_count >= 3 THEN");
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.request_booking(uuid, date, time, integer, jsonb, jsonb, jsonb, text) TO anon, authenticated",
    );
  });

  it("holds a day at checkout and ties the booking to its order and payment", () => {
    const sql = readFileSync("supabase/migrations/20260930140000_booking_checkout.sql", "utf8");
    // A hold is a request (same checks, prices, limits) that takes the day.
    expect(sql).toContain("v_request := public.request_booking(");
    expect(sql).toContain("CHECKOUT_DISABLED_CATALOG_MODE");
    // Only the hold's secret finishes it, for the same store.
    expect(sql).toContain("v_booking.hold_token <> p_hold_token");
    expect(sql).toContain("v_booking.brand_id IS DISTINCT FROM v_brand_id");
    // The order goes through the storefront's own function, unchanged, and
    // the cart must carry the booked services.
    expect(sql.match(/public\.place_storefront_order\(/g)).toHaveLength(2);
    expect(sql).toContain("BOOKING_ITEMS_MISMATCH");
    expect(sql).toContain("BOOKING_ALREADY_ORDERED");
    // A run-out hold works only while the day is free (customer rules).
    expect(sql).toContain(
      "public.booking_day_state(v_settings, v_booking.event_date, v_booking.id);",
    );
    // Card keeps the day held while paying; other methods confirm at once.
    expect(sql).toContain("status = CASE WHEN v_card THEN 'hold' ELSE 'confirmed' END");
    // The booking follows its order.
    expect(sql).toContain("AFTER UPDATE OF status, payment_status ON public.orders");
    expect(sql).toMatch(
      /payment_status = 'paid'[\s\S]*status = 'confirmed'[\s\S]*status IN \('hold', 'expired'\)/,
    );
    expect(sql).toContain("NEW.status IN ('cancelled', 'canceled', 'returned')");
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.sync_bookings_with_order() FROM PUBLIC, anon, authenticated",
    );
  });

  it("charges a booking's deposit by card only, and confirms the day once it is paid", () => {
    const sql = readFileSync("supabase/migrations/20260930160000_booking_deposits.sql", "utf8");
    expect(sql).toContain("CHECK (deposit_percent BETWEEN 0 AND 100)");
    // Card only, and only a real deposit (not 0% or 100%), rounded up to the fils.
    expect(sql).toMatch(
      /WHEN v_card AND v_settings\.deposit_percent > 0 AND v_settings\.deposit_percent < 100\s+THEN ceil\(v_order\.total \* v_settings\.deposit_percent \* 10\) \/ 1000/,
    );
    // The checkout function keeps every earlier guard.
    for (const guard of [
      "v_booking.hold_token <> p_hold_token",
      "BOOKING_ITEMS_MISMATCH",
      "BOOKING_HOLD_EXPIRED",
      "BOOKING_ALREADY_ORDERED",
    ]) {
      expect(sql).toContain(guard);
    }
    // A paid deposit confirms the booking like a full payment.
    expect(sql).toContain("IF NEW.payment_status IN ('paid', 'partially_paid')");
    expect(sql).toContain("'deposit_percent', s.deposit_percent");
  });

  it("prices bookings by duration and area on the server, never from the browser", () => {
    const sql = readFileSync("supabase/migrations/20260930180000_booking_pricing.sql", "utf8");
    // A duration-priced service is booked at its length's variant, whatever was asked.
    expect(sql).toMatch(
      /WHEN EXISTS \([\s\S]*dv\.duration_minutes IS NOT NULL\s*\) THEN v\.duration_minutes = p_duration_minutes/,
    );
    expect(sql).toContain("BOOKING_DURATION_NOT_OFFERED");
    // Travel fees come from the store's own table, keyed by area code.
    expect(sql).toContain("ALTER TABLE public.booking_area_fees ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("REVOKE ALL ON public.booking_area_fees FROM anon");
    expect(sql).toContain(
      "v_travel_fee := public.booking_travel_fee(p_brand_id, p_location ->> 'area_code');",
    );
    // At checkout the booking's travel fee is the order's delivery fee.
    expect(sql).toMatch(
      /p_shipping_fee => CASE\s+WHEN v_booking\.travel_fee IS NOT NULL AND p_fulfillment = 'delivery' THEN v_booking\.travel_fee/,
    );
    // Every earlier guard of the checkout and of requests is kept.
    for (const guard of [
      "v_booking.hold_token <> p_hold_token",
      "BOOKING_ITEMS_MISMATCH",
      "BOOKING_HOLD_EXPIRED",
      "deposit_amount = CASE",
      "IF v_count >= 60 THEN",
      "IF v_count >= 3 THEN",
      "public.booking_day_state(v_settings, p_day);",
    ]) {
      expect(sql).toContain(guard);
    }
    expect(sql).toContain("'travel_fees', COALESCE((");
  });

  it("changes a store's vertical in one audited, super-admin-only transaction", () => {
    const migration = readFileSync(
      "supabase/migrations/20260929160000_vertical_change_audit.sql",
      "utf8",
    );
    // The history is readable by the brand, written only by the function.
    expect(migration).toContain(
      "ALTER TABLE public.brand_vertical_changes ENABLE ROW LEVEL SECURITY",
    );
    expect(migration).toContain("FOR SELECT USING (public.can_access_brand(brand_id))");
    expect(migration).not.toMatch(
      /GRANT (INSERT|UPDATE|DELETE|ALL)[^;]*brand_vertical_changes TO authenticated/,
    );
    // The function checks the caller itself, locks the row, needs a reason.
    const body = migration.slice(migration.indexOf("AS $function$"));
    expect(body.indexOf("public.is_super_admin()")).toBeLessThan(body.indexOf("UPDATE public."));
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("VERTICAL_CHANGE_REASON_REQUIRED");
    // A category a product uses is never removed, checked inside the transaction.
    expect(migration).toMatch(
      /DELETE FROM public\.categories[\s\S]*AND NOT EXISTS \(\s*SELECT 1 FROM public\.products/,
    );
    expect(migration).toContain("FROM PUBLIC, anon");
    // Brand staff can no longer delete their store's settings row.
    expect(migration).toContain('DROP POLICY IF EXISTS "brand delete settings"');
    expect(migration).toContain("FOR DELETE USING (public.is_super_admin())");
  });

  it("signs and securely verifies impersonation session tokens with HMAC", async () => {
    const payload = {
      operatorId: "super-user-123",
      targetTenantId: "brand-456",
      issuedAt: Date.now(),
    };
    const signedToken = await signImpersonationPayload(payload);
    expect(signedToken).toMatch(/^[a-zA-Z0-9_-]+\.[a-f0-9]{64}$/);

    const verified = await verifyImpersonationToken(signedToken);
    expect(verified).not.toBeNull();
    expect(verified?.operatorId).toBe("super-user-123");
    expect(verified?.targetTenantId).toBe("brand-456");

    // Tampered payload must fail
    const tamperedPayload = Buffer.from(
      JSON.stringify({ ...payload, targetTenantId: "brand-attacker" }),
    ).toString("base64url");
    const tamperedToken = `${tamperedPayload}.${signedToken.split(".")[1]}`;
    const tamperedResult = await verifyImpersonationToken(tamperedToken);
    expect(tamperedResult).toBeNull();
  });

  it("enforces tenant authorization before retrieving vault secrets", async () => {
    // The caller works on the brand in the referer, not their own.
    state.request = new Request("https://boutq.store/_server", {
      headers: { referer: "https://boutq.store/admin/b/pura/settings" },
    });
    const lookup = async (canAccess: boolean) => {
      const caller = fakeSupabase({
        rows: { profiles: { brand_id: "own-brand", role: "brand_admin" }, brands: { id: "pura" } },
        rpc: { can_access_brand: canAccess },
      });
      const vault = fakeSupabase({
        rpc: { get_integration_credential_secret: [{ api_key: "vault-key", base_url: "" }] },
      });
      state.admin = vault.supabase;
      const result = await middleware.getGeminiCredentials(caller.supabase, "u1");
      return { result, vaultCalls: vault.supabase.rpc.mock.calls.map(([rpc]) => rpc) };
    };

    const outsider = await lookup(false);
    expect(outsider.vaultCalls).not.toContain("get_integration_credential_secret");
    expect(outsider.result.diagnostics).toContain("[Forbidden] Caller u1");

    const operator = await lookup(true);
    expect(operator.vaultCalls).toContain("get_integration_credential_secret");
    expect(operator.result.apiKey).toBe("vault-key");
  });

  it("runs report exports as the signed-in caller and strips contact details", async () => {
    expect(generateExportData.middleware).toEqual([middleware.requireSupabaseAuth]);
    // The RPC runs through the caller's client (RLS applies), not the service role.
    state.admin = null;
    const caller = fakeSupabase({
      rpc: {
        rpc_reporting_export: [
          { customer: "=HYPERLINK(1)", email: "a@b.c", phone: "3900", total: 30 },
        ],
      },
    });
    const result = (await generateExportData({
      data: {
        reportType: "customers",
        from: "2026-09-01",
        to: "2026-09-30",
        tz: "UTC",
        format: "csv",
      },
      context: caller,
    })) as { content?: string; data?: string };
    expect(caller.supabase.rpc).toHaveBeenCalledWith("rpc_reporting_export", expect.anything());
    const text = JSON.stringify(result);
    expect(text).not.toContain("a@b.c");
    expect(text).not.toContain("3900");
    expect(text).toContain("'=HYPERLINK(1)");
  });
});
