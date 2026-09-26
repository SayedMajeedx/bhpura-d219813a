import React from "react";
import { render, renderHook, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { brandsPageMocks, renderBrandsPage } from "./helpers/brands-page";
import { sidebarLayout } from "../src/lib/admin-workspace";

const page = vi.hoisted(() => ({ brands: [] as unknown[] }));
const auth = vi.hoisted(() => ({
  user: { id: "u1", email: "owner@example.com" } as { id: string; email: string } | null,
  profile: null as Record<string, unknown> | null,
  brandSlug: "own-brand" as string | null,
  exchangeRecoveryCode: vi.fn(async () => ({ data: { session: {} }, error: null })),
  verifyEmailToken: vi.fn(async () => ({ data: { session: {} }, error: null })),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), loading: vi.fn() } }));

const mocks = brandsPageMocks(page);
const router = {
  ...mocks.router,
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
  Outlet: () => null,
  redirect: (options: object) => options,
};
vi.mock("@tanstack/react-router", () => router);
const brandsData = async (importOriginal: () => Promise<object>) => ({
  ...(await mocks.brands(importOriginal)),
  fetchBrandSlug: async () => auth.brandSlug,
  fetchAnyBrandSlug: async () => null,
});
vi.mock("../src/lib/data/brands", (io) => brandsData(io));
vi.mock("@/lib/data/brands", (io) => brandsData(io));
vi.mock("../src/lib/data/super-admin", (io) => mocks.superAdmin(io));
vi.mock("@/lib/data/super-admin", (io) => mocks.superAdmin(io));
vi.mock("@/components/super-admin/brand-wizard/BrandWizardDialog", () => mocks.wizard);
vi.mock("@/components/super-admin/WhiteLabelAppsPanel", () => mocks.whiteLabel);
const impersonation = { startImpersonationSession: vi.fn() };
vi.mock("../src/lib/impersonation.functions", () => impersonation);
vi.mock("@/lib/impersonation.functions", () => impersonation);
const profiles = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  fetchCallerProfile: async () => auth.profile,
});
vi.mock("../src/lib/data/profiles", (io) => profiles(io));
vi.mock("@/lib/data/profiles", (io) => profiles(io));
const session = {
  getCurrentUser: async () => auth.user,
  getCurrentSession: async () => null,
  signOut: vi.fn(async () => undefined),
};
vi.mock("../src/lib/auth/session", () => session);
vi.mock("@/lib/auth/session", () => session);
const ensureSession = { ensureSessionUser: async () => auth.user };
vi.mock("../src/lib/auth/ensure-session-user", () => ensureSession);
vi.mock("@/lib/auth/ensure-session-user", () => ensureSession);
const signIn = {
  exchangeRecoveryCode: auth.exchangeRecoveryCode,
  verifyEmailToken: auth.verifyEmailToken,
  onAuthChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
  restoreSessionFromLink: vi.fn(),
  updatePassword: vi.fn(),
};
vi.mock("../src/lib/auth/sign-in", () => signIn);
vi.mock("@/lib/auth/sign-in", () => signIn);

const { OsBrandSwitcher } = await import("../src/components/os/os-brand-switcher");
const { I18nProvider, useT } = await import("../src/lib/i18n");
const { brandQueries } = await import("../src/lib/data/brands");
const { profilesQueries } = await import("../src/lib/data/profiles");

type Guarded = { options: { beforeLoad: (args: object) => Promise<unknown> } };
const guardOf = async (path: string) =>
  ((await import(path)) as { Route: Guarded }).Route.options.beforeLoad;
const outcome = async (run: Promise<unknown>) => {
  try {
    return { allowed: await run };
  } catch (thrown) {
    return { redirect: (thrown as { to?: string }).to };
  }
};

beforeEach(() => {
  localStorage.setItem("lang", "en");
  auth.user = { id: "u1", email: "owner@example.com" };
  auth.profile = null;
  document.cookie = "boutq_impersonation_token=; path=/; max-age=0";
});

