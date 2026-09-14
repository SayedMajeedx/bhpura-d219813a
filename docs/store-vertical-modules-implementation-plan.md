# Store Vertical & Modules (White-label de-fashioning) — Implementation Plan

> خطة تنفيذ كاملة لتحويل الميزات الخاصة بالأزياء والتفصيل (دليل المقاسات، Fit Passport، مسار "التفصيل/الخياط"، محور "القماش"…) من ميزات **مُثبَّتة في الكود لكل البراندات** إلى **وحدات (Modules) تُفعَّل حسب نوع النشاط (Vertical)** أو يدوياً من إعدادات البراند — بحيث يبقى كل شيء كما هو للبراندات الحالية، ويظهر أي براند جديد (مطعم، عطور، هدايا، مطبعة…) كمنصة white-label نظيفة بلا أي أثر للأزياء. ويتحول "دليل المقاسات" تحديداً إلى **Size Guide Studio** قابل للتخصيص بالكامل لأي براند يريده (المرحلة 2).
>
> الوثيقة مكتوبة لتُنفَّذ كما هي — بواسطة مطوّر أو مساعد AI — داخل هذا المستودع تحديداً. كل مسار ملف ورقم سطر مذكور تم التحقق منه من الكود الفعلي بتاريخ **2026-09-14**. أعد التحقق من أرقام الأسطر قبل الاعتماد عليها (الملفات الكبيرة تتغير).
>
> **Baseline المُتحقَّق منه (2026-09-14):** `npx vitest run` → **113 ملف / 670 اختبار، كلها ناجحة**. معيار النجاح بعد كل مرحلة = **لا فشل جديد** + `npm run typecheck` صفر أخطاء.
>
> **قواعد عامة تنطبق على كل المراحل:**
>
> - لا تعديل على أي ملف موجود في `supabase/migrations/` — فقط **إضافة** ملفات migration جديدة (`YYYYMMDDHHMMSS_description.sql`). شغّل `npm run db:migrations:check` بعد كل إضافة.
> - لا تعديل على `package.json`.
> - guardrails نظام التصميم: لا `text-[10px]`/`text-[11px]`، لا `border-border/50`، لا `<button>` خام (استخدم `Button`)، لا hex في className. (`tests/design-system-guardrails.test.ts`).
> - i18n inline: `lang === "ar" ? "..." : "..."` أو `t("عربي", "English")` حسب نمط الملف.
> - **ممنوع كسر البراندات الحالية**: كل براند موجود اليوم يجب أن يرى نفس الواجهة بالضبط بعد كل مرحلة (المبدأ: الافتراضيات تُحافظ على السلوك الحالي، والتغيير يظهر فقط للبراندات الجديدة أو عند تغيير الإعداد يدوياً).
> - بعد كل مرحلة: `npm run typecheck` + `npx vitest run` + `npx eslint <الملفات المعدّلة>` + `npm run format:check` + `npm run db:migrations:check` عند إضافة migration.

---

## 0. نتيجة الفحص الشامل — أين الأزياء "مُثبَّتة" في النظام؟

فحصت `src/`، `supabase/migrations/`، `apps/`، `tests/`. الجدول يصنّف كل موقع حسب **نوع العلاج** المطلوب:

| #   | الموقع (ملف:سطر)                                                                                                                                                                                                          | ما هو مُثبَّت                                                                                                                                                                                                                          | التصنيف                                             | المرحلة              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | -------------------- |
| 1   | `src/components/storefront/SizeGuideModal.tsx` (كامل الملف؛ `DEFAULT_ABAYA_SIZES` سطر 19)                                                                                                                                 | جدول مقاسات عبايات 50–60 بأعمدة (طول/صدر/كم/كتف) + نصائح قياس عبايات، **بلا أي مصدر بيانات**؛ ويحتوي `<button>` خام (82-104) مخالفاً للـ guardrails                                                                                    | **محتوى قابل للتهيئة** + **بوابة وحدة**             | 1 (إخفاء) → 2 (بناء) |
| 2   | `src/routes/$slug.product.$id.tsx:1557`                                                                                                                                                                                   | `<SizeGuideModal>` يظهر لأي منتج له مقاسات — حتى المقاس الوهمي "قياسي" (الصورة المرفقة بالطلب)                                                                                                                                         | بوابة وحدة `size_guide`                             | 1                    |
| 3   | `src/routes/$slug.product.$id.tsx:641-651, 668-735`                                                                                                                                                                       | اكتشاف Fit Passport من مفاتيح `passport_abaya`/`passport_dress`؛ استعلام `customer_fit_passports` يعمل لكل عميل مسجّل في كل براند                                                                                                      | بوابة وحدة `fit_passport`                           | 1                    |
| 4   | `src/routes/$slug.product.$id.tsx:997-1000, 1443-1478`                                                                                                                                                                    | تبديل "مقاس جاهز / مقاس تفصيل" يظهر لأي منتج له مقاسات + حقول مخصصة (مطبعة، هدايا…)                                                                                                                                                    | بوابة وحدة `made_to_order`                          | 1                    |
| 5   | `src/routes/$slug.product.$id.tsx:2104-2138`                                                                                                                                                                              | صندوق "ملاحظات وتفاصيل التفصيل والخياط" مع placeholder عبايات، يظهر لأي منتج له حقول مخصصة                                                                                                                                             | بوابة + **مفردات**                                  | 1 (بوابة) → 5        |
| 6   | `src/routes/$slug.account.tsx:544-550, 607-616`                                                                                                                                                                           | تبويب "مقاساتي / My fit" ثابت في حساب العميل لكل براند                                                                                                                                                                                 | بوابة وحدة `fit_passport`                           | 1                    |
| 7   | `src/components/storefront/StorefrontFitPassport.tsx:209-213, 253`                                                                                                                                                        | تبويبات ثابتة `abaya` / `dress` + `FIT_PROFILE_FIELDS`                                                                                                                                                                                 | محتوى قابل للتهيئة                                  | 4                    |
| 8   | `src/lib/fit-passport.ts` (كامل)                                                                                                                                                                                          | `FitProfileType = "abaya" \| "dress"`، حقول القياس، regex تصنيف المنتج (`/dress\|فساتين/`) و مطابقة الحقول                                                                                                                             | محتوى قابل للتهيئة                                  | 4                    |
| 9   | `src/routes/_authenticated/admin.b.$slug.customers.$customerId.tsx:534-542`                                                                                                                                               | بطاقة `CustomerFitPassport` ثابتة في صفحة كل عميل                                                                                                                                                                                      | بوابة وحدة                                          | 1                    |
| 10  | `src/routes/_authenticated/admin.b.$slug.orders.$id.tsx:257 (ItemTailoringCustomizer), 446 (Fit Passport Module), 894 (customerPassportQ), 1840/2073/3734/3918 (`includes("تفصيل")`), 2381/2422 (إرسال/استلام من الخياط)` | لوحة "خيارات التخصيص والمقاسات (التفصيل)" + Passport + اكتشاف التفصيل بكلمة عربية ثابتة                                                                                                                                                | بوابة + مفردات                                      | 1 + 3 + 5            |
| 11  | `src/routes/_authenticated/admin.b.$slug.inventory.tsx:2282 (CUSTOMIZER_PRESETS), 2359/2421 (passport presets), 3649-3657 (قائمة القوالب), 4484-4500 (SIZING_PRESETS pills), 4532 (حقل الخامة)`                           | قوالب Fit Passport ظاهرة للجميع؛ قوالب المقاسات تبدأ بالعبايات؛ محور "الخامة" ثابت                                                                                                                                                     | بوابة + ترتيب حسب النشاط                            | 1 + 5                |
| 12  | `src/routes/_authenticated/admin.b.$slug.inventory.tsx:2780, 2899`                                                                                                                                                        | إنشاء متغيّر وهمي `size: "قياسي"/"Standard"` لكل منتج بلا متغيرات → يظهر في الستور فرونت كـ "المقاس / خيار: قياسي" + زر دليل المقاسات                                                                                                  | **خلل كامن** (يخص كل الأنشطة)                       | 4                    |
| 13  | `src/lib/variant-sku-utils.ts:162-215`                                                                                                                                                                                    | `SIZING_PRESETS` يبدأ بـ `abaya_gulf`/`abaya_extended`                                                                                                                                                                                 | ترتيب حسب النشاط                                    | 5                    |
| 14  | `src/lib/order-type-detector.ts` (كامل)                                                                                                                                                                                   | `OrderType = "ready_stock" \| "tailoring" \| "mixed"`، كلمات مفتاحية `تفصيل/tailor`                                                                                                                                                    | **مفهوم عام صحيح** (made-to-order) باسم أزيائي      | 5 (تسميات فقط)       |
| 15  | `src/lib/order-workflow.ts:23-24, 36-37, 134-138, 164-172`                                                                                                                                                                | مراحل `sent_to_tailor`/`received_from_tailor` وإجراءات `send_to_tailor`/`receive_from_tailor`                                                                                                                                          | قيم DB ثابتة — **تبقى**؛ التسميات فقط تتغير         | 5                    |
| 16  | `src/lib/status-labels.ts:27-36, 118-119, 169-172, 257-258, 277-287`                                                                                                                                                      | "تم الإرسال للخياط"، "قيد التفصيل بكل حب"                                                                                                                                                                                              | مفردات                                              | 5                    |
| 17  | `src/routes/_authenticated/admin.b.$slug.orders.index.tsx:1062-1106`، `src/components/orders/OrderUnifiedHeader.tsx:241-273`، `OrderItemsWorkflowCard.tsx:111-158`، `admin.b.$slug.dashboard.tsx:936-937`                 | أزرار/شارات "إرسال للخياط / استلام من الخياط / تفاصيل التفصيل"                                                                                                                                                                         | مفردات                                              | 5                    |
| 18  | `src/components/orders/InvoicePreview.tsx:900-903`                                                                                                                                                                        | نص الشروط الافتراضي في الفاتورة: "القطع المفصلة خصيصاً غير قابلة للاسترجاع…" عندما لا يوجد `footer_note`                                                                                                                               | مفردات                                              | 5                    |
| 19  | `src/routes/_authenticated/admin.b.$slug.content-studio.tsx:1085-1100`                                                                                                                                                    | يضيف "✂️ متوفرة للتفصيل حسب الطلب: نعم" و "🧵 نوع القماش" لكل منشور                                                                                                                                                                    | بوابة + مفردات                                      | 1 + 5                |
| 20  | `src/lib/store-copilot.functions.ts:107, 253-254, 283, 334-335`                                                                                                                                                           | prompt النظام "GCC luxury boutiques"، أمثلة "أضف فستان حرير"                                                                                                                                                                           | **سياق AI** حسب النشاط                              | 5                    |
| 21  | `src/lib/instagram-ai-importer.ts:290, 696-707, 893`                                                                                                                                                                      | prompt "GCC boutique and fashion"، عنوان افتراضي "عباية أنيقة"، استبعاد مقاسات 50–62 من الأسعار                                                                                                                                        | سياق AI                                             | 5                    |
| 22  | `src/lib/generate-variants.functions.ts:107-114, 379-392`                                                                                                                                                                 | prompt "abayas, kaftans"، توسيع نطاق مقاسات العبايات الزوجية                                                                                                                                                                           | سياق AI                                             | 5                    |
| 23  | `src/lib/translate.functions.ts:78-84`                                                                                                                                                                                    | "specializing in high-end fashion"                                                                                                                                                                                                     | سياق AI                                             | 5                    |
| 24  | `src/routes/onboard.tsx:262`، `src/lib/onboarding.functions.ts:724`                                                                                                                                                       | `businessType: "Boutique & Fashion"` ثابت عند التسجيل الذاتي، و`"Abayas & Fashion"` افتراضي في الخادم                                                                                                                                  | **نقطة الدخول** — أهم إصلاح                         | 1                    |
| 25  | `supabase/migrations/20260810205000_fix_tenant_activation_business_settings.sql` (`create_tenant_with_defaults`)                                                                                                          | `p_business_type DEFAULT 'Fashion'`؛ يستخدم النوع فقط لتسمية القسم الأول                                                                                                                                                               | يُحافَظ على التوقيع؛ يُضاف تعيين النشاط بعد الإنشاء | 1                    |
| 26  | `src/lib/i18n.tsx:96, 209, 453, 565`                                                                                                                                                                                      | أمثلة "قماش، خياطة"، "التطريز وتفصيل المقاسات"                                                                                                                                                                                         | مفردات                                              | 5                    |
| 27  | `src/routes/_authenticated/admin.b.$slug.categories.tsx:370, 378`، `apps/boutq-os-mobile/src/app/more/categories.tsx:196-208`                                                                                             | placeholder "عبايات / Abayas"                                                                                                                                                                                                          | مفردات                                              | 5                    |
| 28  | `src/routes/_authenticated/admin.b.$slug.settings.tsx:650 (LEGACY_SETTINGS_NAMES "My Abaya Boutique"), 4259-4260 (منتج عيّنة "فستان سهرة")`                                                                               | عيّنات معاينة                                                                                                                                                                                                                          | مفردات                                              | 5                    |
| 29  | `src/components/inventory/PackagingMaterialsTab.tsx:565-566`                                                                                                                                                              | "بطاقة تسعير لكل عباية"                                                                                                                                                                                                                | مفردات                                              | 5                    |
| 30  | `src/routes/$slug.checkout.tsx:1160-1161`                                                                                                                                                                                 | رسالة خطأ "تعذر تجهيز طلب التفصيل"                                                                                                                                                                                                     | مفردات                                              | 5                    |
| 31  | `apps/boutq-os-mobile/src/lib/order-workflow.ts:65-66`، `src/app/order/[id].tsx:571-574`، `src/screens/dashboard-screen.tsx:198, 222`، `src/lib/i18n.tsx:98, 313`                                                         | "عند الخياط"، "تتطلب تجهيز وخياطة"                                                                                                                                                                                                     | مفردات (تطبيق الجوال)                               | 5                    |
| 32  | `src/components/storefront/product-card.tsx:47-52` + RPC `place_storefront_order_internal_20260710` (آخر تعريف: `supabase/migrations/20260913100000_storefront_mode_catalog.sql:229-239`)                                 | **أي حقل مخصص ⇒ المنتج "تفصيل"**: لا يُعتبر نافد المخزون أبداً، ويُخزَّن في `location='custom'` **بدون خصم مخزون** — حتى لمتجر هدايا يضيف حقل "رسالة إهداء" على منتج له مخزون                                                          | **خلل بنيوي** يمنع white-label حقيقي                | 3                    |
| 33  | `src/lib/trust-badges.ts:242-267`                                                                                                                                                                                         | أيقونات "عبايات/مقص خياطة" ضمن **مكتبة** أيقونات متعددة                                                                                                                                                                                | ✅ لا مشكلة (مكتبة اختيارية، الافتراضيات عامة)      | —                    |
| 34  | `src/lib/variant-sku-utils.ts:6-140` (`COLOR_SKU_MAP`)                                                                                                                                                                    | خريطة ألوان خليجية/أزياء لتوليد SKU                                                                                                                                                                                                    | ✅ لا مشكلة (مفيدة لكل الأنشطة)                     | —                    |
| 35  | `src/routes/onboard.tsx:381, 387, 906`، `src/components/admin/TrialExpiredPaywall.tsx:71, 95`                                                                                                                             | نصوص المنصة: "Launch Your Fashion Boutique in Minutes"، "for Gulf fashion houses"، "E-commerce OS for GCC Fashion Boutiques"، "growing fashion boutiques"، "luxury fashion houses" — (الكلمة **Boutique** تبقى، **Fashion** فقط تُزال) | نصوص منصة — **قرار المالك: تُعمَّم** (انظر 1.9)     | 1                    |

