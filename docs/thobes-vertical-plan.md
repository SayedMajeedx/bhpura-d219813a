# Men's thobes, fabrics and shemaghs: a vertical under fashion

The owner's request of 2026-11-26: a store vertical for men's thobes (ready-made and tailored),
thobe fabrics and shemaghs / ghutras, to sign a prospective client. It is a child of `fashion`,
as `abayas` is. One phase is one pull request, in order. The owner applies each migration
(`npx supabase db push --linked` after a `--dry-run`) and the types are regenerated after it.

**Never guess a thobe or shemagh size, a measurement or how it is taken**: the owner decides
(questions at the end).

## The vertical

- id `thobes`, «ثياب رجالية وأقمشة» / "Men's Thobes & Fabrics", summary «ثياب جاهزة وتفصيل،
  أقمشة، غتر وأشمغة», parent `fashion`, active, modules `TAILORING`; starter pack
  `FASHION_PACK` (and `thobe-pack` once phase 2 builds it).
- Default categories (to confirm): ثياب جاهزة، ثياب تفصيل، أقمشة، غتر وأشمغة، إكسسوارات (عقال،
  طواقي، كبك).

## What already works through the fashion lineage (no change)

Made to order and its limits, send to workshop, job sheet, alterations, supplier orders, partner
shops, offers, gift cards (`verticalKind` is fashion), the content studio's "Made for You" craft
and Eid deadline, sizes and colours as variants, the product facts and vocabulary of fashion.

## Phase 1: the vertical itself (needs only the name and categories)

- `src/lib/verticals/registry.ts`: the definition, right after `abayas` (children follow their
  parent).
- `src/lib/store-profile.ts`: `STORE_VERTICALS`, `legacyBusinessTypeToVertical` (ثوب، ثياب،
  قماش، أقمشة، شماغ، غترة, thobe, kandura, fabric, shemagh, before the generic fashion match),
  `verticalToLegacyBusinessType`.
- `supabase/functions/user-management/provision-input.ts` `PROVISIONABLE_VERTICALS` (the owner
  deploys `user-management` after the merge).
- Every per-vertical table: `RAW_BRAND_TEMPLATES`, `VERTICAL_DESIGN_PRESETS` (portrait),
  `DEFAULT_VERTICAL_CATEGORIES`, `brand-story.ts`, `trust-badge-defaults.ts`, `featured-addons.ts`,
  the content studio's `template-order.ts`, `vertical-inventory.ts` (example text and colour
  placeholder; no size until phase 2), the icon.
- Migration: `'thobes'` in `business_settings_store_vertical_check`; the `offers_alterations`
  default takes the fashion family with thobes. Run in PGlite.
- Tests: the registry (`childVerticals("fashion")`), provisioning, the legacy mapping, the
  alterations migration's family list.

## Phase 2: `src/addons/thobe-pack/` (needs the owner's answers 2 to 5)

Modelled on `src/addons/abaya-pack/manifest.ts`: ready-thobe sizing presets, axis labels (مقاس
الثوب، اللون، القماش), workshop words, AI context, seeds (a thobe size guide as a chart, the
store's `fit_profiles` with a «ثوب رجالي» profile), tailoring choices as priced customization
options (نوع الياقة، كبك أو سادة، الجيوب، أزرار مخفية، القصّة). A `platform_addon_policies` row
for `thobe-pack` (default for `thobes`) in its own migration. Fix what assumes fashion means abayas
or women:

- `src/addons/fit-passport/lib/fit-passport.ts`: a store with no `fit_profiles` falls back to
  abaya and dress for every vertical (`resolveFitProfiles`), and «ثوب» is a keyword of the dress
  profile, so a man's thobe would ask bust and hips. The built-in profiles follow the lineage.
- `src/lib/addons/addon-presets.ts` `orderSizingPresetsForVertical` compares `fashion` /
  `abayas` by name: use the lineage.
- Thobe measurements (owner to confirm with a tailor): الطول، الكتف، الصدر، الوسط، الكم،
  الرقبة، فتحة الكم، عرض الأسفل; on the body or on a thobe laid flat. `MEASUREMENT_KEY_LABELS`
  names any new key.
- "The customer's own fabric" is a product of its own (خياطة ثوب بقماشك), no code.

## Phase 3: the thobe drawing in the size guide

`src/addons/size-guides/lib/flat-diagram.ts` and `GarmentMeasureDiagram` draw an abaya only. A
thobe template drawn with its measurements; the chart stays until it is ready. Needs the owner's
eye on the drawing.

## Phase 4: fabrics

Every quantity is a whole number (order lines, `stock_main`, the ledger, partner stock), so
decimal metres are out of scope. A sale unit per product (`piece` or `metre`, migration and column
grant), shown as «السعر للمتر» / «3 أمتار» on the card, product page, cart, checkout, invoice, job
sheet and feed. A fabric sold as a "thobe piece" in length variants (3.5 م / 4 م) already works.
Fabric facts in `src/lib/product-facts.ts` (composition, origin, mill or brand, season,
transparency, width, weight), origin and season filterable. Taking fabric from stock when a thobe
is tailored is a later phase.

## Phase 5: shemaghs and men's wording

- Shemagh / ghutra facts (material, size, brand, colour). Facts are one set per vertical: a
  product kind (ثوب / قماش / شماغ) so the editor shows that kind's facts.
- The content studio's `CAPTION_VOICES` (لكم / لش / لج): a masculine «لك».
- `src/lib/product-facts.ts` «مقاس العارضة»: the thobe set says «العارض».

## The owner's decisions

1. Name and categories as above? Kids' thobes too?
2. Ready-thobe size: length in inches like abayas, or length and width?
3. Tailoring measurements: which are required, on the body or flat?
4. Cuts (بحريني، سعودي، قطري، إماراتي، كويتي، عماني) as a tailoring choice?
5. The customer's own fabric as a separate product?
6. The shemagh sizes they sell.

## Status

- Phase 1: this pull request.
