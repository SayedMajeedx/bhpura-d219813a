# Vanilla Core + Add-ons Platform — Implementation Plan (v2)

> **الفكرة بكلمة واحدة:** مثل AOSP. النواة (Vanilla Core) = منصة تجارة إلكترونية عامة لا تعرف شيئاً عن أي نشاط. كل ما هو خاص بنشاط (أزياء، عبايات، عطور، مأكولات، منتجات رقمية، هدايا، طباعة، مجوهرات…) يعيش في **Add-on** مستقل له manifest يعلن ما يضيفه للنظام. البراند الجديد يُولد Vanilla، ثم تُثبَّت عليه **حزمة بداية (Starter Pack)** حسب نشاطه، ويستطيع لاحقاً تثبيت/تعطيل/إزالة أي add-on من "متجر الإضافات" داخل لوحة التحكم.
>
> هذه الوثيقة **تبني فوق** ما تم تنفيذه فعلاً من الخطة الأولى (`docs/store-vertical-modules-implementation-plan.md`) ولا تلغيه: الـ commit `a2bfeca` (`feat(store-profile): vertical + modules foundation`) موجود محلياً على فرع `feat/size-guide-studio`، و**PR-2 (Size Guide Studio) قيد التنفيذ الآن في شجرة العمل** بواسطة جلسة أخرى. كل ما هنا مصمَّم ليتكامل مع تلك الأعمال بأقل تعارض ممكن (انظر القسم 2 "العلاقة بالخطة الأولى وترتيب التنفيذ").
>
> كل مسار ملف مذكور تم التحقق منه بتاريخ **2026-09-14** على الـ commit `a2bfeca` + شجرة العمل الحالية. أرقام الأسطر في الملفات العملاقة **متغيرة** بسبب العمل الجاري — اعتمد على أسماء الدوال/المكوّنات المذكورة و`grep -n` قبل التعديل.
>
> **قواعد عامة** (نفس قواعد الخطة الأولى): لا تعديل migrations قديمة، لا تعديل `package.json`، guardrails التصميم، i18n ثنائي، لا إضعاف اختبارات، صفر تغيير سلوكي للبراندات الحالية، بوابة التحقق بعد كل PR: `npm run format:check && npm run typecheck && npm run lint && npx vitest run` (+ `npm run db:migrations:check` عند إضافة migration).

---

## 0. هل فهمت المطلوب؟ — نعم، وهذا التفسير الذي تُبنى عليه الخطة

| مصطلح                           | المعنى في هذه الخطة                                                                                                                                                                                                                                                                      |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vanilla Core**                | كل ما هو عام لأي تجارة: منتجات ومتغيرات وحقول مخصصة وإضافات مسعّرة (`customization_options`)، طلبات وحالات، عملاء، دفع، توصيل/استلام/رقمي، مرتجعات، ولاء، سلات متروكة، كوبونات، حملات، صفحات، تحليلات، تكاملات، API، فريق، محاسبة، حاضنات، استيراد. **لا يعرف كلمة "عباية" ولا "خياط".** |
| **Add-on**                      | حزمة كود + بيانات لها `manifest` تعلن: ما تضيفه للواجهات (slots)، ما تزرعه من بيانات عند التثبيت (seeds)، ما تغيّره من مفردات وإعدادات افتراضية، ما تحتاجه من add-ons أخرى، وهل هي مدفوعة.                                                                                               |
| **نوعان من الـ Add-ons**        | **Feature add-on** = يضيف كوداً وواجهات (مثل `size-guides`, `fit-passport`, `made-to-order`). **Pack** = لا كود، فقط seeds + إعدادات افتراضية + مفردات + سياق AI (مثل `abaya-pack`, `beauty-perfume`, `food-beverage`). الـ Pack رخيص جداً ويكفي لأغلب الأنشطة.                          |
| **Activity (نوع النشاط)**       | ما يختاره التاجر عند التسجيل (إلزامي — قرار سابق). القيمة المخزّنة في `business_settings.store_vertical` (العمود موجود). كل نشاط له **Starter Pack** = قائمة add-ons تُثبَّت تلقائياً + seeds.                                                                                           |
| **Starter Pack**                | ليس كياناً في قاعدة البيانات؛ هو تعريف في الكود: `activity → addon ids[]`. يُعرض للتاجر في الأونبوردنق كقائمة قابلة للتعديل ("سيُفعَّل لك: …") ثم يُثبَّت بعد إنشاء البراند.                                                                                                             |
| **الفرق عن "الميزات المدفوعة"** | ميزات النواة المُقيَّدة بالخطة (Returns/Loyalty/API/Accounting…) تبقى كما هي: **entitlements**. الـ add-on يمكن أن يكون مجانياً أو مربوطاً بـ entitlement (`entitlementKey`) فيُعرض مقفلاً حتى الترقية — الطبقتان مستقلتان لكن متكاملتان.                                                |
| **خارج النطاق**                 | تحميل add-ons ديناميكياً/من طرف ثالث، schema لكل tenant، إعادة تسمية قيم DB القديمة. كل الـ add-ons **داخل المستودع** (`src/addons/*`) وتُبنى مع التطبيق.                                                                                                                                |

**نتيجة الفحص:** المستودع فيه بالفعل بذور كل ما نحتاجه — ولا يوجد نظام add-ons حقيقي بعد:

| موجود اليوم                                                                                                                                      | كيف نستفيد منه                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `src/lib/store-profile.ts` (`store_vertical` + `store_modules` + `resolveStoreModules`) — commit `a2bfeca`                                       | يبقى كطبقة **توافق**: `resolveStoreModules` يُشتق من الـ add-ons المثبتة بدل jsonb يدوي (القسم 4.6). |
| `src/config/admin-navigation.ts` (`tier: "core" \| "modular"`, `storeModules?`) + `src/components/os/os-apps-hub-modal.tsx` (Apps Hub + pinning) | الـ Apps Hub يصبح واجهة "الإضافات المثبتة" + زر "متجر الإضافات".                                     |
| `src/lib/connectors/connector-framework.ts` (`AVAILABLE_CONNECTORS` — سجل metadata في الكود)                                                     | نفس النمط للـ `AddonManifest` registry.                                                              |
| `saas_addons` / `brand_subscription_addons` / `rpc_check_entitlement` (`src/lib/saas-billing/*`)                                                 | الربط المالي الاختياري: add-on مدفوع = `entitlementKey`.                                             |
| `customization_options` (إضافات مسعّرة عامة)، `custom_fields` لكل منتج، تسميات محاور المتغيرات لكل منتج                                          | قدرات نواة عامة تستخدمها الـ Packs عبر seeds بدل كود جديد.                                           |
| `requireSupabaseAuth` middleware + `requireBrandAccess`/`requireSuperAdmin` (`saas-billing.functions.ts:19-53`)                                  | نفس نمط الحماية لدوال تثبيت الـ add-ons.                                                             |
| `get_storefront_page_data` (يُعاد تعريفه الآن في `20260916100000_size_guides.sql:87`)                                                            | نضيف مصفوفة `addons` للناتج (القسم 4.3).                                                             |

---

## 1. القرار المعماري

