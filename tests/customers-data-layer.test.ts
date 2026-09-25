import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

// These tests must never reach a real database: any network call fails loudly.
vi.stubGlobal("fetch", () => {
  throw new Error("Network access is blocked in customers data-layer tests");
});

type Request = {
  table: string;
  op: "select" | "insert" | "update" | "delete" | "rpc";
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
  const write = (op: Request["op"]) => (payload?: unknown) => {
    request.op = op;
    request.payload = payload;
    return chain;
  };
  const chain = {
    select(columns: string) {
      if (request.op === "select") request.select = columns;
      return chain;
    },
    insert: write("insert"),
    update: write("update"),
    delete: write("delete"),
    eq: record("eq"),
    order: record("order"),
    single: () => chain,
    maybeSingle: () => chain,
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

const customers = await import("../src/lib/data/customers");
const { queryKeys } = await import("../src/lib/query-keys");

const filters = (request: Request, kind: string) =>
  request.filters.filter(([k]) => k === kind).map(([, ...rest]) => rest);
const denied = { message: "denied" };

beforeEach(() => {
  requests.length = 0;
  respond = () => ({ data: [], error: null });
});

describe("customers keys", () => {
  it("keep everything of a brand under one prefix, the one existing invalidations use", () => {
    const { customersKeys } = customers;
    expect(customersKeys.all("b1")).toEqual(queryKeys.customers.all("b1"));
    const keys = [
      customers.customersQueries.list("b1").queryKey,
      customers.customersQueries.contacts("b1").queryKey,
      customers.customersQueries.detail("b1", "c1").queryKey,
      customers.customersQueries.addresses("b1").queryKey,
      customers.customersQueries.customerAddresses("b1", "c1").queryKey,
    ];
    expect(new Set(keys.map((k) => JSON.stringify(k))).size).toBe(keys.length);
    for (const key of keys) expect(key.slice(0, 2)).toEqual(["customers", "b1"]);
  });

  it("never mistake a customer's addresses for the brand's (the old key took either id)", () => {
    const { customersKeys } = customers;
    expect(customersKeys.customerAddresses("b1", "c1")).not.toEqual(customersKeys.addresses("c1"));
    expect(customersKeys.customerAddresses("b1", "c1").slice(0, 3)).toEqual(
      customersKeys.addresses("b1"),
    );
  });
});

describe("customer reads", () => {
  it("list the brand's customers newest first and throw on error", async () => {
    await customers.fetchCustomers("b1");
    expect(requests[0]).toMatchObject({ table: "customers", select: "*" });
    expect(filters(requests[0], "eq")).toEqual([["brand_id", "b1"]]);
    expect(filters(requests[0], "order")).toEqual([["created_at", { ascending: false }]]);
    respond = () => ({ data: null, error: denied });
    await expect(customers.fetchCustomers("b1")).rejects.toBe(denied);
  });

  it("read one profile only within the brand", async () => {
    respond = () => ({ data: null, error: null });
    expect(await customers.fetchCustomer("b1", "c1")).toBeNull();
    expect(filters(requests[0], "eq")).toEqual([
      ["brand_id", "b1"],
      ["id", "c1"],
    ]);
  });

  it("list one customer's addresses default first, then oldest first", async () => {
    await customers.fetchCustomerAddresses("b1", "c1");
    expect(requests[0].table).toBe("customer_addresses");
    expect(filters(requests[0], "eq")).toEqual([
      ["brand_id", "b1"],
      ["customer_id", "c1"],
    ]);
    expect(filters(requests[0], "order")).toEqual([
      ["is_default", { ascending: false }],
      ["created_at"],
    ]);
  });

  it("scope the brand-wide reads by brand", async () => {
    await customers.fetchBrandAddresses("b1");
    await customers.fetchCustomerContacts("b1");
    await customers.fetchCustomerIdentities("b1");
    expect(requests.map((r) => r.select)).toEqual(["*", "id, name, phone", "id, phone, email"]);
    for (const request of requests) expect(filters(request, "eq")).toEqual([["brand_id", "b1"]]);
  });
});

describe("customer writes", () => {
  it("create a customer in the brand passed and return its id and name", async () => {
    respond = () => ({ data: { id: "c9", name: "Sara" }, error: null });
    expect(await customers.createCustomer("b1", { name: "Sara", brand_id: "other" })).toEqual({
      id: "c9",
      name: "Sara",
    });
    expect(requests[0].payload).toEqual({ name: "Sara", brand_id: "b1" });
  });

  it("update a customer only within the brand", async () => {
    await customers.updateCustomer("b1", "c1", { notes: "VIP" });
    expect(filters(requests[0], "eq")).toEqual([
      ["brand_id", "b1"],
      ["id", "c1"],
    ]);
  });

  it("delete customers through the brand-checking server function", async () => {
    await customers.deleteCustomers("b1", ["c1", "c2"]);
    expect(requests[0]).toMatchObject({
      table: "delete_brand_customers",
      payload: { p_brand_id: "b1", p_customer_ids: ["c1", "c2"] },
    });
    respond = () => ({ error: denied });
    await expect(customers.deleteCustomers("b1", ["c1"])).rejects.toBe(denied);
  });
});

describe("saved-address writes", () => {
  it("create an address in the brand passed and return its id", async () => {
    respond = () => ({ data: { id: "a9" }, error: null });
    expect(await customers.createCustomerAddress("b1", { customer_id: "c1", user_id: "u1" })).toBe(
      "a9",
    );
    expect(requests[0].payload).toEqual({ customer_id: "c1", user_id: "u1", brand_id: "b1" });
  });

  it("change and delete an address only for that customer of that brand", async () => {
    await customers.updateCustomerAddress("b1", "c1", "a1", { label: "Home" });
    await customers.deleteCustomerAddress("b1", "c1", "a1");
    for (const request of requests) {
      expect(filters(request, "eq")).toEqual([
        ["id", "a1"],
        ["customer_id", "c1"],
        ["brand_id", "b1"],
      ]);
    }
  });

  it("clear the old default before setting the new one, ignoring a failed clear (bug backlog #17)", async () => {
    respond = (request) =>
      (request.payload as { is_default: boolean }).is_default ? { error: null } : { error: denied };
    await customers.setDefaultCustomerAddress("b1", "c1", "a2");
    expect(requests.map((r) => r.payload)).toEqual([{ is_default: false }, { is_default: true }]);
    expect(filters(requests[0], "eq")).toEqual([
      ["customer_id", "c1"],
      ["brand_id", "b1"],
    ]);
    expect(filters(requests[1], "eq")[0]).toEqual(["id", "a2"]);
  });

  it("fail when the new default cannot be set", async () => {
    respond = () => ({ error: denied });
    await expect(customers.setDefaultCustomerAddress("b1", "c1", "a2")).rejects.toBe(denied);
  });

  it("move a duplicate's orders to the kept address, then delete the duplicate", async () => {
    await customers.mergeDuplicateAddress("b1", "c1", "keep", "dup");
    expect(requests.map((r) => [r.table, r.op])).toEqual([
      ["orders", "update"],
      ["customer_addresses", "delete"],
    ]);
    expect(requests[0].payload).toEqual({ shipping_address_id: "keep" });
    expect(filters(requests[0], "eq")).toEqual([
      ["shipping_address_id", "dup"],
      ["brand_id", "b1"],
    ]);
    expect(filters(requests[1], "eq")[0]).toEqual(["id", "dup"]);
  });

  it("keeps the duplicate when its orders cannot be moved (bug backlog #15)", async () => {
    respond = (request) => (request.table === "orders" ? { error: denied } : { error: null });
    await expect(customers.mergeDuplicateAddress("b1", "c1", "keep", "dup")).rejects.toBe(denied);
    expect(requests.map((r) => r.table)).toEqual(["orders"]);
  });

  it("reports a duplicate that could not be deleted (bug backlog #15)", async () => {
    respond = (request) => (request.op === "delete" ? { error: denied } : { error: null });
    await expect(customers.mergeDuplicateAddress("b1", "c1", "keep", "dup")).rejects.toBe(denied);
  });
});

describe("invalidateCustomers", () => {
  it("refreshes everything cached about the brand's customers", async () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    await customers.invalidateCustomers(qc, "b1");
    expect(spy.mock.calls.map(([f]) => f?.queryKey)).toEqual([["customers", "b1"]]);
  });
});
