---
name: settings-registry-single-source
description: >
  استخدم هذا الـ skill إجبارياً عند إضافة أو نقل أو حذف أي حقل قابل
  للتعديل في إعدادات البراند (جدول `business_settings` أو الأعمدة
  القابلة للتعديل في `brands`)، أو عند بناء/تعديل صفحة الإعدادات
  `admin.b.$slug.settings` ومكوّناتها تحت `src/features/settings/`.
  يفرض مبدأ "مكان واحد لكل حقل" عبر سجل الإعدادات، المستوى أساسي/متقدم،
  نموذج الحفظ الموحد، والاختبار الحارس للتكافؤ. يمنع التكرارات التي
  كانت موجودة (نفس العمود في تبويبين، كاتبان لنفس العمود، localStorage
  يظلّل قاعدة البيانات).
---

# سجل الإعدادات — مصدر واحد لموضع كل حقل

## متى تستخدم هذا الـ skill

- إضافة عمود جديد إلى `business_settings` سيعدّله التاجر.
- نقل حقل بين تبويبات/مجموعات الإعدادات.
- بناء مكوّن جديد تحت `src/features/settings/tabs/**`.
- أي حالة ترى فيها نفس الحقل يُعدَّل من مكانين.

## المبدأ الجذري

صاحب العمل لا يعرف أسماء الجداول. يعرف "أبي أغيّر اللون" أو "أبي أضيف
منطقة توصيل". لذلك الإعدادات مرتّبة حسب **الوظيفة** (الهوية، المتجر،
الطلبات والدفع، الإشعارات، الحساب) لا حسب الجدول، وكل حقل له **موضع
واحد بالضبط**. التكرار = ارتباك + خلل (آخر حفظ يدهس الأول).

## البنية

```
src/features/settings/
  registry.ts                 # SETTINGS_REGISTRY + SETTINGS_GROUPS — مصدر الحقيقة
  use-brand-settings-form.ts  # استعلام واحد + state واحد + save() يرسل الفرق فقط
  settings-level.ts           # أساسي/متقدم (localStorage: boutq_settings_level)
  tabs/{identity,storefront,orders,notifications,account}/*Group.tsx
tests/settings-registry-parity.test.ts   # الحارس
```

## إضافة حقل جديد (4 خطوات، بالترتيب)

1. **Migration** (append-only، راجع `migration-hygiene`) + تحديث
   `src/integrations/supabase/types.ts` + إضافته إلى view
   `brand_public_settings` إن كان الستور فرونت يقرؤه.
2. **السجل**: أضف `SettingsFieldDef` واحداً في `registry.ts`:
   ```ts
   { key: "newsletter_enabled", table: "business_settings", tab: "storefront",
     group: "header_footer", level: "basic", owner: "settings", type: "boolean",
     label: { ar: "اشتراك النشرة في التذييل", en: "Footer newsletter signup" },
     keywords: { ar: ["نشرة", "اشتراك"], en: ["newsletter", "subscribe"] } }
   ```
   - `level: "basic"` فقط إن كان 90% من التجار سيلمسونه. غير ذلك `advanced`.
   - `owner` غير `settings` (مثل `route:pages`) يعني الحقل يُعدَّل في صفحة
     أخرى — لا تبنِ له UI في الإعدادات.
3. **المكوّن**: في مجموعة التبويب المناسبة، اقرأ/اكتب عبر
   `form.bs.<key>` و `form.set("<key>", value)`. الحقول `advanced` تُلفّ
   بـ `<AdvancedOnly>`. **لا استعلام خاص، لا `useState` مستقل للحقل، لا
   `supabase.update` مباشر** — الحفظ الموحد فقط.
4. **الاختبار**: `npx vitest run tests/settings-registry-parity.test.ts`
   يجب أن يمر (يقرأ الأعمدة من `types.ts` ويتحقق أن كل عمود مسجّل مرة
   واحدة بالضبط). أضف الحقل أيضاً لقالب النشاط في
   `src/lib/brand-templates/` إن كان له افتراضي يعتمد على النشاط.

## نموذج الحفظ الموحد — القواعد

- `useBrandSettingsForm(brandId)` هو المصدر الوحيد لحالة الإعدادات.
- `save()` = `diff(initial, current)` ثم تحديث واحد لـ `business_settings`
  وواحد لـ `brands`. لا ترسل أعمدة لم تتغير.
- المجموعات ذات منطق خاص (`shipping_zones`, `hero_media`, `trust_badges`)
  تسجّل `beforeSave/afterSave` hooks بدل استعلامات مستقلة.
- الاستثناء الوحيد المسموح بحفظ مستقل: `StoreProfileCard` (تغيير النشاط —
  عملية متعددة الخطوات بتأكيد) و`BranchesCard` (جدول مختلف). أي استثناء
  جديد يحتاج ذكره في `registry.ts` بـ `selfSaving: true` وسبباً في الـ PR.

## ممنوعات صريحة

- **حقل في مكانين**: لو احتجت إظهار القيمة في سياق آخر، اعرضها للقراءة مع
  رابط `?tab=&group=` إلى موضعها الأصلي.
- **localStorage لبيانات الإعدادات**: مسموح فقط لتفضيلات العرض
  (`boutq_settings_level`, البانرات المغلقة). القيم التي تُعرض في المتجر
  تأتي من DB حصراً.
- **كاتبان لنفس العمود** (مثل `logo_size` سابقاً). الحارس لا يكتشف هذا
  آلياً — راجع `grep -rn "<key>" src/features/settings/tabs` قبل الدمج.
- **تسميات تقنية** في الـ label: "storefront_accent_color" ❌ →
  "لون العلامة" ✅. راجع `rtl-arabic-consistency`.
- **إخفاء حقل نهائياً**: المستوى `advanced` يؤخّر الظهور ولا يلغيه.

## نموذج الألوان والخطوط (قرار مالك — لا يُعاد فتحه)

- `business_settings.storefront_accent_color` = لون العلامة الوحيد الذي
  يعدّله المستخدم.
- `brands.primary_color` مشتق آلياً (trigger `sync_brand_primary_color`).
- `business_settings.primary_color` (الفاتورة) يرث عندما
  `invoice_inherit_brand_color = true`.
- الخطوط: `storefront_typography` مصدر الحقيقة؛ الفاتورة ترث عندما
  `invoice_inherit_brand_font = true`.

## قائمة تحقق قبل الـ PR

- [ ] اختبار التكافؤ يمر.
- [ ] الحقل يظهر في مكان واحد فقط في الواجهة (بحثت عن اسمه في `tabs/**`).
- [ ] البحث في الإعدادات يجد الحقل (الفهرس مولّد من السجل).
- [ ] غيّرت القيمة، حفظت، أعدت التحميل، تحققت في DB وفي `/{slug}`.
- [ ] براند قديم (بيورا) يفتح الصفحة ويحفظ بدون تعديل ⇒ لا فرق في DB
      سوى `updated_at`.