| الخيار                     | القرار                                                                                                                                                                                                                                                                                                     |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| مصدر الحقيقة للكتالوج      | **الكود**: `src/addons/<id>/manifest.ts` + `src/addons/registry.ts`. لا جدول كتالوج في DB (يُبنى مع التطبيق، يُختبر، لا انجراف). جدول صغير `platform_addon_policies` للسوبر أدمن فقط (إتاحة/تسعير/افتراضيات) بدون نشر كود.                                                                                 |
| حالة التثبيت لكل براند     | جدول `brand_addons` (سطر لكل براند×add-on) بدل jsonb. يسمح بالنسخة (version) والإعدادات والـ seeds المنفَّذة والتدقيق.                                                                                                                                                                                     |
| كيف يصل الـ add-on للواجهة | **Slots** مُعلَنة ومُنمَّطة: النواة ترسم `<AddonSlot name="…">` في أماكن محددة، والـ add-on يعلن مساهماته في الـ manifest (`React.lazy`). النواة لا تستورد أي add-on مباشرة — يفرضه ESLint + اختبار حراسة.                                                                                                 |
| Feature vs Pack            | نفس الآلية؛ الـ Pack ببساطة manifest بلا `contributions` كودية (فقط seeds/vocabulary/defaults/aiContext).                                                                                                                                                                                                  |
| الاعتماديات                | `requires: AddonId[]` مع ترتيب تثبيت طوبولوجي؛ التثبيت يثبّت الاعتماديات تلقائياً بعد تأكيد؛ الإزالة تمنع إن كانت add-on أخرى تعتمد عليها.                                                                                                                                                                 |
| Seeds                      | مُفهرَسة بمفتاح (`key`) و**idempotent**؛ تُسجَّل في `brand_addons.seeded_keys`؛ تُنفَّذ في الخادم (service role) داخل دالة التثبيت؛ `upgrades[]` تُنفَّذ عند رفع `version` في الـ manifest (عند أول تحميل للأدمن بعد النشر).                                                                               |
| الإزالة والبيانات          | `disable` يخفي فقط. `uninstall` يحذف سطر التثبيت **ويُبقي البيانات** افتراضياً؛ `purge` صريح واختياري بتأكيد (كل add-on يعلن hook حذف بياناته). لا حذف صامت أبداً.                                                                                                                                         |
| التوافق مع ما نُفِّذ       | `store_vertical` يبقى (= Activity). `store_modules` يُهاجَر إلى `brand_addons` ويصبح **مشتقاً** (قراءة فقط) حتى تنتهي مرحلة الاستخراج ثم يُهمَل. كل `if (modules.x)` المكتوب في PR-1 يستمر بالعمل بلا تعديل في المرحلة A.                                                                                  |
| مسارات الملفات (TanStack)  | المسارات ملفات ثابتة (`src/routes/*`). المسار الذي يخص add-on (مثل `/$slug/size-guide`, `/admin/b/$slug/size-guides`) يبقى ملف مسار رفيعاً في `src/routes` يستدعي `useAddonInstalled("size-guides")` ويعيد `notFound()`/redirect إن لم يكن مثبتاً، ويستورد المحتوى من `@/addons/...` عبر الـ registry فقط. |
| الأمان                     | الحالة تُقرأ من `brand_addons` عبر RLS (قراءة أعضاء البراند + anon للمجموعة العامة عبر الـ RPC). **الكتابة فقط عبر server functions** (`requireBrandAccess` أو super admin) لأن التثبيت يشغّل seeds بصلاحيات service role.                                                                                 |

---

## 2. العلاقة بالخطة الأولى وترتيب التنفيذ (مهم بسبب العمل الجاري)

| عنصر الخطة الأولى                                    | مصيره في v2                                                                                                                           |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| PR-1 (`store_vertical` + `store_modules` + البوابات) | **منجَز** (`a2bfeca`). يُحتفَظ به؛ v2 يحوّل `store_modules` إلى `brand_addons` ويجعل `resolveStoreModules` مشتقاً.                    |
| PR-2 Size Guide Studio                               | **قيد التنفيذ الآن** — يُكمَل كما هو. في v2 يصبح داخل `src/addons/size-guides/` (المرحلة B تنقل الملفات).                             |
| PR-3 `is_made_to_order`                              | يُنفَّذ كما هو — العلم **نواة عامة** (أي نشاط قد يبيع حسب الطلب). الـ add-on `made-to-order` يضيف فقط الواجهات/المفردات/مراحل الورشة. |
| PR-4 ملفات القياس + المتغيّر الوهمي                  | يُنفَّذ كما هو — ملفات القياس تصبح داخل `src/addons/fit-passport/`؛ المتغيّر الوهمي إصلاح نواة.                                       |
| PR-5 مفردات/AI/جوال/سوبر أدمن                        | **يُلغى** ويُستبدل بمراحل v2 (C, D): المفردات وسياق AI يصبحان مساهمات add-on، والسوبر أدمن يدير الـ add-ons.                          |
| البرومت `docs/ai-handoff-store-vertical-modules.md`  | ما زال صالحاً لـ PR-2/3/4. يحتاج **برومت جديداً** لـ v2 بعد اعتماد هذه الوثيقة (يُكتب لاحقاً).                                        |

**ترتيب التنفيذ الموصى به (لتقليل تعارضات الدمج في الملفات العملاقة):**

1. الجلسة الحالية تُكمل **PR-2 → PR-3 → PR-4** من الخطة الأولى (ميزات داخلية، لا تلمس بنية add-ons).
2. ثم تبدأ v2: **المرحلة A** (منصة + توافق، بلا تغيير مرئي) → **B** (استخراج الأزياء إلى add-ons، النواة تصبح Vanilla فعلاً) → **C** (متجر الإضافات + الأونبوردنق + السوبر أدمن) → **D** (Packs الأنشطة الأخرى + الجوال + الحراسة) → **E** (اختياري: التسعير).
3. ممنوع بدء المرحلة B قبل دمج PR-2 و PR-4 (لأنها تنقل ملفاتهما).

---

## 3. الكتالوج v1 — ما هي الـ Add-ons وماذا يضيف كل واحد

