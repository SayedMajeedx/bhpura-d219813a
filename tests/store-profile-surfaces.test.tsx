import React from "react";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Where the store profile (vertical and modules) reaches the screens: the
// account page's Fit Passport tab, the paywall copy, and the two places that
// save it (the store profile card and the unified settings form).

const state = vi.hoisted(() => ({
  modules: { fit_passport: false } as Record<string, boolean>,
  saveBusinessSettings: vi.fn(async () => undefined),
  invalidateBusinessSettings: vi.fn(async () => undefined),
  updateBrand: vi.fn(async () => undefined),
  invalidateBrand: vi.fn(async () => undefined),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
const fixture = (key: string, value: unknown) => () => ({
  queryKey: ["store-profile-test", key],
  queryFn: async () => value,
});

// Storefront account page.
const storefront = {
  brand: { id: "b1", slug: "pura", name_en: "Pura", name_ar: "بورا" },
  session: { user: { id: "u1", email: "sara@example.com" } },
  isStoreMember: true,
  membershipLoading: false,
  t: (_ar: string, en: string) => en,
  lang: "en",
  currency: "BHD",
  settings: {},
  signOut: vi.fn(),
};
const storefrontModule = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  useStorefront: () => storefront,
  useStoreModules: () => state.modules,
});
vi.mock("../src/lib/storefront-context", (io) => storefrontModule(io));
vi.mock("@/lib/storefront-context", (io) => storefrontModule(io));
const customers = async (importOriginal: () => Promise<object>) => {
  const actual = (await importOriginal()) as { ownCustomerQueries: object };
  return {
    ...actual,
    ownCustomerQueries: {
      ...actual.ownCustomerQueries,
      profile: fixture("customer", { id: "c1", name: "Sara", phone: "39001122" }),
      orders: fixture("orders", []),
      addresses: fixture("addresses", []),
    },
  };
};
vi.mock("../src/lib/data/customers", (io) => customers(io));
vi.mock("@/lib/data/customers", (io) => customers(io));
const returns = async (importOriginal: () => Promise<object>) => {
  const actual = (await importOriginal()) as { returnsQueries: object };
  return {
    ...actual,
    returnsQueries: { ...actual.returnsQueries, customer: fixture("returns", []) },
  };
};
vi.mock("../src/lib/data/returns", (io) => returns(io));
vi.mock("@/lib/data/returns", (io) => returns(io));
const returnsFunctions = { getCustomerStoreCreditBalance: async () => 0 };
vi.mock("../src/lib/returns.functions", () => returnsFunctions);
vi.mock("@/lib/returns.functions", () => returnsFunctions);
const stub = (name: string) => ({ [name]: () => null });
vi.mock("@/components/loyalty/CustomerLoyaltySection", () => stub("CustomerLoyaltySection"));
vi.mock("@/components/passkey-settings", () => stub("PasskeySettings"));
vi.mock("@/components/storefront/CustomerReturnRequestModal", () =>
  stub("CustomerReturnRequestModal"),
);
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({ options }),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  Navigate: () => null,
  useNavigate: () => vi.fn(),
}));

