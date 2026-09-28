import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  defaultDraftName,
  readDraftFormat,
  readDraftSettings,
} from "../src/features/content-studio/lib/drafts";

// The content studio's saved drafts: the data layer (every read and write
// scoped to the brand) and the defensive reading of a draft's settings.

vi.stubGlobal("fetch", () => {
  throw new Error("Network access is blocked in content draft data-layer tests");
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
    limit: record("limit"),
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

const drafts = await import("../src/lib/data/content-drafts");

const filters = (request: Request, kind: string) =>
  request.filters.filter(([k]) => k === kind).map(([, ...rest]) => rest);

beforeEach(() => {
  requests.length = 0;
  respond = () => ({ data: [], error: null });
});

describe("the content drafts data layer", () => {
  const values = {
    name: "Price Drop · Silk Abaya",
    template_id: "price-drop",
    format: "story",
    product_id: "p1",
    settings: { v: 1, headline: "The Eid edit" },
  };

  it("lists the brand's latest drafts, newest first", async () => {
    respond = () => ({ data: [{ id: "d1" }], error: null });
    expect(await drafts.fetchContentDrafts("b1")).toEqual([{ id: "d1" }]);
    const [request] = requests;
    expect(request.table).toBe("content_studio_drafts");
    expect(filters(request, "eq")).toEqual([["brand_id", "b1"]]);
    expect(filters(request, "order")).toEqual([["updated_at", { ascending: false }]]);
    expect(filters(request, "limit")).toEqual([[drafts.CONTENT_DRAFTS_LIMIT]]);
    expect(drafts.contentDraftsQueries.list("b1").queryKey).toEqual([
      "content-drafts",
      "b1",
      "list",
    ]);
  });

  it("saves a draft in the brand being edited", async () => {
    respond = () => ({ data: { id: "d9" }, error: null });
    expect(await drafts.createContentDraft("b1", values)).toBe("d9");
    expect(requests[0]).toMatchObject({ op: "insert", payload: { ...values, brand_id: "b1" } });
  });

  it("scopes updates and deletes to the brand as well as the draft", async () => {
    await drafts.updateContentDraft("b1", "d1", values);
    await drafts.deleteContentDraft("b1", "d1");
    for (const request of requests) {
      expect(filters(request, "eq")).toEqual([
        ["id", "d1"],
        ["brand_id", "b1"],
      ]);
    }
    expect(requests.map((request) => request.op)).toEqual(["update", "delete"]);
  });

  it("passes a database error on", async () => {
    respond = () => ({ error: new Error("denied") });
    await expect(drafts.deleteContentDraft("b1", "d1")).rejects.toThrow("denied");
  });
});

describe("reading a draft's settings", () => {
  it("keeps what is valid and falls back for the rest", () => {
    const settings = readDraftSettings({
      theme: "maison",
      showPrice: false,
      logoScale: 9,
      logoTint: "neon",
      headline: "The Eid edit",
      lookbookIds: ["a", 2, "b", "c", "d", "e", "f"],
      detail: { x: 1.4, y: 0.3, label: "Silk" },
      occasion: { id: "eid-al-fitr", greeting: "Eid Mubarak", message: "", offer: "20%" },
    });
    expect(settings).toMatchObject({
      theme: "maison",
      showPrice: false,
      logoScale: 2.2,
      logoTint: "auto",
      headline: "The Eid edit",
      body: "",
      lookbookIds: ["a", "b", "c", "d", "e"],
      detail: { x: 1, y: 0.3, label: "Silk", note: "" },
      occasion: { id: "eid-al-fitr", greeting: "Eid Mubarak", offer: "20%" },
    });
  });

  it("opens anything, even an empty or broken draft", () => {
    for (const raw of [null, "text", [], { theme: "neon", occasion: { id: "halloween" } }]) {
      expect(readDraftSettings(raw)).toMatchObject({
        theme: "editorial",
        showPrice: true,
        logoScale: 1,
        occasion: null,
        detail: null,
      });
    }
    expect(readDraftFormat("portrait")).toBe("portrait");
    expect(readDraftFormat("banner")).toBe("story");
  });

  it("names a new draft after its template and subject", () => {
    expect(defaultDraftName("Price Drop", "Silk Abaya")).toBe("Price Drop · Silk Abaya");
    expect(defaultDraftName("Classic", null)).toBe("Classic");
  });
});
