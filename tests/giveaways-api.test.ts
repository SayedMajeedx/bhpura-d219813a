import { FunctionsHttpError, FunctionsFetchError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { giveawayErrorMessage } from "../src/features/giveaways/lib/messages";

// The edge-function calls of the giveaways data layer, with the Supabase client
// faked but the error classes real: what the screen shows depends on reading the
// function's JSON answer out of a failed response.

const invoke = vi.hoisted(() => vi.fn());
const client = { supabase: { functions: { invoke } } };
vi.mock("../src/integrations/supabase/client", () => client);
vi.mock("@/integrations/supabase/client", () => client);

const { GiveawayApiError, pullComments, listInstagramMedia, connectInstagram } =
  await import("../src/lib/data/giveaways");

const httpError = (status: number, body: unknown) =>
  new FunctionsHttpError(
    new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );

beforeEach(() => invoke.mockReset());

describe("calling the instagram-giveaway function", () => {
  it("returns the function's answer when it succeeds", async () => {
    invoke.mockResolvedValue({
      data: { ok: true, fetched: 500, done: false, rate_limited: false },
      error: null,
    });
    expect(await pullComments("b1", "g1")).toEqual({
      ok: true,
      fetched: 500,
      done: false,
      rate_limited: false,
    });
    expect(invoke).toHaveBeenCalledWith("instagram-giveaway", {
      body: { action: "fetch_comments", brand_id: "b1", giveaway_id: "g1", restart: false },
    });
  });

  it("carries the function's error code and message out of a 400", async () => {
    invoke.mockResolvedValue({
      data: null,
      error: httpError(400, { error: "Instagram returned no comments", code: "no_comments" }),
    });
    const error = await pullComments("b1", "g1").catch((e) => e);
    expect(error).toBeInstanceOf(GiveawayApiError);
    expect(error.code).toBe("no_comments");
    expect(error.message).toBe("Instagram returned no comments");
  });

  it("reads Instagram's own words from a 502", async () => {
    invoke.mockResolvedValue({
      data: null,
      error: httpError(502, {
        error: "(#10) Application does not have permission",
        code: "instagram_error",
      }),
    });
    const error = await listInstagramMedia("b1").catch((e) => e);
    expect(error.code).toBe("instagram_error");
    expect(error.message).toContain("does not have permission");
  });

  it("falls back to a server error when the body is not the function's JSON", async () => {
    invoke.mockResolvedValue({ data: null, error: httpError(400, "Bad Request") });
    const error = await connectInstagram("b1", "x".repeat(30)).catch((e) => e);
    expect(error.code).toBe("server_error");
  });

  it("reports a network failure as such", async () => {
    invoke.mockResolvedValue({ data: null, error: new FunctionsFetchError({}) });
    const error = await pullComments("b1", "g1").catch((e) => e);
    expect(error.code).toBe("network");
  });
});

describe("what the screen shows", () => {
  it("adds the function's own words where the code alone does not say enough", () => {
    expect(giveawayErrorMessage("instagram_error", false, "(#10) no permission")).toContain(
      "(#10) no permission",
    );
    expect(giveawayErrorMessage("some_new_code", false, "it broke")).toContain("(it broke)");
    expect(giveawayErrorMessage("server_error", true, "تفصيل")).toContain("(تفصيل)");
  });

  it("leaves a message with its own text as it is", () => {
    expect(giveawayErrorMessage("rate_limited", false, "ignored")).not.toContain("ignored");
  });
});
