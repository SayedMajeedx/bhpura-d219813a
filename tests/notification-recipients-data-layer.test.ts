import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

// These tests must never reach a real database: any network call fails loudly.
vi.stubGlobal("fetch", () => {
  throw new Error("Network access is blocked in notification recipient tests");
});

type Request = {
  table: string;
  op: "select" | "insert" | "update" | "delete";
  payload?: unknown;
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
    select: () => chain,
    insert: write("insert"),
    update: write("update"),
    delete: write("delete"),
    eq: record("eq"),
    order: record("order"),
    then(resolve: (reply: Reply) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve(respond(request)).then(resolve, reject);
    },
  };
  return chain;
}

const client = { supabase: { from: (table: string) => builder(table) } };
vi.mock("../src/integrations/supabase/client", () => client);
vi.mock("@/integrations/supabase/client", () => client);

const recipients = await import("../src/lib/data/notification-recipients");

const eqs = (request: Request) =>
  request.filters.filter(([k]) => k === "eq").map(([, ...rest]) => rest);

beforeEach(() => {
  requests.length = 0;
  respond = () => ({ data: [], error: null });
});

describe("admin alert recipients", () => {
  it("are one list per brand, oldest first, for the editor and the Communications count", async () => {
    const options = recipients.notificationRecipientsQueries.list("b1");
    expect(options.queryKey).toEqual(["notification-recipients", "b1"]);
    expect(recipients.notificationRecipientsQueries.list("").enabled).toBe(false);
    await recipients.fetchNotificationRecipients("b1");
    expect(requests[0].table).toBe("brand_notification_recipients");
    expect(eqs(requests[0])).toEqual([["brand_id", "b1"]]);
    expect(requests[0].filters).toContainEqual(["order", "created_at", { ascending: true }]);
  });

  it("read as none where the table does not exist yet, and throw other errors", async () => {
    respond = () => ({ data: null, error: { code: "42P01", message: "relation missing" } });
    expect(await recipients.fetchNotificationRecipients("b1")).toEqual([]);
    const denied = { code: "42501", message: "permission denied" };
    respond = () => ({ data: null, error: denied });
    await expect(recipients.fetchNotificationRecipients("b1")).rejects.toBe(denied);
  });

  it("are added to the brand passed, and changed or removed only within it", async () => {
    await recipients.createNotificationRecipient("b1", { email: "ops@pura.bh", name: null });
    await recipients.updateNotificationRecipient("b1", "r1", { active: false });
    await recipients.deleteNotificationRecipient("b1", "r1");
    expect(requests.map((r) => r.op)).toEqual(["insert", "update", "delete"]);
    expect(requests[0].payload).toEqual({ email: "ops@pura.bh", name: null, brand_id: "b1" });
    for (const request of requests.slice(1)) {
      expect(eqs(request)).toEqual([
        ["id", "r1"],
        ["brand_id", "b1"],
      ]);
    }
  });

  it("throw the database error as is, so the editor can name a duplicate email", async () => {
    const duplicate = { code: "23505", message: "duplicate key" };
    respond = () => ({ error: duplicate });
    await expect(
      recipients.createNotificationRecipient("b1", { email: "ops@pura.bh" }),
    ).rejects.toBe(duplicate);
  });

  it("refresh only the brand's list after a write", async () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    await recipients.invalidateNotificationRecipients(qc, "b1");
    expect(spy.mock.calls.map(([f]) => f?.queryKey)).toEqual([["notification-recipients", "b1"]]);
  });
});