| id                 | النوع   | موصى به للأنشطة                 | يتطلب                                                  | ماذا يضيف (مساهمات)                                                                                                                                                                                                                      |
| ------------------ | ------- | ------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `size-guides`      | feature | fashion, abayas, jewelry        | —                                                      | Size Guide Studio كاملاً (PR-2): مسار الأدمن + عنصر التنقل، زر/قسم الدليل في صفحة المنتج، الصفحة العامة، رابط الفوتر، فحص الجاهزية، حدث التحليلات.                                                                                       |
| `fit-passport`     | feature | fashion, abayas                 | —                                                      | تبويب "مقاساتي"، تطبيق القياسات في صفحة المنتج، بطاقة العميل بالأدمن، كتلة Passport في تفاصيل الطلب، قوالب Passport في محرر المنتج، تغذية مُرشِّح المقاس، إعدادات `fit_profiles` (PR-4).                                                 |
| `made-to-order`    | feature | fashion, abayas, print, jewelry | —                                                      | تبديل "جاهز/حسب الطلب"، صندوق ملاحظات الورشة، مراحل `sent_to_tailor/received_from_tailor` وأزرارها في الطلبات والداشبورد، سطر Content Studio، حقل الخامة في مولّد المتغيرات. المفردات الافتراضية عامة ("الورشة") وتُخصَّص عبر الـ Packs. |
| `fashion-core`     | pack    | fashion, abayas                 | —                                                      | مفردات الأزياء (الخياط/التفصيل/القماش)، محور الخامة مرئي، ترتيب قوالب المقاسات (apparel أولاً)، قالب حقول "أزياء"، سياق AI للأزياء، اقتراحات شارات الثقة، أمثلة المصروفات.                                                               |
| `abaya-pack`       | pack    | abayas                          | fashion-core, size-guides, fit-passport, made-to-order | seeds: دليل مقاسات العبايات 50–60 (إنش) كافتراضي، ملفا قياس عباية/فستان، ترتيب قوالب المقاسات (abaya_gulf أولاً)، أقسام مقترحة (عبايات، فساتين)، سياق AI (استبعاد المقاسات 50–62 من الأسعار في مستورد إنستغرام).                         |
| `beauty-perfume`   | pack    | beauty                          | —                                                      | تسميات المحاور الافتراضية (المقاس→الحجم مل، اللون→التركيز/الرائحة، الخامة مخفية)، قوالب مقاسات (30/50/100 مل)، قالب حقول "عطور وهدايا" (موجود)، سياق AI، شارات ثقة (أصلي 100%).                                                          |
| `food-beverage`    | pack    | food                            | made-to-order (اختياري، يُقترح)                        | إعدادات افتراضية: الاستلام من الفرع مفعّل، تقدير وقت التحضير، مفردات (المطبخ/قيد التحضير)، تسميات المحاور (الحجم S/M/L، اللون مخفي)، seeds لإضافات مسعّرة (إضافات/بدون)، فحص جاهزية "أضف فرع استلام"، سياق AI.                           |
| `digital-products` | pack    | digital                         | —                                                      | إعدادات افتراضية: `digital_delivery_enabled=true`، التوصيل/الاستلام مطفآن، المحاور مخفية، مفردات (التسليم الرقمي)، فحص جاهزية، سياق AI. (رفع ملفات التسليم الفعلي = ميزة نواة مستقبلية، ليست هنا.)                                       |
| `gifts`            | pack    | gifts                           | —                                                      | قالب حقول "رسالة إهداء"، seed إضافة مسعّرة "تغليف هدية"، سياق AI، شارات ثقة.                                                                                                                                                             |
| `print-stamps`     | pack    | print                           | made-to-order                                          | قالب حقول "أختام وطباعة" (موجود)، مفردات (المطبعة/قيد الطباعة)، سياق AI.                                                                                                                                                                 |
| `jewelry`          | pack    | jewelry                         | size-guides, made-to-order                             | seeds: دليل مقاسات خواتم/أساور من القوالب، قالب حقول "مجوهرات وحفر" (موجود)، مفردات (الورشة/قيد التصنيع)، تسميات المحاور (المقاس→مقاس الخاتم، اللون→المعدن)، سياق AI.                                                                    |

**Starter Packs (النشاط → الإضافات):**

| النشاط (`store_vertical`)        | Starter Pack                                                       |
| -------------------------------- | ------------------------------------------------------------------ |
| `abayas` (**جديد**)              | fashion-core, size-guides, fit-passport, made-to-order, abaya-pack |
| `fashion`                        | fashion-core, size-guides, fit-passport, made-to-order             |
| `beauty`                         | beauty-perfume                                                     |
| `food`                           | food-beverage (+ made-to-order مقترح غير مُختار افتراضياً)         |
| `digital`                        | digital-products                                                   |
| `gifts`                          | gifts                                                              |
| `print`                          | made-to-order, print-stamps                                        |
| `jewelry`                        | size-guides, made-to-order, jewelry                                |
| `home`, `electronics`, `general` | — (Vanilla)                                                        |

> **قرار المالك: `abayas` نشاط مستقل عن `fashion`.** التفاصيل التقنية في 4.0. البراندات الحالية المسجّلة `fashion` تُحوَّل إلى `abayas` (المنصة كانت عبايات-أولاً: النوع الافتراضي القديم "Abayas & Fashion" ودليل المقاسات الافتراضي عبايات)؛ السوبر أدمن أو التاجر يستطيع تغييرها لاحقاً من الإعدادات بلا أثر على البيانات.

---

## 4. المرحلة A — منصة الـ Add-ons (بلا أي تغيير مرئي)

### 4.0 إضافة النشاط `abayas` (قرار المالك)

**`src/lib/store-profile.ts`** (موجود منذ `a2bfeca`):

- `STORE_VERTICALS`: أضف `"abayas"` مباشرة قبل `"fashion"` (11 قيمة).
- `VERTICAL_LABELS`: `abayas: { ar: "عبايات", en: "Abayas" }` وعدّل `fashion` إلى `{ ar: "أزياء", en: "Fashion" }` (كانت "أزياء وعبايات").
- `VERTICAL_MODULE_DEFAULTS.abayas` = نفس `fashion` (الثلاثة `true`) — طبقة التوافق فقط.
- `legacyBusinessTypeToVertical`: أضف قبل فحص الأزياء: `if (/abaya|عباي/.test(t)) return "abayas";` (السطر ≈119 اليوم يعيد `fashion` لكليهما).
- `verticalToLegacyBusinessType("abayas")` → `"Abayas & Fashion"`؛ `("fashion")` → `"Fashion"`.
- `orderSizingPresetsForVertical` (في `variant-sku-utils.ts`): يعامل `abayas` كـ `fashion` (قوالب العبايات أولاً).

**`src/routes/onboard.tsx`**: بلاطة جديدة في `VERTICAL_ICONS` (`abayas` → أيقونة `Shirt`، و`fashion` → `Sparkles`؛ التمييز بالنص). ترتيب العرض: عبايات، أزياء، عطور، … (العبايات أولاً لأنها الجمهور الأساسي).

**Migration** (داخل migration المرحلة A — القسم 4.2، قبل إنشاء `brand_addons`):

```sql
ALTER TABLE public.business_settings DROP CONSTRAINT IF EXISTS business_settings_store_vertical_check;
ALTER TABLE public.business_settings ADD CONSTRAINT business_settings_store_vertical_check
  CHECK (store_vertical IN (
    'abayas','fashion','beauty','food','gifts','print','jewelry','home','electronics','digital','general'
  ));
-- كل براند حالي مسجّل fashion هو عبايات فعلياً (النوع القديم الافتراضي "Abayas & Fashion")
UPDATE public.business_settings SET store_vertical = 'abayas' WHERE store_vertical = 'fashion';
```

**الاختبارات المتأثرة من PR-1** (`tests/store-profile.test.ts`): أي تأكيد يعتمد على عدد الأنشطة أو على `legacyBusinessTypeToVertical("Abayas & Fashion") === "fashion"` يُحدَّث إلى `"abayas"` بنفس النية (اذكره في رسالة الـ commit).

### 4.1 الأنواع والسجل — `src/lib/addons/` (نقية، مُختبَرة)

**`src/lib/addons/addon-types.ts`:**