**الخلاصة:** ثلاث "وحدات" أزيائية حقيقية (`size_guide`، `fit_passport`، `made_to_order`) + طبقة "مفردات" (tailor/خياط/قماش) + خلل بنيوي واحد (custom_fields ⇒ تفصيل) + نقطة دخول واحدة (onboarding لا يسأل عن نوع النشاط) + خمسة أسطر نصوص منصة. ما دون ذلك عام وسليم.

---

## 1. القرار المعماري (لماذا هكذا)

| الخيار                                | القرار                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **النموذج**                           | **طبقتان**: `store_vertical` (نوع النشاط، enum واحد يحدد الافتراضيات) + `store_modules` (jsonb overrides صريحة لكل وحدة). القاعدة: `enabled = store_modules[id] ?? VERTICAL_DEFAULTS[vertical][id] ?? false`. النشاط يعطي تجربة صحيحة بنقرة واحدة عند الأونبوردنق؛ الـ overrides تعطي المرونة (بوتيك يريد Fit Passport بلا دليل مقاسات، أو مجوهرات تريد دليل مقاسات خواتم بلا Passport).                                                                                     |
| **لماذا ليس Entitlements؟**           | `rpc_evaluate_brand_entitlements` (`src/lib/saas-billing/`) يجيب على "ماذا **يحق** للبراند حسب الخطة" — محور تسعيري. الوحدات هنا تجيب على "ماذا **يحتاج** البراند حسب نشاطه" — محور منتج. خلطهما يجعل الميزات الأزيائية "مدفوعة" بالخطأ. يمكن لاحقاً ربط وحدة بـ entitlement (المرحلة 6 اختيارية) لكن الطبقتان مستقلتان.                                                                                                                                                     |
| **أين يُخزَّن**                       | `public.business_settings` (صف واحد لكل `brand_id`) — نفس مكان `storefront_mode`. يصل للستور فرونت تلقائياً عبر view `brand_public_settings` (الـ RPC `get_storefront_page_data` يفعل `to_jsonb(s.*)` — مؤكَّد في `supabase/migrations/20260905140000_three_day_trial_and_lockout.sql:79-81`). لا جدول جديد للطبقة الأساسية.                                                                                                                                                 |
| **الأونبوردنق (قرار المالك)**         | **اختيار النشاط إلزامي** — لا يمكن إرسال نموذج التسجيل بدون اختيار. لا قيمة افتراضية في الواجهة ولا في الخادم (`z.enum(STORE_VERTICALS)` بلا `.optional()`).                                                                                                                                                                                                                                                                                                                 |
| **البراندات الحالية (قرار مُتخذ)**    | بلغة بسيطة: **كل براند موجود اليوم يبقى كما هو** — يُسجَّل كنشاط `fashion` ويرى نفس الواجهة حرفياً. الاستثناء الوحيد: البراندات التي سجّلها السوبر أدمن صراحةً كـ `Cafe / Restaurant` أو `Digital store` (عمود `brands.business_type`) تُسجَّل كـ `food`/`digital` فتنطفئ عندها ميزات الأزياء — **إلا إذا** كان عندها بيانات قياسات عملاء فعلية (`customer_fit_passports`) فتبقى الوحدات مفعّلة حمايةً للبيانات. أي براند يستطيع تغيير نشاطه ووحداته من الإعدادات في أي وقت. |
| **دليل المقاسات (قرار المالك)**       | لا يكفي إخفاؤه: يصبح **Size Guide Studio** — عدد غير محدود من الأدلة لكل براند، كل دليل بأعمدة وصفوف ووحدات ونصائح وصورة خاصة به، يُربط بالمنتج أو القسم أو كافتراضي للبراند، مع مكتبة قوالب للبدء بنقرة، ولصق من Excel، ومُرشِّح مقاس ذكي (Size Recommender) يستفيد من Fit Passport إن كان مفعّلاً. متاح لأي براند يفعّل الوحدة `size_guide` مهما كان نشاطه (خواتم، أحذية، أطفال…). التفاصيل في المرحلة 2.                                                                  |
| **المفردات (Vocabulary)**             | قيم قاعدة البيانات (`sent_to_tailor`, `order_type='tailoring'`, `location='custom'`) **تبقى كما هي** — لا هجرة بيانات. تتغير **التسميات فقط** عبر خريطة `VERTICAL_VOCABULARY` في الكود + overrides اختيارية في `business_settings.store_vocabulary` (المرحلة 5).                                                                                                                                                                                                             |
| **فصل "التفصيل" عن "الحقول المخصصة"** | عمود جديد `products.is_made_to_order boolean` هو المصدر الوحيد للحقيقة (بدل استنتاجه من `custom_fields`). Backfill = `custom_fields` غير فارغ → `true` (صفر تغيير سلوكي). الـ RPC يقرأ العمود بدل الاستنتاج (المرحلة 3).                                                                                                                                                                                                                                                     |
| **نصوص المنصة (قرار المالك)**         | تُعمَّم بإزالة كلمة **Fashion** فقط مع الإبقاء على **Boutique**: "Launch Your Boutique" (انظر 1.9).                                                                                                                                                                                                                                                                                                                                                                          |
| **خارج النطاق الآن**                  | تحويل `size/color/fabric` إلى محاور ديناميكية بالكامل (يوجد `option_four/five` + تسميات لكل منتج — تكفي حالياً)؛ إعادة تسمية قيم DB.                                                                                                                                                                                                                                                                                                                                         |

### 1.1 تعريف الوحدات

| الوحدة          | ماذا تتحكم به                                                                                                                                                                                     | fashion | jewelry          | print | باقي الأنشطة |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ---------------- | ----- | ------------ |
| `size_guide`    | زر/قسم "دليل المقاسات" في صفحة المنتج + صفحة "أدلة المقاسات" في الأدمن (Size Guide Studio) + عنصر التنقل                                                                                          | ✅      | ✅ (خواتم/أساور) | ❌    | ❌           |
| `fit_passport`  | تبويب "مقاساتي" في حساب العميل، تطبيق القياسات في صفحة المنتج، بطاقة Passport في صفحة العميل بالأدمن، كتلة Passport في تفاصيل الطلب، قوالب Passport في محرر المنتج، تغذية مُرشِّح المقاس تلقائياً | ✅      | ❌               | ❌    | ❌           |
| `made_to_order` | تبديل "جاهز / حسب الطلب" في صفحة المنتج، صندوق ملاحظات الورشة، مسار "إرسال/استلام من الورشة" في الطلبات، سطر "متوفرة حسب الطلب" في Content Studio، حقل "الخامة" في مولّد المتغيرات                | ✅      | ✅               | ✅    | ❌           |

قائمة `store_vertical`: `fashion`, `beauty`, `food`, `gifts`, `print`, `jewelry`, `home`, `electronics`, `digital`, `general`.

---

## المرحلة 1 — الأساس: Schema + المكتبة النقية + البوابات + الأونبوردنق الإلزامي + نصوص المنصة

الهدف: بعد هذه المرحلة، براند جديد بنشاط غير أزيائي **لا يرى أي أثر** لدليل المقاسات أو Fit Passport أو تبديل التفصيل، والبراندات الحالية لا تتغير إطلاقاً.

### 1.1 Migration جديد — `supabase/migrations/20260915100000_store_vertical_and_modules.sql`

```sql
-- 1) الأعمدة
ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS store_vertical text NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS store_modules jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.business_settings
  DROP CONSTRAINT IF EXISTS business_settings_store_vertical_check;
ALTER TABLE public.business_settings
  ADD CONSTRAINT business_settings_store_vertical_check
  CHECK (store_vertical IN (
    'fashion','beauty','food','gifts','print','jewelry','home','electronics','digital','general'
  ));

ALTER TABLE public.business_settings
  DROP CONSTRAINT IF EXISTS business_settings_store_modules_object_check;
ALTER TABLE public.business_settings
  ADD CONSTRAINT business_settings_store_modules_object_check
  CHECK (jsonb_typeof(store_modules) = 'object');

-- 2) Backfill: كل براند موجود اليوم أُنشئ عندما كانت المنصة أزياء-فقط
UPDATE public.business_settings bs
SET store_vertical = CASE
  WHEN b.business_type = 'Cafe / Restaurant' THEN 'food'
  WHEN b.business_type = 'Digital store'     THEN 'digital'
  ELSE 'fashion'
END
FROM public.brands b
WHERE b.id = bs.brand_id
  AND bs.store_vertical = 'general';

-- 3) حماية البيانات: أي براند يستخدم Fit Passport فعلياً يحتفظ بالوحدات مهما كان نشاطه
UPDATE public.business_settings bs
SET store_modules = bs.store_modules
  || '{"fit_passport": true, "size_guide": true, "made_to_order": true}'::jsonb
WHERE EXISTS (SELECT 1 FROM public.customer_fit_passports p WHERE p.brand_id = bs.brand_id)
  AND bs.store_vertical <> 'fashion';

-- 4) إعادة تعريف الـ view: انسخ قائمة الأعمدة الكاملة **بنفس الترتيب** من
--    supabase/migrations/20260913100000_storefront_mode_catalog.sql (السطر 19 وما بعده)
--    وأضف العمودين الجديدين في **نهاية** SELECT (CREATE OR REPLACE VIEW يسمح بالإضافة في النهاية فقط).
CREATE OR REPLACE VIEW public.brand_public_settings AS
SELECT
  /* ...كل الأعمدة الحالية حتى bs.catalog_inquiry_message_ar... */,
  bs.store_vertical,
  bs.store_modules
FROM public.business_settings bs;

-- migration الأمان 20260911001500 يضبط security_invoker=false ويمنح anon — أعد تطبيقه صراحةً
ALTER VIEW public.brand_public_settings SET (security_invoker = false);
GRANT SELECT ON public.brand_public_settings TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
```