describe("super-admin platform navigation", () => {
  const brands = [{ id: "b1", slug: "qoffee", name_en: "Qoffee", name_ar: null, is_active: true }];

  it("shows no tenant selector until a brand workspace is open", () => {
    const props = { brands, lang: "en" as const, pathname: "/admin/brands" };
    const platform = render(<OsBrandSwitcher activeSlug={null} {...props} />);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    platform.unmount();
    render(<OsBrandSwitcher activeSlug="qoffee" {...props} />);
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("links only to platform destinations, including brands, requests and settings", () => {
    render(
      <OsBrandSwitcher activeSlug={null} brands={brands} lang="en" pathname="/admin/brands" />,
    );
    const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href") ?? "");
    expect(hrefs).toEqual(
      expect.arrayContaining(["/admin/brands", "/admin/super/requests", "/admin/super/settings"]),
    );
    expect(
      hrefs.every((href) => href === "/admin/brands" || href.startsWith("/admin/super/")),
    ).toBe(true);
  });

  it("keeps the platform sidebar expanded and not collapsible", () => {
    expect(sidebarLayout({ isPlatformMode: true, expandedByUser: false })).toEqual({
      expanded: true,
      collapsible: false,
    });
    expect(sidebarLayout({ isPlatformMode: false, expandedByUser: false })).toEqual({
      expanded: false,
      collapsible: true,
    });
  });

  it("uses a clean non-technical dashboard title", async () => {
    await renderBrandsPage();
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Boutq Dashboard");
    expect(screen.queryByText(/SaaS Dashboard/)).not.toBeInTheDocument();
  });

  it("routes a super admin to tenant management on /admin, even with a brand", async () => {
    const beforeLoad = await guardOf("../src/routes/_authenticated/admin.index");
    auth.profile = { role: "super_admin", brand_id: "b1" };
    expect(await outcome(beforeLoad({}))).toEqual({ redirect: "/admin/brands" });
    auth.profile = { role: "brand_admin", brand_id: "b1" };
    expect(await outcome(beforeLoad({}))).toEqual({ redirect: "/admin/b/$slug/dashboard" });
  });

  it("requires support access and an impersonation token for a super admin in a tenant", async () => {
    const beforeLoad = await guardOf("../src/routes/_authenticated/admin.b.$slug.route");
    const brand = { id: "b1", slug: "qoffee", is_active: true, support_access_enabled: true };
    const load = () => {
      const data = new Map<string, unknown>([
        [JSON.stringify(brandQueries.adminBySlug("qoffee").queryKey), brand],
        [JSON.stringify(profilesQueries.caller("u1").queryKey), auth.profile],
        [JSON.stringify(brandQueries.iconsBySlug("qoffee").queryKey), null],
      ]);
      const queryClient = {
        ensureQueryData: async (options: { queryKey: unknown }) =>
          data.get(JSON.stringify(options.queryKey)),
      };
      return outcome(beforeLoad({ context: { queryClient }, params: { slug: "qoffee" } }));
    };

    auth.profile = { role: "super_admin", brand_id: null, status: "active" };
    expect(await load()).toEqual({ redirect: "/admin/brands" }); // no token
    const payload = btoa(JSON.stringify({ targetTenantId: "b1", issuedAt: Date.now() }));
    document.cookie = `boutq_impersonation_token=${payload}.signature; path=/`;
    expect(await load()).toMatchObject({ allowed: { brand: { id: "b1" } } });
    brand.support_access_enabled = false;
    expect(await load()).toEqual({ redirect: "/admin/brands" });

    // The brand's own team needs neither; outsiders go back to /admin.
    auth.profile = { role: "brand_admin", brand_id: "b1", status: "active" };
    expect(await load()).toMatchObject({ allowed: { brand: { id: "b1" } } });
    auth.profile = { role: "brand_admin", brand_id: "other", status: "active" };
    expect(await load()).toEqual({ redirect: "/admin" });
  });

  it("uses neutral phrasing for the Arabic password reset subtitle", () => {
    localStorage.setItem("lang", "ar");
    const { result } = renderHook(() => useT(), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <I18nProvider>{children}</I18nProvider>
      ),
    });
    expect(result.current("auth.resetSubtitle")).toBe("اختر كلمة مرور قوية لم تستخدمها من قبل.");
  });

  it("handles PKCE codes and OTP token hashes on the reset-password page", async () => {
    const { Route } = (await import("../src/routes/reset-password")) as unknown as {
      Route: { options: { component: React.ComponentType } };
    };
    const ResetPassword = Route.options.component;
    const show = () =>
      render(
        <I18nProvider>
          <ResetPassword />
        </I18nProvider>,
      );

    window.history.replaceState(null, "", "/reset-password?code=pkce-code");
    const pkce = show();
    await waitFor(() => expect(auth.exchangeRecoveryCode).toHaveBeenCalledWith("pkce-code"));
    pkce.unmount();

    window.history.replaceState(null, "", "/reset-password?token_hash=otp-hash&type=recovery");
    show();
    await waitFor(() => expect(auth.verifyEmailToken).toHaveBeenCalledWith("otp-hash", "recovery"));
    window.history.replaceState(null, "", "/");
  });
});
