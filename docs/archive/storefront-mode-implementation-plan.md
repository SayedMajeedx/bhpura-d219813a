# Storefront Mode (Shop vs Catalog) — Implementation Plan

> خطة تنفيذ كاملة لإضافة "وضع المتجر" على مستوى البراند: بيع مباشر (`shop`) أو كتالوج/عرض فقط مع زر واتساب (`catalog`).
> الوثيقة مكتوبة لتُنفَّذ كما هي — بواسطة مطوّر أو مساعد AI — داخل هذا المستودع تحديداً. كل مسار ملف ورقم سطر مذكور تم التحقق منه من الكود الفعلي بتاريخ 2026-09-12.
>
> **قواعد عامة تنطبق على كل المراحل:**
>
> - لا تعديل على أي ملف موجود في `supabase/migrations/` — فقط **إضافة** ملفات migration جديدة.
> - لا تعديل على `package.json`.
> - احترم guardrails نظام التصميم: لا `text-[10px]`/`text-[11px]` (استخدم `text-xs`)، لا `border-border/50`، لا `<button>` خام (استخدم `Button` من `@/components/ui/button`)، لا ألوان hex مكتوبة يدوياً في الـ className.
> - الـ i18n في هذا المستودع غالباً inline: `lang === "ar" ? "..." : "..."` — اتبع نفس نمط الملف الذي تعدّله.
> - Baseline الاختبارات الحالي: 5 اختبارات فاشلة **قبل** أي تغيير (`annual-subscription-regressions`, `image-crop-system`, `manual-order-tailoring-specs`, `pura-growth-tools`, `subscription-renewal-decision`). معيار النجاح = **لا فشل جديد**، وليس 100%.
> - بعد كل مرحلة: `npm run typecheck` (صفر أخطاء) + `npx vitest run` (لا فشل جديد) + `npx eslint <الملفات المعدّلة>` (لا أخطاء جديدة غير `prettier/prettier`) + `npm run db:migrations:check` إذا أضفت migration.

---

## 0. القرار المعماري (لماذا هكذا)

| الخيار                    | القرار                                                                                                                                                                                                                                       |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| شكل الإعداد               | **enum واحد** `storefront_mode: 'shop' \| 'catalog'` على مستوى البراند، وليس عدة booleans متفرقة. يمنع التركيبات غير المنطقية ويعطي سويتش واحد في الأدمن.                                                                                    |
| أين يُخزَّن               | نفس الجدول الذي يحمل إعدادات الواتساب حالياً: `public.business_settings` (صف واحد لكل `brand_id`). لا جدول جديد.                                                                                                                             |
| كيف يصل للستور فرونت      | الستور فرونت يقرأ الإعدادات عبر RPC `get_storefront_page_data` الذي يفعل `to_jsonb(s.*) FROM public.brand_public_settings s` — وهو **VIEW** فوق `business_settings`. لذلك: إضافة الأعمدة للـ view = تصل تلقائياً للواجهة بدون تعديل الـ RPC. |
| الفرض                     | **طبقتان**: إخفاء/استبدال عناصر الواجهة **+** رفض إنشاء الطلبات في الخادم (RPC + Public API). الإخفاء وحده غير كافٍ أمنياً.                                                                                                                  |
| الطلبات اليدوية من الأدمن | **تبقى مسموحة** في وضع `catalog`. الوضع يعطّل **checkout الستور فرونت** فقط؛ التاجر يقفل صفقات الواتساب كطلب يدوي من لوحة الأدمن. لا تلمس مسار إنشاء الطلب اليدوي.                                                                           |
| الافتراضي                 | `'shop'` — العملاء الحاليون لا يتأثرون إطلاقاً (zero behavior change).                                                                                                                                                                       |
| خارج النطاق الآن          | وضع هجين على مستوى المنتج (`purchase_mode` لكل منتج)، بوابة SaaS. مؤجَّلة للمرحلة 4.                                                                                                                                                         |

---

## المرحلة 1 — الأساس: Schema + Types + Server Guards + واجهة الحد الأدنى