**ملاحظات إلزامية:**

- لا تُسقط `bs.storefront_typography` ولا تُضف `bs.admin_typography` للـ view.
- لا تغيّر توقيع `create_tenant_with_defaults` (نضبط النشاط من الخادم بعد الإنشاء — انظر 1.7).
- شغّل `npm run db:migrations:check`.

### 1.2 المكتبة النقية — ملف جديد `src/lib/store-profile.ts`

بدون React، حتى تُختبر كـ unit tests حقيقية (نفس فلسفة `src/lib/storefront-mode.ts`).

```ts
export const STORE_VERTICALS = [
  "fashion",
  "beauty",
  "food",
  "gifts",
  "print",
  "jewelry",
  "home",
  "electronics",
  "digital",
  "general",
] as const;
export type StoreVertical = (typeof STORE_VERTICALS)[number];

export const STORE_MODULES = ["size_guide", "fit_passport", "made_to_order"] as const;
export type StoreModuleId = (typeof STORE_MODULES)[number];
export type StoreModuleOverrides = Partial<Record<StoreModuleId, boolean>>;
export type StoreModules = Record<StoreModuleId, boolean>;

const OFF: StoreModules = { size_guide: false, fit_passport: false, made_to_order: false };

export const VERTICAL_MODULE_DEFAULTS: Record<StoreVertical, StoreModules> = {
  fashion: { size_guide: true, fit_passport: true, made_to_order: true },
  jewelry: { size_guide: true, fit_passport: false, made_to_order: true },
  print: { ...OFF, made_to_order: true },
  beauty: OFF,
  food: OFF,
  gifts: OFF,
  home: OFF,
  electronics: OFF,
  digital: OFF,
  general: OFF,
};

export const VERTICAL_LABELS: Record<StoreVertical, { ar: string; en: string }> = {
  fashion: { ar: "أزياء وعبايات", en: "Fashion & Abayas" },
  beauty: { ar: "عطور وتجميل", en: "Beauty & Perfume" },
  food: { ar: "مأكولات ومشروبات", en: "Food & Beverage" },
  gifts: { ar: "هدايا وحرف", en: "Gifts & Crafts" },
  print: { ar: "طباعة وأختام", en: "Print & Stamps" },
  jewelry: { ar: "مجوهرات وإكسسوارات", en: "Jewelry & Accessories" },
  home: { ar: "منزل وديكور", en: "Home & Decor" },
  electronics: { ar: "إلكترونيات", en: "Electronics" },
  digital: { ar: "منتجات رقمية", en: "Digital Products" },
  general: { ar: "متجر عام", en: "General Store" },
};

export const MODULE_LABELS: Record<
  StoreModuleId,
  { ar: string; en: string; hintAr: string; hintEn: string }
> = {
  size_guide: {
    ar: "دليل المقاسات",
    en: "Size Guide",
    hintAr: "أدلة مقاسات مخصصة تظهر في صفحة المنتج",
    hintEn: "Custom size guides shown on product pages",
  },
  fit_passport: {
    ar: "Fit Passport (قياسات العميل)",
    en: "Fit Passport (customer measurements)",
    hintAr: "حفظ قياسات العميل وإعادة استخدامها في الطلبات",
    hintEn: "Save customer measurements and reuse them on orders",
  },
  made_to_order: {
    ar: "التصنيع حسب الطلب",
    en: "Made-to-order",
    hintAr: "تبديل جاهز/حسب الطلب، ملاحظات الورشة، ومسار الإرسال للورشة",
    hintEn: "Ready/custom toggle, workshop notes, and the send-to-workshop flow",
  },
};

export type StoreProfileSource = {
  store_vertical?: string | null;
  store_modules?: unknown;
};

export function normalizeVertical(raw: unknown): StoreVertical {
  return (STORE_VERTICALS as readonly string[]).includes(String(raw))
    ? (raw as StoreVertical)
    : "general";
}

export function normalizeModuleOverrides(raw: unknown): StoreModuleOverrides {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: StoreModuleOverrides = {};
  for (const id of STORE_MODULES) {
    const v = (raw as Record<string, unknown>)[id];
    if (typeof v === "boolean") out[id] = v;
  }
  return out;
}

export function resolveStoreModules(source: StoreProfileSource | null | undefined): StoreModules {
  const vertical = normalizeVertical(source?.store_vertical);
  const overrides = normalizeModuleOverrides(source?.store_modules);
  const defaults = VERTICAL_MODULE_DEFAULTS[vertical];
  return {
    size_guide: overrides.size_guide ?? defaults.size_guide,
    fit_passport: overrides.fit_passport ?? defaults.fit_passport,
    made_to_order: overrides.made_to_order ?? defaults.made_to_order,
  };
}

export function isModuleEnabled(
  source: StoreProfileSource | null | undefined,
  id: StoreModuleId,
): boolean {
  return resolveStoreModules(source)[id];
}

/** يحوّل النص الحر القديم في brands.business_type / tenant_requests.business_type إلى نشاط. */
export function legacyBusinessTypeToVertical(
  businessType: string | null | undefined,
): StoreVertical {
  const t = (businessType ?? "").toLowerCase();
  if (/cafe|restaurant|food|مطعم|كافيه/.test(t)) return "food";
  if (/digital|رقمي/.test(t)) return "digital";
  if (/abaya|fashion|boutique|عباي|أزياء|بوتيك/.test(t)) return "fashion";
  if (/perfume|beauty|عطر|تجميل/.test(t)) return "beauty";
  if (/print|stamp|طباعة|أختام/.test(t)) return "print";
  if (/jewel|gold|مجوهرات|ذهب/.test(t)) return "jewelry";
  if (/gift|هدايا/.test(t)) return "gifts";
  return "general";
}

/** لتمرير قيمة مفهومة لـ create_tenant_with_defaults (يستخدمها لتسمية القسم الأول فقط). */
export function verticalToLegacyBusinessType(v: StoreVertical): string {
  if (v === "food") return "Cafe / Restaurant";
  if (v === "digital") return "Digital store";
  if (v === "fashion") return "Abayas & Fashion";
  return VERTICAL_LABELS[v].en;
}
```

### 1.3 الأنواع والتحميل (الستور فرونت)

**`src/lib/storefront-context.tsx`** — داخل `export type PublicSettings` بجانب `storefront_mode` (السطر 167):

```ts
store_vertical?: import("@/lib/store-profile").StoreVertical;
store_modules?: import("@/lib/store-profile").StoreModuleOverrides;
```

وأضف في نهاية الملف hook مساعد (يستخدم `useStore()` الموجود):

```ts
export function useStoreModules() {
  const { settings } = useStore();
  return useMemo(
    () => resolveStoreModules(settings),
    [settings.store_vertical, settings.store_modules],
  );
}
```

**`src/routes/$slug.route.tsx`** — في الـ loader بجانب `storefront_mode` (السطر 216):

```ts
store_vertical: normalizeVertical(s?.store_vertical ?? "fashion"),
store_modules: normalizeModuleOverrides(s?.store_modules),
```

(الـ `?? "fashion"` شبكة أمان انتقالية: لو نُشر الكود قبل تطبيق الـ migration في الإنتاج لا تختفي الميزات عن البراندات الأزيائية. **بعد** التأكد من تطبيق الـ migration، غيّرها إلى `normalizeVertical(s?.store_vertical)` في PR لاحق.)

### 1.4 الأدمن — hook موحّد `src/hooks/use-store-profile.ts`

`src/components/app-shell.tsx:278-288` يستعلم اليوم `business_settings.storefront_mode` وحده. وسّعه إلى hook واحد يُعاد استخدامه في كل صفحات الأدمن (نفس `queryKey` ⇒ استعلام واحد فعلياً):

```ts
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/query-keys";
import {
  normalizeVertical,
  resolveStoreModules,
  type StoreModules,
  type StoreVertical,
} from "@/lib/store-profile";

export type AdminStoreProfile = {
  vertical: StoreVertical;
  modules: StoreModules;
  storefrontMode: "shop" | "catalog";
};

const TRANSITIONAL_FALLBACK: AdminStoreProfile = {
  vertical: "fashion",
  modules: resolveStoreModules({ store_vertical: "fashion" }),
  storefrontMode: "shop",
};

export function useAdminStoreProfile(brandId: string | null | undefined) {
  const q = useQuery({
    queryKey: queryKeys.brand.storeProfile(brandId ?? ""),
    enabled: Boolean(brandId),
    staleTime: 60_000,
    queryFn: async (): Promise<AdminStoreProfile> => {
      const { data, error } = await (supabase.from("business_settings") as any)
        .select("storefront_mode, store_vertical, store_modules")
        .eq("brand_id", brandId!)
        .maybeSingle();
      if (error) throw error;
      return {
        vertical: normalizeVertical(data?.store_vertical ?? "fashion"), // نفس الشبكة الانتقالية في 1.3
        modules: resolveStoreModules({
          ...data,
          store_vertical: data?.store_vertical ?? "fashion",
        }),
        storefrontMode: data?.storefront_mode === "catalog" ? "catalog" : "shop",
      };
    },
  });
  return { profile: q.data ?? TRANSITIONAL_FALLBACK, isLoading: q.isLoading };
}
```

- أضف في `src/lib/query-keys.ts` تحت `brand:` (السطر 10-14): `storeProfile: (brandId: string) => ["store-profile", brandId] as const,`.
- في `app-shell.tsx`: استبدل `adminStorefrontModeQuery` بـ `useAdminStoreProfile(activeBrand?.id)` ومرّر `storefrontMode: profile.storefrontMode` و `storeModules: profile.modules` إلى `getAdminNavItems` (السطر 301).
- `src/config/admin-navigation.ts:100-107` (`GetNavItemsOptions`): أضف `storeModules?: StoreModules;` — يُستخدم في المرحلة 2 لعنصر "أدلة المقاسات".
- عند حفظ أي من (`storefront_mode`, `store_vertical`, `store_modules`) في الإعدادات: `qc.invalidateQueries({ queryKey: queryKeys.brand.storeProfile(brandId) })` **بالإضافة** إلى المفاتيح الحالية. المفتاح القديم `["admin-storefront-mode", ...]` يُحذف لأنه لم يعد مستخدماً.

### 1.5 واجهة الإعداد — بطاقة `StoreProfileCard`

ملف جديد `src/components/settings/StoreProfileCard.tsx`، مستقل بحفظه الخاص (نفس نمط `StorefrontModeCard` في `admin.b.$slug.settings.tsx:4156`)، ويُركَّب كأول عنصر داخل `<TabsContent value="business">` (`admin.b.$slug.settings.tsx:937`) قبل بطاقة الملف التجاري الحالية.

المحتوى:

1. **نوع النشاط** — `Select` من `STORE_VERTICALS` بعناوين `VERTICAL_LABELS`. عند التغيير: **لا** تُمسح الـ overrides تلقائياً (المستخدم قد ضبطها عمداً)؛ اعرض زر "إعادة الوحدات إلى افتراضيات النشاط" يضبط `store_modules = {}`.
2. **الوحدات** — ثلاثة `Switch` (من `@/components/ui/switch`) بعناوين `MODULE_LABELS`، كل واحد يعرض شارة "موصى به لنشاطك" إذا كان `VERTICAL_MODULE_DEFAULTS[vertical][id] === true`، وقيمة السويتش = `resolveStoreModules({store_vertical, store_modules})[id]`. عند التبديل يُكتب override صريح `{[id]: value}`.
3. **تحذير عند إطفاء `fit_passport`** إذا كان للبراند صفوف في `customer_fit_passports` (استعلام `count` بسيط): "لن تُحذف بيانات القياسات، ستُخفى فقط".
4. **رابط سريع** عند تفعيل `size_guide`: "إدارة أدلة المقاسات →" (يظهر بعد المرحلة 2).
5. **حفظ**: `update business_settings set store_vertical, store_modules where brand_id` ثم invalidate `storeProfile` و `businessSettings`.

### 1.6 البوابات — تعديل نقطة بنقطة

كل نقطة أدناه: اقرأ الوحدة ثم اشترط. الافتراضي للبراندات الحالية `fashion` ⇒ كل الشروط `true` ⇒ صفر تغيير.

**الستور فرونت (`useStoreModules()`):**

| الملف:السطر                                        | التغيير                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `$slug.product.$id.tsx:1557`                       | `{modules.size_guide && <SizeGuideModal isAr={lang === "ar"} />}` (يُستبدل بالكامل في المرحلة 2)                                                                                                                                                                                                                                                                                  |
| `$slug.product.$id.tsx:641-646`                    | `const passportConfigured = modules.fit_passport && configuredPassportType !== null;` (أبقِ اكتشاف النوع كما هو)                                                                                                                                                                                                                                                                  |
| `$slug.product.$id.tsx:652-668`                    | `customerQ.enabled` و `fitPassportQ.enabled`: أضف `modules.fit_passport &&` — يوقف استعلام `customer_fit_passports` لكل عميل في البراندات غير الأزيائية                                                                                                                                                                                                                           |
| `$slug.product.$id.tsx:997`                        | `const showSizeModeToggle = modules.made_to_order && hasReadySizes && hasCustomFields;` — بدون الوحدة تُعرض الحقول المخصصة **بجانب** المتغيرات (سلوك عام صحيح لمطبعة/هدايا). **تنبيه**: خصم المخزون في الخادم يبقى معطّلاً لأي بند فيه حقول مخصصة حتى المرحلة 3 (البند 32 في الجدول) — وثّق ذلك في PR-1.                                                                          |
| `$slug.product.$id.tsx:2104-2138`                  | لفّ صندوق الملاحظات بـ `{modules.made_to_order && (...)}`؛ بدون الوحدة لا صندوق (الحقول المخصصة تكفي). المفردات تُعالج في المرحلة 5.                                                                                                                                                                                                                                              |
| `$slug.account.tsx:544-550` و `607-616`            | لفّ `TabsTrigger value="fit"` و `TabsContent value="fit"` بـ `{modules.fit_passport && (...)}`. عدّل `grid-cols-2 sm:grid-cols-7` (السطر 516) إلى قيمة محسوبة (`sm:grid-cols-6` عند الإخفاء). **اختبار `tests/storefront-fit-passport.test.ts`** يفحص وجود النصوص `value="fit"` و `<StorefrontFitPassport` و `t("مقاساتي", "My fit")` في الملف — تبقى موجودة، فالاختبار يظل أخضر. |
| `src/components/storefront/product-card.tsx:47-52` | لا تغيير الآن (يُعالج جذرياً في المرحلة 3).                                                                                                                                                                                                                                                                                                                                       |

**الأدمن (`useAdminStoreProfile(brand.id)`):**

| الملف:السطر                                                  | التغيير                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `admin.b.$slug.customers.$customerId.tsx:534-542`            | `{profile.modules.fit_passport && <CustomerFitPassport ... />}`                                                                                                                                                                                                               |
| `admin.b.$slug.orders.$id.tsx:894-911`                       | `enabled: profile.modules.fit_passport && !isCourier && Boolean(order?.customer_id)`                                                                                                                                                                                          |
| `admin.b.$slug.orders.$id.tsx:257 (ItemTailoringCustomizer)` | مرّر prop جديد `fitPassportEnabled: boolean`؛ لفّ كتلة `{/* 📏 Fit Passport Module */}` (السطر 446 حتى نهاية الكتلة) بالشرط. بقية اللوحة (المقاس/اللون/الخامة/الحقول المخصصة) تبقى — هي عامة.                                                                                 |
| `admin.b.$slug.inventory.tsx:3652-3657`                      | لفّ `SelectItem value="passport_abaya"` و `"passport_dress"` بـ `{profile.modules.fit_passport && (...)}`. رتّب القائمة بحيث يظهر قالب النشاط الحالي أولاً (fashion → "عبايات وأزياء" أولاً؛ print → "أختام وطباعة" أولاً…). خريطة بسيطة `VERTICAL_TO_PRESET_KEY` داخل الملف. |
| `admin.b.$slug.inventory.tsx:4484-4500`                      | مرّر `SIZING_PRESETS` عبر دالة جديدة `orderSizingPresetsForVertical(vertical)` في `src/lib/variant-sku-utils.ts` (ترتيب فقط، لا حذف: fashion → abaya أولاً؛ غير ذلك → `apparel_standard`/`numbered` أولاً والعبايات آخراً).                                                   |
| `admin.b.$slug.inventory.tsx:4532-4540`                      | حقل "الخامة" في مولّد المتغيرات: `{profile.modules.made_to_order && (...)}` — **ملاحظة**: عمود `product_variants.fabric` يبقى؛ التسمية لكل منتج (`variant_label_fabric_*`) تبقى متاحة.                                                                                        |
| `admin.b.$slug.content-studio.tsx:1092, 1100`                | `if (profile.modules.made_to_order) details.push(...)` للسطرين "متوفرة للتفصيل حسب الطلب".                                                                                                                                                                                    |

### 1.7 الأونبوردنق — نقطة الدخول (اختيار إلزامي)

**`src/routes/onboard.tsx`:**

- حالة جديدة `const [vertical, setVertical] = useState<StoreVertical | null>(null)` — **بلا افتراضي**.
- عنصر اختيار داخل نموذج الإطلاق بعد حقل اسم المتجر (قرب السطر 477): شبكة `Button variant="outline"` (10 خيارات) بأيقونات lucide: `Shirt`, `Sparkles`, `Coffee`, `Gift`, `Printer`, `Gem`, `Sofa`, `Cpu`, `Download`, `Store`، مع علامة `*` في العنوان "نوع النشاط \*".
- في التحقق قبل الإرسال (المكان الذي يفحص `brandName`/`slug`/`email` قبل السطر 242): `if (!vertical) { toast.error(isAr ? "اختر نوع النشاط للمتابعة" : "Select your business type to continue"); return; }` وزر الإرسال `disabled` حتى يُختار.
- عند الإرسال (السطر 262) استبدل الثابت:

```ts
businessType: verticalToLegacyBusinessType(vertical),
storeVertical: vertical,
```

**`src/lib/onboarding.functions.ts`:**

- `RegisterInstantTrialInput` (السطر 601-615): أضف `storeVertical: z.enum(STORE_VERTICALS)` — **إلزامي** (بلا `.optional()`). أي استدعاء قديم بدون القيمة يفشل بالتحقق — مقصود.
- بعد الخطوة 6 (السطر 730-740، تحديث `brands` بتفاصيل التجربة) أضف الخطوة 6b:

```ts
await (supabaseAdmin.from("business_settings" as never) as any)
  .update({
    store_vertical: data.storeVertical,
    store_modules: {},
    updated_at: new Date().toISOString(),
  })
  .eq("brand_id", brandId);
```

- الاستدعاء عند السطر 724: `p_business_type: data.businessType || verticalToLegacyBusinessType(data.storeVertical)` — يزيل الافتراضي `"Abayas & Fashion"`.
- مسار الموافقة على طلبات التسجيل من السوبر أدمن (السطر ~505-520، يكتب `business_type` من `tenant_requests`): أضف بعده تحديثاً مماثلاً لـ `business_settings.store_vertical = legacyBusinessTypeToVertical(request.business_type)`. (هذا المسار يبقى بتحويل تلقائي لأن طلبات `tenant_requests` تحمل نصاً حراً؛ إن أردت إلزامه أيضاً، أضف حقل `store_vertical` إلى نموذج الطلب — خارج نطاق هذه المرحلة.)

**`src/routes/_authenticated/admin.super.requests.tsx:425`:** بدّل الافتراضي "أزياء / Fashion" إلى عرض `VERTICAL_LABELS[legacyBusinessTypeToVertical(request.business_type)]`.

### 1.8 اختبارات المرحلة 1

ملف جديد `tests/store-profile.test.ts` (نمط `tests/admin-storefront-mode.test.ts`):

- `resolveStoreModules({store_vertical:"fashion"})` → الثلاثة `true`؛ `general` → الثلاثة `false`؛ `jewelry` → `size_guide` و `made_to_order` فقط.
- override يغلب الافتراضي: `{store_vertical:"fashion", store_modules:{fit_passport:false}}` → `fit_passport=false` والباقي `true`.
- `normalizeVertical("abaya")` → `"general"`؛ `normalizeModuleOverrides([1,2])` → `{}`؛ قيم غير boolean تُتجاهل.
- `legacyBusinessTypeToVertical("Cafe / Restaurant")` → `food`؛ `"Boutique & Fashion"` → `fashion`؛ `null` → `general`.
- اختبار مصدر (source test) بنمط `tests/storefront-fit-passport.test.ts`: `$slug.account.tsx` يحتوي `modules.fit_passport &&` قبل `value="fit"`؛ `$slug.product.$id.tsx` يحتوي `modules.size_guide && <SizeGuideModal`؛ الـ migration يحتوي `store_vertical` و `store_modules` و `brand_public_settings[\s\S]*bs\.store_modules`.
- الأونبوردنق: `onboarding.functions.ts` لا يحتوي `"Abayas & Fashion"` ويحتوي `storeVertical: z.enum(STORE_VERTICALS)` **بدون** `.optional()` بعده على نفس السطر؛ `onboard.tsx` لا يحتوي `"Boutique & Fashion"` ويحتوي `useState<StoreVertical | null>(null)`.

### 1.9 نصوص المنصة (قرار المالك: إزالة "Fashion" فقط، الإبقاء على "Boutique")

| الملف:السطر                                       | من                                                                                                                               | إلى                                                                                                                         |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `src/routes/onboard.tsx:381`                      | `"Launch Your Fashion Boutique in Minutes"`                                                                                      | `"Launch Your Boutique"` (العربي "إطلاق متجرك الإلكتروني في دقائق" لا يذكر الأزياء — يبقى)                                  |
| `src/routes/onboard.tsx:387`                      | `"The bespoke e-commerce platform for Gulf fashion houses. Manage your elegant storefront, orders, and inventory effortlessly."` | `"The bespoke e-commerce platform for Gulf boutiques. Manage your elegant storefront, orders, and inventory effortlessly."` |
| `src/routes/onboard.tsx:906`                      | `"E-commerce OS for GCC Fashion Boutiques."`                                                                                     | `"E-commerce OS for GCC Boutiques."`                                                                                        |
| `src/components/admin/TrialExpiredPaywall.tsx:71` | `"Most popular for growing fashion boutiques requiring advanced growth tools."`                                                  | `"Most popular for growing boutiques requiring advanced growth tools."`                                                     |
| `src/components/admin/TrialExpiredPaywall.tsx:95` | `"For established luxury fashion houses needing total automation."`                                                              | `"For established luxury brands needing total automation."`                                                                 |

اختبار مصدر: هذه الملفات الخمسة لا تطابق `/fashion/i` بعد التعديل (يُضاف إلى `tests/store-profile.test.ts`).

---

## المرحلة 2 — Size Guide Studio (دليل مقاسات world-class قابل للتخصيص لأي براند)

