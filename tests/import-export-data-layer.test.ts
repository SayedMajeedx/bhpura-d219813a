import { beforeEach, describe, expect, it, vi } from "vitest";

// These tests must never reach a real database: any network call fails loudly.
vi.stubGlobal("fetch", () => {
  throw new Error("Network access is blocked in import/export data-layer tests");
});

type Request = {
  table: string;
  op: "select" | "insert";
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
      request.select = columns.replace(/\s+/g, " ").trim();
      return chain;
    },
    insert(payload: unknown) {
      request.op = "insert";
      request.payload = payload;
      return chain;
    },
    eq: record("eq"),
    order: record("order"),
    limit: record("limit"),
    then(resolve: (reply: Reply) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve(respond(request)).then(resolve, reject);
    },
  };
  return chain;
}

const client = { supabase: { from: (table: string) => builder(table) } };
vi.mock("../src/integrations/supabase/client", () => client);
vi.mock("@/integrations/supabase/client", () => client);

const runs = await import("../src/lib/data/import-export");
const catalog = await import("../src/lib/data/catalog");
const expenses = await import("../src/lib/data/expenses");

const denied = { message: "denied" };
const eqs = (request: Request) =>
  request.filters.filter(([k]) => k === "eq").map(([, ...rest]) => rest);

beforeEach(() => {
  requests.length = 0;
  respond = () => ({ data: [], error: null });
  localStorage.clear();
});

describe("import history", () => {
  it("lists the brand's latest 30 batches, and shows none when the read fails", async () => {
    await runs.fetchImportRuns("b1");
    expect(eqs(requests[0])).toEqual([["brand_id", "b1"]]);
    expect(requests[0].filters).toContainEqual(["limit", 30]);
    respond = () => ({ data: null, error: denied });
    expect(await runs.fetchImportRuns("b1")).toEqual([]);
  });

  it("lists product batches only for the product importer, and throws its error", async () => {
    await runs.fetchProductImportRuns("b1");
    expect(eqs(requests[0])).toEqual([
      ["brand_id", "b1"],
      ["entity_type", "products"],
    ]);
    respond = () => ({ data: null, error: denied });
    await expect(runs.fetchProductImportRuns("b1")).rejects.toBe(denied);
  });
});

describe("export history", () => {
  const local = [{ id: "local-1", file_name: "products.csv" }];

  it("comes from the log when it has rows", async () => {
    respond = () => ({ data: [{ id: "r1" }], error: null });
    expect(await runs.fetchExportRuns("b1")).toEqual([{ id: "r1" }]);
    expect(requests[0].filters).toContainEqual(["limit", 20]);
  });

  it("falls back to this browser's copy when the log is empty or unreadable", async () => {
    localStorage.setItem("boutq_export_runs_b1", JSON.stringify(local));
    expect(await runs.fetchExportRuns("b1")).toEqual(local);
    respond = () => ({ data: null, error: denied });
    expect(await runs.fetchExportRuns("b1")).toEqual(local);
    localStorage.clear();
    expect(await runs.fetchExportRuns("b1")).toEqual([]);
  });

  it("logs an export and throws a failed write", async () => {
    const run = {
      brand_id: "b1",
      created_by: "u1",
      session_id: "s1",
      preset: "shopify",
      entity_type: "products",
      file_format: "csv",
      record_count: 3,
      file_name: "products.csv",
    };
    await runs.recordExportRun(run);
    expect(requests[0]).toMatchObject({ table: "export_runs", op: "insert", payload: run });
    respond = () => ({ error: denied });
    await expect(runs.recordExportRun(run)).rejects.toBe(denied);
  });

  it("keeps each list under the brand's import/export prefix", () => {
    for (const options of [
      runs.importExportQueries.importRuns("b1"),
      runs.importExportQueries.productImportRuns("b1"),
      runs.importExportQueries.exportRuns("b1"),
    ]) {
      expect(options.queryKey.slice(0, 2)).toEqual(["import-export", "b1"]);
    }
  });
});

describe("the products export", () => {
  it("reads every product with its variants, refreshed with the product list", async () => {
    await catalog.fetchProductExportRows("b1");
    expect(requests[0].table).toBe("products");
    expect(requests[0].select).toContain("product_variants (");
    expect(eqs(requests[0])).toEqual([["brand_id", "b1"]]);
    expect(catalog.catalogQueries.productExportRows("b1").queryKey.slice(0, 2)).toEqual(
      catalog.catalogKeys.products("b1"),
    );
  });

  it("exports nothing when the read fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    respond = () => ({ data: null, error: denied });
    expect(await catalog.fetchProductExportRows("b1")).toEqual([]);
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });
});

describe("the expenses export (bug backlog #28)", () => {
  it("reads the columns expenses have, newest first, refreshed with every expenses write", async () => {
    await expenses.fetchExpenseExportRows("b1");
    expect(requests[0].table).toBe("expenses");
    expect(requests[0].select).toBe(
      "id, expense_date, category, description, amount, notes, created_at",
    );
    expect(requests[0].select).not.toMatch(/\b(date|title|payment_method),/);
    expect(requests[0].filters).toContainEqual(["order", "expense_date", { ascending: false }]);
    expect(eqs(requests[0])).toEqual([["brand_id", "b1"]]);
    expect(expenses.expensesQueries.exportRows("b1").queryKey.slice(0, 2)).toEqual(
      expenses.expensesKeys.all("b1"),
    );
  });

  it("exports nothing when the read fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    respond = () => ({ data: null, error: denied });
    expect(await expenses.fetchExpenseExportRows("b1")).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("writes each expense's date, description and amount, and no invented payment method", () => {
    const line = expenses.toExpenseExportLine({
      id: "e1",
      expense_date: "2026-09-20",
      category: "Packaging",
      description: "Gift boxes",
      amount: 42.5,
      notes: null,
      created_at: "2026-09-21T08:00:00Z",
    });
    expect(line).toEqual({
      date: "2026-09-20",
      category: "Packaging",
      title: "Gift boxes",
      amount: 42.5,
      payment_method: "—",
      notes: "—",
    });
  });
});