الهدف: الميزة تعمل وآمنة. بعد هذه المرحلة يستطيع البراند التبديل لوضع الكتالوج (مؤقتاً عبر SQL أو UI بسيط) ويتصرف الستور فرونت والخادم بشكل صحيح.

### 1.1 Migration جديد

اسم الملف يتبع النمط الحالي (`YYYYMMDDHHMMSS_description.sql`)، مثال: `supabase/migrations/20260913100000_storefront_mode_catalog.sql`.

**المحتوى (ثلاث خطوات في ملف واحد):**

```sql
-- 1) الأعمدة الجديدة على business_settings
ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS storefront_mode text NOT NULL DEFAULT 'shop',
  ADD COLUMN IF NOT EXISTS catalog_show_prices boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS catalog_inquiry_message_en text,
  ADD COLUMN IF NOT EXISTS catalog_inquiry_message_ar text;

ALTER TABLE public.business_settings
  DROP CONSTRAINT IF EXISTS business_settings_storefront_mode_check;
ALTER TABLE public.business_settings
  ADD CONSTRAINT business_settings_storefront_mode_check
  CHECK (storefront_mode IN ('shop', 'catalog'));

-- 2) إعادة تعريف الـ view مع الأعمدة الجديدة
-- انسخ قائمة الأعمدة الكاملة من آخر تعريف للـ view:
--   supabase/migrations/20260909173500_add_trust_badges_customization.sql (السطر 6 وما بعده)
-- ثم أضف الأعمدة الأربعة الجديدة **في نهاية** قائمة SELECT.
-- تحذير Postgres: CREATE OR REPLACE VIEW يسمح فقط بإضافة أعمدة في النهاية؛
-- أي تغيير ترتيب/حذف يفشل. إن اضطررت: DROP VIEW ثم CREATE VIEW.
CREATE OR REPLACE VIEW public.brand_public_settings AS
SELECT
  /* ...كل الأعمدة الحالية بنفس الترتيب بالضبط (بما فيها bs.storefront_typography)... */,
  bs.storefront_mode,
  bs.catalog_show_prices,
  bs.catalog_inquiry_message_en,
  bs.catalog_inquiry_message_ar
FROM public.business_settings bs
/* ...نفس JOINs/WHERE الحالية إن وُجدت... */;

-- مهم: migration الأمان 20260911001500 غيّر الـ view إلى security_invoker=false
-- ومنح SELECT للـ anon. إعادة التعريف قد تعيد الإعداد الافتراضي، لذلك أعد تطبيقه صراحةً:
ALTER VIEW public.brand_public_settings SET (security_invoker = false);
GRANT SELECT ON public.brand_public_settings TO anon, authenticated;

-- 3) حارس الخادم في RPC إنشاء طلب الستور فرونت
-- ابحث عن آخر تعريف كامل:
--   grep -ln "FUNCTION public.place_storefront_order" supabase/migrations/*.sql | tail -1
-- (حالياً 20260829124000_storefront_custom_tailoring_and_stock_fix.sql)
-- انسخ الدالة **كاملة** (CREATE OR REPLACE FUNCTION ... $$ ... $$) وأضف سطراً واحداً
-- مباشرة بعد:  IF NOT FOUND THEN RAISE EXCEPTION 'SETTINGS_NOT_FOUND'; END IF;
--
--   IF v_settings.storefront_mode = 'catalog' THEN
--     RAISE EXCEPTION 'STOREFRONT_CATALOG_MODE';
--   END IF;
--
-- (v_settings معرّف أصلاً كـ public.business_settings%ROWTYPE فالعمود الجديد متاح مباشرة.)
```

**ملاحظات إلزامية للـ migration:**

- `tests/typography-management.test.ts:127` يفحص بالـ regex أي migration يذكر `brand_public_settings` ويتوقع وجود `bs.storefront_typography` وعدم وجود `bs.admin_typography`. إعادة تعريف الـ view بقائمة الأعمدة الكاملة تحقق ذلك تلقائياً — فقط لا تُسقط `storefront_typography` ولا تضف `admin_typography`.
- لا تغيّر توقيع `place_storefront_order` (نفس المعاملات) حتى لا يكسر استدعاء الواجهة في `src/routes/$slug.checkout.tsx:962`.
- شغّل `npm run db:migrations:check` بعد الإضافة.