الهدف: أي براند يفعّل وحدة `size_guide` — مهما كان نشاطه — يبني أدلة مقاسات خاصة به بالكامل، ويربطها بمنتجاته، ويحصل عميله على تجربة على مستوى ASOS/Zara: جدول واضح بوحدتين، شرح كيفية القياس بصورة، وتوصية بالمقاس المناسب. البراندات الأزيائية الحالية تحصل على دليلها الحالي (عبايات 50–60) **كبيانات جاهزة** فلا يتغير شيء عندها.

### 2.0 معايير "world-class" التي تلتزم بها هذه المرحلة

1. **عدد غير محدود من الأدلة** لكل براند، كل واحد بأعمدة وصفوف مستقلة (لا بنية ثابتة).
2. **الربط على ثلاث طبقات**: منتج ← قسم (مع التوريث للأقسام الفرعية عبر `parent_id`) ← افتراضي البراند، مع إمكانية "إخفاء" الدليل لمنتج بعينه.
3. **مكتبة قوالب** للبدء بنقرة: عبايات خليجي (إنش)، فساتين، ملابس نسائية (XS–2XL بصدر/خصر/أرداف)، ملابس رجالية، ثوب رجالي، أحذية (EU/UK/US/سم)، أطفال حسب العمر، خواتم (قطر/محيط/US)، أساور. القوالب بيانات نقية قابلة للاختبار.
4. **محرر جدولي** يشبه Excel: إضافة/حذف/ترتيب الأعمدة والصفوف، تحرير الخلايا مباشرة، **لصق من Excel/Google Sheets**، نوع لكل عمود (قياس يُحوَّل بين الوحدات / نص ثابت مثل EU/US)، ملاحظة لكل صف.
5. **الوحدات**: يُخزَّن الدليل بوحدة أساس (سم أو إنش أو بلا) ويُعرض بأي منهما مع تحويل فوري؛ الأعمدة النصية لا تُحوَّل.
6. **كيفية القياس**: خطوات مرتبة ثنائية اللغة + صورة توضيحية (رفع عبر R2 الموجود) + رابط فيديو اختياري.
7. **مُرشِّح المقاس (Size Recommender)**: العميل يُدخل قياساته (أو تُقرأ من Fit Passport تلقائياً إن كانت الوحدة مفعّلة) ⇒ "مقاسك المقترح: 54" مع شرح مختصر وزر "اختيار". الخوارزمية نقية وقابلة للاختبار.
8. **طريقة العرض** لكل دليل: زر يفتح نافذة (الافتراضي)، أو قسم قابل للطي داخل صفحة المنتج، أو كلاهما — بالإضافة إلى صفحة عامة `/{slug}/size-guide` تعرض كل الأدلة (للربط من الفوتر/الصفحات).
9. **معاينة حية** في الأدمن بنفس المكوّن الذي يراه العميل.
10. **RTL / i18n / موبايل / وصولية**: جدول داخل `overflow-x-auto`، عمود أول ثابت، `scope="col"`، `dir` صحيح، تمييز الصف المختار، تكبير مناسب على الجوال.

### 2.1 Migration — `supabase/migrations/20260916100000_size_guides.sql`

```sql
CREATE TABLE IF NOT EXISTS public.size_guides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name_ar text NOT NULL,
  name_en text NOT NULL,
  template_key text NULL,                                   -- القالب الذي أُنشئ منه (للتتبع فقط)
  base_unit text NOT NULL DEFAULT 'cm' CHECK (base_unit IN ('cm','in','none')),
  -- [{ "key":"bust", "label_ar":"الصدر", "label_en":"Bust", "kind":"measurement", "measurement_key":"bust" }]
  -- kind: 'measurement' (رقم يُحوَّل بين الوحدات) | 'text' (EU/US/العمر… لا يُحوَّل)
  -- measurement_key: يربط العمود بمفتاح قياس في Fit Passport / مُرشِّح المقاس (bust, waist, hips, length, sleeve, shoulder, foot_length, ring_circumference…)
  columns jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(columns) = 'array'),
  -- [{ "label":"52", "values": { "length": 52, "bust": {"min":20,"max":21}, "eu":"38" }, "note_ar":null, "note_en":null }]
  rows jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(rows) = 'array'),
  -- [{ "title_ar":"الطول", "title_en":"Length", "body_ar":"...", "body_en":"..." }]
  how_to_measure jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(how_to_measure) = 'array'),
  diagram_url text NULL,
  video_url text NULL,
  notes_ar text NULL,
  notes_en text NULL,
  placement text NOT NULL DEFAULT 'modal' CHECK (placement IN ('modal','inline','both')),
  recommender_enabled boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_size_guides_brand ON public.size_guides(brand_id);
CREATE UNIQUE INDEX IF NOT EXISTS size_guides_one_default_per_brand
  ON public.size_guides(brand_id) WHERE is_default;

-- updated_at: الدالة العامة موجودة منذ 20260705113344 (public.set_updated_at)
DROP TRIGGER IF EXISTS size_guides_set_updated_at ON public.size_guides;
CREATE TRIGGER size_guides_set_updated_at
  BEFORE UPDATE ON public.size_guides
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- الربط
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS size_guide_id uuid NULL REFERENCES public.size_guides(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS size_guide_hidden boolean NOT NULL DEFAULT false;
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS size_guide_id uuid NULL REFERENCES public.size_guides(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_products_size_guide ON public.products(size_guide_id) WHERE size_guide_id IS NOT NULL;

-- RLS: انسخ صيغ categories حرفياً
--   قراءة عامة: 20260806142421_fix_categories_public_read_policy.sql
--   كتابة الأدمن: 20260905100000_remediate_phase4_categories_rls_and_counts.sql:12-15
ALTER TABLE public.size_guides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can read active size guides" ON public.size_guides;
CREATE POLICY "Public can read active size guides" ON public.size_guides
  FOR SELECT TO anon, authenticated
  USING (is_active = true AND EXISTS (
    SELECT 1 FROM public.brands b WHERE b.id = size_guides.brand_id AND b.is_active = true));
DROP POLICY IF EXISTS "Brand admins manage size guides" ON public.size_guides;
CREATE POLICY "Brand admins manage size guides" ON public.size_guides
  FOR ALL TO authenticated
  USING (is_admin() AND can_access_brand(brand_id))
  WITH CHECK (is_admin() AND can_access_brand(brand_id));
GRANT SELECT ON public.size_guides TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.size_guides TO authenticated;

-- Backfill: البراندات الأزيائية الحالية تحصل على دليلها الحالي (عبايات 50-60 إنش) كصف بيانات افتراضي
-- حتى لا يختفي الزر عنها عندما يصبح مشروطاً بوجود دليل.
INSERT INTO public.size_guides
  (brand_id, name_ar, name_en, template_key, base_unit, columns, rows, how_to_measure, is_default)
SELECT bs.brand_id, 'دليل مقاسات العبايات', 'Abaya Size Guide', 'abaya_gulf', 'in',
  '[{"key":"length","label_ar":"الطول","label_en":"Length","kind":"measurement","measurement_key":"length"},
    {"key":"bust","label_ar":"محيط الصدر","label_en":"Bust","kind":"measurement","measurement_key":"bust"},
    {"key":"sleeve","label_ar":"طول الكم","label_en":"Sleeve","kind":"measurement","measurement_key":"sleeve"},
    {"key":"shoulder","label_ar":"عرض الكتف","label_en":"Shoulder","kind":"measurement","measurement_key":"shoulder"}]'::jsonb,
  '[{"label":"50","values":{"length":50,"bust":20,"sleeve":25,"shoulder":14.5}},
    {"label":"52","values":{"length":52,"bust":21,"sleeve":26,"shoulder":15}},
    {"label":"54","values":{"length":54,"bust":22,"sleeve":27,"shoulder":15.5}},
    {"label":"56","values":{"length":56,"bust":23,"sleeve":28,"shoulder":16}},
    {"label":"58","values":{"length":58,"bust":24,"sleeve":29,"shoulder":16.5}},
    {"label":"60","values":{"length":60,"bust":25,"sleeve":30,"shoulder":17}}]'::jsonb,
  '[{"title_ar":"الطول","title_en":"Length","body_ar":"يُقاس من أعلى الكتف عند الرقبة نزولاً حتى الطول المطلوب.","body_en":"Measure from the top of the shoulder down to your desired length."},
    {"title_ar":"محيط الصدر","title_en":"Bust","body_ar":"يُقاس من أوسع نقطة مع إبقاء الشريط مريحاً.","body_en":"Measure around the fullest part keeping the tape comfortably loose."},
    {"title_ar":"طول الكم","title_en":"Sleeve","body_ar":"يُقاس من عظمة الكتف حتى المعصم.","body_en":"Measure from the shoulder bone down to the wrist."}]'::jsonb,
  true
FROM public.business_settings bs
WHERE bs.store_vertical = 'fashion'
  AND NOT EXISTS (SELECT 1 FROM public.size_guides g WHERE g.brand_id = bs.brand_id);

-- get_storefront_page_data: انسخ آخر تعريف كاملاً من
--   supabase/migrations/20260905140000_three_day_trial_and_lockout.sql:16
-- وأضف:
--   (أ) داخل jsonb المنتج (بجانب 'custom_fields', p.custom_fields — السطر 118):
--       'size_guide_id', p.size_guide_id, 'size_guide_hidden', p.size_guide_hidden,
--   (ب) داخل jsonb القسم (السطر 140-149): 'size_guide_id', c.size_guide_id,
--   (ج) متغير جديد v_size_guides jsonb يُملأ بـ:
--       SELECT COALESCE(jsonb_agg(to_jsonb(g.*) ORDER BY g.sort_order, g.created_at), '[]'::jsonb)
--       INTO v_size_guides FROM public.size_guides g WHERE g.brand_id = v_brand_id AND g.is_active = true;
--       ويُضاف إلى الناتج النهائي (السطر ~172 'categories', v_categories): 'size_guides', v_size_guides,

NOTIFY pgrst, 'reload schema';
```

- `npm run db:migrations:check` ثم `npx vitest run` (اختبارات تفحص بنية الـ RPC إن وُجدت).

### 2.2 المكتبة النقية — `src/lib/size-guide.ts` + `src/lib/size-guide-templates.ts`

**`size-guide.ts`:**

```ts
export type SizeGuideUnit = "cm" | "in" | "none";
export type SizeGuideColumn = {
  key: string;
  label_ar: string;
  label_en: string;
  kind: "measurement" | "text";
  measurement_key?: string | null; // للربط بـ Fit Passport والمُرشِّح
};
export type SizeGuideCell = number | { min: number; max: number } | string | null;
export type SizeGuideRow = {
  label: string;
  values: Record<string, SizeGuideCell>;
  note_ar?: string | null;
  note_en?: string | null;
};
export type SizeGuideStep = {
  title_ar: string;
  title_en: string;
  body_ar: string;
  body_en: string;
};
export type SizeGuide = {
  id: string;
  brand_id: string;
  name_ar: string;
  name_en: string;
  template_key: string | null;
  base_unit: SizeGuideUnit;
  columns: SizeGuideColumn[];
  rows: SizeGuideRow[];
  how_to_measure: SizeGuideStep[];
  diagram_url: string | null;
  video_url: string | null;
  notes_ar: string | null;
  notes_en: string | null;
  placement: "modal" | "inline" | "both";
  recommender_enabled: boolean;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
};

export function normalizeSizeGuide(raw: unknown): SizeGuide | null; // حراسة نوعية كاملة، يرجع null إن كان الشكل فاسداً
export function convertMeasurement(value: number, from: SizeGuideUnit, to: SizeGuideUnit): number; // 2.54، تقريب لأقرب 0.5
export function formatCell(
  cell: SizeGuideCell,
  column: SizeGuideColumn,
  from: SizeGuideUnit,
  to: SizeGuideUnit,
): string; // "20–21" للنطاق، النص كما هو

/** منتج ← قسم (صعوداً عبر parent_id) ← افتراضي البراند ← null. products.category نص يطابق slug أو name_en (انظر $slug.$category.tsx:258). */
export function resolveSizeGuideForProduct(args: {
  product: {
    size_guide_id?: string | null;
    size_guide_hidden?: boolean | null;
    category?: string | null;
  };
  categories: Array<{
    id: string;
    slug: string | null;
    name_en: string;
    parent_id: string | null;
    size_guide_id?: string | null;
  }>;
  guides: SizeGuide[];
}): SizeGuide | null;

/** لصق من Excel/Sheets: يكتشف التاب أو الفاصلة، الصف الأول = رؤوس الأعمدة، العمود الأول = تسمية المقاس، الأرقام تصبح measurement والباقي text. */
export function parseSizeGuidePaste(text: string): {
  columns: SizeGuideColumn[];
  rows: SizeGuideRow[];
};
// يستخدم parseCSV من src/lib/csv-parser.ts عند الفاصلة، وتقسيماً بـ \t عند وجود تاب.

export type SizeRecommendation = {
  size: string | null;
  confidence: "high" | "medium" | "low";
  between?: [string, string]; // إذا وقع العميل بين مقاسين
  oversize?: boolean; // أكبر من أكبر مقاس
  reasons: Array<{ column: SizeGuideColumn; customer: number; row: SizeGuideCell }>;
};

/**
 * خوارزمية شفافة (لا ML): تُحوَّل قياسات العميل إلى وحدة الدليل، ثم لكل صف ولكل عمود measurement له قيمة عميل:
 *   max(row) >= customer - tolerance  ⇒ الصف "يتّسع". tolerance = 1 سم (0.4 إنش).
 * المرشَّح = أصغر صف يتّسع على كل الأعمدة (أقل مجموع فائض). لا صف يتّسع ⇒ أكبر صف + oversize.
 * إذا الفرق بين أول صفين يتّسعان أقل من tolerance ⇒ between + توصية بالأكبر.
 * confidence: high عند تطابق ≥2 أعمدة، medium عند عمود واحد، low عند between/oversize.
 */
export function recommendSize(args: {
  guide: SizeGuide;
  measurements: Record<string, number>; // مفتاح = measurement_key
  unit: SizeGuideUnit; // وحدة قياسات العميل
}): SizeRecommendation;
```