```ts
import type { ComponentType, LazyExoticComponent } from "react";
import type { StoreVertical } from "@/lib/store-profile";
import type { SaaSFeatureKey } from "@/lib/saas-billing/saas-billing.types";

export type Bilingual = { ar: string; en: string };

export type AddonId =
  | "size-guides"
  | "fit-passport"
  | "made-to-order"
  | "fashion-core"
  | "abaya-pack"
  | "beauty-perfume"
  | "food-beverage"
  | "digital-products"
  | "gifts"
  | "print-stamps"
  | "jewelry";

export type AddonKind = "feature" | "pack";

/** إعدادات الـ add-on التي يحررها التاجر (تُخزَّن في brand_addons.settings). */
export type AddonSettingsField =
  | { key: string; type: "boolean"; label: Bilingual; default: boolean; public?: boolean }
  | {
      key: string;
      type: "text";
      label: Bilingual;
      default: string;
      public?: boolean;
      bilingual?: boolean;
    }
  | {
      key: string;
      type: "select";
      label: Bilingual;
      default: string;
      options: Array<{ value: string; label: Bilingual }>;
      public?: boolean;
    };

/** Seed idempotent: يُنفَّذ مرة واحدة لكل براند (يُسجَّل key في seeded_keys). يعمل بصلاحيات service role في الخادم. */
export type AddonSeed = {
  key: string;
  description: Bilingual;
  run: (ctx: AddonSeedContext) => Promise<void>;
};
export type AddonSeedContext = {
  brandId: string;
  db: any; // supabaseAdmin (service role) — لا يُستخدم إلا داخل الخادم
  lang: "ar" | "en";
  settings: Record<string, unknown>;
};

export type SlotPlacement =
  | "storefront.product.optionsAside" // بجانب عنوان المقاس (زر دليل المقاسات)
  | "storefront.product.afterOptions" // بعد المتغيرات/الحقول (Passport, تبديل جاهز/حسب الطلب)
  | "storefront.product.afterCta" // بعد زر الشراء (قسم دليل مقاسات inline)
  | "storefront.account.tab" // تبويب في حساب العميل
  | "storefront.footer.helpLink" // رابط في مجموعة المساعدة
  | "admin.settings.card" // بطاقة في تبويب إعدادات محدد
  | "admin.product.editorPanel" // لوحة في محرر المنتج
  | "admin.order.itemPanel" // لوحة داخل بند الطلب (وضع التحرير)
  | "admin.order.headerActions" // أزرار إجراءات في رأس الطلب
  | "admin.customer.panel" // بطاقة في صفحة العميل
  | "admin.readiness.check"; // بند جاهزية

export type SlotComponent<P = Record<string, unknown>> = {
  id: string; // فريد داخل الـ add-on
  placement: SlotPlacement;
  order?: number; // للترتيب بين add-ons (افتراضي 100)
  tab?: string; // لـ admin.settings.card: "business" | "storefront" | …
  component: LazyExoticComponent<ComponentType<P>>;
};

export type AddonNavItem = {
  id: string;
  to: string;
  labelAr: string;
  labelEn: string;
  descriptionAr?: string;
  descriptionEn?: string;
  icon: string; // اسم أيقونة lucide (يُحل في الشل)
  permission?: string;
  category: "today" | "products_stock" | "customers_growth" | "money_reports" | "store_setup";
};

export type AddonReadinessCheck = {
  id: string;
  label: Bilingual;
  description: Bilingual;
  evaluate: (ctx: { brandId: string; db: any }) => Promise<"ok" | "warn" | "missing">;
  actionTo?: string;
};

export type AddonContributions = {
  slots?: SlotComponent<any>[];
  navItems?: AddonNavItem[];
  customFieldPresets?: Array<{ key: string; label: Bilingual; fields: unknown[] }>; // نفس شكل CUSTOMIZER_PRESETS
  sizingPresetOrder?: string[]; // ids من SIZING_PRESETS تُقدَّم أولاً
  vocabulary?: Partial<Record<string, Bilingual>>; // مفاتيح StoreVocabulary
  productionStages?: boolean; // يفعّل مراحل الورشة في الطلبات
  variantAxisDefaults?: {
    size?: Bilingual | null;
    color?: Bilingual | null;
    fabric?: Bilingual | null;
  }; // null = إخفاء
  settingsPatchOnInstall?: Record<string, unknown>; // أعمدة business_settings تُطبَّق مرة عند التثبيت
  aiContext?: (ctx: { brandName: string; lang: "ar" | "en" }) => string;
  readinessChecks?: AddonReadinessCheck[];
  trustBadgeSuggestions?: string[]; // ids من مكتبة trust-badges
};

export type AddonManifest = {
  id: AddonId;
  version: number;
  kind: AddonKind;
  name: Bilingual;
  description: Bilingual;
  whatItAdds: Bilingual[]; // تُعرض في بطاقة المتجر (تُولَّد جزئياً من contributions)
  icon: string; // lucide
  activities: StoreVertical[]; // "موصى به لـ"
  requires?: AddonId[];
  conflicts?: AddonId[];
  entitlementKey?: SaaSFeatureKey; // إن كان مدفوعاً
  settingsSchema?: AddonSettingsField[];
  contributions: AddonContributions;
  seeds?: AddonSeed[];
  upgrades?: Array<{ toVersion: number; seeds: AddonSeed[] }>;
  purge?: (ctx: AddonSeedContext) => Promise<void>; // حذف بيانات الـ add-on (اختياري، بتأكيد)
};

export type BrandAddonRow = {
  brand_id: string;
  addon_id: AddonId;
  status: "installed" | "disabled";
  version: number;
  settings: Record<string, unknown>;
  public_settings: Record<string, unknown>;
  seeded_keys: string[];
  source: "onboarding" | "manual" | "super_admin" | "migration";
  installed_at: string;
  updated_at: string;
};
```

**`src/lib/addons/addon-registry.ts`:**

```ts
import { ADDON_MANIFESTS } from "@/addons/registry";   // الاستيراد الوحيد المسموح من @/addons خارج المجلد

export function getAddon(id: AddonId): AddonManifest;
export function listAddons(): AddonManifest[];
export function validateRegistry(): string[];                          // ids فريدة، deps موجودة، لا دورات، لا تعارض داخلي، slots ids فريدة، seeds keys فريدة
export function resolveInstallOrder(ids: AddonId[]): AddonId[];       // ترتيب طوبولوجي شامل الاعتماديات
export function dependentsOf(id: AddonId, installed: AddonId[]): AddonId[];
export function starterPackFor(activity: StoreVertical): { required: AddonId[]; suggested: AddonId[] };
export function isInstalled(rows: BrandAddonRow[], id: AddonId): boolean;  // status === "installed"
export function contributionsFor(rows: BrandAddonRow[], placement: SlotPlacement): SlotComponent[]; // مرتبة
export function vocabularyFrom(rows: BrandAddonRow[]): Partial<StoreVocabulary>; // دمج بترتيب التثبيت (الأخير يغلب)
export function aiContextFrom(rows, ctx): string;
export function variantAxisDefaultsFrom(rows): ...;
export function customFieldPresetsFrom(rows): ...;
export function sizingPresetOrderFrom(rows): string[];
```

**`src/lib/addons/addon-compat.ts`** — الجسر مع PR-1:

```ts
import type { StoreModules } from "@/lib/store-profile";
export function modulesFromAddons(rows: BrandAddonRow[]): StoreModules {
  return {
    size_guide: isInstalled(rows, "size-guides"),
    fit_passport: isInstalled(rows, "fit-passport"),
    made_to_order: isInstalled(rows, "made-to-order"),
  };
}
```

**`src/addons/registry.ts`:** `export const ADDON_MANIFESTS: AddonManifest[] = [sizeGuides, fitPassport, madeToOrder, fashionCore, abayaPack, beautyPerfume, foodBeverage, digitalProducts, gifts, printStamps, jewelry];` — المرحلة A تُسجّل الأربعة الأولى + `abaya-pack` بمساهمات تشير إلى **المكوّنات الموجودة في أماكنها الحالية** (لفّ بـ `React.lazy(() => import("@/components/…"))`)؛ النقل الفعلي في المرحلة B.

### 4.2 Migration — `supabase/migrations/2026MMDD100000_brand_addons_platform.sql`

