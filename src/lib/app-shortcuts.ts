/**
 * The installed admin's shortcuts (a long press on its icon; `shortcuts` in
 * public/admin-app/manifest.webmanifest): one app serves every store, so each opens `/admin` with
 * where to go (`?go=`), and the redirector (`admin.index.tsx`) takes the person to that page of
 * their own store. Anything else is the dashboard; a courier only has deliveries. The pages' own
 * guard (`PAGE_ACCESS`) still decides who may open them.
 */

export const SHORTCUTS = ["orders", "new-order", "products", "customers"] as const;
export type Shortcut = (typeof SHORTCUTS)[number];

export function readShortcut(value: unknown): Shortcut | undefined {
  return SHORTCUTS.find((s) => s === value);
}

export type ShortcutTarget =
  | { to: "/admin/b/$slug/dashboard"; params: { slug: string } }
  | { to: "/admin/b/$slug/orders"; params: { slug: string } }
  | { to: "/admin/b/$slug/orders/$id"; params: { slug: string; id: "new" } }
  | { to: "/admin/b/$slug/inventory"; params: { slug: string } }
  | { to: "/admin/b/$slug/customers"; params: { slug: string } };

export function shortcutTarget(
  slug: string,
  go: Shortcut | undefined,
  courier: boolean,
): ShortcutTarget {
  if (courier) return { to: "/admin/b/$slug/orders", params: { slug } };
  switch (go) {
    case "orders":
      return { to: "/admin/b/$slug/orders", params: { slug } };
    case "new-order":
      return { to: "/admin/b/$slug/orders/$id", params: { slug, id: "new" } };
    case "products":
      return { to: "/admin/b/$slug/inventory", params: { slug } };
    case "customers":
      return { to: "/admin/b/$slug/customers", params: { slug } };
    default:
      return { to: "/admin/b/$slug/dashboard", params: { slug } };
  }
}