**`size-guide-templates.ts`:** `SIZE_GUIDE_TEMPLATES: Array<{ key, name_ar, name_en, vertical_hint: StoreVertical[], guide: Omit<SizeGuide, "id"|"brand_id"|...> }>` بالقوالب المذكورة في 2.0 (البند 3). قالب `abaya_gulf` = نفس بيانات الـ backfill بالضبط (اختبار يضمن التطابق).

### 2.3 الأدمن — Size Guide Studio

**مسار جديد** `src/routes/_authenticated/admin.b.$slug.size-guides.tsx` (نمط `admin.b.$slug.categories.tsx:25`) + **عنصر تنقل** في `src/config/admin-navigation.ts` بجانب `categories` (السطر 256-269): `id: "size-guides"`, `labelAr: "أدلة المقاسات"`, `labelEn: "Size Guides"`, `icon: Ruler`, `permission: "manage_inventory"`, `category: "products_stock"`, `tier: "modular"` — ويُضاف **فقط** عندما `storeModules?.size_guide` (البند 1.4). حدّث `tests/admin-storefront-mode.test.ts` بحالة: مع `storeModules.size_guide=false` لا يظهر `size-guides`، ومع `true` يظهر.

**الصفحة (لوحتان):**

- **يسار: قائمة الأدلة** — بطاقة لكل دليل (الاسم، عدد الصفوف، الوحدة، شارة "افتراضي"، عدد المنتجات/الأقسام المرتبطة، تفعيل/تعطيل)، زر "دليل جديد" يفتح **معرض القوالب** (شبكة بطاقات من `SIZE_GUIDE_TEMPLATES` مرتبة بحيث تظهر قوالب `vertical_hint` المطابقة لنشاط البراند أولاً) + "ابدأ من فراغ" + "لصق من Excel".
- **يمين: المحرر** بتبويبات:
  1. **الجدول**: grid بخلايا `Input` قابلة للتحرير، رأس كل عمود قابل للتحرير (label_ar/label_en عبر `BilingualField` الموجود في `src/components/bilingual-field.tsx`)، نوع العمود (`Select`: قياس/نص)، `measurement_key` (`Select` من قائمة مفاتيح معروفة + "مخصص")، أزرار إضافة/حذف/تحريك لليمين/لليسار للأعمدة، إضافة/حذف/تحريك للصفوف، ملاحظة صف. زر "لصق من جدول" يفتح `Textarea` ويمرر النص إلى `parseSizeGuidePaste`. وحدة الأساس `Select` مع خيار "تحويل القيم الحالية" عند تغييرها.
  2. **كيفية القياس**: قائمة خطوات (عنوان + نص ثنائي اللغة، ترتيب)، رفع الصورة التوضيحية عبر `CropUploadButton` (أضف preset جديد `sizeGuideDiagram` في `src/lib/image-crop-presets.ts` بنسبة 4:5 حرة)، حقل رابط فيديو.
  3. **العرض والربط**: `placement` (نافذة / داخل الصفحة / كلاهما)، `recommender_enabled`، "اجعله الافتراضي للبراند"، قائمة الأقسام مع `Checkbox` لربطها بهذا الدليل (يكتب `categories.size_guide_id`)، وقائمة المنتجات المرتبطة (قراءة فقط + رابط لمحرر المنتج).
  4. **معاينة**: نفس `SizeGuidePanel` الذي يراه العميل (2.4) مع مبدّل عربي/إنجليزي ومبدّل الوحدة.
- **الحفظ**: `upsert` مباشر على `size_guides` (RLS تحمي)؛ التحقق قبل الحفظ عبر `normalizeSizeGuide`؛ `is_default` يلغي الافتراضي السابق في نفس المعاملة (تحديث صفين).

**محرر المنتج (`admin.b.$slug.inventory.tsx`)**: داخل بطاقة المتغيرات (قرب السطر 4484): `Select` "دليل المقاسات" بخيارات: "يتبع القسم/الافتراضي" (`null`)، كل دليل بالاسم، "إخفاء الدليل لهذا المنتج" (`size_guide_hidden=true`). يظهر فقط عند `profile.modules.size_guide`. أضف `size_guide_id, size_guide_hidden` إلى `select` المنتجات وإلى payload الحفظ.

**محرر الأقسام (`admin.b.$slug.categories.tsx`)**: `Select` "دليل المقاسات الافتراضي لهذا القسم" (يظهر عند تفعيل الوحدة).

### 2.4 الستور فرونت

**توصيل البيانات**: `$slug.route.tsx:333` يمرر `<StorefrontProvider brand settings>`؛ أضف prop اختيارياً `catalog={{ sizeGuides: bootstrapData.size_guides ?? [], categories: bootstrapData.categories ?? [] }}` (من `loaderData.bootstrapData`)، و`StoreCtx` يعرّض `sizeGuides: SizeGuide[]` (بعد `normalizeSizeGuide` وتصفية `null`) و`categories`. أضف `size_guide_id, size_guide_hidden` إلى `select` المنتج في `src/lib/storefront-queries.ts:87-89` و `$slug.product.$id.tsx:344-345`.

**مكوّنات جديدة في `src/components/storefront/size-guide/`:**

- `SizeGuidePanel.tsx` — الجسم المشترك (يُستخدم في النافذة، والقسم المطوي، والصفحة العامة، ومعاينة الأدمن): رأس بالاسم + مبدّل الوحدة (`Button` مجموعة — **لا** `<button>` خام)، الجدول (عمود أول `sticky`، تمييز الصف المختار، زر "اختر" لكل صف عند وجود `onSelectSize`)، لوحة المُرشِّح، `Accordion` "كيفية القياس" بالصورة والخطوات والفيديو، الملاحظات.
- `SizeRecommender.tsx` — إذا `guide.recommender_enabled` وفيه أعمدة `measurement` بـ `measurement_key`: (أ) عند تفعيل `fit_passport` ووجود قياسات للعميل (نفس استعلام `fitPassportQ` الموجود في صفحة المنتج) ⇒ نتيجة فورية "مقاسك المقترح حسب Fit Passport: **54**" + زر "اختيار"؛ (ب) وإلا نموذج صغير بحقول رقمية لكل `measurement_key` + مبدّل وحدة ⇒ `recommendSize` ⇒ النتيجة مع `reasons` مختصرة ("الصدر 22 ≤ 22 ✓"). حالة `between` تعرض "بين 52 و54 — ننصح بـ 54". حالة `oversize` تعرض "أكبر من أكبر مقاس متاح — تواصل معنا" (وفي وضع الكتالوج/واتساب يفتح رابط الاستفسار الموجود).
- `SizeGuideModal.tsx` (إعادة كتابة كاملة للملف الحالي) — `Dialog` يلف `SizeGuidePanel`؛ props: `{ guide, lang, selectedSize, onSelectSize, measurements?, measurementsUnit?, trigger? }`. **يُحذف** `DEFAULT_ABAYA_SIZES` و`<button>` الخام.
- `SizeGuideInline.tsx` — `Accordion` مطوي تحت خيارات المنتج يلف `SizeGuidePanel`.

**`$slug.product.$id.tsx`:**

- `const sizeGuide = useMemo(() => resolveSizeGuideForProduct({ product, categories, guides: sizeGuides }), [...])`.
- السطر 1557: `{modules.size_guide && sizeGuide && (sizeGuide.placement !== "inline") && <SizeGuideModal guide={sizeGuide} selectedSize={selectedSize} onSelectSize={(s) => { if (uniqueSizes.includes(s)) { setSelectedSize(s); setErrorMsg(null); } }} measurements={passportMeasurementsForGuide} ... />}`.
- بعد كتلة الخيارات (بعد السطر ~1685 نهاية `optionsRef`): `{modules.size_guide && sizeGuide && sizeGuide.placement !== "modal" && <SizeGuideInline .../>}`.
- `passportMeasurementsForGuide`: عند `modules.fit_passport` ووجود `fitPassportQ.data` — خذ ملف القياس الحالي (`fitProfileValues`) وحوّله إلى `Record<measurement_key, number>` مع `preferred_length_unit` كوحدة. (بعد المرحلة 4 تصبح مفاتيح الملفات قابلة للتهيئة — نفس المفاتيح.)
- تتبع: أضف `"view_size_guide"` إلى `StorefrontEvent` في `src/lib/storefront-analytics.ts:1-2` واستدعِ `trackStorefrontEvent("view_size_guide", { product_id, guide_id })` عند فتح النافذة/القسم.

**صفحة عامة جديدة `src/routes/$slug.size-guide.tsx`**: تعرض كل `sizeGuides` النشطة كتبويبات مع `SizeGuidePanel`؛ `head` بعنوان "دليل المقاسات — {اسم البراند}"؛ تُعاد `notFound()` إذا الوحدة مطفأة أو لا أدلة. تظهر تلقائياً في فوتر المتجر تحت مجموعة "المساعدة" عندما تكون الوحدة مفعّلة ويوجد دليل واحد على الأقل (ابحث عن مكان روابط `pages` بمجموعة `help` في مكوّن الفوتر).

### 2.5 اختبارات المرحلة 2

- `tests/size-guide.test.ts`: `convertMeasurement(50,"in","cm")=127`؛ `formatCell({min:20,max:21},...)` → "20–21" وبالسم "51–53.5"؛ `resolveSizeGuideForProduct` (منتج ← قسم ← قسم أب ← افتراضي ← null، و`size_guide_hidden` يرجع null حتى مع افتراضي)؛ `parseSizeGuidePaste` بتاب وبفاصلة، أرقام ونطاقات "20-21" ونصوص؛ `normalizeSizeGuide` يرفض الأشكال الفاسدة.
- `tests/size-recommender.test.ts`: عميل (صدر 22، طول 54) على قالب العبايات ⇒ "54" بثقة high؛ (صدر 22.5) ⇒ between ["54","56"] وتوصية "56"؛ (صدر 30) ⇒ oversize؛ قياسات بالسم تُحوَّل صحيحاً؛ عمود بلا `measurement_key` يُتجاهل.
- `tests/size-guide-templates.test.ts`: كل قالب يمرّ `normalizeSizeGuide`؛ قالب `abaya_gulf` يطابق بيانات الـ backfill (يقرأ الـ migration ويقارن JSON).
- source tests: `SizeGuideModal.tsx` لا يحتوي `DEFAULT_ABAYA_SIZES` ولا `<button`؛ `admin-navigation.ts` يحتوي `id: "size-guides"` مشروطاً بـ `storeModules?.size_guide`؛ الـ migration يحتوي `'size_guides', v_size_guides` و `size_guide_hidden`.
- **يدوي**: براند أزيائي حالي يرى نفس الجدول (من backfill) بنفس الأرقام؛ براند مجوهرات جديد ينشئ دليل خواتم من القالب ويربطه بقسم "خواتم" فيظهر على منتجات القسم فقط؛ لصق جدول من Google Sheets يعمل؛ المُرشِّح يعطي نتيجة صحيحة؛ `/{slug}/size-guide` تعمل؛ الجوال يمرر الجدول أفقياً بلا كسر الصفحة.

