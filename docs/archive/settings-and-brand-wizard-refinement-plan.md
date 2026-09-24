# Handoff Prompt — Boutq OS: Settings Simplification + Brand Setup Wizard (auto‑palette from logo)

Copy everything below the line into a new AI-assistant session opened at the repository root.

---

You are a senior full-stack engineer working in the repository **`SayedMajeedx/bhpura-d219813a`** (Boutq OS — a multi-tenant SaaS e-commerce OS for GCC boutiques; TanStack Start + React 19 + Supabase (Postgres/RLS/RPC/Edge Functions) + Cloudflare Workers/R2; two Expo mobile apps under `apps/`). Work directly in this checkout.

**Your mission:** execute this document exactly, as **four sequential PRs** (one per phase, §3–§6). The plan is written in **Arabic** with English code — read it **in full** before touching anything. It is the single source of truth for scope, schema, file paths, line anchors, tests, and Definition of Done.

**Why this work exists (two owner complaints):**

1. The brand-admin **Settings** page is too complex for business owners: one 9,144-line route file, 157 `business_settings` columns, 4 levels of nesting (9 tabs → 4 sub-tabs → quick/advanced mode → collapsible cards), six independent queries/states/save handlers for the same table, and **at least 11 fields/controls that appear in two or more places** (§0). The owner wants it drastically simpler **without losing a single feature**.
2. Creating a new brand as super admin takes 20–30 minutes of manual work afterwards (upload logo, set colours in three places, pick fonts, set vertical, sync categories, rebuild the white-label app). The owner wants brand creation to produce a **ready-to-use** brand: the system should **extract the brand palette from the uploaded logo** and let the super admin pick the **store vertical (business activity) at creation time**.

## Ground truth as of 2026-09-19 (verified — re-check line numbers before relying on them)

- Branch at handoff: `feat/vertical-categories-stock-tailoring`, HEAD `9ec0613e`. Create your branches from **`main`** after confirming with the owner that the feature branch has been merged; if not, branch from `feat/vertical-categories-stock-tailoring`.
- `npm run typecheck` and `npx vitest run` → see the **Baseline** note at the end of this file (there are pre-existing failures on the feature branch that are not yours). Any _new_ failure after your change is caused by your change.
- Migrations: 247 files in `supabase/migrations/`; the newest is `20260923110000_variant_translation_cache.sql` (timestamps are ahead of the calendar). **Your new migration must sort after it** — use the prefix `20260924` or later. `npm run db:migrations:check` must pass.
- Formatting: `.prettierrc` = `printWidth 100, semi, doubleQuotes, trailingComma all`; LF line endings; `supabase/migrations/*.sql` are prettier-ignored. CI runs on Node 20 (formatting → typecheck → lint → unit tests → build → migration validation → Playwright smoke).
- All line anchors below were verified at commit `9ec0613e`.

## Rules of engagement

