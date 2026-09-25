import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

// These tests must never reach a real database: any network call fails loudly.
vi.stubGlobal("fetch", () => {
  throw new Error("Network access is blocked in message template data-layer tests");
});

type Request = {
  table: string;
  op: "select" | "insert" | "update" | "delete";
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
    then(resolve: (reply: Reply) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve(respond(request)).then(resolve, reject);
    },
  };
  return chain;
}

const client = { supabase: { from: (table: string) => builder(table) } };
vi.mock("../src/integrations/supabase/client", () => client);
vi.mock("@/integrations/supabase/client", () => client);

const templates = await import("../src/lib/data/message-templates");
const { queryKeys } = await import("../src/lib/query-keys");

const filters = (request: Request, kind: string) =>
  request.filters.filter(([k]) => k === kind).map(([, ...rest]) => rest);

beforeEach(() => {
  requests.length = 0;
  respond = () => ({ data: [], error: null });
});

describe("keys", () => {
  it("put the invoice and campaign lists under one prefix, so a save in one refreshes the other", async () => {
    const list = templates.messageTemplatesQueries.list("b1").queryKey;
    const whatsapp = templates.messageTemplatesQueries.channel("b1", "whatsapp").queryKey;
    expect(list).not.toEqual(whatsapp);
    for (const key of [list, whatsapp])
      expect(key.slice(0, 2)).toEqual(["message-templates", "b1"]);
    expect(queryKeys.templates.message("b1")).toEqual(["message-templates", "b1"]);

    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    await templates.invalidateMessageTemplates(qc, "b1");
    expect(spy.mock.calls.map(([f]) => f?.queryKey)).toEqual([["message-templates", "b1"]]);
  });
});

describe("reads", () => {
  it("list every template oldest first, and one channel's newest first", async () => {
    await templates.fetchMessageTemplates("b1");
    await templates.fetchChannelTemplates("b1", "whatsapp");
    expect(filters(requests[0], "eq")).toEqual([["brand_id", "b1"]]);
    expect(filters(requests[0], "order")).toEqual([["created_at"]]);
    expect(requests[1].select).toBe("id, name, body");
    expect(filters(requests[1], "eq")).toEqual([
      ["brand_id", "b1"],
      ["channel", "whatsapp"],
    ]);
    expect(filters(requests[1], "order")).toEqual([["created_at", { ascending: false }]]);
  });
});

describe("writes", () => {
  it("create a template in the brand being edited, not the profile's brand", async () => {
    respond = () => ({ data: { id: "t9" }, error: null });
    const id = await templates.createMessageTemplate("b2", {
      name: "Eid",
      body: "Hi {{name}}",
      channel: "whatsapp",
      user_id: "u1",
    });
    expect(id).toBe("t9");
    expect(requests[0].payload).toEqual({
      name: "Eid",
      body: "Hi {{name}}",
      channel: "whatsapp",
      user_id: "u1",
      brand_id: "b2",
    });
  });

  it("update and delete only the brand's template", async () => {
    await templates.updateMessageTemplate("b1", "t1", { name: "New" });
    await templates.deleteMessageTemplate("b1", "t1");
    for (const request of requests) {
      expect(filters(request, "eq")).toEqual([
        ["id", "t1"],
        ["brand_id", "b1"],
      ]);
    }
  });

  it("clear the default within the brand only, not across the user's brands", async () => {
    await templates.clearDefaultMessageTemplate("b1");
    expect(requests[0]).toMatchObject({ op: "update", payload: { is_default: false } });
    expect(filters(requests[0], "eq")).toEqual([
      ["brand_id", "b1"],
      ["is_default", true],
    ]);
    expect(filters(requests[0], "eq").some(([column]) => column === "user_id")).toBe(false);
  });

  it("throw on error", async () => {
    const denied = { message: "denied" };
    respond = () => ({ data: null, error: denied });
    await expect(templates.deleteMessageTemplate("b1", "t1")).rejects.toBe(denied);
    await expect(
      templates.createMessageTemplate("b1", { name: "x", body: "y", user_id: "u1" }),
    ).rejects.toBe(denied);
  });
});