---

## المرحلة 3 — فصل "حسب الطلب" عن "الحقول المخصصة" (سلامة المخزون)

الهدف: `products.is_made_to_order` هو المصدر الوحيد. متجر هدايا يضيف حقل "رسالة إهداء" على منتج له مخزون ⇒ يُخصم المخزون ويظهر "نفد" عند الصفر. البراندات الحالية: لا تغيير (backfill من `custom_fields`).

### 3.1 Migration — `supabase/migrations/20260917100000_products_made_to_order_flag.sql`

```sql
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_made_to_order boolean NOT NULL DEFAULT false;

-- Backfill = السلوك الحالي بالضبط (أي حقول مخصصة ⇒ تفصيل)
UPDATE public.products
SET is_made_to_order = true
WHERE jsonb_typeof(custom_fields) = 'array' AND jsonb_array_length(custom_fields) > 0
  AND is_made_to_order = false;

-- get_storefront_page_data: انسخ آخر تعريف كاملاً (سيكون في migration المرحلة 2 الآن — 20260916100000)
-- وأضف داخل jsonb المنتج: 'is_made_to_order', p.is_made_to_order,

-- place_storefront_order_internal_20260710: انسخ آخر تعريف كاملاً من
--   supabase/migrations/20260913100000_storefront_mode_catalog.sql:54
-- واستبدل السطر 229:
--   v_is_tailoring := (jsonb_typeof(v_custom_fields) = 'array' AND jsonb_array_length(v_custom_fields) > 0);
-- بـ:
--   v_is_tailoring := COALESCE(v_product.is_made_to_order, false);
-- (v_product محمّل قبلها بسطرين عبر SELECT * INTO v_product — العمود متاح مباشرة.)
```

- شغّل `npm run db:migrations:check`. اختبار `tests/custom-tailoring-location.test.ts` يفحص migration قديماً ثابتاً — لا يتأثر.

### 3.2 الأدمن — محرر المنتج (`admin.b.$slug.inventory.tsx`)

- أضف `is_made_to_order: boolean` إلى نوع الفورم وإلى `select` المنتجات وإلى payload الحفظ.
- سويتش "منتج حسب الطلب (لا يُخصم من المخزون)" داخل بطاقة "محرك تصميم وتخصيص المنتج" (قرب السطر 3590). يظهر **دائماً** (ليس مرتبطاً بوحدة `made_to_order` — متجر عام قد يحتاجه)، لكن نصه يتبع مفردات النشاط في المرحلة 5.
- عند تطبيق قالب Passport (السطر 3607-3640) اضبط `is_made_to_order = true` تلقائياً (يحافظ على تجربة الأزياء).

### 3.3 الستور فرونت

- `src/lib/storefront-queries.ts:87-89` و `$slug.product.$id.tsx:344-345`: أضف `is_made_to_order` إلى حقول `select`.
- `product-card.tsx:47-52`: `const isMadeToOrder = Boolean(product.is_made_to_order); const oos = !isMadeToOrder && totalStock <= 0;`
- `$slug.product.$id.tsx:998-1000`: `isTailoringActive = product.is_made_to_order && ((showSizeModeToggle && sizeMode === "custom") || !showSizeModeToggle)`. بدون العلم: المنتج مخزوني عادي والحقول المخصصة مجرد بيانات إضافية على البند.
- `admin.b.$slug.orders.$id.tsx:1840, 2073, 3734, 3918`: استبدل الاكتشاف بكلمة `"تفصيل"` بـ `it.location === "custom" || !it.variant_id` (البيانات القديمة تحمل `location='custom'` أصلاً).

### 3.4 اختبارات المرحلة 3

- source test: الـ migration يحتوي `COALESCE(v_product.is_made_to_order, false)` و `'is_made_to_order', p.is_made_to_order`.
- `product-card.tsx` لا يحتوي `custom_fields.length > 0` كشرط للنفاد.
- **اختبار يدوي إلزامي**: منتج بمخزون 1 + حقل مخصص + `is_made_to_order=false` → طلبان متتاليان: الثاني يرفض بـ `INSUFFICIENT_STOCK`. ثم `is_made_to_order=true` → لا خصم، `location='custom'`.

---

## المرحلة 4 — ملفات القياس القابلة للتهيئة + المتغيّر الوهمي

### 4.1 ملفات القياس (Fit Profiles) كبيانات

**Migration `supabase/migrations/20260918100000_fit_profiles_config.sql`:**

```sql
ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS fit_profiles jsonb NULL;
-- NULL = استخدم الافتراضيات المدمجة (abaya/dress) — صفر تغيير للبراندات الحالية.
-- الشكل: [{ "key":"abaya", "label_ar":"عباية", "label_en":"Abaya",
--           "match": { "keywords": ["عباي","abaya"] },
--           "fields": [{ "key":"length","label_ar":"الطول","label_en":"Length","required":true,
--                        "aliases": ["height","طول"] }] }]
-- مفاتيح fields.key هي نفسها measurement_key في أدلة المقاسات ⇒ المُرشِّح يعمل تلقائياً.
-- أضفه لـ brand_public_settings في نهاية SELECT (نفس أسلوب 1.1) + security_invoker + GRANT.
```

**`src/lib/fit-passport.ts`** — إعادة هيكلة متوافقة:

- `FIT_PROFILE_FIELDS` الحالي يصبح `FASHION_FIT_PROFILES: FitProfileDefinition[]` (نفس البيانات).
- كل دالة تأخذ `profiles: FitProfileDefinition[]` كمعامل أول: `normalizeFitProfiles(profiles, value)`, `fitProfileForProduct(profiles, category, name)` (يستخدم `match.keywords` بدل regex الثابت؛ الافتراضي أول ملف), `missingFitFields(profiles, key, values)`, `matchCustomFieldToMeasurement(profiles, field)` (يستخدم `aliases` بدل regex الثابت).
- دالة `resolveFitProfiles(settings.fit_profiles)` → `fit_profiles ?? FASHION_FIT_PROFILES`.
- `FitProfileType` يصبح `string`. مفاتيح `customer_fit_passports.measurements` (jsonb مُفهرَس بمفتاح الملف) تبقى صالحة.
- حدّث المستدعين: `StorefrontFitPassport.tsx` (التبويبات من `profiles` بدل `abaya/dress` الثابتة، السطور 209-213/253)، `CustomerFitPassport.tsx`، `$slug.product.$id.tsx`، `admin.b.$slug.orders.$id.tsx`، و`CUSTOMIZER_PRESETS` في `inventory.tsx` (قوالب Passport تُولَّد من `profiles` بدل الثابتين `passport_abaya`/`passport_dress`؛ الاكتشاف في `$slug.product.$id.tsx:641` يصبح `customFields.some(f => f.key.includes(`passport_${p.key}`))` لكل ملف).
- **الأدمن**: داخل `StoreProfileCard` عند تفعيل `fit_passport`: محرر ملفات القياس (اسم/كلمات مطابقة/حقول مع required) + زر "قالب الأزياء (عباية/فستان)".

### 4.2 المتغيّر الوهمي "قياسي" (يخص كل الأنشطة)

- `src/lib/variant-sku-utils.ts`: أضف `export const PLACEHOLDER_SIZE_VALUES = ["قياسي", "Standard"]` و `isPlaceholderVariant(v)` = المقاس ضمن القائمة و لا لون ولا خامة ولا `option_four/five`.
- `inventory.tsx:2780, 2899`: استخدم الثابت بدل النص الحر.
- `$slug.product.$id.tsx`: `uniqueSizes` يستثني القيم الوهمية إذا كانت **كل** المتغيرات وهمية (منتج بمتغيّر واحد) ⇒ لا كتلة "المقاس / خيار"، لا زر دليل مقاسات، ويُختار المتغيّر تلقائياً (السطر ~600 `setSelectedSize(first.size)` يبقى ليُحدَّد `variantId`).
- سلة/checkout/فاتورة/طباعة حرارية: عند عرض `[size, color, fabric].filter(Boolean).join(" · ")` (`$slug.checkout.tsx:2043-2045`, `InvoicePreview.tsx:724-732`, `thermal-print.ts:82, 261`, `cart-sharing.ts`) مرّر عبر `displayVariantParts(v)` جديدة تحذف القيم الوهمية. البيانات في DB لا تتغير.

### 4.3 اختبارات المرحلة 4

- `tests/fit-passport.test.ts`: التوافق الخلفي — `normalizeFitProfiles(FASHION_FIT_PROFILES, {height: 54})` → `abaya.length = 54`؛ `fitProfileForProduct(FASHION_FIT_PROFILES, "فساتين", null)` → `dress`؛ ملفات مخصصة (مثلاً "خاتم" بحقل `ring_circumference`) تعمل وتغذّي `recommendSize` على دليل خواتم.
- `isPlaceholderVariant` + `displayVariantParts`.

---

## المرحلة 5 — المفردات، سياق الـ AI، تطبيق الجوال، السوبر أدمن، الحراسة

### 5.1 مكتبة المفردات — `src/lib/store-vocabulary.ts` (نقية)

```ts
import type { StoreVertical } from "./store-profile";

export type Bilingual = { ar: string; en: string };
export type StoreVocabulary = {
  production_partner: Bilingual; // الخياط / Tailor · المطبعة / Print shop · المطبخ / Kitchen · الورشة / Workshop
  made_to_order: Bilingual; // تفصيل / Custom tailoring · حسب الطلب / Made to order
  made_to_order_short: Bilingual; // مقاس تفصيل / Custom · حسب الطلب / Custom
  notes_label: Bilingual; // ملاحظات وتفاصيل التفصيل والخياط / Tailoring & Workshop Notes · ملاحظات خاصة / Special instructions
  notes_placeholder: Bilingual;
  stage_sent: Bilingual; // تم الإرسال للخياط / Sent to Tailor · أُرسل للورشة / Sent to workshop
  stage_received: Bilingual;
  stage_sent_customer: Bilingual; // قيد التفصيل بكل حب / Tailoring with Love · قيد التحضير / Being prepared
  material_axis: Bilingual; // الخامة / Fabric · المادة / Material
  category_example: Bilingual; // عبايات / Abayas · مثال عام
  expense_examples: Bilingual; // قماش، خياطة، شحن / …
  invoice_terms_fallback: Bilingual; // النص الحالي للأزياء · نص عام للباقي
};

export const VERTICAL_VOCABULARY: Record<StoreVertical, StoreVocabulary> = {
  /* fashion = النصوص الحالية حرفياً؛ الباقي عام */
};

export type VocabularyOverrides = Partial<Record<keyof StoreVocabulary, Partial<Bilingual>>>;

export function resolveVocabulary(
  vertical: StoreVertical,
  overrides?: VocabularyOverrides | null,
): StoreVocabulary;
export function vt(v: Bilingual, lang: "ar" | "en"): string; // اختصار
```

- Migration صغير: `business_settings.store_vocabulary jsonb NOT NULL DEFAULT '{}'` + إضافته للـ view.
- `useStoreModules()` (ستور فرونت) و `useAdminStoreProfile()` (أدمن) يعيدان أيضاً `vocab`.