### 1.2 الأنواع والتحميل (TypeScript)

**`src/lib/storefront-context.tsx`** — داخل `export type PublicSettings` (يبدأ السطر 83)، بجانب `whatsapp_enabled`/`whatsapp_number` (السطر 164-165):

```ts
storefront_mode: "shop" | "catalog";
catalog_show_prices: boolean;
catalog_inquiry_message_en: string | null;
catalog_inquiry_message_ar: string | null;
```

**`src/routes/$slug.route.tsx`** — في الـ `loader` حيث تُبنى `settings` من `s` (بجانب السطر 214-215 `whatsapp_enabled` / `whatsapp_number`):

```ts
storefront_mode: s?.storefront_mode === "catalog" ? "catalog" : "shop",
catalog_show_prices: s?.catalog_show_prices ?? true,
catalog_inquiry_message_en: s?.catalog_inquiry_message_en ?? null,
catalog_inquiry_message_ar: s?.catalog_inquiry_message_ar ?? null,
```

(الافتراضيات هنا شبكة أمان ثانية: لو الـ view لم يُحدَّث بعد، يبقى الوضع `shop`.)

**ملف مساعد جديد: `src/lib/storefront-mode.ts`** (دوال نقية فقط، بدون React، حتى تُختبر كـ unit tests حقيقية):

```ts
import type { PublicSettings } from "@/lib/storefront-context";

export function isCatalogMode(settings: Pick<PublicSettings, "storefront_mode">): boolean {
  return settings.storefront_mode === "catalog";
}

export function shouldShowPrices(
  settings: Pick<PublicSettings, "storefront_mode" | "catalog_show_prices">,
): boolean {
  return !isCatalogMode(settings) || settings.catalog_show_prices;
}

export function normalizeWhatsAppDigits(raw: string | null | undefined): string {
  return String(raw ?? "").replace(/\D/g, "");
}

export type InquiryContext = {
  brandName: string;
  productName: string;
  productUrl: string;
  variantLabel?: string | null; // مثال: "M / أسود"
  priceLabel?: string | null; // مُنسَّق مسبقاً، أو null إذا الأسعار مخفية
};

export const DEFAULT_INQUIRY_MESSAGE_AR =
  "مرحباً {brand_name}، مهتم بـ {product_name} {variant}\n{product_url}";
export const DEFAULT_INQUIRY_MESSAGE_EN =
  "Hi {brand_name}, I'm interested in {product_name} {variant}\n{product_url}";

export function renderInquiryMessage(template: string, ctx: InquiryContext): string {
  return template
    .replaceAll("{brand_name}", ctx.brandName)
    .replaceAll("{product_name}", ctx.productName)
    .replaceAll("{product_url}", ctx.productUrl)
    .replaceAll("{variant}", ctx.variantLabel ? `(${ctx.variantLabel})` : "")
    .replaceAll("{price}", ctx.priceLabel ?? "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function buildWhatsAppInquiryUrl(args: {
  number: string | null | undefined;
  template: string | null | undefined;
  lang: "en" | "ar";
  ctx: InquiryContext;
}): string | null {
  const digits = normalizeWhatsAppDigits(args.number);
  if (!digits) return null;
  const template =
    args.template?.trim() ||
    (args.lang === "ar" ? DEFAULT_INQUIRY_MESSAGE_AR : DEFAULT_INQUIRY_MESSAGE_EN);
  const text = renderInquiryMessage(template, args.ctx);
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
```

الـ placeholders المدعومة (وثّقها في الأدمن): `{brand_name}` `{product_name}` `{product_url}` `{variant}` `{price}`.

### 1.3 حراس الخادم في طبقة التطبيق

