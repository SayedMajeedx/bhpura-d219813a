import React from "react";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi } from "vitest";

/**
 * Renders the super admin's brands page (src/routes/_authenticated/admin.brands.tsx).
 * The test file mocks its modules with `brandsPageMocks` (see the tests using it):
 * vi.mock factories run before this helper's imports resolve, so each test file
 * registers the mocks itself and this module only builds the data.
 */

export const brandRow = (overrides: Record<string, unknown> = {}) => ({
  id: "brand-1",
  slug: "qoffee",
  name_en: "Qoffee",
  name_ar: "قهوة",
  logo_url: null,
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
  primary_color: null,
  about_ar: null,
  about_en: null,
  meta_title: null,
  meta_description: null,
  subscription_tier: null,
  subscription_status: "active",
  subscription_expires_at: "2027-01-01T00:00:00Z",
  payment_receipt_url: null,
  payment_receipt_uploaded_at: null,
  custom_domain: null,
  plan_type: "annual",
  trial_ends_at: null,
  renewal_intent: null,
  renewal_intent_recorded_at: null,
  support_access_enabled: true,
  ...overrides,
});

/** Module mocks for the page; pass `state.brands` to change the listed brands. */
export function brandsPageMocks(state: { brands: unknown[] }) {
  const fixture = (key: string, rows: () => unknown) => ({
    queryKey: ["brands-page-test", key],
    queryFn: async () => rows(),
  });
  return {
    router: {
      createFileRoute: () => (options: object) => ({ options }),
      Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
      redirect: vi.fn(),
      useNavigate: () => vi.fn(),
    },
    brands: async (importOriginal: () => Promise<object>) => {
      const actual = (await importOriginal()) as { brandQueries: object };
      return {
        ...actual,
        brandQueries: { ...actual.brandQueries, list: () => fixture("list", () => state.brands) },
        updateBrand: vi.fn(async () => undefined),
      };
    },
    superAdmin: async (importOriginal: () => Promise<object>) => {
      const actual = (await importOriginal()) as { superAdminQueries: object };
      return {
        ...actual,
        superAdminQueries: {
          ...actual.superAdminQueries,
          activePlans: () => fixture("plans", () => []),
          pendingSubscriptions: () => fixture("pending", () => []),
        },
        deleteBrand: vi.fn(async () => undefined),
      };
    },
    wizard: { BrandWizardDialog: () => null },
    whiteLabel: { WhiteLabelAppsPanel: () => null },
  };
}

export async function renderBrandsPage() {
  const { Route } = await import("../../src/routes/_authenticated/admin.brands");
  const { I18nProvider } = await import("../../src/lib/i18n");
  const Page = (Route as unknown as { options: { component: React.ComponentType } }).options
    .component;
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider>
        <Page />
      </I18nProvider>
    </QueryClientProvider>,
  );
}
