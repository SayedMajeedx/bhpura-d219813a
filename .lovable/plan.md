# Storefront Theme Customizer, Categories, and Contrast Fixes

## 1. Auto-provision storefronts on brand creation

- Add a Postgres trigger `AFTER INSERT ON public.brands` that inserts a `business_settings` row for the new brand with sensible defaults (currency `BHD`, `cod_enabled = true`, `delivery_enabled = true`, `pickup_enabled = true`, `primary_color`, `text_color`, `background_color`, `font_family`, business_name defaulted to `name_en`, `user_id = created_by`).
- Because the route `/store/:slug` reads `brands` + `business_settings`, this makes the storefront live the instant a brand is created — no manual init.
- Backfill: run one-time UPSERT to ensure every existing active brand has a `business_settings` row.

## 2. Storefront Appearance Customizer

Extend `business_settings` with theme columns (all nullable, safe defaults):

```
logo_size int default 48
logo_align text default 'left'   -- left|center|right
header_bg text                    -- hex/oklch
header_fg text
footer_bg text
footer_fg text
heading_color text
link_color text
btn_primary_bg text
btn_primary_fg text
btn_secondary_bg text
btn_secondary_fg text
```

Update `brand_public_settings` view to expose these columns to anon.

New UI: **"مظهر المتجر / Storefront Customizer"** card in `b.$slug.settings.tsx` (or new tab). Sections:
- Logo (existing uploader + size slider + alignment radio)
- Header colors (bg + fg color pickers)
- Footer colors (bg + fg)
- Typography (text color = existing, heading color, link color)
- Buttons (primary bg/fg, secondary bg/fg)

Uses existing color-input pattern + saves via existing settings mutation. Real-time via existing settings realtime hook.

## 3. Dynamic Categories (full CRUD)

New table `public.categories`:
```
id uuid pk, brand_id uuid not null, name_ar text, name_en text not null,
slug text, image_url text, sort_order int default 0,
is_active boolean default true, created_at, updated_at
```
With brand-scoped RLS (admins manage, anon SELECT active rows), GRANTs, and unique(brand_id, slug).

New route `src/routes/_authenticated/b.$slug.categories.tsx`:
- Table/grid of categories with drag-free sort (up/down or number input).
- Create/Edit dialog: name_ar, name_en, image upload (invoice-assets bucket + public URL), sort_order.
- Delete: RPC `delete_category(p_id)` that counts linked products (via `products.category` matching name_en or slug) and returns count for confirmation; performs soft delete (`is_active=false`) if any linked, hard delete otherwise.

Product form: `products.category` remains a text column. Replace hardcoded `<Input>`/select with a `<Select>` fetching `categories` for the current brand, storing the category slug in `products.category`.

Sidebar nav: add "الأقسام / Categories" link in `app-shell.tsx` under brand routes.

## 4. Storefront: dynamic categories on `/store/:slug`

- Add a horizontal category strip (chips with image thumbnail) under the hero on `store.$slug.index.tsx`.
- Client-side filter: clicking a chip sets a category filter state and the product grid filters by `products.category`.
- Query categories via anon SELECT (RLS + GRANT).

## 5. PC contrast & visibility fixes

In `store.$slug.route.tsx` header + `store.$slug.index.tsx` + `store.$slug.product.$id.tsx`:
- Header: replace `text-white` on the outer bar with `text-[var(--sf-header-fg)]` with fallback to `--sf-fg` (dark). Same for cart/language/email links.
- Buy Now button: force a dark contrasting background (`--sf-btn-secondary-bg` fallback to `#111`) with light foreground; add border for safety.
- Stock availability chip: use `bg-secondary text-secondary-foreground` (semantic) with border, so it contrasts on any brand palette.

Inject brand theme as CSS variables on the storefront root (in `store.$slug.route.tsx`):
```
:root of storefront -->
  --sf-header-bg, --sf-header-fg,
  --sf-footer-bg, --sf-footer-fg,
  --sf-heading, --sf-link,
  --sf-btn-primary-bg, --sf-btn-primary-fg,
  --sf-btn-secondary-bg, --sf-btn-secondary-fg
```
All storefront components consume these with hard-coded fallbacks; nothing else in the admin app is affected.

## Migration summary

1. `ALTER TABLE business_settings ADD COLUMN ...` (theme cols).
2. `CREATE TRIGGER brands_after_insert_default_settings ...` + backfill.
3. `CREATE TABLE public.categories` + GRANTs + RLS + policies + trigger for updated_at.
4. `CREATE FUNCTION delete_category(...)`.
5. Recreate `brand_public_settings` view to include new theme cols.

## Files to add/edit

- Migration file (new).
- `src/routes/_authenticated/b.$slug.categories.tsx` (new).
- `src/routes/_authenticated/b.$slug.settings.tsx` — add Customizer card.
- `src/routes/_authenticated/b.$slug.inventory.tsx` (product form) — swap category input for dynamic Select.
- `src/components/app-shell.tsx` — nav link.
- `src/lib/storefront-context.tsx` — extend PublicSettings + expose theme vars.
- `src/routes/store.$slug.route.tsx` — inject CSS vars, fix header contrast.
- `src/routes/store.$slug.index.tsx` — category strip + filter.
- `src/routes/store.$slug.product.$id.tsx` — fix Buy Now + stock chip.

## Out of scope

- Full drag-and-drop reorder (using sort_order number input instead).
- Live preview split-pane (values apply after save, storefront realtime picks up).
- Public storage bucket creation (reusing existing `invoice-assets` + signed/public URLs already used by media uploads).