1. **RPC** `place_storefront_order` — تم في 1.1.
2. **Public API** — `src/lib/public-api/public-api-router.server.ts`، فرع `path === "/api/v1/orders" && method === "POST"` (السطر 734). قبل أي `insert`، اقرأ `storefront_mode` من `business_settings` لـ `authContext.brandId` (بنفس أسلوب الـ `db` client المستخدم في الملف) وأعد:
   ```ts
   return json(
     {
       error: "STOREFRONT_CATALOG_MODE",
       message: "This brand is in catalog mode; storefront orders are disabled.",
     },
     403,
   );
   ```
   (طابق شكل استجابات الخطأ الموجودة في نفس الملف.)
3. **`src/routes/api.public.payments.tap-redirect.ts`** — يقرأ/يحدّث طلبات موجودة فقط (السطر 71/85/144)، لا ينشئ. **لا تغيير**، لكن تحقق يدوياً أنه لا يوجد مسار ينشئ طلباً منه.
4. **الطلب اليدوي من الأدمن** — لا تغيير (قرار معماري، انظر القسم 0).

### 1.4 واجهة الستور فرونت — الحد الأدنى

قاعدة عامة: احصل على الوضع من `useStorefront()` (الـ `settings` موجود فيه)، واستخدم `isCatalogMode(settings)` و`shouldShowPrices(settings)` من `src/lib/storefront-mode.ts`. لا تكرر المنطق.

| الملف                                                                                         | التغيير                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | معيار القبول                                                                                                                                                               |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/routes/$slug.product.$id.tsx`                                                            | (أ) زر "أضف للسلة" + محدد الكمية `qty` → يُستبدلان بزر واتساب واحد (`Button` كبير) في وضع الكتالوج. (ب) الرسالة تُبنى بـ `buildWhatsAppInquiryUrl` مع `variantLabel` من الحالة الموجودة `selectedSize` / `selectedColor` / `selectedFabric` (السطور 331-333) — ادمج غير الفارغ منها بـ " / ". (ج) `productUrl` = رابط الصفحة الكامل (`window.location.href` داخل الـ handler، أو ابنه من `brand.slug` + `product.id`). (د) السعر يُخفى إذا `!shouldShowPrices(settings)` ويُستبدل بنص "تواصل معنا للسعر" / "Contact us for price". (هـ) الشريط السفلي الثابت على الموبايل (نفس الملف) يعرض زر الواتساب بدل زر السلة. (و) عند الضغط: سجّل `record_storefront_product_engagement` بحدث `click` (موجود) — يتغير إلى `inquiry` في المرحلة 3. | في وضع الكتالوج: لا يوجد أي زر يستدعي `addToCart`؛ الرابط يبدأ بـ `https://wa.me/`؛ النص يحوي اسم المنتج والرابط والمقاس/اللون المختار. في وضع `shop`: لا تغيير بكسل واحد. |
| `src/components/storefront/product-card.tsx`                                                  | لا يوجد add-to-cart في الكرت (تم التحقق). فقط: إخفاء السعر إذا `!shouldShowPrices(settings)`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | —                                                                                                                                                                          |
| `src/components/storefront/StorefrontHeader.tsx`                                              | أيقونة السلة `ShoppingBag` + `cartCount` (السطر 187-197) لا تُعرض في وضع الكتالوج.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | لا عنصر سلة في الهيدر.                                                                                                                                                     |
| `src/components/storefront/StorefrontCartDrawer.tsx`                                          | إرجاع `null` مبكراً في وضع الكتالوج (حماية إضافية لو فُتح برمجياً).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | —                                                                                                                                                                          |
| `src/routes/$slug.checkout.tsx`                                                               | في `beforeLoad` أو أول الـ loader: إذا الوضع كتالوج → `throw redirect({ to: "/$slug", params })`. الوضع متاح من loader الـ parent (`$slug.route.tsx`) عبر `context`/`parentMatch`؛ إن كان أسهل، أعد استدعاء `get_storefront_page_data` — لكن الأفضل تمرير الإعدادات من الـ parent.                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `/<slug>/checkout` يعيد التوجيه للرئيسية.                                                                                                                                  |
| `src/routes/$slug.route.tsx`                                                                  | (أ) الزر العائم للواتساب (السطر ~488) يبقى كما هو. (ب) أضف `useEffect` واحد: إذا الوضع كتالوج **وكانت السلة غير فارغة** → أفرغها (استخدم دالة الإفراغ الموجودة في `storefront-context.tsx`؛ إن لم توجد، أضف `clearCart` هناك). يمنع بقاء سلات محفوظة محلياً من وضع `shop` سابق.                                                                                                                                                                                                                                                                                                                                                                                                                                                          | —                                                                                                                                                                          |
| `src/components/storefront/ShareCartModal.tsx` + أي نقطة تفتحه                                | لا يُعرض في وضع الكتالوج.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | —                                                                                                                                                                          |
| `src/routes/$slug.search.tsx`, `src/routes/$slug.$category.tsx`, `src/routes/$slug.index.tsx` | تمر عبر `product-card` غالباً؛ تحقق فقط من أي عرض سعر مباشر خارج الكرت وطبّق `shouldShowPrices`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | —                                                                                                                                                                          |
| `src/routes/$slug.account.tsx`                                                                | قسم "طلباتي" يبقى (العميل قد يملك طلبات قديمة من وضع `shop`). لا تغيير في المرحلة 1.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | —                                                                                                                                                                          |

