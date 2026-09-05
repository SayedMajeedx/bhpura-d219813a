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
    profile: (brandId: string) => ["brand", brandId] as const,
    settings: (brandId: string) => ["brand", brandId, "settings"] as const,
    businessSettings: (brandId: string) => ["business_settings", brandId] as const,
  },

  // Orders
  orders: {
    all: (brandId: string) => ["orders", brandId] as const,
    list: (brandId: string, scope?: string) =>
      scope ? (["orders", brandId, scope] as const) : (["orders", brandId] as const),
    detail: (brandId: string, orderId: string) => ["orders", brandId, orderId] as const,
    items: (brandId: string, orderId: string) => ["orders", brandId, orderId, "items"] as const,
    activities: (brandId: string, orderId?: string) =>
      orderId
        ? (["orders", brandId, orderId, "activities"] as const)
        : (["orders", brandId, "activities"] as const),
  },

  // Customers
  customers: {
    all: (brandId: string) => ["customers", brandId] as const,
    detail: (brandId: string, customerId: string) => ["customers", brandId, customerId] as const,
  },

  // Couriers
  couriers: {
    all: (brandId: string) => ["couriers", brandId] as const,
    detail: (brandId: string, courierId: string) => ["couriers", brandId, courierId] as const,
  },
} as const;
