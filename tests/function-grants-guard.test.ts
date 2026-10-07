import { describe, expect, it } from "vitest";
import allowlist from "../supabase/function-grants.json";
import { diffGrants, LIVE_GRANTS_QUERY } from "../scripts/database/check-function-grants.mjs";

// A browser can call every SECURITY DEFINER function unless its grant is removed. These tests keep
// the allowlist honest and prove the check would have caught what the audit found. The live
// database is compared in CI by scripts/database/check-function-grants.mjs.

const listed = allowlist.functions as Record<
  string,
  { anon: boolean; authenticated: boolean; reason: string }
>;

// Never to be called from a browser, whatever the reason someone gives (see the audit of 2026-10-07).
const SERVER_ONLY = [
  "get_integration_credential_secret",
  "reconcile_verified_tap_order",
  "courier_update_delivery(p_order_id uuid, p_courier_id uuid",
  "rpc_consume_usage",
  "rpc_check_entitlement",
  "apply_whatsapp_delivery_status",
  "rpc_award_order_loyalty_points",
  "rpc_validate_and_redeem_loyalty_points",
  "rpc_process_return_loyalty_adjustment",
  "rpc_calculate_order_loyalty_points",
  "rpc_evaluate_customer_loyalty_tier",
  "redeem_loyalty_points_for_order",
];

describe("the list of browser-callable functions", () => {
  it("says why for every one, and who may call it", () => {
    const entries = Object.entries(listed);
    expect(entries.length).toBeGreaterThan(100);
    for (const [signature, entry] of entries) {
      expect(entry.reason?.length, signature).toBeGreaterThan(20);
      expect(typeof entry.anon, signature).toBe("boolean");
      expect(typeof entry.authenticated, signature).toBe("boolean");
      // A visitor can call it, so a signed-in account certainly can.
      if (entry.anon) expect(entry.authenticated, signature).toBe(true);
    }
  });

  it("has none of the functions that only the server may call", () => {
    for (const prefix of SERVER_ONLY) {
      const found = Object.keys(listed).filter((signature) => signature.startsWith(prefix));
      expect(found, prefix).toEqual([]);
    }
  });

  it("keeps the known risks visible, with what to do about them", () => {
    const risks = Object.entries(listed).filter(([, entry]) =>
      /KNOWN RISK|LEFTOVER/.test(entry.reason),
    );
    expect(risks.length).toBeGreaterThan(0);
    expect(Object.values(listed).filter((entry) => entry.reason.startsWith("REVIEW"))).toEqual([]);
  });
});

describe("the check", () => {
  const allow = {
    "get_storefront_page_data(p_brand_slug text)": { anon: true, authenticated: true },
    "rpc_reporting_sales(p_start_date timestamp with time zone)": {
      anon: false,
      authenticated: true,
    },
  };

  it("passes when the browser can call exactly what is listed, or less", () => {
    expect(
      diffGrants(
        [
          {
            signature: "get_storefront_page_data(p_brand_slug text)",
            anon: true,
            authenticated: true,
          },
          {
            signature: "rpc_reporting_sales(p_start_date timestamp with time zone)",
            anon: false,
            authenticated: true,
          },
        ],
        allow,
      ),
    ).toEqual({ problems: [], stale: [] });
    expect(
      diffGrants(
        [
          {
            signature: "get_storefront_page_data(p_brand_slug text)",
            anon: false,
            authenticated: true,
          },
        ],
        allow,
      ).problems,
    ).toEqual([]);
  });

  it("fails for a new function a visitor or a signed-in account can call (the audit's case)", () => {
    const { problems } = diffGrants(
      [
        {
          signature: "get_integration_credential_secret(p_brand_id uuid, p_provider text)",
          anon: false,
          authenticated: true,
        },
        {
          signature: "reconcile_verified_tap_order(p_order_id uuid)",
          anon: true,
          authenticated: true,
        },
      ],
      allow,
    );
    expect(problems).toEqual([
      {
        signature: "get_integration_credential_secret(p_brand_id uuid, p_provider text)",
        kind: "not-listed",
        to: ["authenticated"],
      },
      {
        signature: "reconcile_verified_tap_order(p_order_id uuid)",
        kind: "not-listed",
        to: ["anon", "authenticated"],
      },
    ]);
  });

  it("fails when a function listed for signed-in accounts is opened to visitors", () => {
    const { problems } = diffGrants(
      [
        {
          signature: "rpc_reporting_sales(p_start_date timestamp with time zone)",
          anon: true,
          authenticated: true,
        },
      ],
      allow,
    );
    expect(problems).toEqual([
      {
        signature: "rpc_reporting_sales(p_start_date timestamp with time zone)",
        kind: "wider-than-listed",
        to: ["anon"],
      },
    ]);
  });

  it("only warns about a listed function that is gone", () => {
    const { problems, stale } = diffGrants([], allow);
    expect(problems).toEqual([]);
    expect(stale).toEqual(Object.keys(allow));
  });

  it("looks at SECURITY DEFINER functions that are not triggers, for either caller", () => {
    expect(LIVE_GRANTS_QUERY).toMatch(/prosecdef/);
    expect(LIVE_GRANTS_QUERY).toMatch(/<> 'trigger'::regtype/);
    expect(LIVE_GRANTS_QUERY).toMatch(/has_function_privilege\('anon'/);
    expect(LIVE_GRANTS_QUERY).toMatch(/has_function_privilege\('authenticated'/);
  });
});

describe("new migrations", () => {
  // Read through the bundler (not the file system). Only migrations after the audit's clean-up are
  // held to this: the older functions that have the pattern are revoked from visitors.
  const migrations = import.meta.glob("../supabase/migrations/*.sql", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const FIRST_CHECKED = "20261007120000";

  it("never check the caller with `IF auth.uid() IS NOT NULL AND NOT ...` (an anonymous caller skips it)", () => {
    const offenders = Object.entries(migrations)
      .filter(([file]) => (file.split("/").pop() ?? "") >= FIRST_CHECKED)
      .filter(([, sql]) =>
        sql
          .split("\n")
          .filter((line) => !line.trim().startsWith("--"))
          .join("\n")
          .match(/auth\.uid\(\)\s+IS\s+NOT\s+NULL\s+AND\s+NOT/i),
      )
      .map(([file]) => file);
    expect(Object.keys(migrations).length).toBeGreaterThan(300);
    expect(offenders).toEqual([]);
  });
});
