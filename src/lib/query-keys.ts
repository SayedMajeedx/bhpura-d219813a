import { brandKeys } from "@/lib/data/brands";
import { businessSettingsKeys } from "@/lib/data/business-settings";
import { catalogKeys } from "@/lib/data/catalog";
import { categoriesKeys } from "@/lib/data/categories";
import { customersKeys } from "@/lib/data/customers/keys";
import { expensesKeys } from "@/lib/data/expenses";
import { ordersKeys } from "@/lib/data/orders/keys";

/**
 * Centralized React Query Key Factory for Boutq OS
 *
 * Enforces explicit brand scoping (multi-tenant safety) across cache keys
 * as required by `.agents/skills/data-access-consistency/SKILL.md` and `multi-tenant-security`.
 */

export const queryKeys = {
  // Brand Profile & Core Settings
  brand: {
    all: ["brand"] as const,
    profile: brandKeys.profile,
    settings: (brandId: string) => ["brand", brandId, "settings"] as const,
    businessSettings: businessSettingsKeys.detail,
    storeProfile: businessSettingsKeys.storeProfile,
  },

  // Orders: lists and details live in `@/lib/data/orders` (`ordersKeys`).
  orders: {
    all: ordersKeys.all,
  },

  // Customers
  customers: {
    all: customersKeys.all,
  },

  // Couriers
  couriers: {
    all: (brandId: string) => ["couriers", brandId] as const,
    detail: (brandId: string, courierId: string) => ["couriers", brandId, courierId] as const,
  },

  // Products & Catalog
  products: {
    all: catalogKeys.products,
  },

  // Categories & Catalog Hierarchy
  categories: {
    all: categoriesKeys.all,
    overview: categoriesKeys.overview,
  },

  // Variants & Options
  variants: {
    all: catalogKeys.variants,
  },

  // Customizations
  customizations: {
    all: (brandId: string) => ["customizations", brandId] as const,
  },

  // Expenses
  expenses: {
    all: expensesKeys.all,
  },

  // Team & Staff
  staff: {
    all: (brandId: string) => ["staff", brandId] as const,
    list: (brandId: string, isSuperAdmin?: boolean) =>
      ["staff", brandId, Boolean(isSuperAdmin)] as const,
  },

  // Message & Campaign Templates
  templates: {
    message: (brandId: string) => ["message-templates", brandId] as const,
    campaign: (brandId: string) => ["campaign-templates", brandId] as const,
  },

  // Storefront
  storefront: {
    all: (slug: string) => ["storefront", slug] as const,
  },

  // Addons Platform
  addons: {
    all: (brandId: string) => ["addons", brandId] as const,
    events: (brandId: string) => ["addons", "events", brandId] as const,
    policies: () => ["addons", "policies"] as const,
  },
} as const;
