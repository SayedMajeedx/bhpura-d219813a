# Moving every store to the new storefront (V1 → V2): the plan

Status: **done in code** (2026-10-30). The owner confirmed every store was on V2 and asked for
the classic engine to be removed. Nothing reads `storefront_design_version` any more, so a store
whose row says 1 (self-serve sign-up still starts there through the column's default) draws the
one storefront all the same; no migration was needed. Steps 1 and 5 below are therefore done by
the removal itself; the column can be dropped later, in an additive way.

## Why

Two storefront engines mean every design improvement is built twice or reaches half the stores.
The 2026-10-30 polish (calm cards, the fixed gallery, the cart opening on add, the description
drawn once) was built for the new look first; the classic look took only what it shares.

## Where the two differ (`storefront_design_version`, read by `storefrontEngine` in `src/lib/storefront-engine.ts`)

| Surface           | Classic (V1)                                                | New look (V2)                                                                                              |
| ----------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Header on a phone | Two rows: menu and an always-open search bar under the logo | One row: menu, logo, search icon (opens the search overlay), cart                                          |
| Hero              | `HeroBanner`'s band                                         | `HeroV2`: slides with live headlines, each slide's look, the live preview in settings                      |
| Product cards     | `ProductCard`                                               | `ProductCardV2`: quick add, colour dots, the second photo on a mouse's rest, card facts                    |
| Product page      | Description above the options                               | Details accordion (description, details, shipping & returns, size guide), bundle offer, "bought this week" |
| Category page     | Grid only                                                   | Filters in a sidebar (a sheet on phones) beside the grid                                                   |
| Home page         | Sections                                                    | Sections plus the brand story                                                                              |
| Settings          | Hero fields with a card preview                             | "Product card & page" group, hero live preview, each slide's look                                          |

**What V1 has that V2 lacks:** only the always-open search bar on a phone. Every other V1 surface
has a V2 counterpart that does more.

## What a store notices on the day it switches

- **The hero:** its slides keep their pictures and words; the headline becomes live text over a
  shade (45% by default, `hero_overlay_strength`). Check each slide's contrast note in settings.
- **Cards** show quick add and colour dots, and the second photo on a mouse's rest (each has its
  switch in "Product card & page"; all on by default).
- **The product page** puts the description in the accordion and may show the bundle offer.
- **The category page** gains filters (`category_filters_enabled`, on by default).
- **The home page** shows the brand story if `brand_story_enabled` (on by default) and the store
  wrote one (`brands.about_*`); its points show only when written.
- **The phone's header** loses the always-open search bar; search is the icon.

## Steps

1. **New stores start on V2.** Self-serve sign-up (`src/lib/onboarding.functions.ts`) never sets
   the version, so those stores start on V1 through the column's default
   (`storefront_design_version smallint NOT NULL DEFAULT 1`, migration `20260925100000`); only the
   super admin's wizard (`BrandWizardDialog`) starts stores on V2. One migration
   (`ALTER TABLE public.business_settings ALTER COLUMN storefront_design_version SET DEFAULT 2;`)
   or one line in the onboarding update fixes it without touching an existing store.
2. **Count who is on V1** (read-only):
   ```sql
   select bs.storefront_design_version, count(*), string_agg(b.slug, ', ' order by b.slug)
   from business_settings bs join brands b on b.id = bs.brand_id
   where b.is_active group by 1;
   ```
3. **Switch store by store**, with the merchant: open "The new storefront look" in Settings →
   Storefront (`StorefrontDesignUpgradeCard`, which already offers the switch), go through the
   checklist above on a phone and a laptop, and switch. A switch is reversible from the same card.
4. **If the phone's always-open search matters**, add it to V2's header as an option before the
   last V1 stores move, so no store loses something it used.
5. **When no active store is on V1 for a month**, remove the classic look: the V1 branches in
   `StorefrontHeader`, `product-card.tsx` (`ProductCard`), `HeroBanner`, `ProductGallery`,
   `$slug.index.tsx`, `$slug.$category.tsx`, `$slug.product.$id.tsx`
   (`descriptionAboveOptions` and the V2 checks), `StoreReadinessChecklist`, and the settings that
   show only on one engine (`HeroSlidesEditor`'s card preview, `DesignV2Group`'s gate,
   `home-page-sections.ts`). Keep the column until then; afterwards it can be dropped in an
   additive way (stop reading it first, drop it in a later migration).

## Risks

- A store that set its look up carefully on V1 (Pura's hero, for one) sees it re-laid out.
  Switch with the merchant, never in bulk.
- Step 5 touches about twelve files; each has tests that render both engines
  (`tests/storefront-engine-surfaces.test.tsx` among them), which then lose their V1 half.