**تتبع السلات المتروكة**: الالتقاط من جهة العميل (ابحث في `src/lib/storefront-context.tsx` و`src/lib/storefront-analytics.ts` عن استدعاءات abandoned cart) يجب أن يُتخطى في وضع الكتالوج لأنه لا توجد سلة. أضف شرط `if (isCatalogMode(settings)) return;` في نقطة الالتقاط.

### 1.5 اختبارات المرحلة 1

ملف جديد `tests/storefront-catalog-mode.test.ts` — اتبع أسلوب المستودع (قراءة الملفات المصدرية كنص + regex) **بالإضافة** إلى unit tests حقيقية للدوال النقية:

- **Unit (حقيقية)**: `buildWhatsAppInquiryUrl` — (١) يرجع `null` إذا الرقم فارغ/بدون أرقام؛ (٢) يزيل غير الأرقام من الرقم؛ (٣) يستخدم القالب الافتراضي حسب اللغة عند غياب القالب؛ (٤) يستبدل كل الـ placeholders؛ (٥) `{variant}` يصبح فارغاً بدون أقواس عند غياب المقاس؛ (٦) النص مُرمَّز بـ `encodeURIComponent`. `shouldShowPrices`: `shop` → دائماً true؛ `catalog` + `catalog_show_prices=false` → false.
- **Contract (نصية)**: الـ migration الجديد يحوي `storefront_mode`, `CHECK (storefront_mode IN ('shop', 'catalog'))`, `STOREFRONT_CATALOG_MODE`, `security_invoker = false`. ملف `public-api-router.server.ts` يحوي `STOREFRONT_CATALOG_MODE`. ملف `$slug.checkout.tsx` يحوي `isCatalogMode`. ملف `$slug.product.$id.tsx` يحوي `buildWhatsAppInquiryUrl`.
- **Guardrails**: `tests/design-system-guardrails.test.ts` موجود ويعمل تلقائياً على الملفات — لا تكسره.

---

## المرحلة 2 — لوحة الأدمن: التحكم بالوضع + تأقلم التنقل + جاهزية المتجر

### 2.1 واجهة الإعداد

**المكان الموصى به**: `src/routes/_authenticated/admin.b.$slug.settings.tsx` داخل `<TabsContent value="storefront">` (السطر ~1719) — كأول بطاقة في التبويب لأنه أهم قرار في الستور فرونت.

**المكوّنات:**