```sql
CREATE TABLE IF NOT EXISTS public.brand_addons (
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  addon_id text NOT NULL,
  status text NOT NULL DEFAULT 'installed' CHECK (status IN ('installed','disabled')),
  version integer NOT NULL DEFAULT 1,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(settings) = 'object'),
  public_settings jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(public_settings) = 'object'),
  seeded_keys text[] NOT NULL DEFAULT '{}',
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('onboarding','manual','super_admin','migration')),
  installed_by uuid NULL,
  installed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (brand_id, addon_id)
);
CREATE INDEX IF NOT EXISTS idx_brand_addons_brand_status ON public.brand_addons(brand_id, status);
DROP TRIGGER IF EXISTS brand_addons_set_updated_at ON public.brand_addons;
CREATE TRIGGER brand_addons_set_updated_at BEFORE UPDATE ON public.brand_addons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.platform_addon_policies (
  addon_id text PRIMARY KEY,
  is_available boolean NOT NULL DEFAULT true,
  entitlement_key text NULL,
  default_for_activities text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.brand_addon_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  addon_id text NOT NULL,
  event text NOT NULL CHECK (event IN ('install','enable','disable','uninstall','purge','upgrade','seed','settings')),
  actor_id uuid NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_brand_addon_events_brand ON public.brand_addon_events(brand_id, created_at DESC);

-- RLS
ALTER TABLE public.brand_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_addon_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_addon_events ENABLE ROW LEVEL SECURITY;

-- قراءة: أعضاء البراند (نفس صيغ categories) + السوبر أدمن. الكتابة: service role فقط (عبر server functions).
CREATE POLICY "Brand members read own addons" ON public.brand_addons FOR SELECT TO authenticated
  USING (can_access_brand(brand_id) OR is_super_admin());
CREATE POLICY "Public read addon policies" ON public.platform_addon_policies FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Super admin manage addon policies" ON public.platform_addon_policies FOR ALL TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY "Brand members read own addon events" ON public.brand_addon_events FOR SELECT TO authenticated
  USING (can_access_brand(brand_id) OR is_super_admin());
GRANT SELECT ON public.brand_addons, public.platform_addon_policies, public.brand_addon_events TO authenticated;
GRANT SELECT ON public.platform_addon_policies TO anon;

-- هجرة store_modules → brand_addons (تحافظ على السلوك الحالي حرفياً)
-- لكل براند: resolve كما تفعل resolveStoreModules (override ?? default(vertical)) ثم أدرج الصفوف.
INSERT INTO public.brand_addons (brand_id, addon_id, status, source, seeded_keys)
SELECT bs.brand_id, x.addon_id, 'installed', 'migration',
       CASE WHEN x.addon_id = 'size-guides' THEN ARRAY['abaya_default_guide'] ELSE '{}' END  -- الدليل الافتراضي زُرع في 20260916100000
FROM public.business_settings bs
CROSS JOIN LATERAL (VALUES
  ('size-guides',   COALESCE((bs.store_modules->>'size_guide')::boolean,    bs.store_vertical IN ('abayas','fashion','jewelry'))),
  ('fit-passport',  COALESCE((bs.store_modules->>'fit_passport')::boolean,  bs.store_vertical IN ('abayas','fashion'))),
  ('made-to-order', COALESCE((bs.store_modules->>'made_to_order')::boolean, bs.store_vertical IN ('abayas','fashion','jewelry','print')))
) AS x(addon_id, enabled)
WHERE x.enabled
ON CONFLICT DO NOTHING;

-- البراندات الحالية (صارت abayas في 4.0): fashion-core + abaya-pack (seeds الأخير مُنجزة فعلياً عبر الـ backfills السابقة)
INSERT INTO public.brand_addons (brand_id, addon_id, status, source, seeded_keys)
SELECT bs.brand_id, 'fashion-core', 'installed', 'migration', '{}' FROM public.business_settings bs WHERE bs.store_vertical IN ('abayas','fashion')
ON CONFLICT DO NOTHING;
INSERT INTO public.brand_addons (brand_id, addon_id, status, source, seeded_keys)
SELECT bs.brand_id, 'abaya-pack', 'installed', 'migration', ARRAY['abaya_default_guide','abaya_fit_profiles','abaya_sizing_order']
FROM public.business_settings bs WHERE bs.store_vertical = 'abayas'
ON CONFLICT DO NOTHING;

-- get_storefront_page_data: انسخ آخر تعريف (سيكون في migration PR-3 أو PR-2 — grep -ln … | tail -1) وأضف:
--   v_addons jsonb := (SELECT COALESCE(jsonb_agg(jsonb_build_object(
--       'addon_id', a.addon_id, 'version', a.version, 'settings', a.public_settings)), '[]'::jsonb)
--     FROM public.brand_addons a WHERE a.brand_id = v_brand_id AND a.status = 'installed');
--   … 'addons', v_addons,   في الناتج النهائي
NOTIFY pgrst, 'reload schema';
```

(اسم الملف يحمل تاريخاً بعد آخر migration من PR-2/3/4 — حدّده وقت التنفيذ.)

### 4.3 دوال الخادم — `src/lib/addons/addons.functions.ts`

نمط `saas-billing.functions.ts` (`createServerFn` + `.middleware([requireSupabaseAuth])` + `requireBrandAccess`/`requireSuperAdmin`). كل دالة تكتب حدثاً في `brand_addon_events`.

| الدالة                | المدخلات                                         | السلوك                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `listBrandAddons`     | `{ brandId }`                                    | صفوف `brand_addons` + سياسات المنصة + حالة entitlement لكل add-on (عبر `rpc_check_entitlement` إن كان له `entitlementKey`).                                                                                                                                                                                                                                                            |
| `installAddon`        | `{ brandId, addonId, source, withDependencies }` | يتحقق من الإتاحة (`platform_addon_policies.is_available`) والـ entitlement والتعارض؛ يحسب `resolveInstallOrder`؛ يرفض إن كانت اعتماديات ناقصة و`withDependencies=false`؛ يدرج الصفوف؛ يطبّق `settingsPatchOnInstall` (مرة واحدة، لا يكتب فوق قيمة غيّرها التاجر — يُسجَّل في `seeded_keys` كـ `patch:<key>`)؛ يشغّل `seeds` غير المنفَّذة بـ `supabaseAdmin`؛ يحدّث `public_settings`. |
| `setAddonStatus`      | `{ brandId, addonId, status }`                   | `disabled` يمنع إن كانت add-on مثبتة تعتمد عليها (`dependentsOf`) — يعرض القائمة.                                                                                                                                                                                                                                                                                                      |
| `uninstallAddon`      | `{ brandId, addonId, purge }`                    | نفس فحص الاعتماديات؛ يحذف الصف؛ إن `purge` و`manifest.purge` موجود ينفّذه بعد تأكيد صريح من الواجهة (نص التأكيد يذكر عدد السجلات).                                                                                                                                                                                                                                                     |
| `updateAddonSettings` | `{ brandId, addonId, settings }`                 | يتحقق ضد `settingsSchema`؛ يحدّث `settings` و`public_settings` (المفاتيح `public: true` فقط).                                                                                                                                                                                                                                                                                          |
| `upgradeBrandAddons`  | `{ brandId }`                                    | لكل صف `version < manifest.version`: يشغّل `upgrades` بالترتيب ثم يرفع `version`. تُستدعى من الأدمن مرة عند التحميل (hook) بلا تأثير مرئي.                                                                                                                                                                                                                                             |
| `installStarterPack`  | `{ brandId, activity, selectedAddonIds }`        | يُستدعى **داخل** `registerInstantTrial` (بعد الخطوة 6b الموجودة) وفي مسار موافقة السوبر أدمن؛ يثبّت `required ∪ selected`.                                                                                                                                                                                                                                                             |

**السياسة (قرار المالك):** التاجر (brand admin) يثبّت/يعطّل/يزيل بنفسه كل add-on متاح (`platform_addon_policies.is_available`). السوبر أدمن يستطيع كل شيء بما فيه تجاوز الإتاحة. الإزالة **لا تحذف البيانات**؛ الحذف خيار صريح منفصل (`purge`) بتأكيد كتابي. **كل الـ add-ons مجانية عند الإطلاق** — لا `entitlementKey` في أي manifest الآن (الحقل يبقى في النوع للمرحلة E).

### 4.4 القراءة في الواجهات