// Admin settings.
const businessSettings = async (importOriginal: () => Promise<object>) => {
  const actual = (await importOriginal()) as { businessSettingsQueries: object };
  return {
    ...actual,
    businessSettingsQueries: {
      ...actual.businessSettingsQueries,
      detail: fixture("bs", { brand_id: "b1", store_vertical: "fashion", header_bg: "#fff" }),
    },
    saveBusinessSettings: state.saveBusinessSettings,
    invalidateBusinessSettings: state.invalidateBusinessSettings,
  };
};
vi.mock("../src/lib/data/business-settings", (io) => businessSettings(io));
vi.mock("@/lib/data/business-settings", (io) => businessSettings(io));
const brands = async (importOriginal: () => Promise<object>) => {
  const actual = (await importOriginal()) as { brandQueries: object };
  return {
    ...actual,
    brandQueries: {
      ...actual.brandQueries,
      profile: fixture("brand", { id: "b1", slug: "pura", name_en: "Pura" }),
    },
    updateBrand: state.updateBrand,
    invalidateBrand: state.invalidateBrand,
  };
};
vi.mock("../src/lib/data/brands", (io) => brands(io));
vi.mock("@/lib/data/brands", (io) => brands(io));
const storeProfile = {
  useAdminStoreProfile: () => ({
    profile: { vertical: "coffee", modules: {}, fitProfiles: [] },
    isLoading: false,
  }),
};
vi.mock("../src/hooks/use-store-profile", async (io) => ({
  ...(await io<object>()),
  ...storeProfile,
}));
vi.mock("@/hooks/use-store-profile", async (io) => ({ ...(await io<object>()), ...storeProfile }));
const brandAddons = {
  useBrandAddons: () => ({
    addons: [],
    installAddon: vi.fn(),
    disableAddon: vi.fn(),
    isMutating: false,
  }),
};
vi.mock("../src/hooks/use-brand-addons", () => brandAddons);
vi.mock("@/hooks/use-brand-addons", () => brandAddons);
const addonData = async (importOriginal: () => Promise<object>) => {
  const actual = (await importOriginal()) as { addonDataQueries: object };
  return {
    ...actual,
    addonDataQueries: { ...actual.addonDataQueries, fitPassportCount: fixture("passports", 0) },
  };
};
vi.mock("../src/lib/data/addons", (io) => addonData(io));
vi.mock("@/lib/data/addons", (io) => addonData(io));

const { Route: accountRoute } = (await import("../src/routes/$slug.account")) as unknown as {
  Route: { options: { component: React.ComponentType } };
};
const { TrialExpiredPaywall } = await import("../src/components/admin/TrialExpiredPaywall");
const { StoreProfileCard } = await import("../src/components/settings/StoreProfileCard");
const { useBrandSettingsForm } = await import("../src/features/settings/use-brand-settings-form");
const { I18nProvider } = await import("../src/lib/i18n");
const { queryKeys } = await import("../src/lib/query-keys");

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem("lang", "en");
});

const withProviders = (qc = new QueryClient()) =>
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={qc}>
        <I18nProvider>{children}</I18nProvider>
      </QueryClientProvider>
    );
  };

describe("the store profile on the screens", () => {
  it("shows the account page's Fit Passport tab only when the module is on", async () => {
    const Account = accountRoute.options.component;
    state.modules = { fit_passport: false };
    const off = render(<Account />, { wrapper: withProviders() });
    expect(await screen.findByRole("tab", { name: /Returns/ })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /My fit/ })).not.toBeInTheDocument();
    off.unmount();

    state.modules = { fit_passport: true };
    render(<Account />, { wrapper: withProviders() });
    expect(await screen.findByRole("tab", { name: /My fit/ })).toBeInTheDocument();
  });

  it("keeps the paywall copy free of fashion-only wording", () => {
    const { container } = render(
      <TrialExpiredPaywall
        brand={{ id: "b1", slug: "qoffee", name_en: "Qoffee", name_ar: null } as never}
        reason="trial_expired"
      />,
      { wrapper: withProviders() },
    );
    expect(container.textContent).not.toMatch(/fashion/i);
  });

  it("saves the store profile card through the settings data layer and refreshes its caches", async () => {
    const qc = new QueryClient();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    render(<StoreProfileCard brandId="b1" slug="pura" />, { wrapper: withProviders(qc) });
    fireEvent.click(await screen.findByRole("button", { name: /Save Changes/ }));
    await waitFor(() => expect(state.saveBusinessSettings).toHaveBeenCalledTimes(1));
    expect(state.saveBusinessSettings).toHaveBeenCalledWith(
      "b1",
      expect.objectContaining({ store_vertical: "coffee" }),
    );
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.brand.businessSettings("b1"),
      }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.brand.storeProfile("b1") });
  });

  it("saves only the changed settings from the unified form, then refreshes them", async () => {
    const { result } = renderHook(() => useBrandSettingsForm("b1"), {
      wrapper: withProviders(),
    });
    await waitFor(() => expect(result.current.form.bs.header_bg).toBe("#fff"));
    act(() => result.current.setBs("header_bg", "#000"));
    await act(async () => {
      await result.current.save();
    });
    expect(state.saveBusinessSettings).toHaveBeenCalledWith("b1", { header_bg: "#000" });
    expect(state.updateBrand).not.toHaveBeenCalled();
    expect(state.invalidateBusinessSettings).toHaveBeenCalledTimes(1);
  });
});