1. Segmented control / RadioGroup (`@/components/ui/radio-group` أو `toggle-group` موجودان): **بيع مباشر** (`shop`) — "العملاء يشترون ويدفعون من الموقع" / **كتالوج** (`catalog`) — "عرض المنتجات والتواصل عبر واتساب".
2. تظهر **فقط** عند اختيار `catalog`:
   - Switch `catalog_show_prices` — "إظهار الأسعار".
   - حقل رقم الواتساب: نفس العمود `whatsapp_number` (يُدار حالياً في `admin.b.$slug.pages.tsx:447-464` تحت "زر واتساب العائم"). **لا تنشئ عموداً ثانياً** — اربط الحقل هنا بنفس العمود، وضع ملاحظة صغيرة "نفس الرقم المستخدم للزر العائم". إذا الرقم فارغ، اعرض تحذيراً واضحاً (`AlertCircle`) أن زر الاستفسار لن يظهر.
   - Textarea للقالب بالعربية والإنجليزية (`catalog_inquiry_message_ar/_en`) مع pills للـ placeholders. **أعد استخدام** آلية `renderPills` الموجودة في نفس الملف (السطر ~6695، مستخدمة لرسائل المندوب) بدل بناء واحدة جديدة. أظهر placeholder النص الافتراضي من `DEFAULT_INQUIRY_MESSAGE_*`.
   - معاينة حية للرسالة (نص فقط) بقيم مثال.
3. تنبيه (`Alert`) عند التبديل إلى `catalog` يشرح ما سيختفي: السلة، الدفع، الكوبونات، الولاء، السلات المتروكة. وعند التبديل إلى `shop`: تذكير بضرورة إعداد طريقة دفع واحدة على الأقل.

**الحفظ**: `supabase.from("business_settings").update({...}).eq("brand_id", brandId)` — نفس نمط الحفظ في `admin.b.$slug.pages.tsx:276`. الـ RLS موجود ومقيّد بـ `brand_id`؛ لا تلمسه. أبطل الـ queries بنفس مفاتيح الاستعلام المستخدمة للإعدادات في الملف.

### 2.2 تأقلم التنقل في الأدمن

`src/config/admin-navigation.ts` — `getAdminNavItems({ activeSlug, isCourier, isAdmin, hasPermission, t, lang })` (السطر 108) ويُرشّح في السطر ~429.

- أضف خياراً `storefrontMode?: "shop" | "catalog"` للـ options.
- في وضع `catalog` أخفِ: `abandoned-carts` (السطر 327)، `loyalty`، `discounts`، وقسم إعدادات طرق الدفع إن كان عنصراً مستقلاً. **الطلبات تبقى** (طلبات يدوية + طلبات قديمة). **العوائد تبقى** (قد تُستخدم لصفقات الواتساب المسجلة يدوياً — قرار مفتوح، انظر القسم 6).
- مرر الوضع من مكان استدعاء `getAdminNavItems` (ابحث عنه في `src/components/os/os-sidebar.tsx` و`os-mobile-navigation.tsx`) — الإعدادات متاحة عبر context البراند/الإعدادات في الأدمن.
- **حدّث الاختبارات** التي تثبّت هيكل التنقل: `tests/admin-navigation-architecture.test.ts`, `tests/progressive-disclosure-navigation.test.ts`, `tests/super-admin-platform-navigation.test.ts` — أضف حالة `storefrontMode: "catalog"` تتحقق من الإخفاء، ولا تُضعف الحالات الحالية.

### 2.3 قائمة جاهزية المتجر (Launch readiness)

حالياً الجاهزية تعتبر إعداد طريقة الدفع/التوصيل مطلوباً. في وضع `catalog` يجب:

- **حذف** بند "طريقة دفع" و"التوصيل" من الشروط، **وإضافة** بند "رقم واتساب مضبوط".
- ابحث عن قواعد الجاهزية عبر `tests/store-readiness.test.ts` و`tests/stage5-settings-readiness-search.test.ts` (تشير إلى الملف المصدري). حدّث القواعد والاختبارات معاً.

### 2.4 معاينة الستور فرونت في الأدمن/الأونبوردنق (اختياري)

`src/components/onboarding/StorefrontLivePreview.tsx` — إن كانت تعرض زر شراء، اجعلها تحترم الوضع. أولوية منخفضة.

---

## المرحلة 3 — قيمة الكتالوج: تتبع الاستفسارات + لوحة القياس

هذه المرحلة هي ما يجعل الكتالوج منتجاً وليس "متجراً ناقصاً": التاجر يخسر تحليلات المبيعات، فنعوّضه بتحليلات الاستفسارات.

### 3.1 التخزين — الخيار الموصى به (رخيص ومتوافق مع الموجود)

