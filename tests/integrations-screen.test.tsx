import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The merchant's integrations screen: when each key was last rotated, and a
// rotation that goes through save_integration_credential alone (the database
// writes the audit row, bug #27).

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
const data = vi.hoisted(() => ({
  credentials: [] as unknown[],
  saveIntegrationCredential: vi.fn(async () => "cred-1"),
}));
vi.mock("sonner", () => ({ toast }));
const integrations = async (importOriginal: () => Promise<object>) => {
  const actual = (await importOriginal()) as { integrationsQueries: object };
  return {
    ...actual,
    integrationsQueries: {
      ...actual.integrationsQueries,
      credentials: () => ({ queryKey: ["credentials"], queryFn: async () => data.credentials }),
      tracking: () => ({ queryKey: ["tracking"], queryFn: async () => null }),
    },
    saveIntegrationCredential: data.saveIntegrationCredential,
  };
};
vi.mock("../src/lib/data/integrations", (io) => integrations(io));
vi.mock("@/lib/data/integrations", (io) => integrations(io));
const brandContext = { useBrand: () => ({ id: "b1", slug: "pura" }) };
vi.mock("../src/lib/brand-context", () => brandContext);
vi.mock("@/lib/brand-context", () => brandContext);
const profile = {
  useProfile: () => ({ isAdmin: true, isSuperAdmin: false, isBrandAdmin: true }),
};
vi.mock("../src/lib/profile-context", () => profile);
vi.mock("@/lib/profile-context", () => profile);
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({ options }),
  redirect: vi.fn(),
}));

const { Route } = (await import("../src/routes/_authenticated/admin.b.$slug.integrations")) as {
  Route: unknown;
};
const { I18nProvider } = await import("../src/lib/i18n");
const IntegrationsPage = (Route as { options: { component: React.ComponentType } }).options
  .component;

const credential = (overrides: Record<string, unknown> = {}) => ({
  id: "cred-1",
  brand_id: "b1",
  provider: "tap",
  base_url: null,
  api_key_masked: "sk_live_••••4242",
  webhook_secret_masked: null,
  has_api_key: true,
  has_webhook_secret: false,
  is_active: true,
  notes: null,
  updated_at: "2026-09-20T10:00:00Z",
  last_rotated_at: "2026-09-20T10:00:00Z",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem("lang", "en");
});

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider>
        <IntegrationsPage />
      </I18nProvider>
    </QueryClientProvider>,
  );

describe("the integrations screen", () => {
  it("shows when each credential's keys were last rotated", async () => {
    data.credentials = [credential()];
    renderPage();
    const label = await screen.findByText("Last rotated:");
    const shown = new Date("2026-09-20T10:00:00Z").toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    expect(label.parentElement).toHaveTextContent(shown);
  });

  it("rotates a key through the secured save only", async () => {
    data.credentials = [credential()];
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Rotate key now/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByPlaceholderText("Enter new API key..."), {
      target: { value: "  sk_live_new  " },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Rotate & Activate" }));
    await waitFor(() => expect(data.saveIntegrationCredential).toHaveBeenCalledTimes(1));
    expect(data.saveIntegrationCredential).toHaveBeenCalledWith(
      "b1",
      expect.objectContaining({ id: "cred-1", provider: "tap", apiKey: "sk_live_new" }),
    );
    expect(toast.success).toHaveBeenCalledWith("Key successfully rotated and timestamp updated");
  });
});
