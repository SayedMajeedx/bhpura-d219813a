import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_RULES } from "../src/features/giveaways/lib/entry-rules";

// One giveaway screen, rendered with its data layer faked: the comments pulled
// from Instagram in batches, the rules, the draw, and the winners staff check.

type Winner = {
  id: string;
  giveaway_id: string;
  position: number;
  kind: string;
  username: string;
  comment_id: string;
  comment_body: string;
  follow_checked: boolean;
  like_checked: boolean;
  status: string;
  note: string | null;
};

const state = vi.hoisted(() => ({
  giveaway: null as Record<string, unknown> | null,
  comments: [] as Record<string, unknown>[],
  winners: [] as Winner[],
  pullSteps: [] as Array<{ fetched: number; done: boolean; rate_limited: boolean }>,
  pullComments: vi.fn(),
  saveDraw: vi.fn(async () => undefined),
  updateWinner: vi.fn(),
  saveGiveawayRules: vi.fn(async () => undefined),
  importComments: vi.fn(async (_brand: string, _id: string, rows: unknown[]) => rows.length),
  qc: null as import("@tanstack/react-query").QueryClient | null,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const fixture = (key: string, value: () => unknown) => ({
  queryKey: ["giveaways-test", key],
  queryFn: async () => value(),
});
class GiveawayApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
const giveawaysData = {
  giveawaysQueries: {
    detail: () => fixture("detail", () => state.giveaway),
    comments: () => fixture("comments", () => state.comments),
    winners: () => fixture("winners", () => state.winners),
    connection: () =>
      fixture("connection", () => ({
        is_connected: true,
        instagram_username: "pura.line",
        days_until_expiry: 50,
        refresh_error: null,
      })),
  },
  GiveawayApiError,
  invalidateGiveaways: vi.fn(() => state.qc?.invalidateQueries({ queryKey: ["giveaways-test"] })),
  pullComments: state.pullComments,
  saveDraw: state.saveDraw,
  updateWinner: state.updateWinner,
  saveGiveawayRules: state.saveGiveawayRules,
  importComments: state.importComments,
};
vi.mock("../src/lib/data/giveaways", () => giveawaysData);
vi.mock("@/lib/data/giveaways", () => giveawaysData);
const brandContext = { useBrand: () => ({ id: "b1", slug: "pura", name_en: "Pura" }) };
vi.mock("../src/lib/brand-context", () => brandContext);
vi.mock("@/lib/brand-context", () => brandContext);

const { GiveawayDetailView } =
  await import("../src/features/giveaways/components/GiveawayDetailView");
const { I18nProvider } = await import("../src/lib/i18n");

const giveaway = (over: Record<string, unknown> = {}) => ({
  id: "g1",
  brand_id: "b1",
  title: "Eid giveaway",
  media_id: "m1",
  media_permalink: "https://www.instagram.com/p/abc/",
  media_caption: null,
  media_thumbnail_url: null,
  media_posted_at: null,
  comments_total: 4,
  rules: DEFAULT_RULES,
  fetch_done: true,
  status: "ready",
  draw_seed: null,
  drawn_at: null,
  created_at: "2026-10-01T00:00:00Z",
  ...over,
});
const comment = (id: string, username: string, body: string) => ({
  comment_id: id,
  username,
  body,
  commented_at: "2026-10-01T10:00:00Z",
  like_count: 0,
});
const winner = (position: number, over: Partial<Winner> = {}): Winner => ({
  id: `w${position}`,
  giveaway_id: "g1",
  position,
  kind: position === 1 ? "winner" : "backup",
  username: `user${position}`,
  comment_id: `c${position}`,
  comment_body: `entry ${position}`,
  follow_checked: false,
  like_checked: false,
  status: "pending",
  note: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem("lang", "en");
  state.giveaway = giveaway();
  state.comments = [
    comment("c1", "sara", "@a @b done"),
    comment("c2", "noor", "@a"),
    comment("c3", "huda", "nice"),
    comment("c4", "pura.line", "thanks everyone"),
  ];
  state.winners = [];
  state.pullSteps = [];
  state.updateWinner.mockImplementation(async (_brand: string, id: string, patch: object) => {
    state.winners = state.winners.map((row) => (row.id === id ? { ...row, ...patch } : row));
  });
  state.pullComments.mockImplementation(async () => {
    const step = state.pullSteps.shift() ?? { fetched: 0, done: true, rate_limited: false };
    if (step.done && state.giveaway) state.giveaway = { ...state.giveaway, fetch_done: true };
    return { ok: true, ...step };
  });
});

function renderScreen() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  state.qc = qc;
  return render(
    <QueryClientProvider client={qc}>
      <I18nProvider>
        <GiveawayDetailView giveawayId="g1" onBack={() => undefined} />
      </I18nProvider>
    </QueryClientProvider>,
  );
}

const stat = (label: string) => screen.getByText(label).nextElementSibling?.textContent;

describe("pulling the comments", () => {
  it("asks for the next batch until Instagram has no more", async () => {
    state.giveaway = giveaway({ fetch_done: false, status: "draft", comments_total: 600 });
    state.comments = [];
    state.pullSteps = [
      { fetched: 500, done: false, rate_limited: false },
      { fetched: 600, done: true, rate_limited: false },
    ];
    renderScreen();
    fireEvent.click(await screen.findByRole("button", { name: /Pull comments/ }));

    await waitFor(() => expect(state.pullComments).toHaveBeenCalledTimes(2));
    expect(state.pullComments).toHaveBeenNthCalledWith(1, "b1", "g1", false);
    expect(state.pullComments).toHaveBeenNthCalledWith(2, "b1", "g1", false);
    expect(await screen.findByText(/All top-level comments are pulled/)).toBeTruthy();
  });

  it("stops and says so when Instagram asks to slow down", async () => {
    state.giveaway = giveaway({ fetch_done: false, status: "draft" });
    state.comments = [];
    state.pullSteps = [{ fetched: 300, done: false, rate_limited: true }];
    renderScreen();
    fireEvent.click(await screen.findByRole("button", { name: /Pull comments/ }));

    expect(await screen.findByText(/asked to slow down/)).toBeTruthy();
    expect(state.pullComments).toHaveBeenCalledTimes(1);
  });

  it("shows the reason when the pull fails", async () => {
    state.giveaway = giveaway({ fetch_done: false, status: "draft" });
    state.comments = [];
    state.pullComments.mockRejectedValueOnce(new GiveawayApiError("token_expired", "expired"));
    renderScreen();
    fireEvent.click(await screen.findByRole("button", { name: /Pull comments/ }));

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      expect.stringContaining("token has expired"),
    );
  });
});

describe("importing comments by hand", () => {
  it("parses what is pasted and sends it for the giveaway", async () => {
    renderScreen();
    fireEvent.change(await screen.findByLabelText("Comments"), {
      target: { value: "username,text\nSara,@a @b done\nNoor,hi" },
    });
    expect(await screen.findByText(/2 readable, 0 lines skipped/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    await waitFor(() => expect(state.importComments).toHaveBeenCalledTimes(1));
    const [brand, id, rows] = state.importComments.mock.calls[0] as unknown as [
      string,
      string,
      Array<{ username: string; body: string }>,
    ];
    expect([brand, id]).toEqual(["b1", "g1"]);
    expect(rows.map((r) => [r.username, r.body])).toEqual([
      ["sara", "@a @b done"],
      ["noor", "hi"],
    ]);
    expect(await screen.findByText("Imported 2 comments.")).toBeTruthy();
  });

  it("keeps Import off until something readable is pasted", async () => {
    renderScreen();
    const button = await screen.findByRole("button", { name: "Import" });
    expect(button).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("Comments"), { target: { value: "!!! ???" } });
    expect(screen.getByRole("button", { name: "Import" })).toHaveProperty("disabled", true);
  });

  it("shows the function's own words when the import fails", async () => {
    state.importComments.mockRejectedValueOnce(
      new GiveawayApiError("bad_request", "Send at most 2000"),
    );
    renderScreen();
    fireEvent.change(await screen.findByLabelText("Comments"), { target: { value: "sara hi" } });
    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Send at most 2000");
  });
});

describe("the rules and the draw", () => {
  it("leaves out the store's own account and counts the rest", async () => {
    renderScreen();
    await screen.findByText("Eligible accounts");
    expect(stat("All comments")).toBe("4");
    expect(stat("Eligible accounts")).toBe("3");
    expect(screen.getByText("Excluded accounts")).toBeTruthy();
  });

  it("narrows the entries as the friends-to-tag minimum goes up", async () => {
    renderScreen();
    await screen.findByText("Eligible accounts");
    fireEvent.change(screen.getByLabelText("Friends to tag (minimum)"), { target: { value: "2" } });
    await waitFor(() => expect(stat("Eligible accounts")).toBe("1"));
    expect(screen.getByText("Too few friends mentioned")).toBeTruthy();
  });

  it("draws with a fresh seed and saves the picks for the places asked", async () => {
    renderScreen();
    fireEvent.click(await screen.findByRole("button", { name: "Draw winners" }));

    await waitFor(() => expect(state.saveDraw).toHaveBeenCalledTimes(1));
    const [brand, id, seed, rules, picks] = state.saveDraw.mock.calls[0] as unknown as [
      string,
      string,
      string,
      { winners: number; backups: number },
      Array<{ kind: string; entry: { username: string } }>,
    ];
    expect([brand, id]).toEqual(["b1", "g1"]);
    expect(seed).toMatch(/^[0-9a-f]{32}$/);
    // 1 winner + 2 backups from the 3 eligible accounts, the store's own left out.
    expect(rules.winners + rules.backups).toBe(3);
    expect(picks.map((p) => p.kind)).toEqual(["winner", "backup", "backup"]);
    expect(picks.map((p) => p.entry.username)).not.toContain("pura.line");
  });

  it("cannot draw before any comment is pulled", async () => {
    state.comments = [];
    renderScreen();
    const button = await screen.findByRole("button", { name: "Draw winners" });
    expect(button).toHaveProperty("disabled", true);
  });
});

describe("checking the winners", () => {
  beforeEach(() => {
    state.giveaway = giveaway({ status: "drawn", draw_seed: "abc123", rules: DEFAULT_RULES });
    state.winners = [winner(1), winner(2), winner(3)];
  });

  const cardOf = (name: string) => screen.getByText(`@${name}`).closest("li") as HTMLElement;

  it("lists the winner first and the backups after", async () => {
    renderScreen();
    await screen.findByText("@user1");
    expect(screen.getByRole("heading", { name: "Backups" })).toBeTruthy();
    expect(screen.getByText("@user2")).toBeTruthy();
    expect(screen.getByText(/Draw seed/).textContent).toContain("abc123");
  });

  it("confirms a win only after the follow is ticked", async () => {
    renderScreen();
    await screen.findByText("@user1");
    const confirm = within(cardOf("user1")).getByRole("button", { name: /Confirm win/ });
    expect(confirm).toHaveProperty("disabled", true);

    fireEvent.click(within(cardOf("user1")).getByRole("checkbox", { name: /Follows the account/ }));
    await waitFor(() =>
      expect(state.updateWinner).toHaveBeenCalledWith("b1", "w1", { follow_checked: true }),
    );
    await waitFor(() =>
      expect(within(cardOf("user1")).getByRole("button", { name: /Confirm win/ })).toHaveProperty(
        "disabled",
        false,
      ),
    );
    fireEvent.click(within(cardOf("user1")).getByRole("button", { name: /Confirm win/ }));
    await waitFor(() =>
      expect(state.updateWinner).toHaveBeenLastCalledWith("b1", "w1", { status: "confirmed" }),
    );
  });

  it("moves the first backup up when the winner is disqualified", async () => {
    renderScreen();
    await screen.findByText("@user1");
    fireEvent.click(within(cardOf("user1")).getByRole("button", { name: /Disqualify/ }));

    await waitFor(() =>
      expect(state.updateWinner).toHaveBeenCalledWith("b1", "w1", {
        status: "disqualified",
        follow_checked: false,
        like_checked: false,
      }),
    );
    // user2 now holds the winning place, so only user3 is left under "Backups".
    await waitFor(() => expect(screen.getByRole("heading", { name: "Disqualified" })).toBeTruthy());
    const backups = screen.getByRole("heading", { name: "Backups" })
      .nextElementSibling as HTMLElement;
    expect(within(backups).queryByText("@user2")).toBeNull();
    expect(within(backups).getByText("@user3")).toBeTruthy();
  });

  it("says when a winning place has no backup left", async () => {
    state.winners = [winner(1, { status: "disqualified" })];
    renderScreen();
    expect(await screen.findByText(/no backup is left/)).toBeTruthy();
  });
});