- **الأدمن:** `src/hooks/use-brand-addons.ts` → `useBrandAddons(brandId)` (`queryKeys.brand.addons(brandId)`, `staleTime 60s`) يعيد `{ rows, isInstalled(id), modules: modulesFromAddons(rows), vocab, contributions(placement) }`. **`useAdminStoreProfile`** (موجود في `src/hooks/use-store-profile.ts`) يُعدَّل ليأخذ `modules` من `modulesFromAddons` بدل `resolveStoreModules(store_modules)` — كل استعمالات PR-1 تبقى كما هي.
- **الستور فرونت:** `$slug.route.tsx` loader يمرر `bootstrapData.addons` إلى `StorefrontProvider` (prop `addons`)؛ `useStoreAddons()` جديد، و**`useStoreModules()`** (موجود في `storefront-context.tsx`) يُشتق من الـ add-ons. الشبكة الانتقالية: إن كانت `addons` غير موجودة في الناتج (قبل تطبيق الـ migration) → اشتق من `store_modules` كما الآن.
- **الترقية:** `app-shell.tsx` يستدعي `upgradeBrandAddons` مرة لكل جلسة براند (`useEffect` مع مفتاح `sessionStorage`).

### 4.5 عارض الـ Slots — `src/components/addons/AddonSlot.tsx`

```tsx
export function AddonSlot<P>({
  placement,
  props,
  tab,
  fallback = null,
}: {
  placement: SlotPlacement;
  props: P;
  tab?: string;
  fallback?: ReactNode;
}) {
  const { contributions } = useAddonsContext(); // يعمل في الأدمن والستور فرونت (provider مختلف، واجهة واحدة)
  const items = contributions(placement).filter((c) => !tab || c.tab === tab);
  if (!items.length) return <>{fallback}</>;
  return (
    <>
      {items.map((c) => (
        <AddonErrorBoundary key={c.id} addonId={c.addonId}>
          {" "}
          {/* انهيار add-on لا يكسر الصفحة */}
          <Suspense fallback={null}>
            <c.component {...props} />
          </Suspense>
        </AddonErrorBoundary>
      ))}
    </>
  );
}
```

`AddonsProvider` (سياق واحد) يُركَّب في `app-shell.tsx` (أدمن) و`StorefrontProvider` (ستور فرونت) ويقدّم `contributions(placement)` و`isInstalled(id)` و`vocab`.

### 4.6 ماذا يتغير في PR-1 code في المرحلة A؟

**لا شيء مرئي.** فقط:

- `useAdminStoreProfile` و `useStoreModules` يشتقان `modules` من الـ add-ons (4.4).
- `StoreProfileCard` (موجود): السويتشات الثلاثة تصبح استدعاءات `installAddon`/`setAddonStatus` بدل كتابة `store_modules` (نفس الشكل للمستخدم) + رابط "متجر الإضافات" (المرحلة C).
- `store_modules` يبقى عموداً **مهملاً** (لا يُقرأ بعد الآن) — يُحذف في migration لاحق بعد مرحلتين.
- اختبارات: `tests/addon-registry.test.ts` (validateRegistry على السجل الحقيقي، ترتيب طوبولوجي، dependentsOf، starterPackFor لكل نشاط)، `tests/addon-compat.test.ts` (`modulesFromAddons`)، source test: الـ migration يحتوي `'addons', v_addons`.

---

## 5. المرحلة B — الاستخراج: النواة تصبح Vanilla فعلاً

الهدف: بعد هذه المرحلة `src/lib`, `src/components` (عدا `components/addons`), `src/routes` **لا تحتوي** كلمة عباية/خياط/Fit Passport/Size Guide، ولا تستورد من `@/addons/*` إلا عبر الـ registry. (اختبار الحراسة 5.5 من الخطة الأولى يُفعَّل هنا بصيغته الأقوى.)

### 5.1 النقل (git mv مع الحفاظ على التاريخ)

| من                                                                                                                                                                | إلى                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `src/lib/size-guide.ts`, `src/lib/size-guide-templates.ts`                                                                                                        | `src/addons/size-guides/lib/`                                                                       |
| `src/components/storefront/size-guide/*`, `src/components/storefront/SizeGuideModal.tsx`                                                                          | `src/addons/size-guides/components/storefront/`                                                     |
| محتوى `src/routes/_authenticated/admin.b.$slug.size-guides.tsx` (المحرر)                                                                                          | `src/addons/size-guides/components/admin/SizeGuideStudioPage.tsx`؛ ملف المسار يبقى رفيعاً (10 أسطر) |
| `src/lib/fit-passport.ts`, `StorefrontFitPassport.tsx`, `CustomerFitPassport.tsx`, `ItemTailoringCustomizer` (من `orders.$id.tsx`) و كتلة Passport في صفحة المنتج | `src/addons/fit-passport/…`                                                                         |
| تبديل جاهز/حسب الطلب + صندوق ملاحظات الورشة (صفحة المنتج)، أزرار إرسال/استلام (OrderUnifiedHeader/orders.index/orders.$id)، سطر Content Studio، حقل الخامة        | `src/addons/made-to-order/…`                                                                        |
| `CUSTOMIZER_PRESETS.fashion` و `passport_*` (inventory.tsx)، `SIZING_PRESETS` الأزيائية (تبقى في `variant-sku-utils.ts` لكن **الترتيب** يأتي من add-on)           | `src/addons/fashion-core/presets.ts`, `src/addons/abaya-pack/seeds.ts`                              |

قاعدة: عند نقل ملف تفحصه اختبارات source (مثل `tests/storefront-fit-passport.test.ts`, `tests/manual-order-tailoring-specs.test.ts`) — حدّث مسار القراءة في الاختبار **بنفس التأكيدات** واذكره في رسالة الـ commit.

### 5.2 استبدال البوابات بـ Slots (المواضع الـ 12 من PR-1)

| الموضع (النواة)                                            | قبل (PR-1)                                          | بعد (المرحلة B)                                                                                                                                                                      |
| ---------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `$slug.product.$id.tsx` بجانب عنوان المقاس                 | `modules.size_guide && <SizeGuideModal/>`           | `<AddonSlot placement="storefront.product.optionsAside" props={{ product, selectedSize, onSelectSize, uniqueSizes }} />`                                                             |
| `$slug.product.$id.tsx` بعد الخيارات                       | كتلة Passport + تبديل جاهز/حسب الطلب + الملاحظات    | `<AddonSlot placement="storefront.product.afterOptions" props={{ product, customFields, cfValues, setCfValues, sizeState… }} />`                                                     |
| `$slug.product.$id.tsx` بعد CTA                            | —                                                   | `<AddonSlot placement="storefront.product.afterCta" …/>` (قسم دليل المقاسات inline)                                                                                                  |
| `$slug.account.tsx` التبويبات                              | `modules.fit_passport && <TabsTrigger value="fit">` | `contributions("storefront.account.tab")` تُدمج في قائمة التبويبات (كل مساهمة: `{id, label, icon, component}`)                                                                       |
| فوتر المتجر                                                | —                                                   | `contributions("storefront.footer.helpLink")`                                                                                                                                        |
| `admin.b.$slug.customers.$customerId.tsx`                  | `modules.fit_passport && <CustomerFitPassport/>`    | `<AddonSlot placement="admin.customer.panel" props={{ customerId }} />`                                                                                                              |
| `admin.b.$slug.orders.$id.tsx` بند الطلب في وضع التحرير    | `<ItemTailoringCustomizer fitPassportEnabled=…/>`   | `<AddonSlot placement="admin.order.itemPanel" props={{ item, onChange, product, customerId }} />`                                                                                    |
| رأس الطلب (`OrderUnifiedHeader`) والقائمة (`orders.index`) | أزرار الخياط مشروطة                                 | `<AddonSlot placement="admin.order.headerActions" props={{ order, workflow, refetch }} />`؛ `getOrderWorkflow` يأخذ `productionStages: boolean` من الـ add-ons (بدل الافتراض الدائم) |
| `admin.b.$slug.inventory.tsx` قوالب الحقول وقوالب المقاسات | شروط `profile.modules.*`                            | `customFieldPresetsFrom(rows)` + `sizingPresetOrderFrom(rows)`؛ لوحات إضافية عبر `admin.product.editorPanel`                                                                         |
| `admin.b.$slug.settings.tsx` تبويب business/storefront     | `StoreProfileCard` + بطاقات ثابتة                   | `<AddonSlot placement="admin.settings.card" tab="storefront" />` (مثلاً إعدادات fit_profiles من add-on)                                                                              |
| `StoreReadinessChecklist`                                  | ثابت                                                | يدمج `readinessChecks` من الـ add-ons                                                                                                                                                |
| `admin-navigation.ts`                                      | عنصر `size-guides` مشروط بـ `storeModules`          | `getAdminNavItems({ …, addonNavItems })` يضيف `navItems` من الـ add-ons (tier `modular`)                                                                                             |