مدّد RPC الموجود `record_storefront_product_engagement` (آخر تعريف في `supabase/migrations/20260712190000_storefront_trending.sql`، يقبل حالياً `'view'`/`'click'` فقط — السطر 22):

- migration جديد: `ALTER TABLE public.product_engagement_daily ADD COLUMN IF NOT EXISTS inquiry_count integer NOT NULL DEFAULT 0;`
- أعد تعريف الدالة **كاملة** مع: قبول `'inquiry'`، وإدراج/تحديث `inquiry_count` بنفس نمط `view_count`/`click_count` (السطر 27-30).
- في `$slug.product.$id.tsx` عند الضغط على زر الواتساب: `p_event: "inquiry"` بدل `"click"`.

**بديل لاحق** (إذا احتجت تفاصيل كل استفسار: المقاس، الوقت): جدول `storefront_inquiries (id, brand_id, product_id, variant_label, lang, created_at)` مع RPC `SECURITY DEFINER` للإدراج من `anon` + تحديد معدل (rate limit) بنفس أسلوب الـ engagement. لا تبدأ به.

### 3.2 العرض في الأدمن

- **الداشبورد** (`admin.b.$slug.dashboard.tsx`): في وضع `catalog` استبدل بطاقة "الإيراد" ببطاقة "الاستفسارات (30 يوم)" + "أكثر المنتجات استفساراً" (تقرأ `inquiry_count` من `product_engagement_daily`). في وضع `shop` لا تغيير.
- **التقارير** (`admin.b.$slug.reports.products.tsx`): عمود "استفسارات" بجانب المشاهدات عندما الوضع `catalog`.
- **صفحة المنتج في الأدمن/المخزون**: اختياري — شارة "X استفسار هذا الشهر".

### 3.3 SEO / بيانات منظمة

لا يوجد JSON-LD حالياً في `$slug.product.$id.tsx` (تم التحقق). إذا أُضيف لاحقاً: في وضع الكتالوج مع أسعار مخفية، **لا** تُصدر `Offer` بسعر.

---

## المرحلة 4 — (اختياري) البوابة التجارية SaaS

- أضف مفتاحاً في `SaaSFeatureKey` (`src/lib/saas-billing/saas-billing.types.ts:53`): `"storefront.checkout"` (boolean). الفئة `"storefront"` موجودة في `FeatureCategory`.
- في واجهة الإعداد (2.1): إذا الخطة لا تملك `storefront.checkout`، خيار `shop` معطّل مع رابط ترقية (نمط `useEntitlements` موجود — مثال الاستخدام `admin.b.$slug.inventory.tsx:1165`).
- **حارس خادم اختياري**: في `place_storefront_order` أو في الـ RPC الذي يفحص الاستحقاقات، ارفض الطلب إذا الخطة بلا `storefront.checkout` حتى لو الوضع `shop`. (احذر: يحتاج مراجعة لعملاء حاليين على خطط قديمة — نفّذه مع grandfathering أو لا تنفذه.)
- **وضع هجين على مستوى المنتج**: عمود `purchase_mode text NULL` على `products` (`NULL` = يرث وضع البراند، `'inquiry'` = استفسار فقط). المنطق: `effectiveMode = product.purchase_mode ?? settings.storefront_mode`. يخدم قطع التفصيل/الـ made-to-order. **فقط عند طلب فعلي من العملاء.**

---

## 5. ترتيب الـ PRs والتحقق

