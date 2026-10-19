/**
 * Who may open which page of a store's admin: one table, read by the route guard and checked
 * against the menu.
 *
 * Five pages each carried their own copy of this check (with small differences between them),
 * and the others had none: the menu hid a page a member of staff could not use, but its address
 * still opened it. The database's own rules decide what data comes back; this decides what a
 * person is shown.
 */

export type PageRule = {
  /** The permission a member of staff needs (an admin needs none). */
  permission?: string;
  /** For the store's admins only, whatever a member of staff was granted. */
  adminOnly?: boolean;
};

/** A page is the first part of the address after the store: `/admin/b/<store>/<page>/...`. */
export const PAGE_ACCESS: Record<string, PageRule> = {
  dashboard: {},

  orders: { permission: "manage_orders" },
  bookings: { permission: "manage_orders" },
  returns: { permission: "manage_orders" },
  campaigns: { permission: "manage_orders" },
  "abandoned-carts": { permission: "manage_orders" },

  customers: { permission: "manage_customers" },
  reviews: { permission: "manage_customers" },
  signups: { permission: "manage_customers" },
  outreach: { permission: "manage_customers" },

  inventory: { permission: "manage_inventory" },
  incubators: { permission: "manage_inventory" },
  categories: { permission: "manage_inventory" },
  "size-guides": { permission: "manage_inventory" },
  import: { permission: "manage_inventory" },
  export: { permission: "manage_inventory" },
  "content-studio": { permission: "manage_inventory" },

  // Money: the report functions themselves ask for this permission.
  reports: { permission: "view_financials" },
  expenses: { permission: "view_financials" },
  // A supplier's order holds its costs; receiving it also needs manage_inventory (checked by
  // the database, and the button is shown only to those who have it).
  "supplier-orders": { permission: "view_financials" },

  discounts: { permission: "manage_settings" },
  loyalty: { permission: "manage_settings" },
  giveaways: { permission: "manage_settings" },
  communications: { permission: "manage_settings" },
  pages: { permission: "manage_settings" },
  addons: { permission: "manage_settings" },
  settings: { permission: "manage_settings" },

  // Connections and people: the server functions behind them accept admins only.
  integrations: { adminOnly: true },
  team: { adminOnly: true },
};

const ADMIN_ROLES = new Set(["admin", "brand_admin", "super_admin"]);

/** The page an address under a store's admin belongs to, or null (the store's root, another area). */
export function pageOf(pathname: string, slug: string): string | null {
  const parts = pathname.split("?")[0].split("/").filter(Boolean);
  // admin / b / <slug> / <page> / ...
  if (parts[0] !== "admin" || parts[1] !== "b" || parts[2] !== slug) return null;
  return parts[3] ?? null;
}

export type PageCaller = {
  role?: string | null;
  status?: string | null;
  permissions?: readonly string[];
};

/**
 * Whether the caller may be shown the page. A page this table does not know is not held back
 * here (a test keeps every page of the admin in the table).
 */
export function mayOpenPage(page: string, caller: PageCaller): boolean {
  if (caller.status && caller.status !== "active") return false;
  const role = caller.role ?? "";
  if (ADMIN_ROLES.has(role)) return true;
  // A courier has one page: the deliveries assigned to them.
  if (role === "courier") return page === "orders";
  const rule = PAGE_ACCESS[page];
  if (!rule) return true;
  if (rule.adminOnly) return false;
  return !rule.permission || (caller.permissions ?? []).includes(rule.permission);
}

/** Where a caller who may not open a page is sent: a page they can always open. */
export function homePageOf(caller: PageCaller): "orders" | "dashboard" {
  return caller.role === "courier" ? "orders" : "dashboard";
}