1. **Zero feature loss.** Every column in `business_settings` and every brand-level field currently editable in the admin must remain editable from **exactly one** UI location. Phase 0 builds the registry + guard test that enforces this; do not skip it.
2. **No schema deletions or renames.** Add columns/functions only. The storefront (`src/routes/$slug.route.tsx`), invoice route, mobile apps and edge functions read these columns; do not change their read semantics except where this plan explicitly says so.
3. **Do not grow `admin.b.$slug.settings.tsx`.** Phase 2 splits it; until then, any new UI goes into its own component file.
4. **Mirror existing patterns**: `SettingsCollapsibleCard`, `SettingsCommandHeader`, `SettingsStickySaveBar`, `useI18n()` + `isAr ? "..." : "..."` bilingual strings, `queryKeys.*` from `src/lib/query-keys.ts`, `toast` from `sonner`, `uploadPublicMedia(brandId, file, kind)` from `src/lib/r2-upload.ts`, server functions via `createServerFn` + `requireSupabaseAuth` middleware (see `src/lib/addons/addons.functions.ts`), edge-function actions in `supabase/functions/user-management/index.ts`.
5. Every new UI string is bilingual (ar/en). Arabic is the primary audience; keep Arabic labels short and plain (business-owner vocabulary, not developer vocabulary).
6. Keep RLS/authorization semantics: brand provisioning stays super-admin-only (`callerCtx.isSuperAdmin` / `public.is_super_admin()`).
7. Write unit tests for every pure module you add (`tests/*.test.ts`, vitest). Update `docs/` when you change behaviour.
8. Before each PR: `npm run check` (typecheck + lint + format:check + test) and `npm run db:migrations:check` must pass.
9. Owner decisions already taken are in §8 — **do not re-ask them**. Anything not covered: choose the simplest option consistent with this plan and note it in the PR description.
10. **Load these repo skills before starting** (they are the working rules for this plan): `.agents/rules/AGENTS.md`, `.agents/skills/handoff-plan-execution/SKILL.md`, `.agents/skills/settings-registry-single-source/SKILL.md` (PR #1, #3, #4), `.agents/skills/brand-provisioning-and-palette/SKILL.md` (PR #2), plus the existing `rtl-arabic-consistency`, `refactor-safety`, `migration-hygiene`, `test-quality-gate`, `multi-tenant-security`, `secrets-credentials-security`.

---

# خطة إعادة هيكلة الإعدادات + معالج إنشاء البراند

> اللغة: عربي للشرح، إنجليزي للكود والمسارات. كل مرجع `file:line` تم التحقق منه عند الـ commit `9ec0613e` بتاريخ 2026-09-19.

## §0 — جدول التدقيق: التكرارات والمشاكل المكتشفة

### 0.1 حقول/عناصر مكرّرة (نفس العمود أو نفس المكوّن في مكانين أو أكثر)

| #   | الحقل / المكوّن                          | المكان 1                                                                                                    | المكان 2                                                                                    | المكان 3+                                                                                                                                                                      | المعالجة (المرحلة)                                                                                         |
| --- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| D1  | `business_settings.footer_note`          | تبويب الملف التجاري — `admin.b.$slug.settings.tsx:1459`                                                     | تبويب الفاتورة — `settings.tsx:2445` ("ملاحظة التذييل الإضافية")                            | —                                                                                                                                                                              | مكان واحد: `orders.invoice` (P2)                                                                           |
| D2  | `FooterLogoResizerControl` (نفس المكوّن) | المتجر ← المظهر ← متقدم ← الترويسة والتذييل — `settings.tsx:7354`                                           | المتجر ← الشعار والواجهة ← التذييل — `settings.tsx:7842`                                    | —                                                                                                                                                                              | مكان واحد: `storefront.header_footer` (P2)                                                                 |
| D3  | **اللون الأساسي ×3**                     | `brands.primary_color` — السوبر أدمن `admin.brands.tsx:1232`                                                | `business_settings.primary_color` (لون الفاتورة، مسمّى "accent") — `settings.tsx:1588`      | `business_settings.storefront_accent_color` — `settings.tsx:7109` (QuickThemeCustomizer). المتجر يقرأ `storefront_accent_color ?? brand.primary_color` (`$slug.route.tsx:206`) | مصدر حقيقة واحد `storefront_accent_color`؛ الباقي مشتق (§1.2، P1+P2)                                       |
| D4  | **الشعار ×4**                            | رفع `logo_url` — `settings.tsx:1264`                                                                        | موضع/حجم شعار الفاتورة — `settings.tsx:2488`                                                | حجم/محاذاة شعار المتجر — `settings.tsx:7762`؛ `brands.logo_url` عند السوبر أدمن — `admin.brands.tsx:1222`                                                                      | الرفع مرة واحدة في `identity.basics`؛ الحجم/الموضع يبقى في سياقه (فاتورة/متجر) لكنه يستخدم نفس الصورة (P2) |
| D5  | **الخطوط ×4**                            | خط الفاتورة `font_family/font_url/font_size` — `settings.tsx:1991`                                          | Quick presets للمتجر `FONT_MOOD_PRESETS` — `QuickThemeCustomizer.tsx`                       | Advanced `TypographyAdvancedControls` — `settings.tsx:7745`؛ `admin_typography` — `settings.tsx:6666`                                                                          | نمط واحد في `identity.typography` + مفتاح "خط مختلف للفاتورة" (P2)                                         |
| D6  | **بلوك الهيرو مقسوم على جدولين**         | `BrandHeroCard` يكتب `brands.hero_media / about_ar / about_en` — `settings.tsx:3305`                        | عنوان الهيرو يكتب `business_settings.hero_title_*` — `settings.tsx:7871`                    | —                                                                                                                                                                              | قسم واحد `storefront.home_hero` بحفظ واحد يكتب الجدولين (P2)                                               |
| D7  | النبذة و SEO                             | `StorefrontSeoCard` → `brands.meta_title/meta_description` — `settings.tsx:5634`؛ النبذة في `BrandHeroCard` | `EditBrandDialog` للسوبر أدمن (نبذة + Meta) — `admin.brands.tsx:1195-1310`                  | —                                                                                                                                                                              | تبقى في إعدادات البراند؛ نافذة السوبر أدمن تعرضها للقراءة مع رابط "تعديل في إعدادات المتجر" (P2)           |
| D8  | الدفع مقسوم                              | تفعيل بطاقة/بنفت/COD + مفاتيح `card_public_key/card_secret_key` — `PaymentSettingsCard` `settings.tsx:2939` | بيانات اعتماد Tap/Benefit في صفحة التكاملات — `admin.b.$slug.integrations.tsx:81`           | —                                                                                                                                                                              | قسم `orders.payments` يعرض حالة الاعتماد inline + رابط مباشر (P2)                                          |
| D9  | الإشعارات مقسومة                         | نصوص القوالب + رسالة واتساب للتوصيل — `EmailSettingsCard` `settings.tsx:8899`                               | مستلمو الإشعارات + سجل البريد — `admin.b.$slug.communications.tsx:54`                       | —                                                                                                                                                                              | نقل "المستلمين" إلى `notifications.recipients`؛ السجل يبقى في صفحته (P2)                                   |
| D10 | `whatsapp_number` ×2                     | صفحة الصفحات والسياسات — `admin.b.$slug.pages.tsx:238,368`                                                  | `StorefrontModeCard` (وضع الكتالوج) — `settings.tsx:6382`                                   | —                                                                                                                                                                              | مكان واحد `identity.contact`؛ الأماكن الأخرى تعرض الرقم للقراءة (P2)                                       |
| D11 | **`logo_size` كاتبان متنافسان**          | الحفظ الرئيسي `save()` يكتب `f.logo_size` — `settings.tsx:898`                                              | `StorefrontCustomizerCard` يكتب `state.logo_size` (حجم شعار الترويسة) — `settings.tsx:7769` | الفاتورة تستخدمه كـ fallback لارتفاع الشعار — `settings.tsx:2549`                                                                                                              | **خلل حقيقي**: آخر حفظ يدهس الأول. كاتب واحد فقط في `storefront.header_footer` (P2)                        |

### 0.2 مشاكل بنيوية (ليست تكرار لكنها سبب الارتباك)

| #   | المشكلة                                                                                                                                           | الدليل                                                                                         | المعالجة   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------- |
| S1  | 6 استعلامات مستقلة لـ `business_settings` في الصفحة نفسها، كل واحد بـ state وحفظ خاص، و"الحفظ الموحد" مجرد refs فوقهم                             | `settings.tsx:717, 2968, 4366, 6041, 6614, 8929` و `handleUnifiedSave` `:938`                  | P2         |
| S2  | `localStorage` يظلّل قاعدة البيانات لـ `storefront_radius / header_glass / badge_accent` — صاحب العمل يحفظ قيمة والمتجر يعرض قيمة ثانية من متصفحه | `settings.tsx:6698-6710` و `$slug.route.tsx:490-505`                                           | P2 (إزالة) |
| S3  | فهرس البحث مكتوب يدوياً ومنفصل عن الأقسام؛ بعض النتائج توصّل للتبويب فقط                                                                          | `src/components/settings/SettingsSearchBar.tsx:33`                                             | P0 + P3    |
| S4  | قائمة الجاهزية مكتوبة يدوياً بأسماء التبويبات القديمة                                                                                             | `src/components/settings/StoreReadinessChecklist.tsx:126-271`                                  | P3         |
| S5  | عمق تنقل 4 مستويات (تبويب ← تبويب فرعي ← سريع/متقدم ← بطاقة)                                                                                      | `SettingsScopeSwitcher.tsx` + `CustomizerNavigation` `settings.tsx:5397` + `themeMode` `:7079` | P2         |
| S6  | العملة والضريبة (تسعير) موضوعة تحت "الملف التجاري" (هوية)                                                                                         | `settings.tsx:1400-1455`                                                                       | P2         |

### 0.3 مشاكل إنشاء البراند من السوبر أدمن

| #   | المشكلة                                                                                                                                             | الدليل                                                                                                             | المعالجة |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------- |
| B1  | نافذة الإنشاء بلا شعار ولا لون ولا نوع نشاط؛ `form.logo_url` موجود في الـ state بلا input (كود ميت)                                                 | `admin.brands.tsx:893-1128`، `:895`                                                                                | P1       |
| B2  | اللون مثبّت `#800020` في الـ edge function                                                                                                          | `supabase/functions/user-management/index.ts:282`                                                                  | P1       |
| B3  | `business_type` مثبّت `"Fashion"` والواجهة لا ترسله                                                                                                 | `index.ts:284`                                                                                                     | P1       |
| B4  | `business_settings.store_vertical` لا يُكتب عند الإنشاء → يبقى `general` بينما `brands.business_type = Fashion` (تناقض)                             | `supabase/migrations/20260810205000_fix_tenant_activation_business_settings.sql` (الدالة لا تلمس `store_vertical`) | P1       |
| B5  | تطبيق الـ White-Label يُبنى **فوراً** بعد الإنشاء بلون افتراضي وبدون شعار → يحتاج rebuild لاحقاً                                                    | `admin.brands.tsx:932` ← `supabase/functions/provision-white-label-app/index.ts:180-182`                           | P1       |
| B6  | صفحة التسجيل الذاتي تسأل عن النشاط، لكن السوبر أدمن لا                                                                                              | `src/routes/onboard.tsx:539`                                                                                       | P1       |
| B7  | التصنيفات المبدئية والـ starter pack والوحدات لا تُطبَّق عند الإنشاء من السوبر أدمن (تُطبَّق فقط عند تغيير النشاط من الإعدادات أو الموافقة على طلب) | `StoreProfileCard.tsx:202-250`، `src/lib/onboarding.functions.ts:525-530`                                          | P1       |

---

## §1 — القرارات المعمارية

### 1.1 مبدأ "مكان واحد لكل حقل" (Single Source of Placement)

- يُنشأ **سجل الإعدادات** `src/features/settings/registry.ts` يعرّف كل حقل قابل للتعديل مرة واحدة (المفتاح، الجدول، التبويب، المجموعة، المستوى أساسي/متقدم، النوع، التسميات، الكلمات المفتاحية).
- اختبار حارس يفشل إذا: عمود في `business_settings` غير مسجّل، أو مسجّل مرتين، أو مسجّل بمجموعة غير موجودة.
- فهرس البحث وقائمة الجاهزية يُولَّدان من السجل (P3).

### 1.2 نموذج الألوان: مصدر حقيقة واحد

- **`business_settings.storefront_accent_color`** هو لون العلامة الوحيد الذي يعدّله المستخدم في "الهوية".
- **`brands.primary_color`** يصبح **مشتقاً**: يُكتب تلقائياً بنفس قيمة `storefront_accent_color` عند كل حفظ (trigger SQL في P1، §3.4) حتى تبقى الأماكن التي تقرأه (بطاقات البراند في السوبر أدمن، `provision-white-label-app`، الـ fallback في المتجر) صحيحة بدون تغيير.
- **`business_settings.primary_color`** (لون الفاتورة) يحصل على مفتاح "يرث لون العلامة" (`invoice_inherit_brand_color boolean DEFAULT true`، عمود جديد). عندما يكون `true`، الحفظ يكتب `primary_color = storefront_accent_color` تلقائياً؛ عندما `false` يظهر منتقي لون مستقل في `orders.invoice`.
- **الألوان المشتقة** (header/footer/buttons/headings/links/price/menu/cart drawer/badge): تُحسب من اللوحة بدالة نقية `derivePalette(primary, secondary, mode)` (§3.2) وتُكتب في الأعمدة الحالية **كقيم صريحة** (لا نغيّر منطق القراءة في المتجر الذي يستخدم `?? primary`). في الإعدادات: المستوى الأساسي يعرض لونين + زر "إعادة الاشتقاق من لون العلامة"؛ المستوى المتقدم يعرض كل عمود منفرداً كما هو اليوم.

### 1.3 نموذج الخطوط

- **نمط واحد** (`FONT_MOOD_PRESETS` الموجود في `src/components/settings/QuickThemeCustomizer.tsx:18`) في `identity.typography` يطبّق على `storefront_font_en/ar` + `storefront_typography`.
- مفتاح "خط مختلف للفاتورة" (`invoice_inherit_brand_font boolean DEFAULT true`، عمود جديد). `true` ⇒ الحفظ يكتب `font_family = storefront_font_en` و `invoice_arabic_font_family = storefront_font_ar`. `false` ⇒ تظهر حقول الفاتورة الحالية.
- `admin_typography` و `TypographyAdvancedControls` تبقى كما هي تحت المستوى المتقدم.

### 1.4 مستوى العرض: أساسي / متقدم

- مفتاح واحد أعلى صفحة الإعدادات (`SettingsCommandHeader`)، يُحفظ في `localStorage` بالمفتاح `boutq_settings_level` (هذا الاستخدام لـ localStorage مقبول لأنه تفضيل عرض لا بيانات).
- الافتراضي **أساسي**. كل حقل في السجل له `level: "basic" | "advanced"`. المتقدم يعرض كل شيء.
- لا يُخفى أي حقل نهائياً.

### 1.5 التبويبات الجديدة (5 بدل 9)

| المعرّف         | العربية        | الإنجليزية        | الأيقونة (lucide) |
| --------------- | -------------- | ----------------- | ----------------- |
| `identity`      | الهوية         | Identity          | `Fingerprint`     |
| `storefront`    | المتجر         | Storefront        | `Store`           |
| `orders`        | الطلبات والدفع | Orders & Payments | `ShoppingBag`     |
| `notifications` | الإشعارات      | Notifications     | `Bell`            |
| `account`       | الحساب         | Account           | `UserCog`         |

عمق التنقل الجديد: تبويب ← مجموعة (بطاقة قابلة للطي) — **مستويان فقط**. لا تبويبات فرعية ولا وضع سريع/متقدم داخل التبويب.

### 1.6 نموذج الحفظ الواحد

- `useBrandSettingsForm(brandId)` (P2): استعلام واحد لـ `business_settings` + استعلام واحد لـ `brands` (الأعمدة القابلة للتعديل فقط)، state واحد، `isDirty` واحد محسوب بالمقارنة العميقة، وحفظ واحد يرسل **الفرق فقط** (`diff(initial, current)`) بتحديثين على الأكثر (`business_settings` ثم `brands`).
- أعمدة لها منطق حفظ خاص اليوم (`shipping_zones` عمليات إضافة/حذف منفصلة، `store_vertical` مع مزامنة التصنيفات والإضافات، `trust_badges`, `hero_media`) تبقى داخل نفس النموذج لكن مع hooks "قبل/بعد الحفظ" (`beforeSave`/`afterSave`) مسجّلة من مكوّن المجموعة.
- شريط الحفظ اللاصق `SettingsStickySaveBar` يبقى، بمصدر واحد لـ `isDirty`.

### 1.7 معالج إنشاء البراند (Brand Setup Wizard)

- يستبدل `NewBrandDialog` بمعالج 3 خطوات داخل نافذة واحدة (`Dialog` بعرض `max-w-2xl`).
- استخراج اللوحة من الشعار **في المتصفح** بدون مكتبات جديدة (`src/lib/logo-palette.ts`، §3.2).
- قوالب نشاط `src/lib/brand-templates/` (§3.3) تجمع كل الافتراضيات لكل نوع نشاط في ملف واحد.
- ترتيب الإنشاء: إنشاء البراند بالقيم الحقيقية ← رفع الشعار ← كتابة اللوحة/الخطوط/الوحدات/التصنيفات/الإضافات ← **أخيراً** بناء التطبيق.

---

## §2 — المرحلة 0: الأساس والحماية (PR #1)

**الهدف:** ضمان "بدون خسارة ولا خاصية" قبل أي تغيير في الواجهة.

### 2.1 سجل الإعدادات

ملف `src/features/settings/registry.ts`:

```ts
export type SettingsTabId = "identity" | "storefront" | "orders" | "notifications" | "account";
export type SettingsLevel = "basic" | "advanced";
export type SettingsOwner =
  | "settings" // يُعدَّل داخل صفحة الإعدادات
  | "route:pages" // يُعدَّل في صفحة الصفحات والسياسات
  | "route:integrations"
  | "route:team"
  | "system"; // لا يُعدَّل يدوياً (created_at, user_id, next_invoice_number...)

export interface SettingsFieldDef {
  key: string; // اسم العمود
  table: "business_settings" | "brands";
  tab: SettingsTabId | null; // null عندما owner !== "settings"
  group: string | null; // معرّف المجموعة داخل التبويب
  level: SettingsLevel;
  owner: SettingsOwner;
  type: "text" | "textarea" | "number" | "boolean" | "color" | "select" | "image" | "font" | "json";
  label: { ar: string; en: string };
  keywords?: { ar: string[]; en: string[] };
  readOnlyMirrors?: string[]; // أماكن تعرض القيمة للقراءة فقط (توثيق)
}

export const SETTINGS_GROUPS: Record<SettingsTabId, { id: string; ar: string; en: string }[]> = {
  identity: [
    { id: "basics", ar: "الاسم والشعار", en: "Name & Logo" },
    { id: "vertical", ar: "نوع النشاط والوحدات", en: "Store Vertical & Modules" },
    { id: "palette", ar: "الألوان", en: "Colours" },
    { id: "typography", ar: "الخطوط", en: "Typography" },
    { id: "contact", ar: "التواصل والعنوان", en: "Contact & Address" },
  ],
  storefront: [
    { id: "mode", ar: "وضع البيع", en: "Selling Mode" },
    { id: "home_hero", ar: "الواجهة الرئيسية (Hero)", en: "Homepage Hero" },
    { id: "home_sections", ar: "أقسام الصفحة الرئيسية", en: "Homepage Sections" },
    { id: "header_footer", ar: "الترويسة والقائمة والتذييل", en: "Header, Menu & Footer" },
    { id: "announcement", ar: "شريط الإعلانات", en: "Announcement Bar" },
    { id: "loader", ar: "شاشة التحميل", en: "Loading Screen" },
    { id: "seo", ar: "محركات البحث (SEO)", en: "SEO" },
  ],
  orders: [
    { id: "payments", ar: "طرق الدفع", en: "Payment Methods" },
    { id: "pricing", ar: "العملة والضريبة", en: "Currency & Tax" },
    { id: "fulfillment", ar: "التوصيل والاستلام", en: "Delivery & Pickup" },
    { id: "invoice", ar: "الفاتورة", en: "Invoice" },
  ],
  notifications: [
    { id: "templates", ar: "نصوص الرسائل", en: "Message Templates" },
    { id: "recipients", ar: "مستلمو الإشعارات", en: "Notification Recipients" },
  ],
  account: [
    { id: "subscription", ar: "الاشتراك", en: "Subscription" },
    { id: "security", ar: "الأمان", en: "Security" },
    { id: "apps", ar: "تطبيقات الجوال", en: "Mobile Apps" },
  ],
};

export const SETTINGS_REGISTRY: SettingsFieldDef[] = [/* §2.2 */];
```

### 2.2 خريطة التكافؤ الكاملة (Feature-Parity Matrix)

كل عمود من أعمدة `business_settings` الـ 157 + أعمدة `brands` القابلة للتعديل يجب أن يظهر في السجل بالضبط كما يلي. (`A` = أساسي، `V` = متقدم.)

**identity.basics** — `business_name`(A) · `logo_url`(A, image) · `favicon_url`(A, image)

**identity.vertical** — `store_vertical`(A) · `store_modules`(V, json — عبر `StoreProfileCard`) · `fit_profiles`(V, json — عبر `StoreProfileCard`)

**identity.palette** — `storefront_accent_color`(A) · `storefront_background_color`(A) · `storefront_text_color`(V) · `heading_color`(V) · `link_color`(V) · `price_color`(V) · `product_title_color`(V) · `btn_primary_bg`(V) · `btn_primary_fg`(V) · `btn_secondary_bg`(V) · `btn_secondary_fg`(V) · `btn_checkout_bg`(V) · `btn_checkout_fg`(V) · `cart_drawer_checkout_bg`(V) · `cart_drawer_checkout_fg`(V) · `header_bg`(V) · `header_fg`(V) · `footer_bg`(V) · `footer_fg`(V) · `menu_bg`(V) · `menu_fg`(V) · `badge_accent`(A) · `storefront_radius`(A) · `header_glass`(V) · `brands.primary_color`(system — مشتق، §1.2)

**identity.typography** — `storefront_font_en`(A) · `storefront_font_ar`(A) · `storefront_font_en_url`(V) · `storefront_font_ar_url`(V) · `storefront_typography`(V, json) · `admin_typography`(V, json)

**identity.contact** — `address`(A) · `phone`(A) · `email`(A) · `whatsapp_number`(A) · `socials`(owner `route:pages` — يبقى في صفحة الصفحات) · `brands.custom_domain`(system — عرض فقط)

**storefront.mode** — `storefront_mode`(A) · `catalog_show_prices`(A) · `catalog_inquiry_message_ar`(V) · `catalog_inquiry_message_en`(V) · `whatsapp_enabled`(A — زر واتساب العائم؛ ينتقل من `route:pages` إلى هنا)

**storefront.home_hero** — `brands.hero_media`(A, json) · `brands.about_ar`(A) · `brands.about_en`(A) · `show_hero_title`(A) · `show_hero_about`(A) · `hero_title_en`(A) · `hero_title_ar`(A) · `hero_title_size`(V) · `hero_title_color`(V) · `hero_title_align`(V)

**storefront.home_sections** — `show_new_arrivals`(A) · `show_best_sellers`(A) · `new_arrivals_title_ar/en`(V) · `best_sellers_title_ar/en`(V) · `homepage_editorial_sections`(V, json) · `home_promo_cards`(A, json) · `trending_banner_background_url`(V) · `category_banner_background_url`(V) · `secondary_banner_parallax_enabled`(V) · `secondary_banner_parallax_mobile_enabled`(V) · `secondary_banner_parallax_breakpoint`(V) · `global_sale_badges_enabled`(A)

**storefront.header_footer** — `logo_size`(A) · `logo_align`(A) · `show_header_name`(A) · `menu_title_en/ar`(V) · `menu_show_home`(V) · `menu_show_account`(V) · `menu_show_orders`(V) · `menu_show_pages`(V) · `footer_logo_size`(V) · `show_footer_name`(A) · `trust_badges`(A, json) · `pages`(owner `route:pages`)

**storefront.announcement** — `announcement_enabled`(A) · `announcement_text_ar/en`(A) · `announcement_bg`(V) · `announcement_fg`(V) · `announcement_bold`(V) · `announcement_italic`(V) · `announcement_dismissible`(V) · `announcement_scope`(V) · `announcement_audience`(V)

**storefront.loader** — `storefront_loader_text_ar/en`(V)

**storefront.seo** — `brands.meta_title`(A) · `brands.meta_description`(A)

**orders.payments** — `cod_enabled`(A) · `card_enabled`(A) · `card_public_key`(V) · `card_secret_key`(V) · `card_processing_fee`(V) · `benefit_enabled`(A) · `benefit_qr_url`(A) · `benefit_account_number`(A) · `benefit_processing_fee`(V)

**orders.pricing** — `currency`(A) · `default_tax_rate`(A) · `vat_inclusive`(A) · `vat_number`(A)

**orders.fulfillment** — `delivery_enabled`(A) · `pickup_enabled`(A) · `digital_delivery_enabled`(A) · `delivery_fee`(A) · `delivery_estimate_enabled`(V) · `delivery_estimate_ar/en`(V) · `shipping_zones`(A, json) · جدول `branches` (A — `BranchesCard`)

**orders.invoice** — `invoice_template`(A) · `invoice_title_ar/en`(V) · `invoice_show_business_details`(V) · `invoice_show_business_name`(V) · `invoice_show_customer_contact`(V) · `invoice_show_fulfillment`(V) · `invoice_show_notes`(V) · `invoice_show_terms`(A) · `invoice_terms_ar/en`(A) · `footer_note`(A) · `invoice_inherit_brand_color`(A, **جديد**) · `primary_color`(V — يظهر فقط عندما inherit=false) · `invoice_secondary_color`(V) · `invoice_status_paid_color`(V) · `invoice_status_unpaid_color`(V) · `invoice_status_progress_color`(V) · `invoice_table_header_bg/fg`(V) · `invoice_divider_color`(V) · `invoice_inherit_brand_font`(A, **جديد**) · `font_family`(V — inherit=false) · `font_url`(V) · `font_size`(V) · `invoice_arabic_font_family`(V) · `text_color`(V) · `background_color`(V) · `logo_x`(V) · `logo_y`(V) · `logo_width`(V) · `logo_height`(V) · `next_invoice_number`(system — عرض فقط)

**notifications.templates** — `email_sender_name`(A) · `email_intro_ar/en`(A) · `email_footer_ar/en`(V) · `courier_out_for_delivery_message_ar/en`(A)

**notifications.recipients** — جدول `brand_notification_recipients` (A — يُنقل المكوّن من `admin.b.$slug.communications.tsx:54-210` إلى مكوّن مشترك يُستخدم في المكانين)

**account.subscription** — `brands.plan_type / subscription_* / trial_ends_at / renewal_intent*`(system — `SubscriptionCard` كما هو) **account.security** — `brands.support_access_enabled`(A — `SupportAccessCard`) + `PasskeySettings` **account.apps** — `WhiteLabelAppsPanel` كما هو

**system (غير قابلة للتعديل يدوياً):** `brand_id` · `user_id` · `created_at` · `updated_at` · `bom_enabled` (يُدار من صفحة المصروفات — owner `route:expenses`، أضف هذا الـ owner للنوع)

> ملاحظة للمنفّذ: إذا اكتشفت عموداً غير مذكور هنا، أضفه للسجل في أقرب مجموعة منطقية بمستوى `advanced` واذكره في وصف الـ PR. الاختبار الحارس (§2.3) سيمنعك من نسيانه.

### 2.3 الاختبار الحارس

`tests/settings-registry-parity.test.ts`:

1. يقرأ أسماء أعمدة `business_settings` من `src/integrations/supabase/types.ts` (parse نصي بسيط للكتلة `business_settings: { Row: {...} }`).
2. يتأكد أن **كل** عمود موجود في `SETTINGS_REGISTRY` **مرة واحدة بالضبط**.
3. يتأكد أن كل `group` مذكور موجود في `SETTINGS_GROUPS[tab]`.
4. يتأكد أن كل حقل `owner: "settings"` له `tab` و`group` غير فارغين.

### 2.4 snapshot لحمولات الحفظ الحالية

`tests/settings-save-payload-baseline.test.ts`: يستورد قائمة الأعمدة التي يكتبها كل handler حالياً (انسخها حرفياً من `settings.tsx:880-925`, `:2996`, `:4420-4430`, `:6155-6160`, `:6810-6830`, `:9011-9020`) كثوابت في `src/features/settings/legacy-save-columns.ts`، ويتأكد أن اتحادها ⊆ مفاتيح السجل ذات `owner: "settings"`. يُحذف هذا الملف في نهاية P2 بعد التحقق من التكافؤ.

### 2.5 مخرجات PR #1

- `src/features/settings/registry.ts` + `legacy-save-columns.ts`
- `tests/settings-registry-parity.test.ts` + `tests/settings-save-payload-baseline.test.ts`
- لا تغيير في الواجهة.

---

## §3 — المرحلة 1: معالج إنشاء البراند (PR #2)

**الهدف:** السوبر أدمن ينشئ براند جاهز 100% في أقل من 3 دقائق.

### 3.1 الـ migration `supabase/migrations/20260924100000_brand_wizard_provisioning.sql`

```sql
-- 1) أعمدة جديدة (بدون حذف أو إعادة تسمية)
ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS invoice_inherit_brand_color boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS invoice_inherit_brand_font  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS brand_palette jsonb NOT NULL DEFAULT '{}'::jsonb; -- {source:"logo"|"manual", extracted:[...], chosen:"dominant"|"muted"|"bold"|"manual"}

-- 2) store_vertical CHECK: أضف 'abayas' و 'coffee' (موجودان في STORE_VERTICALS بالكود لكن غير موجودين في القيد الحالي)
ALTER TABLE public.business_settings DROP CONSTRAINT IF EXISTS business_settings_store_vertical_check;
ALTER TABLE public.business_settings ADD CONSTRAINT business_settings_store_vertical_check
  CHECK (store_vertical IN ('abayas','fashion','beauty','coffee','food','gifts','print','jewelry','home','electronics','digital','general'));

-- 3) brands.primary_color مشتق من storefront_accent_color
CREATE OR REPLACE FUNCTION public.sync_brand_primary_color() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.storefront_accent_color IS NOT NULL
     AND NEW.storefront_accent_color IS DISTINCT FROM OLD.storefront_accent_color THEN
    UPDATE public.brands SET primary_color = NEW.storefront_accent_color, updated_at = now()
    WHERE id = NEW.brand_id;
  END IF;
  IF COALESCE(NEW.invoice_inherit_brand_color, true) AND NEW.storefront_accent_color IS NOT NULL THEN
    NEW.primary_color := NEW.storefront_accent_color;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS business_settings_sync_brand_primary_color ON public.business_settings;
CREATE TRIGGER business_settings_sync_brand_primary_color
  BEFORE UPDATE OF storefront_accent_color, invoice_inherit_brand_color ON public.business_settings
  FOR EACH ROW EXECUTE FUNCTION public.sync_brand_primary_color();

-- 4) backfill: لكل براند بدون storefront_accent_color اجعله = brands.primary_color
UPDATE public.business_settings bs SET storefront_accent_color = b.primary_color
FROM public.brands b WHERE b.id = bs.brand_id AND bs.storefront_accent_color IS NULL AND b.primary_color IS NOT NULL;
-- البراندات الحالية التي لون فاتورتها يختلف عن لون المتجر تحتفظ به:
UPDATE public.business_settings SET invoice_inherit_brand_color = false
WHERE storefront_accent_color IS NOT NULL AND primary_color IS DISTINCT FROM storefront_accent_color;
UPDATE public.business_settings SET invoice_inherit_brand_font = false
WHERE font_family IS DISTINCT FROM storefront_font_en AND font_family NOT IN ('Inter','');

-- 5) دالة الإنشاء الجديدة (overload جديد؛ القديمة تبقى للتوافق)
CREATE OR REPLACE FUNCTION public.create_tenant_with_defaults_v2(
  p_slug text, p_name_en text, p_name_ar text, p_owner_id uuid,
  p_store_vertical text, p_palette jsonb, p_font_preset jsonb, p_defaults jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_brand_id uuid; v_primary text; v_business_type text;
BEGIN
  IF NOT public.is_super_admin() AND COALESCE(auth.jwt() ->> 'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'SUPER_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;
  v_primary := COALESCE(p_palette->>'storefront_accent_color', '#800020');
  v_business_type := COALESCE(p_defaults->>'business_type', 'General Store');
  -- أعد استخدام الدالة القديمة لإنشاء brands + business_settings + التصنيف الأول
  v_brand_id := public.create_tenant_with_defaults(p_slug, p_name_en, p_name_ar, v_primary, p_owner_id, v_business_type);
  -- ثم اكتب كل ما تبقى دفعة واحدة
  UPDATE public.business_settings SET
    store_vertical = COALESCE(NULLIF(p_store_vertical,''), 'general'),
    storefront_accent_color = v_primary,
    storefront_background_color = p_palette->>'storefront_background_color',
    storefront_text_color = p_palette->>'storefront_text_color',
    heading_color = p_palette->>'heading_color', link_color = p_palette->>'link_color',
    price_color = p_palette->>'price_color', product_title_color = p_palette->>'product_title_color',
    btn_primary_bg = p_palette->>'btn_primary_bg', btn_primary_fg = p_palette->>'btn_primary_fg',
    btn_secondary_bg = p_palette->>'btn_secondary_bg', btn_secondary_fg = p_palette->>'btn_secondary_fg',
    btn_checkout_bg = p_palette->>'btn_checkout_bg', btn_checkout_fg = p_palette->>'btn_checkout_fg',
    header_bg = p_palette->>'header_bg', header_fg = p_palette->>'header_fg',
    footer_bg = p_palette->>'footer_bg', footer_fg = p_palette->>'footer_fg',
    menu_bg = p_palette->>'menu_bg', menu_fg = p_palette->>'menu_fg',
    badge_accent = COALESCE(p_palette->>'badge_accent','maroon'),
    brand_palette = COALESCE(p_palette->'meta','{}'::jsonb),
    storefront_font_en = COALESCE(p_font_preset->>'fontEn','Inter'),
    storefront_font_ar = COALESCE(p_font_preset->>'fontAr','Tajawal'),
    font_family = COALESCE(p_font_preset->>'fontEn','Inter'),
    invoice_arabic_font_family = COALESCE(p_font_preset->>'fontAr','Tajawal'),
    delivery_enabled = COALESCE((p_defaults->>'delivery_enabled')::boolean, delivery_enabled),
    pickup_enabled = COALESCE((p_defaults->>'pickup_enabled')::boolean, pickup_enabled),
    digital_delivery_enabled = COALESCE((p_defaults->>'digital_delivery_enabled')::boolean, false),
    storefront_mode = COALESCE(p_defaults->>'storefront_mode','shop'),
    trust_badges = COALESCE(p_defaults->'trust_badges', trust_badges),
    storefront_radius = COALESCE(p_defaults->>'storefront_radius', storefront_radius),
    updated_at = now()
  WHERE brand_id = v_brand_id;
  RETURN v_brand_id;
END $$;
REVOKE ALL ON FUNCTION public.create_tenant_with_defaults_v2(text,text,text,uuid,text,jsonb,jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_tenant_with_defaults_v2(text,text,text,uuid,text,jsonb,jsonb,jsonb) TO authenticated, service_role;

-- 6) أعد تعريف brand_public_settings لإضافة الأعمدة الجديدة (append-only كما في 20260915100000)
-- انسخ تعريف الـ view الحالي من supabase/migrations/20260915100000_store_vertical_and_modules.sql
-- وأضف: bs.invoice_inherit_brand_color, bs.invoice_inherit_brand_font, bs.brand_palette
NOTIFY pgrst, 'reload schema';
```

بعد الـ migration: حدّث `src/integrations/supabase/types.ts` بالأعمدة والدالة الجديدة (نفس أسلوب الأعمدة المجاورة).

### 3.2 مكتبة استخراج اللوحة `src/lib/logo-palette.ts` (نقية، بدون تبعيات)

```ts
export interface ExtractedColor {
  hex: string;
  population: number;
  saturation: number;
  lightness: number;
}
export interface BrandPalette {
  storefront_accent_color: string;
  storefront_background_color: string;
  storefront_text_color: string;
  heading_color: string;
  link_color: string;
  price_color: string;
  product_title_color: string;
  btn_primary_bg: string;
  btn_primary_fg: string;
  btn_secondary_bg: string;
  btn_secondary_fg: string;
  btn_checkout_bg: string;
  btn_checkout_fg: string;
  header_bg: string;
  header_fg: string;
  footer_bg: string;
  footer_fg: string;
  menu_bg: string;
  menu_fg: string;
  badge_accent: string;
  meta: { source: "logo" | "manual"; chosen: PaletteMood; extracted: string[] };
}
export type PaletteMood = "dominant" | "muted" | "bold";

/** يرسم الصورة (PNG/JPG/WebP/SVG) على canvas 128×128 ويعيد بكسلات RGBA. */
export async function rasterizeImage(file: Blob, size = 128): Promise<Uint8ClampedArray>;

/**
 * Median-cut quantization:
 * - يتجاهل البكسلات ذات alpha < 128
 * - يتجاهل البكسلات القريبة من الأبيض (L > 0.94) والأسود (L < 0.06) — تُحسب لكن لا تدخل الترشيح
 * - يعيد حتى maxColors لون مرتبة حسب population
 */
export function quantize(pixels: Uint8ClampedArray, maxColors = 6): ExtractedColor[];

/** يختار الأساسي (أعلى population بتشبّع ≥ 0.25، وإلا الأعلى تشبّعاً) والثانوي (أبعد مسافة ΔE تقريبية عن الأساسي). */
export function pickPrimarySecondary(colors: ExtractedColor[]): {
  primary: string;
  secondary: string;
};

/** يشتق كل الأعمدة من لونين. mode يغيّر التشبّع/الإضاءة: muted = -20% تشبّع، bold = +15% تشبّع و -10% إضاءة. */
export function derivePalette(primary: string, secondary: string, mood: PaletteMood): BrandPalette;

/** الدالة العليا: file → ثلاث لوحات مقترحة. */
export async function extractBrandPalettes(file: Blob): Promise<Record<PaletteMood, BrandPalette>>;

/** أدوات مساعدة مصدَّرة للاختبار: hexToHsl, hslToHex, contrastRatio (WCAG), readableOn */
```

قواعد الاشتقاق داخل `derivePalette` (ثابتة لتكون قابلة للاختبار):

- `btn_primary_bg = primary`، `btn_primary_fg = readableOn(primary)` (استخدم `getReadableTextColor` من `src/lib/color-utils.ts` أو أعد تنفيذها محلياً بـ contrast ≥ 4.5).
- `btn_checkout_bg = primary`, `btn_checkout_fg = btn_primary_fg`.
- `btn_secondary_bg = secondary`, `btn_secondary_fg = readableOn(secondary)`.
- `heading_color = primary` معدّلاً حتى يحقق contrast ≥ 4.5 مع `storefront_background_color` (#ffffff افتراضياً) عبر تقليل الإضاءة تدريجياً.
- `link_color = heading_color`, `price_color = heading_color`, `product_title_color = "#111111"`.
- `header_bg = "#ffffff"`, `header_fg = "#111111"`, `footer_bg = darken(primary, 0.35)`, `footer_fg = readableOn(footer_bg)`, `menu_bg = header_bg`, `menu_fg = header_fg`.
- `storefront_text_color = "#111111"`, `storefront_background_color = "#ffffff"`.
- `badge_accent`: اختر من القيم المسموحة في `$slug.route.tsx:508+` (`maroon | crimson | ...`) الأقرب لونياً للـ primary.

اختبارات `tests/logo-palette.test.ts`: (1) صورة اصطناعية 50% أحمر 30% أزرق 20% شفاف ⇒ الأساسي أحمر والثانوي أزرق؛ (2) شعار أبيض/أسود فقط ⇒ fallback إلى `#800020`/`#111111` مع `meta.source = "manual"`؛ (3) كل الأزواج (bg/fg) في اللوحة المشتقة تحقق contrast ≥ 4.5؛ (4) `derivePalette` حتمية (نفس المدخل ⇒ نفس المخرج).

> `rasterizeImage` يعمل في المتصفح فقط (يحتاج `Image` + `canvas`). في الاختبارات اختبر `quantize/derivePalette` على مصفوفات بكسل مصنّعة يدوياً.

### 3.3 قوالب النشاط `src/lib/brand-templates/index.ts`

```ts
import type { StoreVertical } from "@/lib/store-profile";
export interface BrandTemplate {
  vertical: StoreVertical;
  fontPresetId: string; // من FONT_MOOD_PRESETS
  storefront_mode: "shop" | "catalog";
  delivery_enabled: boolean;
  pickup_enabled: boolean;
  digital_delivery_enabled: boolean;
  storefront_radius: "0px" | "0.375rem" | "1rem" | "1.5rem";
  trust_badges: TrustBadgesConfig; // نفس النوع المستخدم في TrustBadgesEditor
  announcement?: { ar: string; en: string };
}
export const BRAND_TEMPLATES: Record<StoreVertical, BrandTemplate>;
export function templateFor(v: StoreVertical): BrandTemplate;
```

قيم البداية (عدّلها بحرية لكن وثّقها):

| vertical      | fontPreset  | mode    | delivery | pickup | digital | radius   |
| ------------- | ----------- | ------- | -------- | ------ | ------- | -------- |
| `abayas`      | `classic`   | shop    | ✓        | ✓      | ✗       | 0.375rem |
| `fashion`     | `signature` | shop    | ✓        | ✓      | ✗       | 1rem     |
| `beauty`      | `signature` | shop    | ✓        | ✓      | ✗       | 1rem     |
| `jewelry`     | `classic`   | shop    | ✓        | ✓      | ✗       | 0px      |
| `coffee`      | `strong`    | shop    | ✓        | ✓      | ✗       | 1rem     |
| `food`        | `bubble`    | catalog | ✓        | ✓      | ✗       | 1.5rem   |
| `gifts`       | `bubble`    | shop    | ✓        | ✓      | ✗       | 1.5rem   |
| `print`       | `modern`    | catalog | ✓        | ✓      | ✗       | 0.375rem |
| `home`        | `modern`    | shop    | ✓        | ✓      | ✗       | 1rem     |
| `electronics` | `modern`    | shop    | ✓        | ✓      | ✗       | 0.375rem |
| `digital`     | `modern`    | shop    | ✗        | ✗      | ✓       | 1rem     |
| `general`     | `modern`    | shop    | ✓        | ✓      | ✗       | 1rem     |

اختبار `tests/brand-templates.test.ts`: كل `StoreVertical` له قالب؛ كل `fontPresetId` موجود في `FONT_MOOD_PRESETS`؛ `digital` بدون توصيل.

### 3.4 الـ backend: توسيع `provision-brand`

في `supabase/functions/user-management/index.ts` → `handleProvisionBrand`:

- اقرأ من الـ body: `store_vertical` (تحقق من القائمة)، `palette` (jsonb — تحقق أن كل قيمة hex `^#[0-9a-f]{6}$`)، `font_preset` (`{ id, fontEn, fontAr }`)، `defaults` (من القالب: `business_type` عبر `verticalToLegacyBusinessType` — انسخ الدالة إلى الـ edge function لأنها لا تستطيع استيراد `src/`)، `delivery_enabled`, `pickup_enabled`, `digital_delivery_enabled`, `storefront_mode`, `trust_badges`, `storefront_radius`.
- استدعِ `create_tenant_with_defaults_v2` بدل القديمة. إذا لم يُرسل `palette` (عميل قديم) استخدم `{ storefront_accent_color: "#800020" }` — التوافق محفوظ.
- **لا تبني التطبيق هنا.** أعد `brand_id` فقط.

في `src/lib/brand-provisioning.ts`: وسّع `ProvisionBrandPayload` بالحقول أعلاه (كلها اختيارية).

### 3.5 إجراء ما بعد الإنشاء (server function)

`src/lib/brand-wizard.functions.ts` — `finalizeBrandSetup = createServerFn({ method: "POST" })` بمدخل `{ brandId, storeVertical, logoUrl?, faviconUrl? }`، يعمل بصلاحيات السوبر أدمن (أعد استخدام نمط التحقق في `src/lib/onboarding.functions.ts:409+`):

1. `UPDATE business_settings SET logo_url, favicon_url` + `UPDATE brands SET logo_url`.
2. `installStarterPack({ brandId, activity: verticalToLegacyBusinessType(vertical) })` (موجودة في `src/lib/addons/addons.functions.ts:600`).
3. `syncBrandVerticalCategories({ db, brandId, newVertical, replaceEmptyOldCategories: true })` (`src/lib/addons/vertical-categories.ts:98`). انتبه: الدالة تحمي `PURA_BRAND_ID` — لا تغيّر ذلك.
4. يعيد `{ ok: true, categoriesInserted, addonsInstalled }`.

### 3.6 واجهة المعالج

استبدل `NewBrandDialog` (`admin.brands.tsx:893-1128`) بـ `src/components/super-admin/brand-wizard/`:

```
BrandWizardDialog.tsx        // الحاوية + مؤشر الخطوات + الحالة المشتركة (useReducer)
StepIdentity.tsx             // الخطوة 1
StepVertical.tsx             // الخطوة 2
StepOwnerAndPlan.tsx         // الخطوة 3 + الملخص
PalettePicker.tsx            // ثلاث بطاقات (مهيمنة/هادئة/جريئة) + تعديل يدوي للونين
LogoDropzone.tsx             // سحب وإفلات + معاينة + شفافية
BrandMiniPreview.tsx         // معاينة مصغّرة ثابتة (ترويسة/زر/بطاقة منتج/تذييل) تُستخدم في المعالج وفي الإعدادات
VerticalPicker.tsx           // شبكة 12 نشاط — انقل الـ JSX من src/routes/onboard.tsx:539-640 إلى هذا المكوّن وأعد استخدامه في onboard.tsx أيضاً
```

**الخطوة 1 — الهوية**

- الاسم (عربي/إنجليزي)، الـ slug: يُقترح تلقائياً من الاسم الإنجليزي (`slugify`) **لكن يبقى قابلاً للتعديل** ويظهر تحذير إن كان مستخدماً (استعلام `brands.slug`). (قرار المالك السابق كان "يدوي دائماً"؛ الاقتراح التلقائي مع إبقاء التعديل يحترم هذا القرار — لا تولّده بصمت بعد أن يلمسه المستخدم.)
- `LogoDropzone`: يقبل PNG/SVG/WebP/JPG. عند الاختيار: يعرض المعاينة، ويستدعي `extractBrandPalettes(file)` ويعرض `PalettePicker`. الشعار **لا يُرفع الآن** (يحتاج `brandId`) — يُحفظ كـ `File` في حالة المعالج.
- `PalettePicker`: ثلاث بطاقات، كل بطاقة تحوي `BrandMiniPreview` باللوحة. الافتراضي "مهيمنة". أسفلها لونان قابلان للتعديل (أساسي/ثانوي) — أي تعديل يعيد `derivePalette` بنفس الـ mood ويضع `meta.source = "manual"`.
- إذا لم يُرفع شعار: اللوحة الافتراضية `derivePalette("#800020", "#111111", "dominant")` مع تنبيه هادئ "يمكنك رفع الشعار لاحقاً".

**الخطوة 2 — النشاط**

- `VerticalPicker`. عند الاختيار: يُطبَّق `templateFor(vertical)` (نمط الخط، وضع البيع، التوصيل، الشارات، الزوايا) ويظهر ملخص "ما سيُجهَّز تلقائياً" (الوحدات من `VERTICAL_MODULE_DEFAULTS`، عدد التصنيفات من `DEFAULT_VERTICAL_CATEGORIES[vertical].length`، الإضافات من `starterPackFor(vertical).required`).
- نمط الخط قابل للتغيير هنا (نفس بطاقات `FONT_MOOD_PRESETS`).
- `BrandMiniPreview` يتحدث بالخط واللوحة.

**الخطوة 3 — المالك والباقة والملخص**

- نفس حقول اليوم (اسم/بريد/هاتف/كلمة مرور مؤقتة/الباقة/مفتاح White-Label) بنفس التحقق.
- ملخص نهائي: الشعار + اللوحة + النشاط + الخط + المالك.
- زر "إنشاء البراند" ينفّذ التسلسل:

```ts
const provisioned = await provisionBrandWithOwner({ ...names, slug, owner..., plan_type,
  store_vertical, palette, font_preset, defaults: templateFor(vertical) });
setProgress("uploading-logo");
const logoUrl = logoFile ? await uploadPublicMedia(provisioned.brand_id, logoFile, "logo") : null;
const faviconUrl = faviconFile ? await uploadPublicMedia(provisioned.brand_id, faviconFile, "favicon") : null;
setProgress("finalizing");
await finalizeBrandSetup({ data: { brandId: provisioned.brand_id, storeVertical, logoUrl, faviconUrl } });
if (createMobileApp) { setProgress("app"); await supabase.functions.invoke("provision-white-label-app", { body: { brand_id, rebuild: false } }); }
setProgress("done"); // يعرض: رابط المتجر، رابط لوحة التحكم، بيانات الدخول المؤقتة للمالك
```

- شاشة تقدّم بخطوات مرئية؛ أي فشل بعد الإنشاء (رفع/تجهيز/تطبيق) **لا يلغي البراند** بل يعرض "تم الإنشاء، خطوة X تحتاج إعادة محاولة" مع زر إعادة المحاولة لتلك الخطوة فقط.

### 3.7 زر "استخراج الألوان من الشعار" للبراندات الموجودة

في إعدادات البراند (اليوم في `QuickThemeCustomizer` بجانب اللون الأساسي؛ بعد P2 في `identity.palette`): زر يفتح `PalettePicker` على الشعار الحالي (`fetch(logo_url)` → Blob → `extractBrandPalettes`) ويكتب اللوحة المختارة في الـ state (لا يحفظ تلقائياً). أضفه الآن في `QuickThemeCustomizer` كـ prop اختياري `onExtractFromLogo` حتى لا ينتظر P2.

### 3.8 نافذة تعديل البراند للسوبر أدمن

`EditBrandDialog` (`admin.brands.tsx:1130`): حقل "لون العلامة" يصبح **للقراءة فقط** مع نص "يُدار من إعدادات المتجر ← الهوية" ورابط `/admin/b/$slug/settings?tab=identity`. (النبذة و Meta تبقى قابلة للتعديل هنا حتى P2، ثم تتحول للقراءة فقط بنفس الأسلوب — D7.)

### 3.9 مخرجات PR #2

- migration + types
- `src/lib/logo-palette.ts`, `src/lib/brand-templates/index.ts`, `src/lib/brand-wizard.functions.ts`
- edge function + `brand-provisioning.ts`
- `src/components/super-admin/brand-wizard/*` + إعادة استخدام `VerticalPicker` في `onboard.tsx`
- `EditBrandDialog` (قراءة فقط للون) + زر الاستخراج في `QuickThemeCustomizer`
- اختبارات: `logo-palette`, `brand-templates`, + اختبار لـ `handleProvisionBrand` payload validation إن وُجد إطار اختبار للـ edge functions (وإلا وثّق التحقق اليدوي)
- تحديث `docs/` (هذا الملف: علّم P1 مكتملة + أي انحرافات)

**تحقق يدوي:** أنشئ براند تجريبي بشعار ملوّن → افتح `/{slug}` → الترويسة والأزرار بلون الشعار، الخط حسب النشاط، التصنيفات المبدئية موجودة، الإضافات المطلوبة مثبّتة، `store_vertical` صحيح في DB، `brands.primary_color = storefront_accent_color`، التطبيق (إن فُعّل) يحمل الشعار واللون من أول build.

---

## §4 — المرحلة 2: إعادة هيكلة صفحة الإعدادات (PR #3)

**الهدف:** 5 تبويبات، مستويان، مكان واحد لكل حقل، state وحفظ واحد، صفر تكرار.

### 4.1 البنية الجديدة

```
src/features/settings/
  registry.ts                         (من P0)
  use-brand-settings-form.ts          (§1.6)
  settings-level.ts                   (أساسي/متقدم + localStorage key)
  diff.ts                             (diff عميق للكائنات مع دعم jsonb)
  SettingsPage.tsx                    (الحاوية: Header + Search + Readiness + Tabs)
  SettingsTabs.tsx                    (يستبدل SettingsScopeSwitcher بالتبويبات الخمسة)
  FieldVisibility.tsx                 (<AdvancedOnly> wrapper يقرأ المستوى)
  tabs/
    identity/  IdentityTab.tsx, BasicsGroup.tsx, VerticalGroup.tsx (يغلّف StoreProfileCard), PaletteGroup.tsx, TypographyGroup.tsx, ContactGroup.tsx
    storefront/ StorefrontTab.tsx, ModeGroup.tsx, HomeHeroGroup.tsx, HomeSectionsGroup.tsx, HeaderFooterGroup.tsx, AnnouncementGroup.tsx, LoaderGroup.tsx, SeoGroup.tsx
    orders/    OrdersTab.tsx, PaymentsGroup.tsx, PricingGroup.tsx, FulfillmentGroup.tsx, InvoiceGroup.tsx
    notifications/ NotificationsTab.tsx, TemplatesGroup.tsx, RecipientsGroup.tsx
    account/   AccountTab.tsx (SubscriptionCard, SupportAccessCard, PasskeySettings, WhiteLabelAppsPanel كما هي)
  shared/
    NotificationRecipientsEditor.tsx  (منقول من communications.tsx ويُستخدم هناك أيضاً)
    LivePreviewPane.tsx               (P3)
```

`src/routes/_authenticated/admin.b.$slug.settings.tsx` يصبح: `beforeLoad` الحالي كما هو + `component: SettingsPage` + `validateSearch` لـ `?tab=&group=` (deep-link للبحث والجاهزية والروابط من السوبر أدمن).

### 4.2 استراتيجية النقل (بدون كسر)

انقل الكود **حرفياً** من `settings.tsx` إلى ملفات المجموعات، ثم عدّله. الترتيب:

1. **`use-brand-settings-form.ts`**: استعلام واحد `select("*")` من `business_settings` (queryKey `queryKeys.brand.businessSettings(brandId)`) + استعلام `brands` بالأعمدة: `hero_media, about_ar, about_en, meta_title, meta_description, logo_url, custom_domain, support_access_enabled`. State: `{ bs: Partial<BusinessSettingsRow>, brand: Partial<BrandRow> }`. `save()` = `diff` ثم `update(...).eq("brand_id")` و `update(...).eq("id")`، ثم `beforeSave/afterSave` hooks، ثم invalidate `queryKeys.brand.*` + `["business-settings-theme", brandId]` + `["brand-hero", brandId]` (المفاتيح القديمة حتى تُزال آخر المستهلكين).
2. **الحقول البسيطة أولاً** (identity.basics/contact، orders.pricing، storefront.announcement/loader/seo، notifications.templates): استبدل `f`/`state`/`form` المحلية بـ `form.bs.<key>` و `form.set("key", value)`.
3. **المجموعات ذات المنطق الخاص:**
   - `orders.fulfillment`: `ShippingSettingsCard` (`settings.tsx:4317`) — عمليات `shipping_zones` تبقى كما هي لكنها تكتب في `form.bs.shipping_zones` وتُحفظ عبر الحفظ الموحد (احذف الـ 3 تحديثات المباشرة `:4539, 4576, 4614`). `BranchesCard` يبقى بحفظه المستقل (جدول مختلف) — مقبول.
   - `identity.vertical`: `StoreProfileCard` يبقى بحفظه الخاص (تغيير النشاط عملية متعددة الخطوات مع تأكيد) — سجّله في الـ registry كـ `owner: "settings"` مع ملاحظة `selfSaving: true` وأضف هذا الحقل للنوع.
   - `storefront.home_hero`: ادمج `BrandHeroCard` + `HeroSlidesEditor` + حقول `hero_title_*` في `HomeHeroGroup`؛ الحفظ الموحد يكتب `brands.hero_media/about_*` و `business_settings.hero_title_*/show_hero_*` معاً. احذف الاستعلام `["brand-hero"]`.
   - `identity.palette`: `QuickThemeCustomizer` (المستوى الأساسي: لون العلامة + الخلفية + الزوايا + الشارة + زر الاستخراج من الشعار + زر "إعادة اشتقاق الألوان") + `<AdvancedOnly>` يعرض الأقسام الثلاثة الحالية "ألوان المتجر والعناوين والمنتجات" / "الترويسة والتذييل" / "أزرار المتجر والتفاعل" (`settings.tsx:7246-7530`). **`FooterLogoResizerControl` يُحذف من هنا** (D2) ويبقى في `header_footer`.
   - `identity.typography`: بطاقات `FONT_MOOD_PRESETS` (أساسي) + `<AdvancedOnly>` `TypographyAdvancedControls` + `admin_typography`.
   - `orders.invoice`: كل أقسام تبويب الفاتورة الحالية (`settings.tsx:1471-2670`) مع: مفتاح `invoice_inherit_brand_color` يخفي منتقي `primary_color`؛ مفتاح `invoice_inherit_brand_font` يخفي حقول الخط؛ `footer_note` **مرة واحدة هنا** (D1)؛ `logo_x/y/width/height` تبقى؛ **احذف `logo_size` من حمولة حفظ الفاتورة** (D11) واجعل الـ fallback في المعاينة يقرأ `form.bs.logo_size` للقراءة فقط.
   - `storefront.header_footer`: حجم/محاذاة الشعار + اسم الترويسة + القائمة + `FooterLogoResizerControl` (المكان الوحيد) + `TrustBadgesEditor`.
   - `storefront.mode`: `StorefrontModeCard` (`settings.tsx:6017`) بدون حقل `whatsapp_number` (D10) — يعرض الرقم من `identity.contact` مع رابط. أضف `whatsapp_enabled` هنا وانقل التحكم به من `admin.b.$slug.pages.tsx:237-368` (هناك يصبح للقراءة مع رابط).
   - `notifications.recipients`: استخرج `NotificationRecipientsEditor` من `communications.tsx:54-210` واستخدمه في المكانين (D9).
   - `orders.payments`: `PaymentSettingsCard` + شريط حالة "بيانات اعتماد Tap: مضبوطة/غير مضبوطة" يقرأ `list_integration_credentials` (كما في `integrations.tsx`) مع رابط (D8).
4. **احذف** `SettingsScopeSwitcher`, `CustomizerNavigation`, `themeMode`, `settingsTab`, `tabSaveHandlersRef`, `storefrontModeSaveRef`, `storefrontCustomizerSaveRef`, `activeTabDirty`, والاستعلامات الستة، وقراءات/كتابات `localStorage` لـ `boutq_storefront_radius/header_glass/badge_accent` في **الإعدادات و`$slug.route.tsx:490-505`** (S2). المعاينة الحية تصبح عبر P3.
5. **`SettingsSearchBar`**: مؤقتاً حدّث `tabId` للتبويبات الجديدة (يُولَّد من السجل في P3).
6. **`StoreReadinessChecklist`**: حدّث `tabId` للتبويبات الجديدة (يُولَّد من السجل في P3).
7. **`spotlight-command-palette.tsx`** وأي رابط داخلي إلى `settings` بتبويب قديم (`grep -rn "settings?tab=\|setActiveTab(" src`) → حدّثه.

### 4.3 المستوى أساسي/متقدم

- `settings-level.ts`: `useSettingsLevel(): ["basic"|"advanced", setLevel]`.
- `<AdvancedOnly>`: يعرض الأطفال فقط في `advanced`؛ في `basic` يعرض سطراً واحداً رمادياً "N إعدادات متقدمة مخفية — إظهار" (زر يبدّل المستوى).
- المفتاح في `SettingsCommandHeader` (segmented: "أساسي | متقدم").
- **قاعدة:** أي حقل `level: "advanced"` في السجل يُلفّ بـ `<AdvancedOnly>`. اختبار وحدة يتحقق أن عدد الحقول `basic` في السجل ≤ 45 (حارس ضد التضخم).

### 4.4 التسميات (Arabic first, business-owner vocabulary)

استبدل التسميات التقنية بتسميات بسيطة عند النقل. أمثلة ملزمة:

| القديم                                              | الجديد                               |
| --------------------------------------------------- | ------------------------------------ |
| "بيانات المتجر والاتصال والضريبة والعملة"           | "الاسم والشعار" / "التواصل والعنوان" |
| "مظهر المتجر والقالب البصري"                        | "الألوان" / "الخطوط"                 |
| "الترويسة والتذييل" (متقدم)                         | "أعلى الصفحة وأسفلها"                |
| "انحناء الزوايا وشارات التخفيضات"                   | "شكل الزوايا"                        |
| "تأثير الحركة البارالاكس للافتات (Parallax Effect)" | "حركة اللافتات عند التمرير"          |
| "وضع المتجر ونموذج البيع"                           | "طريقة البيع"                        |
| "Storefront Mode & Selling Model"                   | "Selling Mode"                       |

### 4.5 مخرجات PR #3

- `src/features/settings/**` + الملف الروتي المختصر (≤ 150 سطر)
- حذف الكود المنقول من `settings.tsx` (الملف يختفي عملياً ويبقى الروت فقط)
- `NotificationRecipientsEditor` مشترك؛ `pages.tsx` و `communications.tsx` و `EditBrandDialog` محدثة
- حذف `legacy-save-columns.ts` واختباره بعد تحديث اختبار التكافؤ ليتحقق من أن كل حقل `owner:"settings"` **مستخدم فعلاً** في مكوّن مجموعة (اختبار نصي: `grep` لاسم المفتاح داخل `src/features/settings/tabs/**`)
- Playwright smoke: `tests/settings-tabs.spec.ts` — يفتح الإعدادات، يتنقل بين التبويبات الخمسة، يغيّر اسم المتجر ويحفظ، يتحقق من الـ toast.

**تحقق يدوي (لا تتخطاه):** لكل مجموعة في §2.2 غيّر حقلاً واحداً، احفظ، أعد التحميل، تأكد من القيمة في DB وفي المتجر `/{slug}`. تأكد خصوصاً من: D11 (`logo_size` لا يُدهس)، S2 (تغيير الزوايا يظهر فوراً في المتجر بدون localStorage)، D6 (حفظ الهيرو يكتب الجدولين).

---

## §5 — المرحلة 3: التلميع (PR #4)

1. **المعاينة الحية** `shared/LivePreviewPane.tsx`: على الشاشات ≥ `xl` تظهر لوحة جانبية بـ `iframe src="/{slug}?preview=1"` (النمط موجود في `src/components/onboarding/StorefrontLivePreview.tsx:42`). بعد كل حفظ ناجح `iframe.contentWindow.location.reload()`. زر تبديل جوال/سطح مكتب (عرض 390px / 100%). على الشاشات الأصغر زر "معاينة" يفتح `/{slug}` في تبويب جديد (الموجود اليوم).
2. **فهرس البحث من السجل**: `SettingsSearchBar` يستورد `SETTINGS_REGISTRY` ويبني الفهرس من `label` + `keywords` + اسم المجموعة؛ النتيجة تنقل إلى `?tab=&group=` وتفتح البطاقة وتمرّر إليها (`scrollIntoView`). احذف `SETTINGS_SEARCH_INDEX` اليدوي.
3. **قائمة الجاهزية من السجل**: كل عنصر في `StoreReadinessChecklist` يشير إلى `{ tab, group }` من السجل بدل `tabId` اليدوي. أضف عنصر "لون العلامة مستخرج من الشعار" (يتحقق من `brand_palette.meta.source === "logo"`) وعنصر "نوع النشاط محدد" (`store_vertical !== "general"`).
4. **إرشاد أول زيارة**: بانر قابل للإغلاق في تبويب الهوية "ابدأ من هنا: الشعار ← اللون ← الخط ← نوع النشاط" (localStorage `boutq_settings_intro_dismissed`).
5. **تنظيف**: احذف `SettingsScopeSwitcher.tsx` و `CustomizerNavigation` ومفاتيح localStorage القديمة (أضف `localStorage.removeItem` لمرة واحدة للمفاتيح الثلاثة في `SettingsPage` mount حتى لا تبقى قيم قديمة في متصفحات أصحاب الأعمال).
6. **التوثيق**: `docs/settings-architecture.md` (السجل، المستويات، نموذج الحفظ، كيفية إضافة حقل جديد في 4 خطوات) + تحديث هذا الملف بحالة الإنجاز.

---

## §6 — التنفيذ على مستوى الـ PRs

| PR  | الفرع                          | المحتوى | التحقق                                                                                           |
| --- | ------------------------------ | ------- | ------------------------------------------------------------------------------------------------ |
| #1  | `feat/settings-registry`       | §2      | `npm run check`؛ اختبار التكافؤ يمر بـ 157 عموداً                                                |
| #2  | `feat/brand-setup-wizard`      | §3      | `npm run check` + `db:migrations:check`؛ التحقق اليدوي في §3.9؛ إنشاء براند بدون شعار يعمل أيضاً |
| #3  | `feat/settings-ia-restructure` | §4      | `npm run check`؛ Playwright؛ التحقق اليدوي في §4.5؛ `settings.tsx` ≤ 150 سطر                     |
| #4  | `feat/settings-polish`         | §5      | `npm run check`؛ البحث يصل لكل مجموعة؛ المعاينة تتحدث بعد الحفظ                                  |

كل PR: وصف بالإنجليزية يذكر رقم القسم، قائمة الملفات، الانحرافات عن الخطة (إن وجدت)، ولقطات شاشة للواجهة.

---

## §7 — ما لا يجب فعله

- لا تحذف أو تعيد تسمية أعمدة. لا تغيّر `brand_public_settings` إلا بالإضافة.
- لا تغيّر منطق قراءة الألوان في `$slug.route.tsx:452-470` (الـ `??` fallbacks) — اللوحة المشتقة تُكتب كقيم صريحة فتبقى النتيجة متطابقة.
- لا تحوّل `StoreProfileCard` (تغيير النشاط) إلى الحفظ الموحد — عمليته متعددة الخطوات ومؤكَّدة بحوار.
- لا تلمس `PURA_BRAND_ID` في مزامنة التصنيفات.
- لا تضف مكتبة لاستخراج الألوان؛ التنفيذ الذاتي مطلوب (حجم الحزمة + SVG).
- لا تبنِ التطبيق قبل اكتمال الشعار واللوحة.
- لا تجعل الـ slug يُولَّد بصمت بعد أن يعدّله المستخدم.

## §8 — قرارات المالك (لا تُعاد مناقشتها)

1. **اللون الأساسي الواحد** = `storefront_accent_color`. `brands.primary_color` مشتق بـ trigger؛ لون الفاتورة يرث افتراضياً مع مفتاح للاستقلال.
2. **الإشعارات**: "المستلمون" يُنقلون إلى الإعدادات كمكوّن مشترك؛ سجل المراسلات يبقى في صفحته.
3. **أساسي/متقدم** على مستوى الصفحة كلها (مفتاح واحد)، الافتراضي أساسي.
4. **الـ slug** يُقترح تلقائياً لكنه قابل للتعديل يدوياً دائماً (لا يُشتق بصمت بعد التعديل).
5. **5 تبويبات** بالأسماء في §1.5.
6. **لا مكتبات جديدة** لاستخراج الألوان.

> إذا رفض المالك أياً من هذه القرارات عند تسليم الخطة، سيعدّل هذا القسم قبل بدء التنفيذ.

## §9 — تعريف الاكتمال (Definition of Done)

- [x] اختبار التكافؤ يمر: كل عمود في `business_settings` (157 + الجديدة) في السجل مرة واحدة، وكل حقل `owner:"settings"` مستخدم في مكوّن (`tests/settings-registry-parity.test.ts`).
- [x] `admin.b.$slug.settings.tsx` ≤ 150 سطر (حالياً 35 سطراً)؛ لا ملف جديد تحت `src/features/settings/` > 600 سطر.
- [x] 5 تبويبات، مستويان، لا تبويبات فرعية، لا وضع سريع/متقدم داخل التبويب.
- [x] D1–D11 و S1–S6 و B1–B7 كلها معالجة (انظر جدول التتبع في ملخص PR #4).
- [x] إنشاء براند من السوبر أدمن بشعار ملوّن ينتج متجراً بلوحة مستخرجة، نشاط صحيح، تصنيفات وإضافات مبدئية، وتطبيقاً مبنياً بالشعار واللون الصحيحين من أول مرة — بدون أي تعديل يدوي لاحق.
- [x] براند قديم (مثل Pura) يفتح الإعدادات ويرى **كل** قيمه السابقة في أماكنها الجديدة، ويحفظ بدون تغيير غير مقصود (`useBrandSettingsFormContext` مع baseline diff).
- [x] المتجر `/{slug}` لا يتغيّر بصرياً لأي براند قديم بعد الترقية.
- [x] `npm run db:migrations:check` و `tests/settings-registry-parity.test.ts` و `tests/settings-tabs.test.ts` تمر بدون أخطاء.
- [x] `docs/settings-architecture.md` موجود ومحدَّث وشامل.

---

### Baseline (measured 2026-09-19 at `9ec0613e`, branch `feat/vertical-categories-stock-tailoring`)

- `npx vitest run` → **138 files: 130 passed, 8 failed; 869 tests: 854 passed, 15 failed.** The 8 pre-existing failing files are: `tests/addon-registry.test.ts`, `tests/admin-feedback-states.test.ts`, `tests/design-system-guardrails.test.ts`, `tests/fit-passport.test.ts`, `tests/food-sweets-variants-refinement.test.ts`, `tests/formatting.behavior.test.ts`, `tests/storefront-performance-guardrails.test.ts`, `tests/vanilla-core-guard.test.ts`. **These are not yours to fix** (they belong to the in-progress feature branch) — but you must not add any new failure, and if `main` is green when you branch from it, keep it green.
- `npm run typecheck` → **2 pre-existing errors**, both in `src/lib/storefront-cookies.functions.ts` (`string | undefined` passed where `string`/`"en" | "ar" | null` expected). Same rule: do not add errors.
- Re-run all three commands on your starting commit and paste the fresh numbers into your first PR description.
