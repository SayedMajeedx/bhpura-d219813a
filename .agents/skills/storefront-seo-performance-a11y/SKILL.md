---
name: storefront-seo-performance-a11y
description: >
  استخدم هذا الـ skill إجبارياً عند أي تغيير يمس ما تراه محركات البحث أو
  أدوات القياس في متاجر البراندات: `head()` في `src/routes/$slug.*.tsx`،
  الـ Structured Data (JSON-LD)، وسوم OG/Twitter، `manifest`، الصور
  والفيديو (`ResponsiveImage`/`OptimizedVideo`)، تحميل الخطوط، أو أي
  إضافة JS/CSS للستور فرونت. يحدد ميزانية الأداء الملزمة، صيغة كل نوع
  JSON-LD، متطلبات الوصول WCAG 2.2 AA، وطريقة القياس (Lighthouse +
  Playwright audits) التي يجب لصق نتائجها في كل PR.
---

# SEO + الأداء + الوصول للستور فرونت

## متى تستخدم هذا الـ skill

- تعديل `head()` أو أي `<meta>`/`<link>` في صفحات `/{slug}/**`.
- إضافة/تعديل صور، فيديو، خطوط، أو أي حزمة JS تُحمَّل في المتجر.
- إضافة صفحة عامة جديدة للمتجر.
- قبل فتح أي PR يمس واجهات الستور فرونت (مثل خطة `docs/archive/storefront-2-premium-upgrade-plan.md` أو وثيقة `docs/storefront-architecture.md`).

## ميزانية الأداء (ملزمة — Lighthouse mobile على `/pura`)

| المقياس         | الحد                                                   |
| --------------- | ------------------------------------------------------ |
| LCP             | ≤ 2.5s                                                 |
| CLS             | ≤ 0.05                                                 |
| TBT             | ≤ 200ms                                                |
| Performance     | ≥ 85                                                   |
| SEO / a11y / BP | ≥ 95 لكل منها                                          |
| JS الرئيسية     | لا زيادة في الطبقة 1؛ ≤ +25KB gz للطبقتين 2+3 مجتمعتين |
| تبعيات جديدة    | صفر للحركة/الكاروسيل/الزووم/اللوحة                     |

القياس: `npx lighthouse https://<preview>/pura --preset=perf --form-factor=mobile --output=json` (أو Chrome DevTools) — الصق الأرقام قبل/بعد في وصف الـ PR. الاختبارات الموجودة `tests/navigation-perf.spec.ts` و`tests/storefront-performance-guardrails.test.ts` لا تُضعَّف.

## الصور والفيديو

- الصور عبر `ResponsiveImage` مع `preset` مناسب و`sizes` صحيح؛ لا `<img>`
  خام في الستور فرونت.
- صورة الهيرو/LCP: `fetchpriority="high"` وبدون `loading="lazy"`؛ كل ما
  تحت الطية `lazy`.
- الفيديو: `poster` إلزامي، `preload="metadata"`, `muted playsInline`,
  إيقاف خارج الشاشة. لا autoplay بدون poster.
- `alt` ذو معنى (اسم المنتج + اللون) أو `alt=""` + `aria-hidden` للديكور.
- OG image: 1200×630 JPG/PNG (preset `og`)، ليس SVG.

## الخطوط

- `font-display: swap`، `preconnect` موجود لـ Google Fonts/الميديا.
- `<link rel="preload" as="font">` لخط الـ display المستخدم فعلاً فقط
  (subset عربي/لاتيني). لا تحميل لكل `FONT_LIBRARY`.
- خطان (display + body) × لغتان كحد أقصى في الصفحة.

## Structured Data (JSON-LD) — `src/lib/seo/structured-data.ts`

مولّدات نقية مختبَرة (`tests/structured-data.test.ts`)، تُحقن عبر `head()`:

| الصفحة     | الأنواع                                                                                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| كل الصفحات | `Organization` (name, logo, url, sameAs من `socials`, contactPoint من `whatsapp/phone`)، `WebSite` مع `SearchAction` إلى `/{slug}/search?q={search_term_string}`   |
| المنتج     | `Product` (name, image[], description, sku/variant id, brand, `offers`: `Offer` بـ price/priceCurrency/availability `InStock`/`OutOfStock`/url) + `BreadcrumbList` |
| القسم      | `CollectionPage` + `BreadcrumbList` + `ItemList` (أول 12 منتجاً)                                                                                                   |
| الصفحات    | `WebPage`                                                                                                                                                          |

قواعد: لا حقل فارغ (احذف المفتاح بدل `""`)، الأسعار أرقام لا نصوص،
العملة ISO (`BHD`)، الروابط مطلقة (`https://boutq.store/{slug}/…` أو
`custom_domain` إن وُجد). تحقق بـ Rich Results Test قبل الدمج.

## Head لكل صفحة

- `<title>` فريد ≤ 60 حرفاً: المنتج `اسم المنتج | اسم البراند`؛ القسم
  `اسم القسم | اسم البراند`؛ الرئيسية من `meta_title` أو الاسم.
- `meta description` ≤ 155 حرفاً من `meta_description`/الوصف.
- `canonical` مطلق بدون query. `hreflang` `ar`/`en` عند توفر اللغتين.
- `theme-color` من `storefront_accent_color`. `<link rel="manifest">` إلى
  `/{slug}/manifest.webmanifest`.
- OG/Twitter: title, description, image (1200×630), type (`product` للمنتج).

## الوصول WCAG 2.2 AA

- تسلسل عناوين صحيح، H1 واحد. Landmarks: `header/nav/main/footer`.
- كل عنصر تفاعلي: `<button>`/`<a>` حقيقي، `aria-label` للأيقونات، focus
  مرئي (`focus-visible:ring`)، لمس ≥ 44px.
- الكاروسيل/الأكورديون/الفلاتر/المودال: لوحة مفاتيح كاملة، `aria-expanded`،
  `aria-controls`، إغلاق بـ Esc، حبس التركيز في المودال (`<dialog>` الأصلي مفضّل).
- التباين ≥ 4.5:1 للنص، ≥ 3:1 للعناصر — استخدم `contrastRatio` من
  `src/lib/logo-palette.ts` في الاختبارات.
- `prefers-reduced-motion` محترم في كل حركة.
- اللغة: `<html lang="ar" dir="rtl">` أو `en/ltr` حسب الكوكي (SSR موجود).

## قائمة تحقق قبل الـ PR

- [ ] Lighthouse mobile قبل/بعد ملصوق في الـ PR ويحقق الميزانية.
- [ ] Rich Results Test أخضر لصفحة منتج وصفحة قسم.
- [ ] `tests/structured-data.test.ts` + Playwright audits تمر.
- [ ] مشاركة رابط منتج في واتساب تعطي صورة المنتج والعنوان.
- [ ] Add to Home Screen يعمل (iOS Safari + Android Chrome) بالأيقونة واللون.
- [ ] فحص لوحة مفاتيح كامل للرئيسية وصفحة المنتج (Tab من البداية للنهاية).