### 5.3 المفردات وسياق AI كمساهمات

- `src/lib/store-vocabulary.ts` (نواة): `DEFAULT_VOCABULARY` **عام** ("الورشة / Workshop", "حسب الطلب / Made to order") + `resolveVocabulary(base, ...overrides)`. الـ add-on `fashion-core` يساهم بمفردات الأزياء الحالية **حرفياً**. النتيجة للبراندات الحالية = نفس النصوص (اختبار يثبت ذلك).
- كل المواضع الـ "مفردات" في جدول الخطة الأولى (§0 البنود 5, 10, 16-19, 26-31) تقرأ من `vocab`.
- `src/lib/store-profile.server.ts#getBrandAiContext(brandId)` = `aiContextFrom(installedRows, { brandName, lang })` + سطر النشاط؛ يُحقن في Copilot/Instagram/Variants/Translate (نفس مواضع الخطة الأولى §5.2).

### 5.4 حراسة النواة

- ESLint (`eslint.config.js`): قاعدة `no-restricted-imports` على `src/**` (عدا `src/addons/**` و`src/lib/addons/addon-registry.ts`): يمنع `@/addons/*` عدا `@/addons/registry`.
- `tests/vanilla-core-guard.test.ts`: يفحص `src/**/*.{ts,tsx}` عدا `src/addons/**` و قائمة بيضاء صغيرة (`trust-badges.ts`, `variant-sku-utils.ts` بيانات القوالب): لا `/عباي|abaya|الخياط|Sent to Tailor|Fit Passport|SizeGuide/i`.
- `tests/addon-registry.test.ts`: كل manifest يمر `validateRegistry`؛ كل `slots[].component` قابل للتحميل (`await component._payload` أو استيراد ديناميكي)؛ كل add-on فيه `whatItAdds` ≥ 1.

---

## 6. المرحلة C — متجر الإضافات + الأونبوردنق + السوبر أدمن

### 6.1 صفحة "الإضافات / Add-ons" — `src/routes/_authenticated/admin.b.$slug.addons.tsx` + `src/components/addons/AddonStore.tsx`

- عنصر تنقل `id: "addons"`, `labelAr: "الإضافات"`, `labelEn: "Add-ons"`, `category: "store_setup"`, `tier: "core"` (يجب أن يجده كل تاجر)، أيقونة `Puzzle`. وزر "الإضافات / Add-ons" داخل `OsAppsHubModal`.
- تبويبات: **المثبتة** / **موصى بها لنشاطك** (`manifest.activities` أو `platform_addon_policies.default_for_activities` تحتوي `store_vertical`) / **الكل**.
- بطاقة لكل add-on: الأيقونة، الاسم، الوصف، شارة النوع (feature/pack)، "ماذا يضيف" (من `whatItAdds` + تُولَّد أسطر تلقائياً من `contributions`: "يضيف عنصر تنقل: أدلة المقاسات"، "يضيف تبويباً في حساب العميل"…)، "يتطلب: …"، شارة "مدفوع — يتطلب باقة X" إن لم يكن entitled (زر يفتح `BrandSubscriptionHub`)، الحالة (مثبت/معطّل)، أزرار: تثبيت / تعطيل / تفعيل / إزالة / إعدادات.
- **تثبيت**: إن كانت اعتماديات ناقصة → حوار "سيُثبَّت أيضاً: …" ثم `installAddon({withDependencies:true})`. بعد التثبيت: toast + إبطال `queryKeys.brand.addons` و`storeProfile` و`businessSettings` (لأن `settingsPatchOnInstall` قد يغيّر إعدادات).
- **إزالة**: حوار يوضح "البيانات تبقى" مع خيار متقدم "حذف بيانات الإضافة نهائياً" (يظهر فقط إن كان للـ manifest `purge`) بتأكيد كتابة اسم الإضافة.
- **إعدادات**: درج (Sheet) يرسم `settingsSchema` تلقائياً (boolean → Switch، text → Input/BilingualField، select → Select) ويحفظ عبر `updateAddonSettings`.
- سجل الأحداث في أسفل الصفحة (من `brand_addon_events`).

### 6.2 الأونبوردنق — خطوة "حزمة البداية"

في `src/routes/onboard.tsx` (اختيار النشاط الإلزامي موجود منذ `a2bfeca`): بعد اختيار النشاط تظهر بطاقة "سيُفعَّل لمتجرك:" تعرض `starterPackFor(activity)` — الإلزامية مقفلة، المقترحة كـ `Checkbox` (مثل `made-to-order` للمأكولات). `registerInstantTrial` يستقبل `selectedAddonIds` (zod: مصفوفة من `AddonId` مقيدة بما يسمح به `starterPackFor`) ويستدعي `installStarterPack` داخلياً بعد الخطوة 6b. مسار موافقة طلبات السوبر أدمن يثبّت الحزمة الافتراضية للنشاط المحوَّل.

### 6.3 السوبر أدمن

- `admin.brands.tsx`: عمود "الإضافات" (عدد + أيقونات) وفي تفاصيل البراند لوحة `AddonStore` بوضع super (يستطيع التثبيت/الإزالة وتجاوز الإتاحة).
- `src/components/super/SuperAddonPoliciesManager.tsx` داخل `admin.super.settings.tsx` بجانب `SuperAddonsManager` الموجود: جدول كل الـ add-ons من السجل مع `is_available`، `entitlement_key` (اختيار من `saas_features`)، `default_for_activities` (multi-select) → يكتب `platform_addon_policies`.
- `StoreProfileCard` (الإعدادات): يبقى لاختيار النشاط + ملخص الإضافات المثبتة + زر "إدارة الإضافات".

### 6.4 اختبارات المرحلة C

- `tests/addons-functions.test.ts` (سلوكية على الأجزاء النقية): حساب حزمة البداية، التحقق من `selectedAddonIds` ضد الحزمة، منطق "يتطلب أيضاً"، منع التعطيل عند وجود تابعين.
- source: `onboard.tsx` يعرض `starterPackFor`؛ `admin-navigation.ts` يحتوي `id: "addons"` بـ tier core؛ `OsAppsHubModal` يحتوي زر متجر الإضافات.
- **يدوي**: تثبيت `size-guides` على براند عام يُظهر عنصر التنقل وزر الدليل فوراً بعد إعادة التحميل؛ تعطيله يخفيهما مع بقاء الأدلة في DB؛ محاولة إزالة `made-to-order` وعليه `print-stamps` تُرفض بقائمة التابعين.

