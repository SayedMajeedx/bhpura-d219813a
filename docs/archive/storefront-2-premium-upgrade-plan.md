# Handoff Prompt — Boutq OS: Storefront 2.0 (Premium Upgrade of the auto-generated storefront)

Copy everything below the line into a new AI-assistant session opened at the repository root.

**Prerequisite:** `docs/settings-and-brand-wizard-refinement-plan.md` (PR #1–#4) must be merged first. This plan reuses its settings registry, brand templates, and palette pipeline. Do not start this work before those PRs are on `main`.

---

You are a senior web agency team (art director + senior frontend engineer + CRO specialist + SEO/a11y/performance engineer) working in the repository **`SayedMajeedx/bhpura-d219813a`** (Boutq OS — multi-tenant SaaS e-commerce OS for GCC boutiques; TanStack Start + React 19 + Supabase + Cloudflare Workers/R2). Work directly in this checkout.

**Your mission:** execute this document as **three sequential PRs** (§3 Layer 1, §4 Layer 2, §5 Layer 3). It is written in **Arabic** with English code. Read it in full first. It is the single source of truth for scope, files, line anchors, tests and Definition of Done.

**Why this work exists:** the storefront engine (`src/routes/$slug.*.tsx`, `src/components/storefront/*`) is feature-rich but the _default_ result — as seen on the live reference brand **PURA LINE** (`https://boutq.store/pura`) — does not yet pass the agency test: "would a paying client immediately feel they received premium work?". The audit in §0 lists what a real visitor sees. The upgrade must improve **every** brand automatically (it is an engine upgrade, not a Pura-only theme), be driven by the existing settings/brand-template system, and keep all commerce logic intact.

## Ground truth as of 2026-09-19 (verified at commit `9ec0613e`; re-check anchors before relying on them)

- Storefront routes (lines): `$slug.route.tsx` 1,081 · `$slug.index.tsx` 1,275 · `$slug.product.$id.tsx` 2,509 · `$slug.checkout.tsx` 2,778 · `$slug.$category.tsx` 648 · `$slug.account.tsx` 1,560. Components: `src/components/storefront/{StorefrontHeader,StorefrontNavigation,StorefrontCartDrawer,product-card,product-grid,secondary-banner-parallax,ProductShareModal,ShareCartModal}.tsx` (3,179 lines total). Media: `src/components/responsive-media.tsx` (`ResponsiveImage`, `OptimizedVideo`), `src/lib/media-delivery.ts`. Typography engine: `src/lib/typography.ts` (`TypographyConfig` with `display`/`body` per language, `typographyVariables`, `customFontFaces`). Trust badges: `resolveStorefrontTrustBadges` in `src/lib/trust-badges.ts` (rendered only in the footer, `$slug.route.tsx:711`). WhatsApp FAB: `$slug.route.tsx:592`.
- Theme CSS variables are emitted in `$slug.route.tsx:452-520` (`--sf-*`). Do not change their names; add new ones only.
- Existing Playwright audits: `tests/desktop-audit.spec.ts`, `tests/mobile-ux-audit.spec.ts`, `tests/navigation-perf.spec.ts`, `tests/storefront-performance-guardrails.test.ts` (unit guard). Extend them; do not weaken thresholds.
- Baseline test/typecheck status: see the Baseline note in `docs/settings-and-brand-wizard-refinement-plan.md` (re-measure on your starting commit).

## Rules of engagement

1. **Engine upgrade, not a Pura theme.** Every change must be driven by `business_settings` / `brands` / brand templates so all tenants benefit; Pura is only the reference for visual QA.
2. **No commerce-logic changes** (cart, checkout, stock, pricing, tailoring, catalog mode) except the explicit items in this plan (out-of-stock "notify me").
3. **Keep every current storefront setting working.** New behaviour ships **on by default for new brands** (via `src/lib/brand-templates/`) and **on for existing brands only when it cannot regress them** (poster fallback, JSON-LD, alt text, a11y). Visual restyles that could surprise an existing merchant (typography pair, footer layout, header layout) ship behind a per-brand setting `storefront_design_version` (`1` = current, `2` = new) with the super admin able to flip it per brand and a one-click "upgrade to the new look" card in the brand's Settings → Storefront. Pura is flipped to `2` after visual QA.
4. **Performance budget (mobile, 4G, Lighthouse mobile preset):** LCP ≤ 2.5 s, CLS ≤ 0.05, TBT ≤ 200 ms, total JS on the home route not larger than today (+0 KB gzipped for Layer 1; ≤ +25 KB for Layers 2–3 combined). No new runtime dependencies for animation (use CSS + `IntersectionObserver`).
5. **Accessibility:** WCAG 2.2 AA — visible focus, keyboard-operable carousels/filters/accordions, `prefers-reduced-motion` respected everywhere, contrast ≥ 4.5:1 for text (use the palette helpers from `src/lib/logo-palette.ts`).
6. **Bilingual + RTL first.** Every string ar/en; every layout verified in `dir="rtl"` and `ltr`.
7. **Do not grow the big route files.** New UI = new component files under `src/components/storefront/` (or `src/features/storefront/`), each ≤ 400 lines.
8. Mirror repo conventions: `useI18n`, `queryKeys`, `ResponsiveImage`, `createServerFn`, prettier config, migrations append-only with prefix later than the newest file.
9. **Load these repo skills before starting** (they are the working rules for this plan): `.agents/rules/AGENTS.md`, `.agents/skills/handoff-plan-execution/SKILL.md`, `.agents/skills/storefront-premium-design-system/SKILL.md`, `.agents/skills/storefront-seo-performance-a11y/SKILL.md`, `.agents/skills/settings-registry-single-source/SKILL.md` (for the new columns), `.agents/skills/brand-provisioning-and-palette/SKILL.md` (for template defaults), plus the existing `rtl-arabic-consistency`, `refactor-safety`, `migration-hygiene`, `test-quality-gate`, `multi-tenant-security`.
10. Before each PR: `npm run check`, `npm run db:migrations:check`, Playwright audits, and a Lighthouse run on `/pura` (mobile) with the numbers pasted in the PR description.

---

# خطة ترقية الستور فرونت — Storefront 2.0

> اللغة: عربي للشرح، إنجليزي للكود. المرجع البصري: متجر بيورا `https://boutq.store/pura`. كل مرجع `file:line` تم التحقق منه عند `9ec0613e`.

## §0 — جدول التدقيق (ما يراه الزائر اليوم)

تم الفحص على الجوال (375px) والتابلت (768px) وقراءة الـ DOM والكود.

### 0.1 حرجة — أول انطباع والتحويل

| #   | المشكلة                                                                                                                                              | الدليل                                                                                                                     | البند المعالج |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------- |
| C1  | **الهيرو يظهر كمستطيل عنابي فارغ** عندما لا يعمل الفيديو تلقائياً (iOS توفير الطاقة، Data Saver، متصفحات إنستغرام/سناب داخل التطبيق). لا يوجد poster | DOM: `video.paused=true, poster=""`؛ حقل `media_poster_url_*` موجود في `$slug.index.tsx:730-732` لكنه يدوي وفارغ عند بيورا | L1-1          |
| C2  | **عنوان الهيرو H1 بحجم 16–20px وبلون داكن فوق فيديو داكن** — غير مقروء                                                                               | `$slug.index.tsx:794-803` (`clamp(16px…20px)`)، DOM: `color:#330a0a`                                                       | L1-1          |
| C3  | **لا عنصر ثقة في الصفحة الرئيسية**: شارات الثقة تُعرض في الفوتر فقط، لا طرق دفع، لا تقييمات، لا وعد توصيل                                            | `resolveStorefrontTrustBadges` يُستدعى فقط في الفوتر `$slug.route.tsx:711`؛ DOM الرئيسية: `hasTrustBadges:false`           | L1-3          |
| C4  | **خط واحد (Readex Pro) للعناوين والنصوص** — لا تباين طباعي فيبدو الموقع "قالباً"                                                                     | DOM `fonts:["Readex Pro"]`؛ `TypographyConfig.display` موجود في `src/lib/typography.ts:54` لكن غير مفعّل                   | L1-2          |
| C5  | **منتج بمخزون 0 يعرض "0 متوفر"** مع زر الشراء (معطّل) وبدون بديل — لا "نبّهني عند التوفر"                                                            | نص الصفحة `0 متوفر … أضف للسلة`؛ `selectedVariantOutOfStock` `$slug.product.$id.tsx:1009`                                  | L1-4          |

### 0.2 مهمة — الجودة والاحترافية

| #   | المشكلة                                                                             | الدليل                                                | البند |
| --- | ----------------------------------------------------------------------------------- | ----------------------------------------------------- | ----- |
| Q1  | زر واتساب العائم يغطي أزرار المفضلة/المشاركة في صفحة المنتج على الجوال              | لقطة الجوال؛ `WhatsAppFab` `$slug.route.tsx:592-640`  | L1-5  |
| Q2  | الترويسة على الجوال صفّان (~250px) قبل أي محتوى                                     | `StorefrontHeader.tsx:207-215`                        | L1-6  |
| Q3  | لا Structured Data (JSON-LD) في أي صفحة                                             | DOM `ld:0`؛ لا `application/ld+json` في `src/routes/` | L1-7  |
| Q4  | `og:image` = الشعار SVG؛ مشاركة الرابط في واتساب تعطي معاينة فقيرة                  | DOM meta؛ `$slug.route.tsx:397`                       | L1-7  |
| Q5  | الفوتر: 3 روابط + حقوق فقط. لا نبذة، لا تواصل، لا سوشال بارز، لا طرق دفع، لا اشتراك | `$slug.route.tsx:768-830`                             | L2-10 |
| Q6  | بطاقة المنتج: لا صورة ثانية عند الـ hover، لا نقاط ألوان، لا إضافة سريعة            | `product-card.tsx:80-160`                             | L2-9  |
| Q7  | 4 صور بلا `alt` + ثامبنيل فارغ في معرض المنتج                                       | DOM `imgsNoAlt:4`؛ لقطة PDP                           | L1-8  |
| Q8  | تسمية "اللون:" تظهر بدون قيمة قبل الاختيار                                          | نص PDP                                                | L1-8  |
| Q9  | لا صفحة/قسم "قصتنا" رغم وجود `brands.about_ar/en`                                   | القائمة والفوتر                                       | L2-14 |
| Q10 | صفحة القسم: ترتيب فقط، بلا فلاتر (مقاس/لون/سعر/متوفر)                               | `$slug.$category.tsx:105`                             | L2-11 |

### 0.3 تحسينات

| #   | الملاحظة                                                                           | البند |
| --- | ---------------------------------------------------------------------------------- | ----- |
| I1  | لا "شوهد مؤخراً"، لا social proof من بيانات الطلبات الحقيقية                       | L2-13 |
| I2  | لا Quick View من الشبكة                                                            | L3-18 |
| I3  | لا `theme-color` بلون العلامة، لا `manifest.json` (PWA) رغم وجود تطبيق White-Label | L1-8  |
| I4  | الصفحة ثابتة تماماً عند التمرير — لا scroll-reveal ولا انتقالات                    | L3-15 |
| I5  | تجربة واحدة لكل الأنشطة (عبايات = قهوة = إلكترونيات)                               | L3-17 |

---

## §1 — نظام التصميم لـ Storefront 2.0

### 1.1 الطباعة (Typography pairs)

تُطبَّق عبر `storefront_typography.display/body` الموجود. تُضاف إلى `FONT_MOOD_PRESETS` (`src/components/settings/QuickThemeCustomizer.tsx:18`) خاصية `display` لكل نمط، وإلى `src/lib/typography.ts` `FONT_LIBRARY` الخطوط الناقصة:

| النمط       | Display (ar / en)                | Body (ar / en)       | الأنشطة الافتراضية                         |
| ----------- | -------------------------------- | -------------------- | ------------------------------------------ |
| `classic`   | Amiri / Playfair Display         | Readex Pro / Inter   | abayas, jewelry                            |
| `signature` | Aref Ruqaa / Cormorant Garamond  | Tajawal / Inter      | fashion, beauty                            |
| `modern`    | Cairo (700) / Inter (700, tight) | Cairo / Inter        | electronics, digital, home, general, print |
| `strong`    | Almarai (800) / Montserrat (800) | Almarai / Montserrat | coffee                                     |
| `bubble`    | Changa (700) / Poppins (700)     | Changa / Poppins     | food, gifts                                |

مقياس الأحجام (CSS vars جديدة، تُضاف بجانب `--sf-*` الحالية): `--sf-text-xs .75rem, --sf-text-sm .875rem, --sf-text-base 1rem, --sf-text-lg 1.125rem, --sf-h3 clamp(1.25rem,1.1rem+.6vw,1.5rem), --sf-h2 clamp(1.75rem,1.4rem+1.4vw,2.5rem), --sf-h1 clamp(2rem,1.5rem+2.5vw,3.75rem)`. `letter-spacing` للعناوين اللاتينية `-0.01em`، للعربية `0`.

### 1.2 المسافات والإيقاع

مقياس 4px. أقسام الصفحة الرئيسية: `py-12 sm:py-16 lg:py-20`. فجوة الشبكة: `gap-4 sm:gap-6 lg:gap-8`. عرض المحتوى `max-w-7xl` كما هو. **قاعدة:** كل قسم له عنوان + سطر فرعي اختياري + رابط "عرض الكل" في نفس السطر (يمين في RTL).

### 1.3 الزوايا والظلال والحدود

`storefront_radius` يبقى مصدر الحقيقة. الظلال: بطاقات بلا ظل افتراضياً؛ `shadow-sm` عند الـ hover فقط؛ الأزرار الأساسية `shadow-[0_1px_2px_rgba(0,0,0,.08)]`. لا glassmorphism إلا في الترويسة عند `header_glass=true` (موجود).

### 1.4 نظام الحركة

- `IntersectionObserver` واحد مشترك (`src/components/storefront/motion/useReveal.ts`)، class `sf-reveal` (opacity 0 → 1, translateY 12px → 0, 500ms, `cubic-bezier(.16,1,.3,1)`), مرة واحدة، `threshold .15`.
- `@media (prefers-reduced-motion: reduce)` يلغي كل الحركة.
- لا مكتبات (لا framer-motion، لا GSAP).

### 1.5 مكوّنات جديدة (كلها تحت `src/components/storefront/`)

`HeroV2.tsx`, `TrustBar.tsx`, `ProductCardV2.tsx`, `ColorDots.tsx`, `QuickAddPopover.tsx`, `FooterV2.tsx`, `NewsletterForm.tsx`, `BrandStorySection.tsx`, `CategoryFilters.tsx` (+ `CategoryFiltersSheet.tsx`), `ProductAccordion.tsx`, `ImageZoom.tsx`, `BundleOffer.tsx`, `RecentlyViewed.tsx`, `NotifyMeForm.tsx`, `QuickViewModal.tsx`, `motion/useReveal.ts`, `seo/JsonLd.tsx`.

---

## §2 — الأعمدة والإعدادات الجديدة (migration واحدة لكل الطبقات)

`supabase/migrations/2026XXXX_storefront_v2.sql` (اختر بادئة أحدث من آخر ملف):

```sql
ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS storefront_design_version smallint NOT NULL DEFAULT 1,   -- 1 current, 2 new look
  ADD COLUMN IF NOT EXISTS trust_bar_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS trust_bar_position text NOT NULL DEFAULT 'below_hero',  -- below_hero | above_footer | both
  ADD COLUMN IF NOT EXISTS hero_overlay_strength smallint NOT NULL DEFAULT 45,      -- 0..80 (%)
  ADD COLUMN IF NOT EXISTS hero_title_color_v2 text,                                  -- null = auto (readable on overlay)
  ADD COLUMN IF NOT EXISTS product_card_hover_image boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS product_card_color_dots boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS product_card_quick_add boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS new_badge_days smallint NOT NULL DEFAULT 14,
  ADD COLUMN IF NOT EXISTS footer_layout text NOT NULL DEFAULT 'minimal',           -- minimal (current) | columns
  ADD COLUMN IF NOT EXISTS footer_show_payment_methods boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS newsletter_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS newsletter_title_ar text, ADD COLUMN IF NOT EXISTS newsletter_title_en text,
  ADD COLUMN IF NOT EXISTS brand_story_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS brand_story_image_url text,
  ADD COLUMN IF NOT EXISTS category_filters_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pdp_layout text NOT NULL DEFAULT 'accordion',            -- accordion | flat (current)
  ADD COLUMN IF NOT EXISTS pdp_image_zoom boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS social_proof_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS recently_viewed_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS motion_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS quick_view_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS back_in_stock_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS fabric_care_ar text, ADD COLUMN IF NOT EXISTS fabric_care_en text,
  ADD COLUMN IF NOT EXISTS shipping_returns_ar text, ADD COLUMN IF NOT EXISTS shipping_returns_en text;

CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('whatsapp','email')),
  contact text NOT NULL, lang text NOT NULL DEFAULT 'ar',
  source text NOT NULL DEFAULT 'footer', created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, channel, contact)
);
CREATE TABLE IF NOT EXISTS public.back_in_stock_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  product_id uuid NOT NULL, variant_id uuid,
  channel text NOT NULL CHECK (channel IN ('whatsapp','email')), contact text NOT NULL,
  lang text NOT NULL DEFAULT 'ar', notified_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
-- RLS: anon INSERT only (with brand_id present), brand staff SELECT/UPDATE via existing brand-membership helper functions
-- (mirror the policies used by product_reviews / abandoned carts). Rate-limit inserts in the server function, not in SQL.
-- Append the new columns to brand_public_settings (copy the view from the newest migration that redefines it, append-only).
```

كل عمود جديد يُسجَّل في `src/features/settings/registry.ts` (التبويب `storefront`، المجموعات المناسبة، المستوى `basic` للمفاتيح الرئيسية و`advanced` للتفاصيل)، ويُضاف لقوالب النشاط `src/lib/brand-templates/` بقيمه الافتراضية.

---

## §3 — الطبقة 1: الإصلاحات الأساسية (PR #A) — تُفعَّل لكل البراندات فوراً حيث لا يمكن أن تسبب انحداراً

### L1-1 الهيرو (C1, C2)

- **Poster تلقائي**: في محرّر الشرائح (`HeroSlidesEditor`, بعد P2 في `storefront/HomeHeroGroup.tsx`) عند رفع فيديو، التقط الإطار عند 0.5s عبر `<video>` + `canvas` في المتصفح، ارفعه بـ `uploadPublicMedia(brandId, blob, "hero")` واكتبه في `media_poster_url_{lang}`. أضف زر "إعادة توليد الصورة الثابتة". **Backfill لبيورا**: server function لمرة واحدة `generateMissingHeroPosters` (يستخدم Cloudflare Stream thumbnail إن كان `stream_uid` موجوداً، وإلا يترك الحقل ويعرض تحذيراً في قائمة الجاهزية "الشريحة بلا صورة ثابتة").
- **Fallback بدون poster**: `HeroV2` يعرض `storefront_accent_color` بتدرّج قطري + نمط نسيج SVG خفيف (5% opacity) — ليس مستطيلاً مسطحاً.
- **الطبقة والعنوان**: تدرّج أسفل الوسائط `linear-gradient(to top, rgba(0,0,0,var(--sf-hero-overlay)), transparent 60%)`؛ H1 بـ `--sf-h1` وخط `display`، لون `hero_title_color_v2 ?? readableOn(overlay)`؛ سطر فرعي `--sf-text-lg`؛ زر CTA أساسي + رابط ثانوي. الافتراضيات الحالية (`hero_title_size` 26px) تبقى محترمة عندما `storefront_design_version = 1`.
- `OptimizedVideo`: `preload="metadata"`, `playsInline`, `muted`, `autoplay`, ومع `IntersectionObserver` يوقف الفيديو خارج الشاشة.
- **اختبار**: Playwright — عند `page.route` يحظر `.mp4`، يجب أن يظهر poster أو خلفية اللون، ولا يكون الهيرو مستطيلاً أحادي اللون بدون نص (تحقق من وجود H1 مرئي بـ `toBeVisible` وحجم خط ≥ 28px على 375px).

### L1-2 زوج الخطوط (C4)

- وسّع `FontMoodPreset` بـ `displayAr/displayEn`؛ `onSelectFontPreset` يكتب `storefront_typography.display` و`.body` معاً. `FONT_LIBRARY` يضيف Amiri, Aref Ruqaa, Cormorant Garamond, Playfair Display, Montserrat, Poppins, Changa, Almarai (Google Fonts، `font-display: swap`، `preconnect` موجود).
- `$slug.route.tsx` يحقن `<link rel="preload" as="font">` لخط الـ display المستخدم فقط (WOFF2 latin/arabic subsets).
- في المعالج (`StepVertical`) وقوالب النشاط: `fontPresetId` يطبّق الزوج.
- **Backfill**: لا تغيير تلقائي للبراندات الموجودة (قد يكون خطهم مقصوداً). بطاقة "ترقية المظهر" (§3 L1-9) تعرض معاينة قبل/بعد.

### L1-3 شريط الثقة تحت الهيرو (C3)

- `TrustBar.tsx`: يقرأ نفس `resolveStorefrontTrustBadges` (أيقونات خطية `lucide`, نص قصير)، 3–4 عناصر، صف أفقي قابل للتمرير على الجوال، مركزي على سطح المكتب، خلفية `--sf-background` بحد علوي/سفلي `1px` بلون `--sf-border` (متغير جديد = `color-mix(in oklab, var(--sf-text) 10%, transparent)`).
- الافتراضي إن لم يضبط التاجر شارات: يُولَّد من الإعدادات الفعلية (`delivery_estimate_*` ⇒ "توصيل خلال 24–48 ساعة"، `pickup_enabled` ⇒ "استلام من الفرع"، `benefit_enabled/card_enabled` ⇒ "دفع آمن"، `store_modules.made_to_order` ⇒ "تفصيل حسب المقاس") — الدالة `getDynamicTrustBadges` موجودة في `src/lib/trust-badges.ts`؛ استخدمها.
- يُتحكم به بـ `trust_bar_enabled/position`.

### L1-4 نفاد المخزون → "نبّهني عند التوفر" (C5)

- `NotifyMeForm.tsx` يظهر مكان زر الشراء عندما `selectedVariantOutOfStock` (`$slug.product.$id.tsx:1009`): اختيار قناة (واتساب افتراضياً / بريد)، حقل واحد، زر. server function `createBackInStockRequest` مع rate-limit (5/ساعة/IP، أعد استخدام نمط `api.admin.nabda-otp.ts` إن وُجد أو `Map` في الذاكرة على الـ worker).
- الأدمن: قائمة الطلبات في صفحة المنتج بالمخزون (`admin.b.$slug.inventory.tsx`) كشارة "N ينتظرون التوفر" + زر "إشعارهم عبر واتساب" (يفتح قالب رسالة؛ لا إرسال آلي في هذه المرحلة).
- الشارة على البطاقة "نفد المخزون" تصبح "نفد — نبّهني" وتفتح صفحة المنتج على النموذج.

### L1-5 زر واتساب العائم (Q1)

`WhatsAppFab`: على الجوال في صفحة المنتج يختفي عند ظهور الشريط اللاصق (موجود جزئياً بـ `hasStickyBottom`) ويُدمج كزر ثانوي داخل الشريط اللاصق نفسه؛ في الصفحات الأخرى يرتفع `bottom: calc(16px + env(safe-area-inset-bottom))` ويوضع `inline-end` بدل يسار ثابت. أضف `aria-label`.

### L1-6 ترويسة الجوال في صف واحد (Q2)

`StorefrontHeader.tsx:207-215`: عند `storefront_design_version = 2`: صف واحد `[قائمة] [شعار] [بحث] [سلة]` بارتفاع 56px، البحث يفتح `SearchOverlay` كامل الشاشة (نفس `SearchBar` داخله + آخر عمليات البحث من localStorage + اقتراحات من الأقسام). التصنيفات في شريط أفقي قابل للتمرير تحت الترويسة (كما اليوم على سطح المكتب). الإصدار 1 يبقى بلا تغيير.

### L1-7 SEO: JSON-LD و OG (Q3, Q4)

- `seo/JsonLd.tsx` + مولّدات نقية في `src/lib/seo/structured-data.ts`: `organizationJsonLd(brand, settings)`, `websiteJsonLd(slug)` (مع `SearchAction` إلى `/{slug}/search?q=`), `productJsonLd(product, variants, currency, url)` (`Offer` بالسعر والتوفر `InStock/OutOfStock`، الصور، `brand`)، `breadcrumbJsonLd(items)`, `collectionPageJsonLd(category, products)`.
- تُحقن عبر `head()` في `$slug.route.tsx`, `$slug.product.$id.tsx:101`, `$slug.$category.tsx:63`.
- `og:image`: الرئيسية = poster الهيرو أو أول بطاقة ترويجية (PNG/JPG، 1200×630 عبر `ResponsiveImage` preset جديد `og`)؛ المنتج = أول صورة منتج. الشعار SVG يبقى fallback أخيراً.
- **اختبار**: `tests/structured-data.test.ts` يتحقق من صحة الـ schema (الحقول المطلوبة) لكل مولّد.

### L1-8 تفاصيل الجودة (Q7, Q8, I3)

- `alt` تلقائي: `${اسم المنتج} — ${اللون إن وُجد}`؛ صور الديكور `alt=""` + `aria-hidden`.
- ثامبنيل معرض المنتج: لا يُعرض ثامبنيل بلا مصدر؛ للفيديو يُستخدم poster أو أيقونة تشغيل على خلفية اللون.
- تسمية الخيار: "اللون: **أسود**" بعد الاختيار، و"اختاري اللون" قبله.
- `theme-color` من `storefront_accent_color` (وتحديثه عند تبديل الثيم)؛ `manifest.json` ديناميكي `GET /{slug}/manifest.webmanifest` (اسم، أيقونات من الشعار/الأيقونة عبر `ResponsiveImage` بمقاسات 192/512، `theme_color`, `background_color`, `start_url=/{slug}`, `display: standalone`) + `<link rel="manifest">`.

### L1-9 بطاقة "ترقية المظهر" وإصدار التصميم

- `storefront_design_version` في الـ registry (تبويب `storefront`، مجموعة `mode`، أساسي). بطاقة في الإعدادات: معاينة جنباً إلى جنب (iframe `?preview=1&design=2`) + زر "تفعيل المظهر الجديد" + "الرجوع" — قابل للعكس دائماً.
- `$slug.route.tsx` يقرأ `?design=` فقط في وضع المعاينة لتجاوز القيمة المحفوظة.
- السوبر أدمن: عمود "المظهر v1/v2" في `admin.brands.tsx` مع تبديل.
- **القوالب**: كل براند جديد من المعالج يبدأ بـ `2`.

### مخرجات PR #A

migration + types + registry + templates · `HeroV2`, `TrustBar`, `NotifyMeForm`, `SearchOverlay`, `JsonLd` + `structured-data.ts`, manifest route, poster generation · تحديث `WhatsAppFab`, `StorefrontHeader`, `product-card` (نص الشارة), `QuickThemeCustomizer` (زوج الخطوط) · اختبارات: `structured-data.test.ts`, `hero-fallback.spec.ts`, `notify-me.test.ts` (server fn validation), تحديث `mobile-ux-audit.spec.ts` (ارتفاع الترويسة ≤ 120px في v2). **تحقق يدوي على بيورا (v2 في المعاينة فقط):** الهيرو مع الفيديو محظوراً، الجوال iOS Safari حقيقي، مشاركة رابط منتج في واتساب تعطي صورة المنتج.

---

## §4 — الطبقة 2: تجربة بريميوم (PR #B)

### L2-9 بطاقة المنتج 2.0 (Q6)

`ProductCardV2.tsx` (يُستخدم عندما `storefront_design_version = 2`، وإلا `product-card.tsx` الحالي):

- صورة ثانية عند الـ hover/focus من `product.media[1]` (تحميل كسول `loading="lazy"` وتُحمَّل فقط عند أول hover عبر `onPointerEnter`؛ على اللمس: لا تبديل).
- `ColorDots.tsx`: حتى 5 نقاط من ألوان الـ variants (استخدم `COLOR_MAP` من `$slug.product.$id.tsx:224` — انقله إلى `src/lib/color-names.ts` ليُشارَك) + "+N".
- `QuickAddPopover.tsx` (سطح المكتب فقط، `min-width: 1024px`): زر "إضافة سريعة" يظهر عند الـ hover أسفل الصورة؛ يعرض المقاسات كأزرار؛ الاختيار يضيف للسلة بنفس منطق `addToCart` الموجود (استخرج الدالة المشتركة من صفحة المنتج إلى `src/lib/cart/add-to-cart.ts` **بدون تغيير سلوكها**؛ منتجات التفصيل/الخيارات المتعددة تفتح صفحة المنتج بدلاً من الإضافة).
- شارة "جديد" تلقائية إذا `created_at` خلال `new_badge_days`؛ أولوية الشارات: خصم > جديد > الأكثر مبيعاً > رائج (شارة واحدة فقط).
- السعر: عند وجود نطاق "من 8.000 د.ب."؛ عند الخصم السعر القديم مشطوب بلون `--sf-muted`.
- الشبكة: `grid-cols-2 md:grid-cols-3 lg:grid-cols-4` تبقى؛ الأنشطة `electronics/general` تحصل على `xl:grid-cols-5` عبر قالب النشاط.

### L2-10 الفوتر البريميوم (Q5)

`FooterV2.tsx` عندما `footer_layout = 'columns'`: 4 أعمدة على سطح المكتب / أكورديون على الجوال:

1. الشعار + `about_*` (≤ 160 حرفاً) + سوشال (`socials` بأيقونات).
2. "تسوّقي": الأقسام الرئيسية (≤ 6) + وصل حديثاً + تنزيلات.
3. "المساعدة": `pages` الموجودة + دليل المقاسات + تتبّع الطلب (`/{slug}/account`).
4. "تواصلي": هاتف/واتساب/بريد/العنوان/ساعات العمل (حقل جديد اختياري `business_hours_ar/en` — أضفه للـ migration) + `NewsletterForm`.

- صف سفلي: طرق الدفع كأيقونات (Benefit/Visa/Mastercard/COD حسب المفعّل) + شارات الثقة (إن `trust_bar_position` تشمل الفوتر) + الحقوق + "مدعوم من Boutq" (قابل للإخفاء بالباقة — استخدم مفتاح الـ white-label الموجود إن وُجد، وإلا اعرضه دائماً).
- `NewsletterForm.tsx`: واتساب افتراضياً (رقم) أو بريد؛ يكتب في `newsletter_subscribers` عبر server function مع rate-limit؛ صفحة الأدمن `admin.b.$slug.campaigns.tsx` تحصل على مصدر جمهور "مشتركو النشرة".

### L2-11 فلاتر القسم (Q10)

`CategoryFilters.tsx` (شريط جانبي `lg:` 260px) و`CategoryFiltersSheet.tsx` (Bottom Sheet على الجوال بزر "تصفية (N)"): المقاس، اللون (نقاط)، نطاق السعر (slider بحدّين من min/max الفعلي)، "المتوفر فقط"، الفرعيات. الحالة في الـ URL (`?size=&color=&min=&max=&stock=1`) — `$slug.$category.tsx:143` فيه بنية deep-linking؛ وسّعها. الفلترة client-side على الـ rows المحمّلة (كما اليوم)؛ عدّاد النتائج؛ "مسح الكل".

### L2-12 صفحة المنتج (Q8+)

- `ProductAccordion.tsx` عندما `pdp_layout='accordion'`: الوصف · القماش والعناية (`fabric_care_*` أو نص افتراضي حسب النشاط من القالب) · الشحن والاستبدال (`shipping_returns_*` أو تلخيص تلقائي من `delivery_estimate_*` + صفحة سياسة الاستبدال) · دليل المقاسات (يفتح المودال الموجود). الأول مفتوح افتراضياً؛ `aria-expanded`، لوحة مفاتيح.
- `ImageZoom.tsx`: على سطح المكتب تكبير 2× عند الـ hover داخل الإطار؛ على الجوال pinch-zoom في lightbox (استخدم `<dialog>` أصلي).
- `BundleOffer.tsx`: "أكملي الطقم" — إن كان للمنتج `related` من نفس القسم الشقيق (عباية ↔ فستان داخلي عبر قاعدة في قالب النشاط `bundle_pairs: [["abayas","inner-dresses"]]`) يعرض بطاقة "اشتري الاثنين" بخصم من إعداد جديد `bundle_discount_percent` (افتراضي 0 = يعرض بدون خصم كاقتراح). الخصم يُطبَّق كـ discount code تلقائي موجود في نظام `discounts` — لا تكتب منطق تسعير جديد.

### L2-13 Social proof حقيقي (I1)

- server function `getProductSocialProof(brandId, productId)` (cache 10 دقائق على الـ worker): عدد الطلبات خلال 7 أيام من `order_items`؛ يُعرض "طُلب N مرة هذا الأسبوع" فقط إذا N ≥ 3. **ممنوع** أي رقم مزيف.
- شارة "الأكثر طلباً هذا الأسبوع" على الشبكة لأعلى 4 منتجات (يستبدل "رائج" عندما تتوفر بيانات).
- `RecentlyViewed.tsx`: آخر 8 منتجات من localStorage (`boutq_rv_{slug}`) كقسم أسفل الرئيسية وصفحة المنتج.

### L2-14 قسم "قصتنا" (Q9)

`BrandStorySection.tsx` في الرئيسية (بعد الأكثر مبيعاً): صورة editorial (`brand_story_image_url` أو poster الهيرو) + `about_*` + زر إلى صفحة `/{slug}/page/about` (تُنشأ تلقائياً في `pages` إن لم توجد). تخطيط 5/7 على سطح المكتب، مكدّس على الجوال.

### مخرجات PR #B

المكوّنات أعلاه · `src/lib/cart/add-to-cart.ts` (استخراج بدون تغيير سلوك + اختبار وحدة يقارن الحمولة قبل/بعد) · `src/lib/color-names.ts` · جدول `newsletter_subscribers` + server functions · تحديث `campaigns` بمصدر الجمهور · اختبارات: `category-filters.test.ts` (منطق الفلترة النقي), `social-proof.test.ts` (لا يعرض < 3), Playwright `pdp-v2.spec.ts` (أكورديون + زووم + إضافة سريعة على 1280px).

---

## §5 — الطبقة 3: الحركة والتميّز (PR #C)

### L3-15 Scroll-reveal (I4)

`useReveal` + class `sf-reveal` على كل قسم رئيسي وبطاقة (stagger 40ms حتى 8 عناصر). يُعطَّل بـ `motion_enabled=false` أو `prefers-reduced-motion`. **اختبار**: CLS لا يتغير (العناصر تحجز مكانها؛ الحركة `transform/opacity` فقط).

### L3-16 انتقالات الصفحة

View Transitions API عند التنقل شبكة → منتج (`document.startViewTransition` إن وُجد؛ `view-transition-name` على صورة البطاقة/المنتج). Fallback: لا شيء. لا polyfill.

### L3-17 قوالب مظهر حسب النشاط (I5)

في `src/lib/brand-templates/`: `design: { preset: "editorial" | "fresh" | "tech", grid: 4|5, radius, sectionSpacing: "airy"|"regular"|"dense", cardStyle: "borderless"|"bordered" }`:

- `editorial` (abayas, fashion, jewelry, beauty): serif display، `airy`، `borderless`، هيرو بارتفاع 70vh، قسم قصتنا مفعّل.
- `fresh` (coffee, food, gifts, home): زوايا 1.5rem، ألوان دافئة، بطاقات `bordered`، شريط ثقة بارز، قسم "الأكثر طلباً" أولاً.
- `tech` (electronics, digital, print, general): كثافة أعلى، شبكة 5، `dense`، مواصفات في جدول بدل أكورديون نصي.
  تُطبَّق كقيم صريحة في الأعمدة عند الإنشاء (لا منطق خاص في الستور فرونت عدا قراءة الأعمدة).

### L3-18 Quick View (I2)

`QuickViewModal.tsx`: من الشبكة على سطح المكتب — معرض مصغّر + الخيارات + إضافة للسلة عبر `add-to-cart.ts` + رابط "التفاصيل الكاملة". يُعطَّل تلقائياً لمنتجات التفصيل/الحقول المخصصة.

### L3-19 صفحة "الطلب المخصص" (للأنشطة ذات `made_to_order`)

`/{slug}/custom-order`: نموذج موجّه 3 خطوات (القماش/اللون → المقاسات باستخدام Fit Passport إن وُجد → الموعد والملاحظات) ينشئ طلباً بنوع `made_to_order` عبر نفس مسار السلة/الدفع الموجود (منتج "خدمة تفصيل" افتراضي يُنشأ بالقالب). رابط في القائمة والفوتر والهيرو (CTA ثانوي) عندما الوحدة مفعّلة.

### مخرجات PR #C

`motion/`, `QuickViewModal`, صفحة الطلب المخصص، قوالب المظهر · اختبارات: `brand-templates.test.ts` (كل نشاط له `design`), Playwright `motion-a11y.spec.ts` (مع `reduce` لا حركة؛ CLS ≤ 0.05), `quick-view.spec.ts`.

---

## §6 — جدول الـ PRs والقياس

| PR  | الفرع                           | المحتوى | القياس قبل/بعد على `/pura` (Lighthouse mobile)                                                   |
| --- | ------------------------------- | ------- | ------------------------------------------------------------------------------------------------ |
| #A  | `feat/storefront-v2-foundation` | §3      | LCP, CLS, SEO ≥ 95, a11y ≥ 95؛ لقطات الهيرو مع/بدون فيديو؛ ارتفاع ترويسة الجوال                  |
| #B  | `feat/storefront-v2-premium`    | §4      | نفس المقاييس + حجم JS للرئيسية (≤ +25KB gz مع #C) + لقطات البطاقة/الفوتر/الفلاتر/PDP             |
| #C  | `feat/storefront-v2-motion`     | §5      | CLS مع الحركة؛ `reduce` يعمل؛ لقطات القوالب الثلاثة على براندات تجريبية (عبايات/قهوة/إلكترونيات) |

## §7 — ما لا يجب فعله

- لا مكتبات حركة/كاروسيل/زووم جديدة. لا تغيير أسماء `--sf-*`. لا تغيير منطق السلة/الدفع/المخزون (عدا NotifyMe). لا social proof مزيف. لا تفعيل تلقائي لـ v2 على براند موجود بدون قرار (بيورا تُفعَّل بعد QA بصري موثّق بلقطات في الـ PR). لا كسر للإصدار 1 — يبقى يعمل حتى إشعار آخر.

## §8 — قرارات المالك

1. الترقية **محرّك** لكل البراندات، وبيورا مرجع QA. 2. الإصدار الجديد خلف `storefront_design_version` قابل للعكس. 3. لا مكتبات جديدة للحركة. 4. "نبّهني عند التوفر" والنشرة عبر واتساب أولاً (السوق خليجي). 5. الأولوية إن ضاق الوقت: L1-1, L1-2, L1-3, L2-9, L2-10.

## §9 — تعريف الاكتمال

- [ ] بيورا على v2: الهيرو مقروء مع/بدون فيديو، زوج خطوط، شريط ثقة، بطاقة 2.0، فوتر أعمدة، فلاتر، أكورديون PDP، قصتنا، JSON-LD صالح في Rich Results Test، manifest يعمل (إضافة للشاشة الرئيسية على iOS/Android).
- [ ] Lighthouse mobile على `/pura`: Performance ≥ 85، SEO ≥ 95، Accessibility ≥ 95، Best Practices ≥ 95؛ LCP ≤ 2.5s؛ CLS ≤ 0.05.
- [ ] براند بإصدار 1 لا يتغير بصرياً (لقطات قبل/بعد متطابقة).
- [ ] براند جديد من المعالج (عبايات) يطلع مباشرة بـ v2 + قالب `editorial`؛ براند قهوة بـ `fresh`؛ إلكترونيات بـ `tech`.
- [ ] كل الأعمدة الجديدة في الـ registry واختبار التكافؤ يمر.
- [ ] `npm run check`, `db:migrations:check`, Playwright audits تمر؛ لا اختبارات ضعُفت.
- [ ] `docs/storefront-architecture.md` يشرح: الإصدارات، القوالب، المكوّنات الجديدة، كيفية إضافة قسم جديد للرئيسية.
