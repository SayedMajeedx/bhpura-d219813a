---
name: brand-provisioning-and-palette
description: >
  استخدم هذا الـ skill إجبارياً عند بناء أو تعديل أي جزء من إنشاء براند
  جديد (معالج السوبر أدمن، `provision-brand` في edge function
  `user-management`، الدالة `create_tenant_with_defaults*`، قوالب النشاط
  `src/lib/brand-templates/`)، أو استخراج/اشتقاق ألوان العلامة من الشعار
  (`src/lib/logo-palette.ts`). يحدد ترتيب الإنشاء الصحيح، قواعد استخراج
  اللوحة واشتقاق الألوان القابلة للاختبار، وما يُجهَّز تلقائياً حسب
  نوع النشاط حتى يخرج البراند جاهزاً بدون تعديل يدوي لاحق.
---

# إنشاء البراند + استخراج اللوحة من الشعار

## متى تستخدم هذا الـ skill

- أي تعديل على `src/components/super-admin/brand-wizard/**`.
- أي تعديل على `handleProvisionBrand` في
  `supabase/functions/user-management/index.ts` أو
  `src/lib/brand-provisioning.ts` أو `src/lib/brand-wizard.functions.ts`.
- أي دالة تحوّل شعاراً/صورة إلى ألوان، أو تشتق ألوان الواجهة من لون واحد.
- إضافة نوع نشاط جديد إلى `STORE_VERTICALS`.

## المبدأ الجذري

البراند الجديد يجب أن يخرج من المعالج **جاهزاً للبيع**: شعار، لوحة ألوان
متناسقة ومقروءة، خطوط مناسبة للنشاط، تصنيفات مبدئية، إضافات حزمة البداية،
إعدادات توصيل منطقية، وتطبيق مبني بالهوية الصحيحة من أول build. أي خطوة
يدوية بعد الإنشاء = فشل في التصميم.

## ترتيب الإنشاء (ثابت — لا يُغيَّر)

```
1. provisionBrandWithOwner(...)        → create_tenant_with_defaults_v2 (اللون + النشاط + اللوحة + الخط + افتراضيات القالب)
2. uploadPublicMedia(brand_id, logo)   → يحتاج brand_id، لذلك بعد (1)
3. finalizeBrandSetup(...)             → logo_url/favicon_url + installStarterPack + syncBrandVerticalCategories
4. provision-white-label-app           → أخيراً، حتى يقرأ الشعار واللوحة الحقيقية
```

- أي فشل بعد الخطوة (1) **لا يلغي البراند**؛ يعرض المعالج الخطوة الفاشلة
  مع زر إعادة محاولة لتلك الخطوة فقط.
- الـ payload القديم (بدون لوحة/نشاط) يجب أن يظل مقبولاً — التوافق للخلف
  مع `create_tenant_with_defaults` القديمة محفوظ.
- `syncBrandVerticalCategories` تحمي `PURA_BRAND_ID` — لا تلمس هذه الحماية.

## استخراج اللوحة — قواعد قابلة للاختبار

الملف: `src/lib/logo-palette.ts`، **بدون تبعيات** (قرار مالك).

1. `rasterizeImage(file, 128)` — canvas 128×128، يدعم PNG/JPG/WebP/SVG.
2. `quantize(pixels, 6)` — median-cut. يتجاهل alpha < 128، والإضاءة
   L > 0.94 أو L < 0.06 (أبيض/أسود لا يمثلان هوية).
3. `pickPrimarySecondary(colors)`:
   - الأساسي = أعلى population بتشبّع ≥ 0.25؛ إن لم يوجد ⇒ الأعلى تشبّعاً.
   - الثانوي = الأبعد مسافة لونية عن الأساسي.
   - شعار أحادي (أبيض/أسود فقط) ⇒ fallback `#800020` / `#111111` مع
     `meta.source = "manual"`.
4. `derivePalette(primary, secondary, mood)` حتمية (نفس المدخل = نفس
   المخرج)؛ `mood`: `dominant` كما هو، `muted` −20% تشبّع، `bold` +15%
   تشبّع −10% إضاءة.
5. **كل زوج (bg/fg) في اللوحة المشتقة يحقق contrast ≥ 4.5** — اختبار
   وحدة إلزامي. العناوين على الخلفية تُغمَّق تدريجياً حتى تحقق النسبة.
6. تُكتب الألوان المشتقة **كقيم صريحة** في أعمدة `business_settings`
   الحالية (`header_bg`, `btn_primary_bg`, …). لا تغيّر منطق القراءة في
   `$slug.route.tsx` (الـ `??` fallbacks).

## قوالب النشاط `src/lib/brand-templates/`

- ملف واحد لكل `StoreVertical` يجمع **كل** الافتراضيات: نمط الخط
  (`fontPresetId` من `FONT_MOOD_PRESETS`)، وضع البيع، التوصيل/الاستلام/
  الرقمي، الزوايا، شارات الثقة، الإعلان الافتراضي، وبعد Storefront 2.0:
  `design` (editorial/fresh/tech) والقيم الجديدة.
- إضافة نشاط جديد = إضافة قالب + `VERTICAL_LABELS` + `VERTICAL_MODULE_DEFAULTS`
  - `DEFAULT_VERTICAL_CATEGORIES` + قيد `store_vertical` في migration.
    اختبار `tests/brand-templates.test.ts` يفشل إن نسيت أحدها.
- القالب يُطبَّق **مرة واحدة عند الإنشاء** كقيم مكتوبة في DB. لا يُقرأ
  في وقت التشغيل من الستور فرونت.

## ممنوعات

- لون مثبّت في الكود (`#800020` في edge function) إلا كـ fallback أخير.
- بناء التطبيق قبل رفع الشعار وكتابة اللوحة.
- توليد الـ slug بصمت بعد أن يعدّله المستخدم.
- كتابة `store_modules` مباشرة (deprecated — الوحدات تُشتق من النشاط).
- أي مكتبة لاستخراج الألوان.

## قائمة تحقق قبل الـ PR

- [ ] براند تجريبي بشعار ملوّن: الترويسة/الأزرار بلون الشعار، الخط حسب
      النشاط، التصنيفات والإضافات المبدئية موجودة، `store_vertical` صحيح،
      `brands.primary_color = storefront_accent_color`.
- [ ] براند بدون شعار: ينشأ بنجاح باللوحة الافتراضية + تنبيه هادئ.
- [ ] براند بشعار أبيض/أسود: fallback يعمل بدون خطأ.
- [ ] التطبيق (إن فُعّل) يحمل الشعار واللون من أول build.
- [ ] `tests/logo-palette.test.ts` و `tests/brand-templates.test.ts` تمر.
