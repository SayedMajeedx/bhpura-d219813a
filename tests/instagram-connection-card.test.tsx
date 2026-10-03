import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The Instagram connection card with its data layer faked: the Connect button, and
// the message the page shows when Instagram sends the browser back.

const state = vi.hoisted(() => ({
  connection: null as Record<string, unknown> | null,
  startInstagramOAuth: vi.fn(),
  connectInstagram: vi.fn(),
  invalidateGiveaways: vi.fn(async () => undefined),
  goTo: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

class GiveawayApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
const giveawaysData = {
  giveawaysQueries: {
    connection: () => ({
      queryKey: ["ig-card-test", "connection"],
      queryFn: async () => state.connection,
    }),
  },
  GiveawayApiError,
  startInstagramOAuth: state.startInstagramOAuth,
  connectInstagram: state.connectInstagram,
  invalidateGiveaways: state.invalidateGiveaways,
};
vi.mock("../src/lib/data/giveaways", () => giveawaysData);
vi.mock("@/lib/data/giveaways", () => giveawaysData);
const brandContext = { useBrand: () => ({ id: "b1", slug: "pura", name_en: "Pura" }) };
vi.mock("../src/lib/brand-context", () => brandContext);
vi.mock("@/lib/brand-context", () => brandContext);
const navigate = { goTo: state.goTo };
vi.mock("../src/features/giveaways/lib/navigate", () => navigate);

const { InstagramConnectionCard } =
  await import("../src/features/giveaways/components/InstagramConnectionCard");
const { useInstagramConnection } =
  await import("../src/features/giveaways/hooks/use-instagram-connection");
const { I18nProvider } = await import("../src/lib/i18n");

function Card() {
  const conn = useInstagramConnection();
  return <InstagramConnectionCard conn={conn} />;
}

function renderCard(search = "") {
  window.history.replaceState(null, "", `/admin/b/pura/giveaways${search}`);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <I18nProvider>
        <Card />
      </I18nProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem("lang", "en");
  state.connection = null;
});

describe("connecting Instagram", () => {
  it("offers Connect, and sends the browser to Instagram's address", async () => {
    state.startInstagramOAuth.mockResolvedValue("https://www.instagram.com/oauth/authorize?x=1");
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "Connect with Instagram" }));

    await waitFor(() => expect(state.startInstagramOAuth).toHaveBeenCalledWith("b1"));
    await waitFor(() =>
      expect(state.goTo).toHaveBeenCalledWith("https://www.instagram.com/oauth/authorize?x=1"),
    );
  });

  it("keeps pasting a token as an advanced fallback", async () => {
    renderCard();
    expect(await screen.findByText(/Advanced: connect with a token by hand/)).toBeTruthy();
    expect(screen.getByLabelText("Instagram token")).toBeTruthy();
  });

  it("says why when the connection cannot be started", async () => {
    state.startInstagramOAuth.mockRejectedValue(new GiveawayApiError("forbidden", "Forbidden"));
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "Connect with Instagram" }));
    expect((await screen.findByRole("alert")).textContent).toContain("do not have permission");
    expect(state.goTo).not.toHaveBeenCalled();
  });

  it("shows which part failed when the server could not check access", async () => {
    state.startInstagramOAuth.mockRejectedValue(
      new GiveawayApiError("server_error", "check_failed: PGRST301"),
    );
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "Connect with Instagram" }));
    const text = (await screen.findByRole("alert")).textContent ?? "";
    expect(text).toContain("could not be connected");
    expect(text).toContain("(check_failed: PGRST301)");
    expect(text).not.toContain("do not have permission");
  });

  it("names the refusal when the database really said no", async () => {
    state.startInstagramOAuth.mockRejectedValue(new GiveawayApiError("forbidden", "no_permission"));
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "Connect with Instagram" }));
    const text = (await screen.findByRole("alert")).textContent ?? "";
    expect(text).toContain("do not have permission");
    expect(text).toContain("(no_permission)");
  });

  it("offers Reconnect once connected", async () => {
    state.connection = {
      is_connected: true,
      instagram_username: "puraline.bh",
      days_until_expiry: 59,
      refresh_error: null,
    };
    renderCard();
    expect(await screen.findByText("@puraline.bh")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reconnect" })).toBeTruthy();
  });
});

describe("when Instagram sends the browser back", () => {
  it("shows success, refreshes the connection and cleans the address", async () => {
    renderCard("?instagram=connected");
    expect(await screen.findByText("Instagram connected successfully.")).toBeTruthy();
    expect(state.invalidateGiveaways).toHaveBeenCalled();
    expect(window.location.search).toBe("");
  });

  it("explains a missing comment permission", async () => {
    renderCard("?instagram_error=missing_comments_permission");
    expect((await screen.findByRole("alert")).textContent).toContain(
      "comment-management permission was not granted",
    );
    expect(window.location.search).toBe("");
  });

  it("explains a refusal and a link that expired", async () => {
    const denied = renderCard("?instagram_error=denied");
    expect((await screen.findByRole("alert")).textContent).toContain("not approved");
    denied.unmount();

    renderCard("?instagram_error=invalid_state");
    expect((await screen.findByRole("alert")).textContent).toContain("expired");
  });

  it("shows Instagram's own words for a refused connection and cleans them from the address", async () => {
    renderCard(
      "?instagram_error=exchange_failed&instagram_detail=code%20exchange%3A%20HTTP%20400%20-%20Invalid%20client_secret",
    );
    const text = (await screen.findByRole("alert")).textContent ?? "";
    expect(text).toContain("refused to complete the connection");
    expect(text).toContain("(code exchange: HTTP 400 - Invalid client_secret)");
    expect(window.location.search).toBe("");
  });

  it("keeps other parts of the address", async () => {
    renderCard("?tab=x&instagram=connected");
    await screen.findByText("Instagram connected successfully.");
    expect(window.location.search).toBe("?tab=x");
  });
});