---

## 7. المرحلة D — Packs الأنشطة الأخرى + الجوال + التلميع

- تنفيذ الـ manifests السبعة (`beauty-perfume`, `food-beverage`, `digital-products`, `gifts`, `print-stamps`, `jewelry`, `fashion-core` إن لم يكتمل) بمحتوى الجدول في القسم 3: seeds (تستخدم `size_guides`, `customization_options`, `categories`, `business_settings` الموجودة فقط — **لا جداول جديدة**)، `settingsPatchOnInstall`, `variantAxisDefaults`, `vocabulary`, `aiContext`, `readinessChecks`, `trustBadgeSuggestions`.
- `variantAxisDefaults` تُطبَّق في النواة: صفحة المنتج ومحرر المنتج يقرآن التسمية بترتيب: تسمية المنتج (`variant_label_*`) ← افتراضي الـ add-on ← الافتراضي العام؛ `null` يخفي المحور في المحرر والستور فرونت (المتغيرات القديمة تبقى في DB).
- تطبيق الجوال `apps/boutq-os-mobile`: يقرأ `brand_addons` (status installed) مع `business_settings` في `src/lib/auth.tsx`، ونسخة مصغّرة من خريطة المفردات (`src/lib/store-vocabulary.ts` داخل التطبيق — لا استيراد من الجذر)؛ يُظهر مراحل الورشة فقط إن كان `made-to-order` مثبتاً.
- Telemetry خفيف: حدث `addon_installed`/`addon_uninstalled` في `saas_audit_logs` (موجود) لتحليل الطلب على الـ add-ons.
- اختبارات: كل pack يمر `validateRegistry`؛ اختبار seeds idempotent (تشغيل مرتين على db وهمي = نفس النتيجة)؛ `vanilla-core-guard` أخضر؛ اختبار المفردات: `general` بلا خياط، `fashion-core` = النصوص القديمة حرفياً.

---

## 8. المرحلة E — (اختياري) التسعير

- `entitlementKey` في manifests المدفوعة (مثلاً `fit_passport.enabled`) + صف في `saas_features` + ربطه بـ `saas_addons` (grant_type `boolean_unlock`) أو بالخطط. `installAddon` يرفض بـ `ADDON_NOT_ENTITLED`؛ الواجهة تعرض القفل وزر الترقية. عند انتهاء الاشتراك: الـ add-on يصبح `disabled` تلقائياً (cron/عند التقييم) **بلا حذف بيانات**.

---

## 9. ترتيب الـ PRs

| PR   | الفرع                             | المحتوى                          | "Done when"                                                                                                                                      |
| ---- | --------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| —    | (الجلسة الحالية)                  | PR-2, PR-3, PR-4 من الخطة الأولى | مدمجة وخضراء — **شرط بدء v2**                                                                                                                    |
| v2-A | `feat/addons-platform`            | المرحلة 4 كاملة                  | لا فرق مرئي لأي براند؛ `brand_addons` مملوء بالهجرة؛ `resolveStoreModules` مشتق؛ اختبارات السجل والتوافق خضراء؛ `npm run build` ✓                |
| v2-B | `refactor/extract-fashion-addons` | المرحلة 5                        | `vanilla-core-guard` أخضر؛ كل مواضع PR-1 تستخدم `AddonSlot`؛ البراندات الحالية بلا فرق مرئي (لقطات قبل/بعد في الـ PR)                            |
| v2-C | `feat/addon-store`                | المرحلة 6                        | متجر الإضافات يعمل بكل الإجراءات؛ الأونبوردنق يثبّت الحزمة؛ السوبر أدمن يدير السياسات                                                            |
| v2-D | `feat/activity-packs`             | المرحلة 7                        | براند "عطور" جديد يُولد Vanilla + pack العطور بتسميات المحاور الصحيحة؛ براند "مأكولات" بالاستلام مفعّلاً ومفردات المطبخ؛ الجوال يعكس الـ add-ons |
| v2-E | (اختياري)                         | المرحلة 8                        | —                                                                                                                                                |

---

## 10. القرارات المُتخذة (المالك — 2026-09-14)

| السؤال                           | القرار                                                                                                                      | أين طُبّق في الخطة                                 |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `abayas` نشاط مستقل عن `fashion` | **نعم.** حزمة بداية خاصة (`abaya-pack`)، والبراندات الحالية تُحوَّل إلى `abayas`.                                           | 3 (Starter Packs)، 4.0، 4.2 (الهجرة)               |
| من يثبّت الـ add-ons             | **التاجر بنفسه** (self-serve) لكل ما هو متاح؛ السوبر أدمن يتحكم بالإتاحة من السياسات.                                       | 4.3 (السياسة)، 6.1، 6.3                            |
| الإزالة تحذف البيانات؟           | **لا** — البيانات تبقى؛ الحذف خيار صريح منفصل بتأكيد كتابي (`purge`).                                                       | 1 (الإزالة والبيانات)، 4.3 (`uninstallAddon`)، 6.1 |
| إضافات مدفوعة عند الإطلاق        | **لا — كلها مجانية.** حقل `entitlementKey` يبقى في النوع فارغاً؛ المرحلة E اختيارية لاحقاً.                                 | 4.3، 8                                             |
| التسمية في الواجهة               | **"الإضافات / Add-ons"** في كل مكان (عنصر التنقل، الصفحة، الأونبوردنق، السوبر أدمن). الـ Apps Hub يبقى باسمه لعناصر التنقل. | 6.1، 6.2، 6.3                                      |

---

## 11. Definition of Done (v2 كاملة)

- [ ] براند جديد بنشاط `general` = Vanilla تماماً: لا أثر لأي نشاط في الأدمن أو الستور فرونت أو الفاتورة أو الجوال، و`brand_addons` فارغ.
- [ ] براند جديد بنشاط `abayas`: يُولد Vanilla ثم تُثبَّت حزمته تلقائياً (5 add-ons) وتظهر كل ميزات الأزياء الحالية **بنفس الشكل** الذي تراه البراندات القديمة.
- [ ] كل البراندات الحالية: `store_vertical` صار `abayas`، `brand_addons` مُهاجَر (fashion-core + size-guides + fit-passport + made-to-order + abaya-pack)، لا فرق مرئي، `store_modules` لم يعد يُقرأ.
- [ ] النواة لا تستورد من `@/addons/*` إلا عبر الـ registry، وخالية من مفردات الأزياء (اختبار حراسة + ESLint).
- [ ] كل add-on: manifest صالح، مساهمات تُرسم عبر `AddonSlot`، انهيار add-on لا يكسر الصفحة (error boundary)، seeds idempotent ومسجَّلة، upgrade يعمل عند رفع `version`.
- [ ] صفحة الإضافات: تثبيت/تعطيل/تفعيل/إزالة (البيانات تبقى)/حذف صريح/إعدادات/اعتماديات/تعارضات — كلها تعمل بيد التاجر مع سجل أحداث؛ لا add-on مقفل بالتسعير عند الإطلاق.
- [ ] الأونبوردنق يعرض حزمة البداية ويثبّتها؛ السوبر أدمن يدير السياسات ويرى إضافات كل براند.
- [ ] Packs الأنشطة (عطور، مأكولات، رقمي، هدايا، طباعة، مجوهرات) تعمل بـ seeds/إعدادات/مفردات/AI بلا جداول جديدة.
- [ ] `npm run typecheck` صفر أخطاء، `npx vitest run` بلا فشل جديد، `db:migrations:check` و`format:check` ناجحان، لا مخالفات guardrails.