| PR                                                              | المحتوى                                                                                      | التحقق قبل الدمج                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PR-1** `feat(storefront): catalog mode foundation`            | المرحلة 1 كاملة (migration + types + helper + server guards + UI الحد الأدنى + اختبارات 1.5) | typecheck ✓ · vitest بلا فشل جديد · `db:migrations:check` ✓ · **اختبار يدوي**: براند تجريبي، غيّر `storefront_mode='catalog'` عبر SQL، افتح المتجر: لا سلة، زر واتساب يفتح `wa.me` بالرسالة الصحيحة، `/checkout` يعيد التوجيه، استدعاء `place_storefront_order` يرجع `STOREFRONT_CATALOG_MODE`، `POST /api/v1/orders` يرجع 403. ثم أعد `shop` وتأكد أن كل شيء كما كان. |
| **PR-2** `feat(admin): storefront mode settings and navigation` | المرحلة 2                                                                                    | نفس الأوامر + اختبارات التنقل والجاهزية محدّثة                                                                                                                                                                                                                                                                                                                         |
| **PR-3** `feat(catalog): inquiry tracking and dashboard`        | المرحلة 3                                                                                    | نفس الأوامر + اختبار أن `'inquiry'` مقبول في الـ RPC                                                                                                                                                                                                                                                                                                                   |
| **PR-4** (اختياري)                                              | المرحلة 4                                                                                    | —                                                                                                                                                                                                                                                                                                                                                                      |

الأمر الكامل للتحقق قبل كل PR:

```bash
npm run typecheck && npx vitest run && npm run db:migrations:check
```

ثم على الملفات المعدّلة فقط:

```bash
npx eslint <files>
```

(تجاهل أخطاء `prettier/prettier` — نحو 11 ألفاً منها موجودة مسبقاً في المستودع كله ولا علاقة لها بهذا العمل.)

---

## 6. قرارات مفتوحة تحتاج قرار المالك

1. **الافتراضي لإظهار الأسعار في الكتالوج**: مقترح `true` (أغلب التجار يريدون السعر ظاهراً؛ الإخفاء استثناء للراقي/التفصيل).
2. **العوائد في وضع الكتالوج**: إبقاؤها (لصفقات واتساب سُجلت كطلبات يدوية) أم إخفاؤها؟ مقترح: إبقاؤها.
3. **الكوبونات**: بلا checkout لا معنى للكود. مقترح: إخفاؤها في وضع الكتالوج. (التاجر قد يذكر "كود خصم عبر الواتساب" — تسويقي فقط، لا يحتاج النظام.)
4. **هل يُسمح لكل الخطط بوضع `shop`** أم يصبح ميزة مدفوعة (المرحلة 4)؟ قرار تسعيري.
5. **قائمة الحساب "طلباتي"**: تبقى ظاهرة للعملاء الذين لديهم طلبات قديمة؟ مقترح: تبقى (لا ضرر، وتحفظ السجل).

---

## 7. قائمة تحقق نهائية (Definition of Done للميزة كاملة)

- [ ] براند جديد يُنشأ بوضع `shop` ويعمل كما قبل الميزة بالضبط (لا diff سلوكي).
- [ ] التبديل إلى `catalog` من الأدمن يحفظ في `business_settings` ويظهر فوراً في الستور فرونت بعد إعادة التحميل.
- [ ] في `catalog`: لا سلة في الهيدر، لا درج سلة، لا زر إضافة، `/checkout` يعيد التوجيه، السلة المحلية القديمة تُفرَّغ.
- [ ] زر الواتساب في صفحة المنتج يحمل: اسم المنتج، الرابط، المقاس/اللون المختار، حسب قالب التاجر أو الافتراضي حسب اللغة.
- [ ] `catalog_show_prices=false` يخفي السعر في الكرت وصفحة المنتج ويعرض "تواصل معنا للسعر".
- [ ] `place_storefront_order` يرفض بـ `STOREFRONT_CATALOG_MODE`، و`POST /api/v1/orders` يرفض بـ 403 — حتى لو الواجهة تُجوِّزت.
- [ ] الطلب اليدوي من الأدمن يعمل في كلا الوضعين.
- [ ] تنقل الأدمن يخفي السلات المتروكة/الولاء/الكوبونات في `catalog`؛ اختبارات التنقل خضراء.
- [ ] جاهزية المتجر لا تطلب طريقة دفع في `catalog` وتطلب رقم واتساب.
- [ ] الاستفسارات تُسجَّل وتظهر في الداشبورد والتقارير (المرحلة 3).
- [ ] `npm run typecheck` صفر أخطاء، `npx vitest run` بلا فشل جديد مقارنة بالـ baseline، `npm run db:migrations:check` ناجح، لا مخالفات لـ guardrails نظام التصميم.
