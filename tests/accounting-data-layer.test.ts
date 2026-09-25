import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

// These tests must never reach a real database: any network call fails loudly.
vi.stubGlobal("fetch", () => {
  throw new Error("Network access is blocked in accounting data-layer tests");
});

type Request = {
  table: string;
  op: "select" | "insert" | "update" | "rpc";
  payload?: unknown;
  select?: string;
  filters: Array<[string, ...unknown[]]>;
};
type Reply = { data?: unknown; error: unknown };

const requests: Request[] = [];
let respond: (request: Request) => Reply = () => ({ data: [], error: null });

function builder(table: string) {
  const request: Request = { table, op: "select", filters: [] };
  requests.push(request);
  const record =
    (kind: string) =>
    (...args: unknown[]) => (request.filters.push([kind, ...args]), chain);
  const chain = {
    select(columns: string) {
      request.select = columns;
      return chain;
    },
    insert(payload: unknown) {
      request.op = "insert";
      request.payload = payload;
      return chain;
    },
    update(payload: unknown) {
      request.op = "update";
      request.payload = payload;
      return chain;
    },
    eq: record("eq"),
    order: record("order"),
    then(resolve: (reply: Reply) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve(respond(request)).then(resolve, reject);
    },
  };
  return chain;
}

const client = {
  supabase: {
    from: (table: string) => builder(table),
    rpc: (fn: string, args: unknown) => {
      const request: Request = { table: fn, op: "rpc", payload: args, filters: [] };
      requests.push(request);
      return Promise.resolve(respond(request));
    },
  },
};
vi.mock("../src/integrations/supabase/client", () => client);
vi.mock("@/integrations/supabase/client", () => client);

const accounting = await import("../src/lib/data/accounting");

const eqs = (request: Request) =>
  request.filters.filter(([k]) => k === "eq").map(([, ...rest]) => rest);
const denied = { message: "denied" };

beforeEach(() => {
  requests.length = 0;
  respond = () => ({ data: [], error: null });
});

describe("the accounting tabs' reads", () => {
  it("sit under the brand's accounting prefix", () => {
    const q = accounting.accountingQueries;
    for (const options of [
      q.cashAccounts("b1"),
      q.vendors("b1"),
      q.vendorOptions("b1"),
      q.purchaseOrders("b1"),
    ]) {
      expect(options.queryKey.slice(0, 2)).toEqual(["accounting", "b1"]);
    }
    // The vendors tab and the expense form's picker are two lists, one per column set.
    expect(q.vendors("b1").queryKey).not.toEqual(q.vendorOptions("b1").queryKey);
  });

  it("are scoped by brand and throw on error", async () => {
    await accounting.fetchCashFlowAccounts("b1");
    await accounting.fetchVendors("b1");
    await accounting.fetchVendorOptions("b1");
    await accounting.fetchPurchaseOrders("b1");
    expect(requests.map((r) => r.table)).toEqual([
      "cash_flow_accounts",
      "vendors",
      "vendors",
      "purchase_orders",
    ]);
    for (const request of requests) expect(eqs(request)).toEqual([["brand_id", "b1"]]);
    expect(requests[2].select).toBe("id, name");
    expect(requests[3].select).toBe("*, vendors(name)");

    respond = () => ({ data: null, error: denied });
    await expect(accounting.fetchPurchaseOrders("b1")).rejects.toBe(denied);
  });
});

describe("the accounting tabs' writes", () => {
  it("stamp the brand on new rows", async () => {
    await accounting.createVendor("b1", { name: "Silk Co" });
    await accounting.createPurchaseOrder("b1", {
      po_number: "PO-1234",
      vendor_id: "v1",
      total_amount: 100,
    });
    expect(
      requests.map((r) => [r.table, r.op, (r.payload as { brand_id: string }).brand_id]),
    ).toEqual([
      ["vendors", "insert", "b1"],
      ["purchase_orders", "insert", "b1"],
    ]);
  });

  it("update only the brand's own rows and throw on error", async () => {
    await accounting.updatePurchaseOrder("b1", "po-1", { paid_amount: 20 });
    expect(requests[0]).toMatchObject({ table: "purchase_orders", payload: { paid_amount: 20 } });
    expect(eqs(requests[0])).toEqual([
      ["id", "po-1"],
      ["brand_id", "b1"],
    ]);

    respond = () => ({ error: denied });
    await expect(accounting.createVendor("b1", { name: "x" })).rejects.toBe(denied);
    await expect(accounting.updatePurchaseOrder("b1", "po-1", {})).rejects.toBe(denied);
  });

  it("refresh both vendor lists after a new vendor, and nothing else", async () => {
    const qc = new QueryClient();
    const q = accounting.accountingQueries;
    for (const key of [
      q.vendors("b1").queryKey,
      q.vendorOptions("b1").queryKey,
      q.purchaseOrders("b1").queryKey,
      q.vendors("b2").queryKey,
    ]) {
      qc.setQueryData(key, []);
    }
    await accounting.invalidateVendors(qc, "b1");
    expect(
      qc
        .getQueryCache()
        .getAll()
        .map((query) => query.state.isInvalidated),
    ).toEqual([true, true, false, false]);
  });
});

describe("the cash box to bank transfer (bug backlog #24)", () => {
  it("is one database call for the brand, never separate balance writes", async () => {
    respond = () => ({ data: "tx-1", error: null });
    expect(await accounting.transferCashToBank("b1", 25, "  Friday deposit ")).toBe("tx-1");
    expect(requests).toEqual([
      {
        table: "transfer_cash_to_bank",
        op: "rpc",
        payload: { p_brand_id: "b1", p_amount: 25, p_notes: "Friday deposit" },
        filters: [],
      },
    ]);
    // Blank notes are left to the database's default note.
    await accounting.transferCashToBank("b1", 25, "   ");
    expect((requests[1].payload as { p_notes?: string }).p_notes).toBeUndefined();
  });

  it("throws the database's refusal, which the screen can name", async () => {
    const refusal = { message: "INSUFFICIENT_CASH_BALANCE", code: "P0001" };
    respond = () => ({ data: null, error: refusal });
    const failure = accounting.transferCashToBank("b1", 1000);
    await expect(failure).rejects.toBe(refusal);
    expect(accounting.cashTransferRefusal(refusal)).toBe("INSUFFICIENT_CASH_BALANCE");
    expect(accounting.cashTransferRefusal({ message: "CASH_ACCOUNTS_MISSING" })).toBe(
      "CASH_ACCOUNTS_MISSING",
    );
    expect(accounting.cashTransferRefusal({ message: "network down" })).toBeNull();
    expect(accounting.cashTransferRefusal(null)).toBeNull();
  });
});