**نقاط الاستبدال (كلها من الجدول في القسم 0):** `status-labels.ts` (أضف معامل `vocab` اختيارياً لدوال التسمية مع افتراضي = fashion للتوافق مع كل المستدعين الحاليين واختبارات `order-workflow.behavior.test.ts`)، `orders.index.tsx:1062-1106`، `OrderUnifiedHeader.tsx:241-273`، `OrderItemsWorkflowCard.tsx:158`، `orders.$id.tsx:2381/2422/436-441`، `dashboard.tsx` نصوص "تتطلب خياطة"، `$slug.product.$id.tsx:1475, 2108-2130`، `$slug.checkout.tsx:1160-1161`، `InvoicePreview.tsx:900-903` (يحتاج تمرير `vocab` مع `settings`)، `content-studio.tsx:1092-1100`، `i18n.tsx:96/209/453/565` (حوّلها إلى قراءة من `vocab` في مواضع الاستخدام)، `categories.tsx:370/378`، `PackagingMaterialsTab.tsx:565-566`، `settings.tsx:4259-4260` (منتج العيّنة حسب النشاط)، `inventory.tsx` عنوان "الخامة"، `order-type-detector.ts:getOrderTypeLabel` (أضف `vocab`).

- **الأدمن**: قسم "المصطلحات" داخل `StoreProfileCard` يسمح بتجاوز `production_partner` و `made_to_order` و `notes_label` (الأكثر ظهوراً) — يكتب `store_vocabulary`.

### 5.2 سياق الـ AI حسب النشاط

دالة خادمية مشتركة `getBrandAiContext(brandId)` في ملف جديد `src/lib/store-profile.server.ts` تقرأ `store_vertical` + اسم البراند وتعيد سطراً مثل `"This store sells: Beauty & Perfume (GCC market, Bahrain). Do not assume apparel sizes."` — ثم:

- `store-copilot.functions.ts:107`: استبدل "elite AI store operating copilot for GCC and luxury boutiques" بـ نص عام + السطر السياقي؛ الأمثلة السريعة (253-254, 334-335) تُختار من خريطة `VERTICAL_COPILOT_EXAMPLES`.
- `instagram-ai-importer.ts:696-707, 893`: prompt عام + السياق؛ العنوان الافتراضي "عباية أنيقة" → `vocab.category_example` أو "منتج جديد"؛ استبعاد المقاسات 50–62 من الأسعار (السطر 290) يبقى **فقط** عندما `vertical === "fashion"`.
- `generate-variants.functions.ts:379-392`: prompt عام + السياق؛ توسيع نطاق العبايات (107-114) يبقى عاماً (لا ضرر) لكن أسبقية "even sizes" تُفعَّل فقط للأزياء.
- `translate.functions.ts:78-84`: "specializing in {vertical label} retail brands".

### 5.3 تطبيق الجوال `apps/boutq-os-mobile`

التطبيق يقرأ Supabase مباشرة وله نسخ مستقلة من المكتبات. أضف `apps/boutq-os-mobile/src/lib/store-vocabulary.ts` (نسخة مبسّطة من الخريطة — لا استيراد من `src/` الجذر) واقرأ `store_vertical` مع `business_settings` في `src/lib/auth.tsx:69` ثم استبدل النصوص في `order-workflow.ts:65-66`، `app/order/[id].tsx:571-574`، `screens/dashboard-screen.tsx:198/222`، `app/more/categories.tsx:196-208`، `lib/i18n.tsx:98/313`.

### 5.4 السوبر أدمن وجاهزية المتجر

- `admin.brands.tsx` / صفحة تفاصيل البراند في السوبر أدمن: عمود "النشاط" + نفس `StoreProfileCard` (بصلاحية super) لتصحيح النشاط/الوحدات لأي براند دعماً.
- `StoreReadinessChecklist.tsx:349`: أضف `store_vertical, store_modules` إلى `select`، وبند جديد في `evaluateStoreReadiness` (السطر 61): عند `modules.size_guide` مفعّلة ولا يوجد `size_guides` نشط للبراند → "أضف دليل مقاسات" (تحذير، ليس مانعاً). حدّث `tests/store-readiness.test.ts` بالحالة الجديدة.

### 5.5 اختبار الحراسة (يمنع عودة الأزياء المُثبَّتة)

- `tests/store-vocabulary.test.ts`: `resolveVocabulary("fashion")` يعيد النصوص الحالية حرفياً ("تم الإرسال للخياط"، "Sent to Tailor")؛ `general` لا يحتوي "خياط" ولا "Tailor" ولا "قماش" في أي قيمة؛ override يغلب.
- `tests/no-hardcoded-fashion.test.ts` (نمط `design-system-guardrails.test.ts`): يقرأ كل ملفات `src/**/*.{ts,tsx}` **باستثناء** قائمة بيضاء صريحة (`store-vocabulary.ts`, `fit-passport.ts`, `size-guide-templates.ts`, `trust-badges.ts`, `variant-sku-utils.ts`, `store-profile.ts`) ويفشل إن طابق أي ملف `/الخياط|Sent to Tailor|عباي|abaya|Fashion Boutique/i`.

---

## المرحلة 6 — (اختياري) ربط الوحدات بالتسعير

إذا قرر المالك أن `fit_passport` أو `size_guide` ميزة مدفوعة: أضف `fit_passport.enabled` / `size_guide.enabled` إلى `saas_features` (migration بيانات) و في `resolveStoreModules` **لا** تغيير — بل في `useAdminStoreProfile` و `useStoreModules` اجعل النتيجة `modules[id] && entitled[id]` عبر `useFeature(brandId, "<key>")`. الطبقتان تبقيان مستقلتين في التخزين.

---

## 7. ترتيب الـ PRs والتحقق

| PR                                                                                | المحتوى                        | التحقق قبل الدمج                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PR-1** `feat(store-profile): vertical + modules foundation, gating, onboarding` | المرحلة 1 كاملة (بما فيها 1.9) | typecheck ✓ · vitest بلا فشل جديد (baseline 670) · `db:migrations:check` ✓ · **يدوي**: (أ) براند حالي: لا فرق بصري في المنتج/الحساب/العميل/الطلب. (ب) `/onboard` لا يقبل الإرسال بدون اختيار نشاط؛ براند جديد بنشاط "عطور": صفحة منتج بمتغيّر واحد بلا زر دليل مقاسات ولا تبديل تفصيل؛ حساب العميل بلا تبويب "مقاساتي"؛ صفحة العميل بالأدمن بلا Passport؛ قائمة القوالب بلا Passport. (ج) تغيير النشاط إلى "أزياء" من الإعدادات يعيد كل شيء. (د) `/onboard` يعرض "Launch Your Boutique". |
| **PR-2** `feat(size-guides): Size Guide Studio`                                   | المرحلة 2                      | نفس الأوامر + الاختبارات اليدوية في 2.5                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **PR-3** `fix(products): explicit is_made_to_order flag`                          | المرحلة 3                      | نفس الأوامر + الاختبار اليدوي للمخزون في 3.4                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **PR-4** `feat(fit-passport): configurable fit profiles + placeholder variant`    | المرحلة 4                      | نفس الأوامر + Passport حالي (abaya/dress) يُقرأ ويُحفظ كما كان                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **PR-5** `feat(store-profile): vocabulary, AI context, mobile, super admin`       | المرحلة 5                      | نفس الأوامر + اختبار الحراسة 5.5                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **PR-6** (اختياري)                                                                | المرحلة 6                      | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

الأمر الكامل قبل كل PR:

```bash
npm run format:check && npm run typecheck && npm run lint && npx vitest run
```

وعند إضافة migration:

```bash
npm run db:migrations:check
```

**ترتيب النشر لـ PR-1 تحديداً:** طبّق الـ migration في الإنتاج **قبل** نشر الكود، أو اعتمد على الـ fallback الانتقالي `fashion` (1.3/1.4) ثم أزله في PR لاحق بعد التأكد.

---

## 8. القرارات المُتخذة (بدل "القرارات المفتوحة")

| السؤال                                             | القرار                                                                                                                                                       | أين طُبّق        |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| الافتراضي عند عدم اختيار نشاط في الأونبوردنق       | **إلزام الاختيار** (قرار المالك). لا افتراضي في الواجهة ولا الخادم.                                                                                          | 1.7              |
| البراندات الحالية                                  | تبقى كما هي (`fashion`)؛ فقط ما سُجِّل صراحةً كمطعم/رقمي ينتقل لنشاطه مع حماية من يملك بيانات Passport. أي براند يغيّر نشاطه ووحداته من الإعدادات في أي وقت. | 1.1 (خطوتا 2 و3) |
| دليل المقاسات                                      | **Size Guide Studio** كامل قابل للتخصيص لأي براند يفعّل الوحدة (قرار المالك: "world-class")، مع قالب العبايات الحالي كنقطة بداية للبراندات الأزيائية.        | المرحلة 2        |
| نصوص المنصة                                        | إزالة "Fashion" فقط، الإبقاء على "Boutique": "Launch Your Boutique" (قرار المالك).                                                                           | 1.9              |
| `made_to_order` مفعّل افتراضياً للمجوهرات والطباعة | نعم (نقش/طباعة حسب الطلب شائعة). قابل للتعديل من الإعدادات.                                                                                                  | 1.2              |
| الوحدات كميزات مدفوعة                              | مؤجَّل — المرحلة 6 اختيارية.                                                                                                                                 | 6                |

---

## 9. قائمة تحقق نهائية (Definition of Done للميزة كاملة)

- [ ] كل براند موجود قبل الخطة يرى **نفس** الواجهة والسلوك بعد كل PR (لا diff بصري ولا وظيفي).
- [ ] `/onboard` لا يقبل التسجيل بدون اختيار نوع النشاط، ويعرض "Launch Your Boutique" بلا كلمة Fashion في أي نص منصة.
- [ ] براند جديد بنشاط غير أزيائي: لا زر "دليل المقاسات"، لا تبويب "مقاساتي"، لا Fit Passport في الأدمن، لا تبديل "جاهز/تفصيل"، لا صندوق "ملاحظات الخياط"، لا قوالب Passport، لا عنصر "أدلة المقاسات" في التنقل، لا كلمة "خياط/Tailor/عباية" في أي شاشة أدمن أو ستور فرونت أو فاتورة أو تطبيق جوال.
- [ ] براند جديد بنشاط "أزياء": يحصل على كل الوحدات مفعّلة + قالب عبايات جاهز في Size Guide Studio + ملفات عباية/فستان — بنقرة واحدة في الأونبوردنق.
- [ ] أي براند يستطيع تشغيل/إطفاء كل وحدة يدوياً من الإعدادات بغض النظر عن نشاطه، والتغيير يظهر في الستور فرونت بعد إعادة التحميل.
- [ ] **Size Guide Studio**: عدد غير محدود من الأدلة، أعمدة/صفوف حرة، لصق من Excel، قوالب، وحدتان بتحويل، كيفية القياس بصورة، ربط منتج ← قسم ← افتراضي، إخفاء لمنتج، مُرشِّح مقاس يعمل مع Fit Passport وبدونه، صفحة `/{slug}/size-guide`، معاينة حية في الأدمن مطابقة للستور فرونت.
- [ ] لا يوجد `DEFAULT_ABAYA_SIZES` ولا `<button>` خام في `SizeGuideModal.tsx`.
- [ ] إطفاء `fit_passport` لا يحذف صفوف `customer_fit_passports`؛ إعادة تشغيلها تُظهر البيانات نفسها.
- [ ] منتج **غير** "حسب الطلب" له حقول مخصصة: يُخصم مخزونه ويُعرض "نفد" عند الصفر. منتج "حسب الطلب": لا خصم، `location='custom'`.
- [ ] ملفات القياس تُقرأ من `fit_profiles` مع افتراضي مدمج للأزياء، والـ Passports القديمة تُقرأ بلا هجرة بيانات.
- [ ] منتج بمتغيّر واحد "قياسي" لا يعرض كتلة "المقاس / خيار" ولا يظهر "قياسي" في السلة/الفاتورة.
- [ ] الـ AI (Copilot/Instagram/Variants/Translate) يتلقى سياق النشاط ولا يفترض الأزياء.
- [ ] السوبر أدمن يستطيع تصحيح النشاط والوحدات لأي براند.
- [ ] اختبار الحراسة (5.5) يمنع عودة الأزياء المُثبَّتة إلى `src/` مستقبلاً.
- [ ] `npm run typecheck` صفر أخطاء، `npx vitest run` بلا فشل جديد مقارنة بـ 670، `npm run db:migrations:check` ناجح، `npm run format:check` ناجح، لا مخالفات guardrails.
