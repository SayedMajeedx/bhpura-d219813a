import type { AddonId, Bilingual } from "./addon-types";

export type AddonKeyFeature = {
  icon: string;
  title: Bilingual;
  description: Bilingual;
};

export type AddonWorkflowStep = {
  step: number;
  title: Bilingual;
  description: Bilingual;
};

export type AddonFaq = {
  q: Bilingual;
  a: Bilingual;
};

export type AddonPreviewMockup = {
  storefront: {
    title: Bilingual;
    subtitle: Bilingual;
    bullets: Bilingual[];
    tag?: Bilingual;
  };
  admin: {
    title: Bilingual;
    subtitle: Bilingual;
    bullets: Bilingual[];
    tag?: Bilingual;
  };
};

export type AddonShowcaseItem = {
  id: AddonId;
  tagline: Bilingual;
  categoryLabel: Bilingual;
  badge?: Bilingual;
  publisher: Bilingual;
  highlights: Bilingual[];
  fullOverview: Bilingual;
  keyFeatures: AddonKeyFeature[];
  workflowSteps: AddonWorkflowStep[];
  faqs: AddonFaq[];
  previewMockup: AddonPreviewMockup;
};

export const ADDON_SHOWCASE_DATA: Record<AddonId, AddonShowcaseItem> = {
  "size-guides": {
    id: "size-guides",
    tagline: {
      ar: "استوديو احترافي لإنشاء أدلة المقاسات وجداول القياس التفاعلية لتقليل المرتجعات",
      en: "Professional size guide studio and interactive measurement charts to eliminate returns",
    },
    categoryLabel: {
      ar: "تجربة المنتج والقياسات",
      en: "Product Experience & Sizing",
    },
    badge: {
      ar: "الأكثر طلباً",
      en: "Most Popular",
    },
    publisher: {
      ar: "فريق Boutq المعتمد",
      en: "Boutq Official Studio",
    },
    highlights: [
      {
        ar: "تقليل معدل استفسارات المقاسات والمرتجعات بأكثر من 45%",
        en: "Reduces sizing inquiries and return rates by over 45%",
      },
      {
        ar: "قوالب قياس جاهزة للعبايات، الفساتين، الأحذية، والخواتم",
        en: "Ready-to-use templates for abayas, dresses, shoes, and rings",
      },
      {
        ar: "نافذة تفاعلية منبثقة بلمسة زر واحدة في صفحة المنتج",
        en: "One-click interactive modal on storefront product pages",
      },
    ],
    fullOverview: {
      ar: "تعد الحيرة في اختيار المقاس المناسب السبب الأول وراء تردد العملاء في الشراء وتراجع معدل التحويل، بالإضافة لكونها المسبب الرئيسي للمرتجعات وتكاليف الشحن العكسي. تمنحك إضافة 'أدلة المقاسات' استوديو متكامل في لوحة التحكم لبناء وتخصيص جداول القياس بالسنتيمتر والإنش مع توضيح طريقة أخذ القياس لكل قطعة، وربط كل دليل بالمنتجات المناسبة له بضغطة زر واحدة.",
      en: "Uncertainty around sizing is the primary reason customers hesitate to complete purchases and the leading cause of costly returns. The Size Guides add-on gives you a complete studio inside your admin dashboard to create and customize measurement charts in centimeters or inches with visual measuring tips, linking each guide to relevant products instantly.",
    },
    keyFeatures: [
      {
        icon: "Ruler",
        title: {
          ar: "استوديو جداول القياس المرن",
          en: "Flexible Chart Studio",
        },
        description: {
          ar: "أنشئ جداول قياس غير محدودة تشمل الصدر، الخصر، الطول، الأكمام وغيرها مع إمكانية التبديل بين وحدات القياس (سم / إنش).",
          en: "Create unlimited measurement charts including bust, waist, length, sleeves with automatic cm/inch switching.",
        },
      },
      {
        icon: "Layers",
        title: {
          ar: "قوالب خليجية وعالمية جاهزة",
          en: "Prebuilt GCC & Global Templates",
        },
        description: {
          ar: "قوالب معتمدة مسبقاً لمقاسات العبايات الخليجية (50 إلى 62)، والملابس النسائية والرجالية والأحذية ومقاسات الخواتم.",
          en: "Pre-configured templates for GCC abayas (50-62), women's/men's apparel, shoes, and ring sizes.",
        },
      },
      {
        icon: "Sparkles",
        title: {
          ar: "زر منبثق أنيق في صفحة المنتج",
          en: "Sleek Storefront Modal Button",
        },
        description: {
          ar: "يظهر زر 'دليل المقاسات' تلقائياً بجانب خيارات المقاس للعميل دون الحاجة لتعديل كود أو قوالب المتجر.",
          en: "A neat 'Size Guide' button automatically embeds next to variant selectors on your storefront.",
        },
      },
      {
        icon: "HelpCircle",
        title: {
          ar: "دليل إرشادي لكيفية أخذ القياس",
          en: "Visual Measuring Instructions",
        },
        description: {
          ar: "نصائح وإرشادات توضيحية ترشد المشتري لكيفية استخدام شريط القياس لضمان المقاس المثالي من أول تجربة.",
          en: "Helpful diagrams and instructions guiding shoppers on how to accurately measure themselves.",
        },
      },
    ],
    workflowSteps: [
      {
        step: 1,
        title: { ar: "تثبيت وتفعيل الإضافة", en: "Install & Activate" },
        description: {
          ar: "بمجرد التثبيت، تُضاف مساحة 'أدلة المقاسات' في لوحة التحكم وتتاح فتحات العرض بصفحات المتجر.",
          en: "Once installed, the Size Guides studio appears in your admin and storefront slots are enabled.",
        },
      },
      {
        step: 2,
        title: { ar: "إنشاء أو اختيار قالب القياس", en: "Create or Select a Template" },
        description: {
          ar: "اختر قالباً جاهزاً أو أنشئ جدولاً مخصصاً يطابق خياطة قطعك وحدد المقاسات والأبعاد.",
          en: "Choose a ready preset or build custom charts tailored to your garments and cuts.",
        },
      },
      {
        step: 3,
        title: { ar: "ربط الدليل بالمنتجات", en: "Link Guide to Products" },
        description: {
          ar: "حدد المنتجات أو الأقسام المرتبطة ليعرض الدليل فوراً للعملاء مع زر القياس التفاعلي في المتجر.",
          en: "Assign the guide to products or categories to go live immediately on product pages.",
        },
      },
    ],
    faqs: [
      {
        q: {
          ar: "هل يظهر دليل المقاسات في جميع المنتجات أم المنتجات المحددة فقط؟",
          en: "Does the size guide appear on all products or only selected ones?",
        },
        a: {
          ar: "يمكنك تعيين دليل مقاسات عام للمتجر، أو تخصيص دليل منفصل لكل منتج أو فئة (مثلاً دليل للعبايات ودليل للفساتين).",
          en: "You can set a default guide for the whole store or assign specific guides to individual products and categories.",
        },
      },
      {
        q: {
          ar: "هل يمكن للعميل التبديل بين السنتيمتر والإنش؟",
          en: "Can customers toggle between cm and inches?",
        },
        a: {
          ar: "نعم، تتضمن نافذة الدليل زر تحويل فوري يُظهر الأبعاد بوحدة القياس المفضلة للعميل.",
          en: "Yes, the popup includes an instant unit toggle letting shoppers switch between cm and inches effortlessly.",
        },
      },
    ],
    previewMockup: {
      storefront: {
        title: { ar: "نافذة منبثقة تفاعلية في صفحة المنتج", en: "Interactive Product Page Modal" },
        subtitle: {
          ar: "تظهر بسلاسة عند نقر العميل على زر 'دليل المقاسات' بجانب خيار المقاس",
          en: "Opens smoothly when the shopper taps the Size Guide trigger beside size selectors",
        },
        bullets: [
          { ar: "جدول مرتب للمقاسات والأبعاد بالسنتيمتر", en: "Clean measurement matrix in cm" },
          { ar: "نصائح وإرشادات القياس الصحيح", en: "Accurate self-measuring guidance" },
          {
            ar: "متوافق 100% مع شاشات الجوال والكمبيوتر",
            en: "100% responsive on mobile and desktop",
          },
        ],
        tag: { ar: "واجهة المتجر", en: "Storefront" },
      },
      admin: {
        title: { ar: "استوديو أدلة المقاسات بلوحة التحكم", en: "Admin Size Guide Studio" },
        subtitle: {
          ar: "مساحة متكاملة لإضافة الجداول، تعديل الأرقام، وربطها بالمنتجات بمرونة",
          en: "A comprehensive studio to add tables, edit dimensions, and link to products",
        },
        bullets: [
          { ar: "قوالب خليجية جاهزة بنقرة زر", en: "Ready GCC presets in one click" },
          {
            ar: "إمكانية إضافة أعمدة وصفوف قياس مخصصة",
            en: "Add custom measurement columns and rows",
          },
          { ar: "ربط جماعي بالأقسام والمنتجات", en: "Bulk assign to categories & items" },
        ],
        tag: { ar: "لوحة التحكم", en: "Admin Panel" },
      },
    },
  },

  "fit-passport": {
    id: "fit-passport",
    tagline: {
      ar: "جواز قياس ذكي يحفظ مقاسات العميل المفضلة ويقترح المقاس الأنسب له تلقائياً",
      en: "Smart customer fit profile that remembers measurements and recommends ideal sizes",
    },
    categoryLabel: {
      ar: "تجربة العميل والتخصيص",
      en: "Customer Experience & AI",
    },
    badge: {
      ar: "تجربة عميل مميزة",
      en: "Customer Delight",
    },
    publisher: {
      ar: "فريق Boutq المعتمد",
      en: "Boutq Official Studio",
    },
    highlights: [
      {
        ar: "حفظ مقاسات العميل في حسابه لاستخدامها في كل طلب مستقبلي",
        en: "Saves shopper measurements in their account for future orders",
      },
      {
        ar: "توصية ذكية تلقائية بالمقاس الأنسب بناءً على أبعاد العميل",
        en: "Automatic smart size recommendations matching shopper dimensions",
      },
      {
        ar: "لوحة خاصة بمقاسات العميل تظهر لخدمة العملاء في تفاصيل الطلب",
        en: "Dedicated fit panel visible to support and tailors in order view",
      },
    ],
    fullOverview: {
      ar: "يتيح 'جواز القياس' للعميل حفظ قياساته الدقيقة (الطول، محيط الصدر، الخصر، الورك، طول الأكمام) مرة واحدة في حسابه بالمتجر. عند تصفح أي منتج في متجرك، يقوم النظام بمقارنة أبعاد القطعة مع مقاسات العميل واقتراح المقاس المثالي له مع وسم 'مقاسك الموصى به: L'، مما يزيل أي تردد ويصنع تجربة تسوق شخصية فاخرة.",
      en: "Fit Passport allows shoppers to store their exact measurements (height, bust, waist, hips, sleeve length) once in their store account. While browsing products, the system automatically compares garment dimensions with their passport to highlight their ideal fit ('Recommended size: L'), creating a personalized luxury boutique experience.",
    },
    keyFeatures: [
      {
        icon: "UserCheck",
        title: { ar: "ملف مقاسات العميل الدائم", en: "Persistent Customer Fit Profile" },
        description: {
          ar: "تبويب خاص داخل حساب العميل في المتجر لإدخال وتحديث مقاساته في أي وقت.",
          en: "A dedicated tab inside the shopper's store account to save and update measurements.",
        },
      },
      {
        icon: "Sparkles",
        title: { ar: "محرك الاقتراح الذكي للمقاس", en: "Smart Size Match Engine" },
        description: {
          ar: "اقتراح تلقائي لأقرب مقاس مناسب في صفحة المنتج مع شارة واضحة تشجع على الشراء فوراً.",
          en: "Auto-suggests the closest matching size on product pages with reassuring trust badge.",
        },
      },
      {
        icon: "FileText",
        title: { ar: "بطاقة قياسات مدمجة ببيانات الطلب", en: "Embedded Order Fit Card" },
        description: {
          ar: "تظهر أبعاد العميل لفريق العمل والخياطين مباشرة داخل صفحة تفاصيل الطلب لتفادي أي أخطاء.",
          en: "Customer fit specs appear directly on admin order screens for tailors and fulfillment.",
        },
      },
      {
        icon: "Heart",
        title: { ar: "رفع ولاء العملاء وتكرار الشراء", en: "Boosts Repeat Purchases" },
        description: {
          ar: "العميل الذي يحفظ مقاساته في متجرك يعود للشراء مراراً بثقة وسهولة متناهية.",
          en: "Customers who save their fit passport return frequently to buy with zero friction.",
        },
      },
    ],
    workflowSteps: [
      {
        step: 1,
        title: { ar: "تفعيل ميزة جواز القياس", en: "Enable Fit Passport" },
        description: {
          ar: "تفعيل الإضافة يتيح قسم القياسات في حسابات العملاء وشارات التوصية في المتجر.",
          en: "Enabling adds the fit tab in customer profiles and smart size matching on storefront.",
        },
      },
      {
        step: 2,
        title: { ar: "إدخال العميل لقياساته", en: "Customer Enters Fit Specs" },
        description: {
          ar: "يقوم العميل بإدخال قياساته مرة واحدة عبر واجهة بسيطة وموجهة في حسابه بالمتجر.",
          en: "The shopper inputs their body measurements once through a guided interface.",
        },
      },
      {
        step: 3,
        title: { ar: "توصية تلقائية وتنفيذ دقيق", en: "Auto Match & Precision Fulfillment" },
        description: {
          ar: "يظهر المقاس الموصى به تلقائياً للعميل، وتصل أبعاده مع الطلب لفريق التجهيز والإنتاج.",
          en: "Recommended sizes glow on products, and fit dimensions accompany the order automatically.",
        },
      },
    ],
    faqs: [
      {
        q: {
          ar: "هل يمكن للزوار غير المسجلين استخدام جواز القياس؟",
          en: "Can guest visitors use Fit Passport?",
        },
        a: {
          ar: "يمكن للزائر إدخال قياساته وتجربة الاقتراح، ويشجعه النظام على إنشاء حساب أو تسجيل الدخول لحفظها بشكل دائم.",
          en: "Guest shoppers can input dimensions to see their match, and are gently prompted to register to save it.",
        },
      },
      {
        q: {
          ar: "هل يتطلب جواز القياس وجود أدلة مقاسات للمنتجات؟",
          en: "Does Fit Passport require Size Guides to be installed?",
        },
        a: {
          ar: "يُفضّل تثبيت إضافة 'أدلة المقاسات' لتتمكن الخوارزمية من مقارنة أبعاد العميل بأبعاد القطعة بدقة متناهية.",
          en: "It is strongly recommended to pair with Size Guides for high-precision automatic matching.",
        },
      },
    ],
    previewMockup: {
      storefront: {
        title: { ar: "شارة التوصية الذكية بصفحة المنتج", en: "Smart Recommendation Badge" },
        subtitle: {
          ar: "توضح للعميل مقاسه المثالي فور فتح الصفحة استناداً لقياساته المحفوظة",
          en: "Highlights the customer's ideal fit instantly based on their saved passport",
        },
        bullets: [
          {
            ar: "شارة: 'مقاسك الموصى به: M' مع درجة المطابقة",
            en: "Badge: 'Your recommended fit: M'",
          },
          { ar: "زر تعديل المقاسات مباشرة", en: "Quick-edit passport button" },
          { ar: "تبويب متكامل داخل حساب العميل", en: "Dedicated tab in store account" },
        ],
        tag: { ar: "واجهة المتجر", en: "Storefront" },
      },
      admin: {
        title: { ar: "بطاقة القياسات في تفاصيل الطلب", en: "Order View Fit Card" },
        subtitle: {
          ar: "عرض فوري لأبعاد العميل الدقيقة المسجلة في جواز قياسه لتفصيل دقيق",
          en: "Instant view of the shopper's dimensions for tailoring and quality checks",
        },
        bullets: [
          { ar: "أبعاد الطول، الصدر، الخصر والأكمام", en: "Height, bust, waist, and sleeve specs" },
          { ar: "ملاحظات وتفضيلات القياس للعميل", en: "Customer fitting notes & preferences" },
          { ar: "ربط مباشر بملف العميل في الـ CRM", en: "Direct link to customer CRM profile" },
        ],
        tag: { ar: "لوحة التحكم", en: "Admin Panel" },
      },
    },
  },

  "made-to-order": {
    id: "made-to-order",
    tagline: {
      ar: "إدارة متكاملة لطلبات التفصيل المسبق، قياسات العميل المخصصة، ومراحل الورشة والخياطة",
      en: "Full custom tailoring workflow, bespoke customer measurements, and workshop tracking",
    },
    categoryLabel: {
      ar: "التفصيل والعمليات",
      en: "Tailoring & Workshop Ops",
    },
    badge: {
      ar: "موصى به للعبايات والأزياء",
      en: "Boutique Essential",
    },
    publisher: {
      ar: "فريق Boutq المعتمد",
      en: "Boutq Official Studio",
    },
    highlights: [
      {
        ar: "تبديل بين القطع الجاهزة والقطع المصنوعة حسب الطلب مع مهلة إنجاز مخصصة",
        en: "Toggle ready-to-wear vs bespoke with customizable production lead times",
      },
      {
        ar: "حقول قياسات وتخصيص إضافية يملؤها العميل عند الطلب (طول، تعديل قصة، تطريز)",
        en: "Bespoke fields filled by customer (length, adjustments, embroidery)",
      },
      {
        ar: "تتبع مراحل الإنتاج خطوة بخطوة: قيد القص، الخياطة، الكي، والتغليف",
        en: "Track production stages: Cutting, Stitching, Pressing, and Packaging",
      },
    ],
    fullOverview: {
      ar: "تحتاج متاجر الأزياء الراقية والعبايات والقطع المصممة حسب الطلب إلى نظام تشغيل يتجاوز نموذج 'المخزون الجاهز للشحن'. توفر إضافة 'الطلب المسبق والتفصيل' محركاً كاملاً يسمح للعميل بتحديد رغباته الدقيقة (المقاس بالإنش، رغبة إضافة طقطق، تعديل الأكمام، الاسم للتطريز) مع إظهار مهلة التفصيل المتوقعة (مثلاً: 7-10 أيام عمل)، ونقل الطلب تلقائياً لخط إنتاج الورشة لتتبع إنجازه بدقة.",
      en: "Bespoke fashion houses, abaya boutiques, and atelier brands require operational workflows far beyond standard ready-to-ship inventory. Made-to-Order equips your boutique with a tailored ordering flow where customers specify bespoke details (exact length in inches, snap buttons, sleeve modifications, custom monogramming) with clear estimated production timelines (e.g. 7-10 business days), flowing directly into workshop kanban stages.",
    },
    keyFeatures: [
      {
        icon: "Scissors",
        title: {
          ar: "خيارات التفصيل المخصصة في صفحة المنتج",
          en: "Bespoke Fields on Product Page",
        },
        description: {
          ar: "حقول مخصصة تظهر للعميل مثل: اختيار مقاس مخصص، طلب تعديلات معينة، أو كتابة اسم للتطريز.",
          en: "Custom input fields on product pages: custom dimensions, alteration notes, or custom embroidery text.",
        },
      },
      {
        icon: "Clock",
        title: { ar: "إدارة مهلة التنفيذ والتفصيل", en: "Production Lead Time Display" },
        description: {
          ar: "عرض مدة التفصيل المتوقعة بوضوح للعميل قبل إتمام الطلب لتفادي أي استفسارات أو شكاوى.",
          en: "Transparent display of expected tailoring turnaround time before checkout.",
        },
      },
      {
        icon: "CheckSquare",
        title: { ar: "مراحل الورشة وتتبع الطلب", en: "Workshop Production Pipeline" },
        description: {
          ar: "تحديث حالة القطعة بالورشة: قيد القص ← قيد الخياطة والتطريز ← الجودة والكي ← جاهز للتسليم.",
          en: "Update order workshop progress: Cutting → Stitching & Embroidery → Pressing → Ready.",
        },
      },
      {
        icon: "Printer",
        title: { ar: "أمر تشغيل الورشة المطبوع", en: "Printable Atelier Job Sheet" },
        description: {
          ar: "طباعة كارت تشغيل مخصص للقطعة بالورشة يحتوي على كافة تفاصيل قياسات وملاحظات العميل.",
          en: "Generate printable job cards for workshop tailors containing customer measurements.",
        },
      },
    ],
    workflowSteps: [
      {
        step: 1,
        title: { ar: "تفعيل نمط التفصيل للمنتج", en: "Enable Tailoring Mode" },
        description: {
          ar: "حدد المنتجات المتاحة للتفصيل أو حسب الطلب وحدد مهلة الإنجاز والأبعاد المطلوبة.",
          en: "Designate products as made-to-order, setting production days and custom measurement inputs.",
        },
      },
      {
        step: 2,
        title: { ar: "اختيار وتخصيص العميل للقطعة", en: "Customer Customizes Garment" },
        description: {
          ar: "يقوم المشتري بإدخال قياساته المخصصة أو تعديلاته بوضوح قبل إضافة القطعة للسلة.",
          en: "Shoppers fill their bespoke requirements directly on the product page before checkout.",
        },
      },
      {
        step: 3,
        title: { ar: "تشغيل ومتابعة مراحل الورشة", en: "Workshop Execution & Tracking" },
        description: {
          ar: "يصل الطلب مزوداً بكارت تشغيل الخياط وتتحدث مراحل الإنتاج حتى التسليم والشحن.",
          en: "Order arrives with a tailor job sheet, updating production milestones smoothly until dispatch.",
        },
      },
    ],
    faqs: [
      {
        q: {
          ar: "هل يمكن فرض رسوم إضافية على خيارات التفصيل الخاصة؟",
          en: "Can I charge extra fees for custom alterations?",
        },
        a: {
          ar: "نعم، يمكنك تخصيص رسوم إضافية لخيارات محددة (مثل إضافة طقطق أو تطريز يدوي فاخر).",
          en: "Yes, you can configure additional fees for specific customization options such as embroidery.",
        },
      },
      {
        q: {
          ar: "هل تصل تفاصيل التفصيل لشركة الشحن أو الفاتورة؟",
          en: "Do custom tailoring notes appear on the customer invoice?",
        },
        a: {
          ar: "تظهر ملاحظات التفصيل في الفاتورة المطبوعة وفي لوحة التحكم لتكون مرجعاً دائماً وموثقاً.",
          en: "Tailoring notes are preserved on the invoice and order management views for full auditability.",
        },
      },
    ],
    previewMockup: {
      storefront: {
        title: { ar: "خيارات التفصيل بصفحة المنتج", en: "Tailoring Options on Product Page" },
        subtitle: {
          ar: "حقول تفاعلية لاختيار طول العباية المخصص وتفضيلات الأزرار والأكمام",
          en: "Interactive inputs for custom abaya length, button types, and alterations",
        },
        bullets: [
          {
            ar: "خيار: تفصيل مخصص / جاهز للشحن الفوري",
            en: "Toggle: Bespoke tailoring vs ready to ship",
          },
          { ar: "حقل الطول بالإنش وتفضيلات القصة", en: "Length in inches and cut preferences" },
          {
            ar: "عرض مهلة الإنجاز: 'يستغرق التفصيل 5-7 أيام'",
            en: "Turnaround notice: 'Tailoring takes 5-7 days'",
          },
        ],
        tag: { ar: "واجهة المتجر", en: "Storefront" },
      },
      admin: {
        title: { ar: "مراحل الورشة في تفاصيل الطلب", en: "Workshop Tracker in Order View" },
        subtitle: {
          ar: "متابعة مسار القطعة مع إمكانية طباعة أمر التشغيل للخياطين بنقرة زر",
          en: "Follow tailoring progress and print atelier job cards for seamstresses in one click",
        },
        bullets: [
          {
            ar: "شريط مراحل: القص ← الخياطة ← التجهيز",
            en: "Milestone bar: Cut → Stitch → Quality Check",
          },
          {
            ar: "عرض مواصفات القياسات الدقيقة للقطعة",
            en: "Exact garment specifications overview",
          },
          { ar: "زر طباعة بطاقة الخياط للورشة", en: "Print tailor workshop job card button" },
        ],
        tag: { ar: "لوحة التحكم", en: "Admin Panel" },
      },
    },
  },

  "abaya-pack": {
    id: "abaya-pack",
    tagline: {
      ar: "الحزمة الخليجية المتكاملة لمتاجر العبايات والجلابيات مع مصطلحات متخصصة وقوالب مقاسات",
      en: "The definitive GCC pack for abaya and jalabiya boutiques with industry terms and sizes",
    },
    categoryLabel: {
      ar: "حزمة نشاط متخصصة",
      en: "Vertical Business Pack",
    },
    badge: {
      ar: "حزمة شاملة",
      en: "Complete Pack",
    },
    publisher: {
      ar: "فريق Boutq المعتمد",
      en: "Boutq Official Studio",
    },
    highlights: [
      {
        ar: "قوالب المقاسات الخليجية المعتمدة (50، 52، 54، 56، 58، 60، 62)",
        en: "Standard GCC abaya sizes (50, 52, 54, 56, 58, 60, 62) ready out of the box",
      },
      {
        ar: "مصطلحات قطاع العبايات في المتجر (الطرحة، القماش، القصة، الإغلاق)",
        en: "Boutique industry vocabulary: Sheila, Fabric, Cut, Closure types",
      },
      {
        ar: "أدوات مدمجة للتفصيل حسب الطلب، أدلة المقاسات، وإرشادات العناية بالحرير والكتان",
        en: "Bundled made-to-order, size guides, and specialized fabric care advice",
      },
    ],
    fullOverview: {
      ar: "صُممت هذه الحزمة المتكاملة خصيصاً لمتاجر وبراندات العبايات في الخليج لتختصر أسابيع من إعداد المتجر وتجهيز البيانات. بنقرة واحدة، تُفعّل الحزمة نظام المقاسات المعتمد في الخليج (50-62)، وتُضبط مصطلحات المتجر لتناسب ثقافة العميل (مثل استبدال 'الألوان' بـ 'نوع القماش' أو خيارات 'الطرحة المرفقة')، بالإضافة إلى قوالب جاهزة لأدلة المقاسات ومهل التفصيل.",
      en: "Engineered specifically for abaya and modest fashion houses across the GCC, this pack eliminates weeks of manual setup. In a single click, it configures standard Gulf sizing (50-62), adapts storefront vocabulary to authentic terminology (Sheilas, crepe/linen fabrics, cuts, buttons), and unlocks tailored made-to-order workflows.",
    },
    keyFeatures: [
      {
        icon: "Layers",
        title: { ar: "سلم المقاسات الخليجي القياسي", en: "Standard Gulf Abaya Sizing" },
        description: {
          ar: "تعبئة تلقائية لمقاسات العبايات من 50 إلى 62 بالسنتيمتر والإنش مع جدول قياس معتمد.",
          en: "Auto-fills standard abaya measurements from 50 to 62 with verified dimensional guides.",
        },
      },
      {
        icon: "Sparkles",
        title: { ar: "تخصيص خيارات الطرحة والأقمشة", en: "Sheila & Fabric Customization" },
        description: {
          ar: "محاور مخصصة للمنتج مثل: طرحة سادة / مطرزة، قماش كريب إنترنت، كريب ملكي، كتان، وغيرها.",
          en: "Custom product variant axes: plain/embroidered sheila, internet crepe, royal crepe, linen.",
        },
      },
      {
        icon: "BookOpen",
        title: { ar: "إرشادات الغسيل والعناية بالعباية", en: "Abaya Fabric Care Instructions" },
        description: {
          ar: "بطاقة تعليمات تلقائية تظهر للعميلة في صفحة المنتج لحماية الأقمشة الحساسة والشك اليدوي.",
          en: "Automatic care and laundering advice on product pages protecting delicate handwork.",
        },
      },
      {
        icon: "TrendingUp",
        title: { ar: "جاهزية فورية لمتجر فاخر", en: "Instant Luxury Boutique Readiness" },
        description: {
          ar: "تحويل المتجر فوراً إلى تجربة بوتيك خليجي فاخرة ومألوفة للعميلات في السعودية والخليج.",
          en: "Transforms your store into a prestigious GCC boutique familiar to discerning shoppers.",
        },
      },
    ],
    workflowSteps: [
      {
        step: 1,
        title: { ar: "تثبيت حزمة العبايات بنقرة واحدة", en: "One-Click Installation" },
        description: {
          ar: "يقوم النظام بتهيئة المتجر وإعداد جداول المقاسات والمصطلحات الخليجية تلقائياً.",
          en: "Instantly sets up GCC abaya sizing charts, terminology, and product presets.",
        },
      },
      {
        step: 2,
        title: { ar: "إضافة تشكيلات العبايات", en: "Add Your Collections" },
        description: {
          ar: "ستجد خيارات المقاسات والأقمشة جاهزة مسبقاً في نموذج إضافة المنتج دون كتابتها يدوياً.",
          en: "Abaya sizes and fabric options are preloaded in product editors ready for selection.",
        },
      },
      {
        step: 3,
        title: { ar: "إطلاق تجربة بوتيك متكاملة", en: "Launch Your Boutique" },
        description: {
          ar: "يتسوق العملاء بتجربة مألوفة تدعم اختيار المقاس، خيارات الطرحة، والتفصيل بدقة.",
          en: "Shoppers enjoy a native buying flow with accurate sizing, sheila options, and custom notes.",
        },
      },
    ],
    faqs: [
      {
        q: {
          ar: "هل يمكنني تعديل المقاسات المقترحة في الحزمة؟",
          en: "Can I adjust the dimensions in the prebuilt size guide?",
        },
        a: {
          ar: "نعم بالكامل، يمكنك الدخول إلى استوديو أدلة المقاسات وتعديل أي رقم ليطابق قصات متجرك الخاصة.",
          en: "Yes, you can edit every individual dimension in the Size Guide studio to match your signature cut.",
        },
      },
      {
        q: {
          ar: "هل تشمل الحزمة إضافة خيارات تفصيل مثل الطول وتعديل الأكمام؟",
          en: "Does this pack include custom tailoring options like length adjustments?",
        },
        a: {
          ar: "نعم، تتكامل الحزمة تلقائياً مع خيارات التفصيل المسبق وتوفر حقول قياس مخصصة بالكامل.",
          en: "Yes, it integrates with custom tailoring workflows, providing customizable length and sleeve fields.",
        },
      },
    ],
    previewMockup: {
      storefront: {
        title: { ar: "صفحة منتج مخصصة لمتاجر العبايات", en: "Native Abaya Product Experience" },
        subtitle: {
          ar: "خيارات واضحة للمقاسات الخليجية (52-60)، القماش، خيارات الطرحة، ودليل القياس",
          en: "Clear options for GCC sizing (52-60), fabrics, sheila pairings, and size charts",
        },
        bullets: [
          { ar: "مقاسات العباية الخليجية بنقرة واحدة", en: "Standard Gulf abaya size chips" },
          {
            ar: "تحديد خيار الطرحة وإمكانية إضافة الطقطق",
            en: "Sheila selection & snap button option",
          },
          { ar: "دليل مقاسات تفاعلي مخصص للعبايات", en: "Specialized abaya measurement guide" },
        ],
        tag: { ar: "واجهة المتجر", en: "Storefront" },
      },
      admin: {
        title: { ar: "إعدادات حزمة العبايات في لوحة التحكم", en: "Abaya Pack Admin Suite" },
        subtitle: {
          ar: "قوالب سريعة لإضافة العبايات ومتابعة طلبيات التفصيل والورشة بكل سهولة",
          en: "Quick templates to add abayas and manage tailoring workflows smoothly",
        },
        bullets: [
          { ar: "قوالب مقاسات العبايات (50 إلى 62)", en: "Abaya size presets (50 to 62)" },
          { ar: "تسميات خاصة: القماش، الطرحة، القصة", en: "Native naming: Fabric, Sheila, Cut" },
          { ar: "جاهزية تشغيل الورشة والتفصيل", en: "Atelier & workshop integration ready" },
        ],
        tag: { ar: "لوحة التحكم", en: "Admin Panel" },
      },
    },
  },

  "fashion-core": {
    id: "fashion-core",
    tagline: {
      ar: "الأساس المتين لمتاجر الأزياء والملابس: مقاسات قياسية عالمية، إدارة الألوان، ودليل الأحذية",
      en: "Essential infrastructure for fashion & apparel stores: global sizing, colors, and shoe charts",
    },
    categoryLabel: {
      ar: "حزمة نشاط متخصصة",
      en: "Vertical Business Pack",
    },
    publisher: {
      ar: "فريق Boutq المعتمد",
      en: "Boutq Official Studio",
    },
    highlights: [
      {
        ar: "مقاسات الملابس العالمية القياسية (XS, S, M, L, XL, XXL) والمقاسات الرقمية",
        en: "Global apparel sizes (XS to XXL) and numerical dress sizing preconfigured",
      },
      {
        ar: "جداول مقاسات الأحذية الرجالية والنسائية (EU / US / UK)",
        en: "Complete men's and women's footwear size conversion charts (EU / US / UK)",
      },
      {
        ar: "عرض مربعات الألوان البصرية (Color Swatches) في صفحة المنتج",
        en: "Visual color swatch pickers on storefront product pages",
      },
    ],
    fullOverview: {
      ar: "تمثل هذه الحزمة حجر الزاوية لأي براند ملابس أو أحذية أو أزياء معاصرة. توفر مقاييس موحدة ومحاور متغيرات جاهزة للمقاس واللون مع عينات ألوان مرئية (Color Swatches)، وجداول تحويل المقاسات بين الأنظمة الأوروبية والأمريكية، مما يوفر تجربة تسوق راقية ويقلل استفسارات المقاسات.",
      en: "The essential foundation for ready-to-wear fashion and footwear labels. Fashion Core introduces standardized variant dimensions for size and color swatches, plus comprehensive international conversion matrices (EU/US/UK) for garments and shoes, keeping your store aligned with world-class fashion retail standards.",
    },
    keyFeatures: [
      {
        icon: "Shirt",
        title: { ar: "مقاييس الملابس القياسية", en: "Standard Apparel Sizing" },
        description: {
          ar: "قوالب قياس جاهزة للقمصان، البناطيل، الفساتين، والبدلات مع أبعاد دقيقة.",
          en: "Ready-to-use sizing templates for tops, bottoms, dresses, and suiting.",
        },
      },
      {
        icon: "Palette",
        title: { ar: "عينات الألوان التفاعلية", en: "Visual Color Swatches" },
        description: {
          ar: "عرض دوائر ألوان بصرية حقيقية بدل النصوص الجافة لخيارات الألوان في صفحة المنتج.",
          en: "Rich visual color bubbles instead of plain dropdown text for product color options.",
        },
      },
      {
        icon: "Globe",
        title: { ar: "جداول مقاسات الأحذية والتحويل الدولي", en: "Shoe Size Conversion Matrix" },
        description: {
          ar: "تحويل تلقائي بين المقاسات الأوروبية والأمريكية والبريطانية للأحذية.",
          en: "Seamless conversion tables between EU, US, and UK shoe sizes.",
        },
      },
      {
        icon: "Tag",
        title: { ar: "تجهيز تلقائي لمحاور المتغيرات", en: "Automated Variant Structuring" },
        description: {
          ar: "ربط متقن بين خيارات المقاس واللون في إدارة المخزون بمرونة تامة.",
          en: "Intelligent linking between size and color variants in inventory management.",
        },
      },
    ],
    workflowSteps: [
      {
        step: 1,
        title: { ar: "تثبيت حزمة الأزياء", en: "Install Fashion Core" },
        description: {
          ar: "تفعيل قوالب القياسات العالمية وعينات الألوان في المتجر.",
          en: "Activates standard international sizing matrices and color swatches.",
        },
      },
      {
        step: 2,
        title: { ar: "إضافة الألوان والمقاسات للقطع", en: "Configure Colors & Sizes" },
        description: {
          ar: "اختر الألوان من اللوحة الدائرية واستخدم سلم المقاسات العالمي بنقرة واحدة.",
          en: "Pick visual swatch colors and apply standard size ladders in seconds.",
        },
      },
      {
        step: 3,
        title: { ar: "عرض تجربة تسوق أنيقة", en: "Showcase Sleek Shopping Experience" },
        description: {
          ar: "يتصفح العملاء المنتجات مع تبديل الألوان البصري ومقاسات الأحذية والملابس الواضحة.",
          en: "Customers enjoy visual color toggling and foolproof sizing charts.",
        },
      },
    ],
    faqs: [
      {
        q: {
          ar: "هل يمكنني إضافة ألوان مخصصة مع كود Hex؟",
          en: "Can I customize color swatches with hex codes?",
        },
        a: {
          ar: "نعم، يمكنك اختيار أي لون بدقة أو إدخال كود اللون ليظهر كدائرة ملونة للعميل.",
          en: "Yes, you can customize any color swatch to match your exact fabric hue.",
        },
      },
      {
        q: {
          ar: "هل تعمل الحزمة مع متاجر الأحذية فقط؟",
          en: "Does this pack work for footwear-only stores?",
        },
        a: {
          ar: "بالتأكيد، تشمل الحزمة قوالب مخصصة للأحذية الرجالية والنسائية مع جداول المقاسات الأوروبية (36-45).",
          en: "Absolutely, it includes specialized women's and men's shoe conversion charts (EU 36-45).",
        },
      },
    ],
    previewMockup: {
      storefront: {
        title: { ar: "عرض عينات الألوان ومقاسات الملابس", en: "Color Swatches & Size Selectors" },
        subtitle: {
          ar: "دوائر ملونة تفاعلية تُمكّن العميل من رؤية اللون الفعلي واختيار مقاسه بدقة",
          en: "Interactive color bubbles letting shoppers see the actual hue and choose sizes",
        },
        bullets: [
          { ar: "دوائر ألوان بصرية ناعمة", en: "Soft visual color swatches" },
          { ar: "أزرار مقاسات قياسية (XS - XXL)", en: "Standard size chips (XS - XXL)" },
          { ar: "جدول تحويل مقاسات الأحذية والملابس", en: "Shoe & apparel conversion tables" },
        ],
        tag: { ar: "واجهة المتجر", en: "Storefront" },
      },
      admin: {
        title: { ar: "إدارة تشكيلات الأزياء في اللوحة", en: "Apparel Collection Management" },
        subtitle: {
          ar: "قوالب مقاسات جاهزة وسهولة في توليد المتغيرات باللون والمقاس",
          en: "Ready-to-use sizing presets and fast variant generation by color and size",
        },
        bullets: [
          { ar: "توليد سريع للمقاسات والألوان", en: "Fast variant matrix generation" },
          { ar: "ربط مع أدلة المقاسات المعيارية", en: "Linked standard size guide matrices" },
          { ar: "تنظيم المخزون حسب اللون والقياس", en: "Stock tracking per color and size" },
        ],
        tag: { ar: "لوحة التحكم", en: "Admin Panel" },
      },
    },
  },

  "beauty-perfume": {
    id: "beauty-perfume",
    tagline: {
      ar: "حزمة متخصصة لمتاجر العطور ومستحضرات التجميل: خيارات الحجم (مل)، النوتات العطرية، والمكونات",
      en: "Dedicated pack for perfume and cosmetics boutiques: bottle volumes (ml), notes, and ingredients",
    },
    categoryLabel: {
      ar: "حزمة نشاط متخصصة",
      en: "Vertical Business Pack",
    },
    publisher: {
      ar: "فريق Boutq المعتمد",
      en: "Boutq Official Studio",
    },
    highlights: [
      {
        ar: "محاور أحجام العطور القياسية (30 مل، 50 مل، 75 مل، 100 مل، 200 مل)",
        en: "Standard fragrance bottle volume variants (30ml, 50ml, 75ml, 100ml, 200ml)",
      },
      {
        ar: "هرم النوتات العطرية (القمة، القلب، القاعدة) في صفحة المنتج",
        en: "Visual olfactory pyramid (top notes, heart notes, base notes)",
      },
      {
        ar: "إرشادات الاستخدام ومطابقة معايير هيئة الغذاء والدواء للمكونات",
        en: "Ingredient transparency and usage instructions display",
      },
    ],
    fullOverview: {
      ar: "تتطلب تجارة العطور ومستحضرات التجميل إبراز التفاصيل الحسية التي تعوض تجربة الشم المباشرة. تُمكّنك حزمة 'العطور والتجميل' من عرض الهرم العطري الكامل (النوتات العليا، الوسطى، والقاعدية) بتصميم بصري جذاب، مع توفير خيارات الحجم بالمليلتر، وبطاقات المكونات والتحذيرات لتقديم تجربة تسوق راقية تليق بدار عطور فاخرة.",
      en: "Selling fragrances online demands rich sensory storytelling to bridge the gap of physical scent sampling. Beauty & Perfume equips your store with an elegant olfactory pyramid showcasing top, heart, and base notes, alongside bottle volume variant presets (ml), concentration badges (Extrait, Eau de Parfum), and ingredient transparency panels.",
    },
    keyFeatures: [
      {
        icon: "Droplet",
        title: { ar: "الهرم العطري التفاعلي", en: "Visual Olfactory Pyramid" },
        description: {
          ar: "عرض نوتات العطر مقسمة إلى: القمة (الانطباع الأول)، القلب (جوهر العطر)، والقاعدة (الثبات).",
          en: "Structured display of fragrance notes: Top Notes, Heart/Middle, and Longevity Base.",
        },
      },
      {
        icon: "Package",
        title: { ar: "أحجام العبوات القياسية", en: "Bottle Volumes (ml)" },
        description: {
          ar: "خيارات سريعة لأحجام الزجاجات الأكثر شيوعاً: 50 مل، 100 مل، مع إمكانية إضافة عينات تجريبية.",
          en: "Volume presets (50ml, 100ml) with support for discovery sample sets.",
        },
      },
      {
        icon: "ShieldAlert",
        title: { ar: "بطاقة المكونات والتحسس", en: "Ingredients & Allergen Notes" },
        description: {
          ar: "قسم موثوق لعرض مكونات مستحضرات التجميل والعطور لراحة بال وثقة العميل.",
          en: "Dedicated transparent area displaying cosmetic formulas and allergen guidance.",
        },
      },
      {
        icon: "Sparkles",
        title: { ar: "شارة تركيز العطر وثباته", en: "Fragrance Concentration Badges" },
        description: {
          ar: "شارات بارزة لتوضيح التركيز: بارفيوم نقي (Parfum)، أو دو بارفيوم (EDP)، وتوليت (EDT).",
          en: "Clear luxury badges indicating concentration: Parfum, Eau de Parfum, Eau de Toilette.",
        },
      },
    ],
    workflowSteps: [
      {
        step: 1,
        title: { ar: "تثبيت حزمة العطور والتجميل", en: "Install Beauty & Perfume" },
        description: {
          ar: "تفعيل خيارات الأحجام بالمليلتر وأقسام النوتات والمكونات في لوحة التحكم.",
          en: "Enables volume dropdowns (ml), scent note sections, and ingredient panels.",
        },
      },
      {
        step: 2,
        title: { ar: "إدخال نوتات العطر وأحجامه", en: "Enter Notes & Volumes" },
        description: {
          ar: "أدخل مكونات القمة والقلب والقاعدة وحدد أحجام الزجاجة المتاحة للبيع.",
          en: "Input top, middle, base notes and set available bottle sizes with prices.",
        },
      },
      {
        step: 3,
        title: { ar: "عرض فاخر يجذب المقتنين", en: "Luxury Olfactory Showcase" },
        description: {
          ar: "يظهر الهرم العطري بأناقة في صفحة المنتج مع تجربة طلب راقية ومحفزة للشراء.",
          en: "The scent pyramid displays gracefully on product pages, inspiring high-value orders.",
        },
      },
    ],
    faqs: [
      {
        q: {
          ar: "هل يمكنني بيع عينات تجريبية (Discovery Samples) مع العطر؟",
          en: "Can I offer discovery sample sizes alongside full bottles?",
        },
        a: {
          ar: "نعم، يمكنك بسهولة إضافة حجم 2 مل أو 5 مل كخيار عينة تجريبية بسعر مخصص.",
          en: "Yes, you can easily offer 2ml or 5ml discovery samples as variant options.",
        },
      },
      {
        q: {
          ar: "هل تدعم الحزمة منتجات المكياج والعناية بالبشرة؟",
          en: "Does this pack support skincare and makeup products?",
        },
        a: {
          ar: "نعم، تدعم أحجام السيروم والكريمات، وتوفر بطاقات خاصة لطريقة الاستخدام ونوع البشرة.",
          en: "Yes, it supports skincare bottle sizes and includes skin-type and usage guidance tabs.",
        },
      },
    ],
    previewMockup: {
      storefront: {
        title: { ar: "الهرم العطري وخيارات الحجم", en: "Fragrance Pyramid & Bottle Volume" },
        subtitle: {
          ar: "عرض حسي غني يوضح مكونات العطر بالتفصيل مع خيارات الحجم 50 مل و 100 مل",
          en: "Sensory product layout detailing olfactory notes with 50ml and 100ml selection",
        },
        bullets: [
          { ar: "هرم النوتات: قمة، قلب، وقاعدة العطر", en: "Notes pyramid: Top, Heart, and Base" },
          {
            ar: "أزرار اختيار الحجم (50ml / 100ml)",
            en: "Volume selection buttons (50ml / 100ml)",
          },
          { ar: "شارة درجة التركيز: Eau de Parfum", en: "Concentration badge: Eau de Parfum" },
        ],
        tag: { ar: "واجهة المتجر", en: "Storefront" },
      },
      admin: {
        title: { ar: "إدارة تفاصيل العطور في لوحة التحكم", en: "Perfume Specs in Admin Panel" },
        subtitle: {
          ar: "حقول مخصصة لتدوين النوتات العطرية والمكونات والأحجام بسهولة",
          en: "Dedicated inputs for olfactory notes, ingredients, and volumes",
        },
        bullets: [
          { ar: "حقول منظمة للنوتات العطرية", en: "Structured scent note fields" },
          { ar: "قوالب أحجام العطور الجاهزة بالمليلتر", en: "Volume variant presets in ml" },
          { ar: "ملاحظات الاستخدام وإرشادات السلامة", en: "Safety & usage instructions" },
        ],
        tag: { ar: "لوحة التحكم", en: "Admin Panel" },
      },
    },
  },

  "food-beverage": {
    id: "food-beverage",
    tagline: {
      ar: "حلول متاجر الأغذية، القهوة المختصة، والحلويات: تواريخ الصلاحية، الحساسية، والاستلام من الفرع",
      en: "Solutions for specialty coffee, bakery, and gourmet food: freshness dates, allergens, and branch pickup",
    },
    categoryLabel: {
      ar: "حزمة نشاط متخصصة",
      en: "Vertical Business Pack",
    },
    publisher: {
      ar: "فريق Boutq المعتمد",
      en: "Boutq Official Studio",
    },
    highlights: [
      {
        ar: "إدارة خيارات الحصص والوزن (250 جم، 500 جم، 1 كجم، حبات، دزينة)",
        en: "Portions and weight options (250g, 500g, 1kg, box, dozen)",
      },
      {
        ar: "توضيح مسببات الحساسية (مكسرات، جلوتين، حليب، بيض) بشارات تحذيرية واضحة",
        en: "Clear allergen warning badges (nuts, gluten, dairy, eggs)",
      },
      {
        ar: "دعم خيار الاستلام المباشر من الفرع مع تحديد وقت التجهيز",
        en: "Direct branch pickup support with prep time notifications",
      },
    ],
    fullOverview: {
      ar: "تتطلب المأكولات والمشروبات والقهوة المختصة معايير دقيقة فيما يخص الصلاحية، درجات التحميص، مسببات الحساسية، والخيارات اللوجستية مثل الاستلام من الفرع أو التوصيل السريع المبرد. توفر هذه الحزمة قوالب أحجام وأوزان جاهزة، مع وسم مسببات الحساسية وفق متطلبات سلامة الغذاء، وتخصيص تجربة الاستلام.",
      en: "Specialty coffee roasters, gourmet bakeries, and artisanal foods require strict management of roast dates, batch freshness, allergen declarations, and rapid delivery options like in-store pickup. Food & Beverage provides weight presets (250g/1kg), bean grind selectors, dietary badges (Vegan, Keto, Halal), and branch collection readiness checks.",
    },
    keyFeatures: [
      {
        icon: "Coffee",
        title: { ar: "خيارات الوزن ودرجة الطحن", en: "Weight & Grind Options" },
        description: {
          ar: "خيارات جاهزة للقهوة: حبوب كاملة، طحن إسبريسو، فلتر V60، مع أوزان 250 جم و 1 كجم.",
          en: "Presets for coffee: whole bean, espresso grind, filter V60 with 250g & 1kg bags.",
        },
      },
      {
        icon: "AlertCircle",
        title: { ar: "تنبيهات مسببات الحساسية", en: "Allergen Awareness Badges" },
        description: {
          ar: "شارات بصرية واضحة تنبه المشتري لوجود المكسرات أو منتجات الألبان أو الجلوتين.",
          en: "Prominent visual badges warning shoppers of nuts, dairy, gluten, or eggs.",
        },
      },
      {
        icon: "MapPin",
        title: { ar: "الاستلام من الفرع / المقهى", en: "Store & Branch Pickup" },
        description: {
          ar: "إمكانية اختيار استلام الطلب من موقع الفرع مع تحديد وقت وتاريخ الاستلام المفضل.",
          en: "Enables customers to collect fresh orders directly from your boutique kitchen or branch.",
        },
      },
      {
        icon: "Calendar",
        title: { ar: "تاريخ الإنتاج ومدة الصلاحية", en: "Batch Freshness & Best Before" },
        description: {
          ar: "عرض تاريخ التحميص أو الإنتاج لطمأنة العميل على طزاجة وجودة المنتج الغذائي.",
          en: "Displays roast date or bake time to guarantee optimal freshness and artisan quality.",
        },
      },
    ],
    workflowSteps: [
      {
        step: 1,
        title: { ar: "تفعيل حزمة الأغذية والمشروبات", en: "Enable Food & Beverage Pack" },
        description: {
          ar: "إتاحة قوالب الأوزان وخيارات الحساسية والاستلام من الفرع.",
          en: "Enables weight presets, allergen indicators, and branch pickup features.",
        },
      },
      {
        step: 2,
        title: { ar: "إضافة المنتجات الغذائية والقهوة", en: "Add Products & Batch Specs" },
        description: {
          ar: "حدد الوزن، نوع الطحن أو الحصص، وأشر على مسببات الحساسية إن وجدت.",
          en: "Configure packaging weight, grind options, and mark dietary allergens.",
        },
      },
      {
        step: 3,
        title: { ar: "تلقي الطلبات بمرونة وسرعة", en: "Fast Order Prep & Fulfillment" },
        description: {
          ar: "تصلك الطلبات مع تفاصيل التحضير وخيار التوصيل أو الاستلام من الفرع.",
          en: "Receive orders with clear prep details for counter staff or swift courier dispatch.",
        },
      },
    ],
    faqs: [
      {
        q: {
          ar: "هل يمكنني تفعيل خيار الاستلام من الفرع لمنتجات محددة فقط؟",
          en: "Can I enable branch pickup only for specific fresh items?",
        },
        a: {
          ar: "نعم، يمكنك تخصيص خيارات الاستلام أو التوصيل حسب نوع كل منتج.",
          en: "Yes, you can configure pickup availability on a per-product or store-wide basis.",
        },
      },
      {
        q: {
          ar: "هل توفر الحزمة خيارات الحلويات مثل الدزينة ونصف الدزينة؟",
          en: "Does this pack support bakery portioning like dozen or half-dozen boxes?",
        },
        a: {
          ar: "نعم، تشمل الحزمة قوالب جاهزة لعلب الحلويات (6 حبات، 12 حبة، 24 حبة).",
          en: "Yes, it includes prebuilt portion templates for 6-pack, 12-pack (dozen), and party trays.",
        },
      },
    ],
    previewMockup: {
      storefront: {
        title: { ar: "خيارات الأوزان ودرجة الطحن للقهوة", en: "Portions, Weights & Grind Type" },
        subtitle: {
          ar: "تحديد الوزن المناسب ودرجة الطحن مع شارات مسببات الحساسية وتاريخ التحميص",
          en: "Select package weight and grind level with allergen warnings and roast dates",
        },
        bullets: [
          { ar: "خيارات أوزان القهوة (250g / 1kg)", en: "Weight selection chips (250g / 1kg)" },
          {
            ar: "اختيار درجة الطحن: حبوب كاملة أو مطحونة",
            en: "Grind preference: Whole bean or ground",
          },
          { ar: "شارة التحميص الطازج والاستلام من الفرع", en: "Freshness badge & pickup option" },
        ],
        tag: { ar: "واجهة المتجر", en: "Storefront" },
      },
      admin: {
        title: { ar: "لوحة إعدادات المأكولات والمشروبات", en: "Food Operations in Admin Panel" },
        subtitle: {
          ar: "ضبط فروع الاستلام، مسببات الحساسية، وتواريخ الصلاحية والتحميص",
          en: "Configure branch locations, allergen disclosures, and freshness dates",
        },
        bullets: [
          { ar: "إدارة فروع الاستلام المباشر", en: "Branch pickup management" },
          { ar: "تحديد مسببات الحساسية والمكونات", en: "Allergen matrix & nutritional notes" },
          { ar: "تتبع مواعيد تحضير الطلبيات", en: "Order prep scheduling" },
        ],
        tag: { ar: "لوحة التحكم", en: "Admin Panel" },
      },
    },
  },

  "digital-products": {
    id: "digital-products",
    tagline: {
      ar: "بيع الملفات، الكتب الرقمية، والوسائط مع تسليم تلقائي فوري بعد الدفع",
      en: "Sell downloadable files, ebooks, presets, and digital assets with instant delivery",
    },
    categoryLabel: {
      ar: "ميزة متخصصة",
      en: "Specialized Feature",
    },
    publisher: {
      ar: "فريق Boutq المعتمد",
      en: "Boutq Official Studio",
    },
    highlights: [
      {
        ar: "تسليم فوري للملف برابط تحميل مشفر وآمن مباشرة في صفحة الشكر وحساب العميل",
        en: "Instant encrypted download link on checkout thank you page and customer account",
      },
      {
        ar: "إعفاء المنتجات الرقمية من رسوم الشحن وعنوان التوصيل لتسهيل الدفع الفوري",
        en: "Exempts digital orders from shipping fees and physical delivery addresses",
      },
      {
        ar: "حماية الملفات وتحديد عدد مرات التحميل وصلاحية الرابط",
        en: "File download limits and link expiration security controls",
      },
    ],
    fullOverview: {
      ar: "تتيح لك إضافة 'المنتجات الرقمية' تحويل متجرك إلى منصة تبيع الدورات، القوالب، الفلاتر (Presets)، الكتب الإلكترونية، أو التصاميم. يتعرف النظام تلقائياً على المنتجات الرقمية في السلة، فيُعفي المشتري من تعبئة عنوان الشحن أو دفع رسوم التوصيل، وفور تأكيد الدفع الإلكتروني، يُسلّم العميل روابط تحميل مؤمنة فوراً مع إرسال نسخة لبريده.",
      en: "Digital Products unlocks effortless sales of downloadable assets: ebooks, Lightroom presets, planners, guides, and templates. The checkout flow automatically skips shipping address and delivery charges for digital items. Upon successful payment, buyers receive secure, time-limited download links immediately on screen and via email.",
    },
    keyFeatures: [
      {
        icon: "Download",
        title: { ar: "تسليم فوري بعد الدفع", en: "Instant Automated Fulfillment" },
        description: {
          ar: "توليد روابط تحميل آمنة وفورية تظهر للعميل في صفحة تأكيد الطلب وترسل لبريده.",
          en: "Generates secure download URLs on the order confirmation screen and email.",
        },
      },
      {
        icon: "Zap",
        title: { ar: "تخطي الشحن والرسوم تلقائياً", en: "Zero-Shipping Fast Checkout" },
        description: {
          ar: "إزالة حقول العنوان ورسوم الشحن عند شراء منتجات رقمية فقط لتسريع عملية الدفع.",
          en: "Bypasses shipping address and freight charges for a frictionless checkout.",
        },
      },
      {
        icon: "Lock",
        title: { ar: "أمان الروابط وحدود التنزيل", en: "Download Link Protection" },
        description: {
          ar: "حدد صلاحية الرابط بالزمن أو بحد أقصى لمرات التنزيل لمنع المشاركة غير المصرح بها.",
          en: "Set expiry days and maximum download counts to prevent unauthorized link sharing.",
        },
      },
      {
        icon: "FileCode",
        title: { ar: "دعم مختلف صيغ الملفات", en: "Multi-Format File Support" },
        description: {
          ar: "دعم ملفات PDF، مضغوطة ZIP، تصاميم PSD، صوتيات، وفلاتر الصور وغيرها.",
          en: "Support for PDF, ZIP archives, presets, audio files, and high-res digital art.",
        },
      },
    ],
    workflowSteps: [
      {
        step: 1,
        title: { ar: "تثبيت ميزة المنتجات الرقمية", en: "Install Digital Products" },
        description: {
          ar: "تفعيل خيار 'منتج رقمي قابل للتنزيل' في صفحة إضافة المنتجات.",
          en: "Enables digital download toggles inside the product management editor.",
        },
      },
      {
        step: 2,
        title: { ar: "رفع الملف وتحديد صلاحيات التحميل", en: "Upload File & Set Rules" },
        description: {
          ar: "ارفع الملف وحدد عدد مرات التنزيل المسموحة وصلاحية الرابط للعميل.",
          en: "Upload your asset file, setting max downloads and link expiration limits.",
        },
      },
      {
        step: 3,
        title: { ar: "بيع فوري وتسليم آلي 24/7", en: "Sell & Deliver Autonomously" },
        description: {
          ar: "يدفع العميل إلكترونياً ويحصل على ملفه فوراً دون أي تدخل يدوي منك.",
          en: "Shoppers pay online and access their files immediately with zero manual work.",
        },
      },
    ],
    faqs: [
      {
        q: {
          ar: "ماذا يحدث إذا اشترى العميل منتجاً رقمياً مع منتج فعلي في نفس الطلب؟",
          en: "What happens if a cart contains both digital and physical goods?",
        },
        a: {
          ar: "يتعامل النظام بذكاء مع الطلب: يتم شحن المنتج الفعلي بينما يُسلّم الملف الرقمي فوراً بعد الدفع.",
          en: "The system handles hybrid carts smoothly: shipping physical items while delivering digital downloads instantly.",
        },
      },
      {
        q: {
          ar: "أين يجد العميل روابط التحميل إذا أغلق الصفحة؟",
          en: "Where does the customer find download links if they close the browser tab?",
        },
        a: {
          ar: "تبقى الروابط محفوظة دائماً في تبويب 'مشترياتي الرقمية' بحسابه بالمتجر وبالإيميل.",
          en: "Downloads remain accessible in their store account under 'My Digital Downloads' and via order emails.",
        },
      },
    ],
    previewMockup: {
      storefront: {
        title: { ar: "صفحة التحميل الفوري بعد الدفع", en: "Instant Post-Checkout Download" },
        subtitle: {
          ar: "زر تنزيل فوري للملفات مع تفاصيل الحجم وصلاحية الرابط بدون خطوات شحن",
          en: "One-click download button with file size info and zero shipping steps",
        },
        bullets: [
          {
            ar: "زر: 'تحميل الملف الرقمي الآن (PDF - 12MB)'",
            en: "CTA: 'Download Your File Now (PDF - 12MB)'",
          },
          { ar: "تخطي عنوان الشحن والدفع بضغطة زر", en: "Zero-shipping instant checkout" },
          { ar: "حفظ دائم في حساب العميل بالمتجر", en: "Permanent access in customer account" },
        ],
        tag: { ar: "واجهة المتجر", en: "Storefront" },
      },
      admin: {
        title: { ar: "إدارة الملفات الرقمية في لوحة التحكم", en: "Digital Asset Management" },
        subtitle: {
          ar: "رفع الملفات وتحديد عدد مرات التحميل وتاريخ انتهاء الصلاحية بسهولة",
          en: "Upload assets, set download limits, and control link expirations",
        },
        bullets: [
          { ar: "رفع آمن للملفات والمرفقات", en: "Secure cloud asset storage" },
          {
            ar: "تحديد حد أقصى للتحميل (مثلاً 3 مرات)",
            en: "Download limit controls (e.g. 3 times)",
          },
          { ar: "سجل عمليات التحميل لكل عميل", en: "Audit log of customer download activity" },
        ],
        tag: { ar: "لوحة التحكم", en: "Admin Panel" },
      },
    },
  },

  gifts: {
    id: "gifts",
    tagline: {
      ar: "خدمات التغليف الفاخر، كروت الإهداء المكتوبة، والشحن المباشر لعنوان المهداة إليه",
      en: "Luxury gift wrapping services, custom handwritten cards, and direct recipient shipping",
    },
    categoryLabel: {
      ar: "ميزة متخصصة",
      en: "Specialized Feature",
    },
    badge: {
      ar: "رفع قيمة السلة",
      en: "AOV Booster",
    },
    publisher: {
      ar: "فريق Boutq المعتمد",
      en: "Boutq Official Studio",
    },
    highlights: [
      {
        ar: "خيار 'إرسال كهدية' مع إخفاء الأسعار من بوليصة الفاتورة المرفقة",
        en: "'Send as a Gift' toggle hiding prices on enclosed invoices and packaging",
      },
      {
        ar: "خيارات تغليف هدايا متعددة (بوكس فاخر، شريط ساتان، كيس بوتيك) مع أسعار إضافية",
        en: "Multiple gift box options (luxury box, satin ribbon, boutique tote) with custom fees",
      },
      {
        ar: "حقل كتابة رسالة الإهداء ليقوم المتجر بطباعتها أو كتابتها بخط اليد",
        en: "Personal gift message card input for custom handwritten or printed greeting notes",
      },
    ],
    fullOverview: {
      ar: "تمثل الهدايا نسبة كبيرة من مشتريات الأزياء، العطور، والمجوهرات في مناسبات الأعياد والأعراس والتخرج. تُضيف ميزة 'خدمات الإهداء' تجربة متكاملة تسمح للمشتري بتحديد أن الطلب هدية، واختيار نوع علبة الهدية ولون الشريط، وكتابة رسالة دافئة للمهداة إليه، مع إدخال عنوان المستلم مباشرة وإخفاء تفاصيل الأسعار عن الشحنة لتبقى مفاجأة رائعة.",
      en: "Gifts represent a massive share of luxury fashion, fragrance, and jewelry sales during Eid, weddings, and celebrations. The Gifts add-on provides an effortless gifting suite: shoppers mark orders as gifts, select premium packaging styles (boxes, ribbons), compose personalized greeting cards, and ship directly to recipients with price tags cleanly concealed.",
    },
    keyFeatures: [
      {
        icon: "Gift",
        title: { ar: "خيارات تغليف هدايا متعددة", en: "Tiered Gift Packaging Options" },
        description: {
          ar: "عرض صور وخيارات التغليف المتاحة مع إمكانية تحديد سعر رمزي لكل خيار تغليف.",
          en: "Showcase custom packaging styles with optional additional fees that boost average order value.",
        },
      },
      {
        icon: "HeartHandshake",
        title: { ar: "كتابة كارت الإهداء الشخصي", en: "Personalized Greeting Cards" },
        description: {
          ar: "حقل أنيق يدخل فيه المشتري رسالته الخاصة لتتم طباعتها أو كتابتها على كارت الهدية.",
          en: "Shoppers compose heartfelt messages printed on branded greeting cards.",
        },
      },
      {
        icon: "EyeOff",
        title: { ar: "إخفاء الأسعار تلقائياً", en: "Concealed Price Packing Slip" },
        description: {
          ar: "طباعة نسخة فاتورة شحن خاصة بالهدية لا تحتوي على أي أسعار أو مبالغ مالية.",
          en: "Prints gift packing slips that exclude monetary prices and payment info.",
        },
      },
      {
        icon: "Send",
        title: { ar: "شحن مباشر للمهداة إليه", en: "Direct Recipient Delivery" },
        description: {
          ar: "إدخال اسم ورقم هاتف المستلم لتوصيل الهدية لموقعه مع إرسال تحديثات الشحن للمشتري.",
          en: "Separate recipient shipping details while tracking updates go to the buyer.",
        },
      },
    ],
    workflowSteps: [
      {
        step: 1,
        title: { ar: "تفعيل خيارات الإهداء", en: "Enable Gifting Options" },
        description: {
          ar: "إتاحة قسم التغليف والإهداء في صفحة السلة وإتمام الطلب بالمتجر.",
          en: "Activates gift wrapping and card options in storefront cart and checkout.",
        },
      },
      {
        step: 2,
        title: { ar: "تخصيص التغليف من قِبل العميل", en: "Shopper Customizes Gift" },
        description: {
          ar: "يختار العميل نوع التغليف، ويكتب نص الكارت، ويدخل عنوان المستلم.",
          en: "The buyer selects box style, types card greeting, and specifies delivery address.",
        },
      },
      {
        step: 3,
        title: { ar: "تجهيز وتغليف فاخر بالمتجر", en: "Boutique Gift Assembly" },
        description: {
          ar: "يصل الطلب مميزاً بوسم 'هدية' مع نص الكارت الجاهز للطباعة وبوليصة بدون أسعار.",
          en: "Order arrives flagged as a gift with printable note card and unpriced invoice.",
        },
      },
    ],
    faqs: [
      {
        q: {
          ar: "هل يمكنني تقديم التغليف كخدمة مجانية لعملائي؟",
          en: "Can I offer gift wrapping for free?",
        },
        a: {
          ar: "نعم بالتأكيد، يمكنك جعل سعر التغليف 0.00 ليكون خدمة إضافية مجانية ترفع ولاء العملاء.",
          en: "Yes, you can set packaging fees to zero as a complimentary loyalty perk.",
        },
      },
      {
        q: {
          ar: "أين تظهر رسالة الإهداء لفريق التجهيز؟",
          en: "Where does the fulfillment team see the gift card note?",
        },
        a: {
          ar: "تظهر الرسالة بوضوح داخل صفحة تفاصيل الطلب باللوحة، مع زر سريع لطباعة الكارت فوراً.",
          en: "The card note is clearly highlighted in admin order details with a 1-click print button.",
        },
      },
    ],
    previewMockup: {
      storefront: {
        title: { ar: "صندوق خيارات الإهداء في السلة", en: "Gifting Options in Checkout" },
        subtitle: {
          ar: "خيار 'طلب كهدية' يتيح للعميل اختيار البوكس الفاخر وكتابة رسالة الكارت",
          en: "'Send as a gift' toggle letting shoppers pick packaging and write a message",
        },
        bullets: [
          { ar: "تفعيل: 'هذا الطلب عبارة عن هدية'", en: "Toggle: 'This order is a gift'" },
          {
            ar: "اختيار التغليف: بوكس مخملي فاخر (+3 د.ب)",
            en: "Box choice: Velvet luxury box (+3 BHD)",
          },
          { ar: "حقل رسالة الكارت بخط أنيق", en: "Card greeting message input" },
        ],
        tag: { ar: "واجهة المتجر", en: "Storefront" },
      },
      admin: {
        title: { ar: "بطاقة الهدية في صفحة تجهيز الطلب", en: "Gift Preparation Card in Admin" },
        subtitle: {
          ar: "تنبيه بارز لفريق التغليف مع نص الرسالة المطلوب كتابتها وبوليصة بدون أسعار",
          en: "Clear notification for fulfillment team with gift card text and unpriced slip",
        },
        bullets: [
          { ar: "وسم بارز: طلب هدية خاص", en: "Prominent badge: Special Gift Order" },
          {
            ar: "عرض رسالة العميل مع زر طباعة الكارت",
            en: "Greeting card preview with print button",
          },
          { ar: "تنبيه إخفاء السعر عن المستلم", en: "Price concealment verified indicator" },
        ],
        tag: { ar: "لوحة التحكم", en: "Admin Panel" },
      },
    },
  },

  "print-stamps": {
    id: "print-stamps",
    tagline: {
      ar: "أدوات مخصصة لمتاجر الطباعة، الأختام، ومستلزمات الورق: مقاسات الطباعة والأشكال الهندسية",
      en: "Tools for print shops, custom rubber stamps, and stationery: paper sizes and stamp shapes",
    },
    categoryLabel: {
      ar: "حزمة نشاط متخصصة",
      en: "Vertical Business Pack",
    },
    publisher: {
      ar: "فريق Boutq المعتمد",
      en: "Boutq Official Studio",
    },
    highlights: [
      {
        ar: "مقاسات الورق والمطبوعات المعتمدة (A3, A4, A5, A6، كروت أعمال)",
        en: "Standard paper & print dimensions (A3, A4, A5, A6, Business Cards)",
      },
      {
        ar: "قوالب أبعاد الأختام الدائرية والمستطيلة بالمليمتر (30 مم، 40 مم، 50 مم)",
        en: "Rubber stamp dimensions in millimeters (circular and rectangular stamps)",
      },
      {
        ar: "حزم أعداد الكروت وكميات الطباعة (100، 250، 500، 1000 كرت)",
        en: "Print quantity bundles (100, 250, 500, 1000 cards) with tiered pricing",
      },
    ],
    fullOverview: {
      ar: "تتميز متاجر الطباعة وخدمات الأختام باحتياجها لمقاييس هندسية دقيقة (أحجام الورق الدولية A-series، أقطار الأختام بالمليمتر، خيارات الحبر، وكميات الكروت). توفر هذه الحزمة قوالب جاهزة تتيح لعملاء المتجر اختيار أبعاد الأختام أو حجم الورق وكمية النسخ المطلوبة، مما ينظم الطلبات ويمنع الأخطاء في مقاسات الطباعة.",
      en: "Print studios and custom stamp makers require precise geometric dimensions (A-series paper standards, stamp diameters in millimeters, ink pad colors, and bulk print quantities). Print & Stamps provides preconfigured variant presets so customers choose stamp shapes, paper grades, and print quantities smoothly.",
    },
    keyFeatures: [
      {
        icon: "Printer",
        title: { ar: "مقاسات الورق والمطبوعات (ISO)", en: "Standard Paper Sizes (ISO)" },
        description: {
          ar: "قوالب سريعة للمقاسات A3, A4, A5, A6 وكروت الأعمال بمقاس 9×5 سم.",
          en: "Standardized templates for A3, A4, A5, A6, and 9x5cm business cards.",
        },
      },
      {
        icon: "Circle",
        title: { ar: "أبعاد الأختام الدائرية والمستطيلة", en: "Rubber Stamp Form Factors" },
        description: {
          ar: "أقطار الأختام المعتمدة (30مم، 40مم، 50مم) مع خيارات لون حبر الختم.",
          en: "Circular stamp diameters (30mm, 40mm, 50mm) and rectangular desk stamp sizes.",
        },
      },
      {
        icon: "Layers",
        title: { ar: "حزم الكميات المتدرجة", en: "Tiered Quantity Bundles" },
        description: {
          ar: "تحديد كميات الطباعة (100، 250، 500، 1000) مع تسعير تلقائي لكل حزمة.",
          en: "Quantity packs (100, 250, 500, 1000) with volume discount tiering.",
        },
      },
      {
        icon: "FileUp",
        title: { ar: "رفع ملف الشعار والتصميم", en: "Design & Artwork Upload" },
        description: {
          ar: "إتاحة حقل لرفع ملف الشعار أو التصميم للختم مباشرة عند الطلب.",
          en: "Shoppers can attach their vector artwork or logo files directly with their stamp order.",
        },
      },
    ],
    workflowSteps: [
      {
        step: 1,
        title: { ar: "تثبيت حزمة الطباعة والأختام", en: "Install Print & Stamps" },
        description: {
          ar: "تفعيل قوالب مقاسات الورق وأبعاد الأختام في لوحة التحكم والمتجر.",
          en: "Enables paper size presets and stamp dimension scales across your store.",
        },
      },
      {
        step: 2,
        title: { ar: "إضافة منتجات الأختام والمطبوعات", en: "Add Stamp & Stationery Items" },
        description: {
          ar: "حدد شكل الختم (دائري أو مستطيل) والقطر بالمليمتر أو مقاس الورق.",
          en: "Specify stamp geometry, diameters in mm, or paper size specs.",
        },
      },
      {
        step: 3,
        title: { ar: "استقبال الطلبات بملفات وتفاصيل دقيقة", en: "Receive Orders with Artwork" },
        description: {
          ar: "تصلك الطلبات بالمقاسات والكميات المحددة جاهزة للطباعة والتصنيع الفوري.",
          en: "Orders arrive with verified millimeter specs and attached logo files ready for print.",
        },
      },
    ],
    faqs: [
      {
        q: {
          ar: "هل يمكن للعميل رفع ملف متجه (Vector / PDF)؟",
          en: "Can customers upload vector or PDF artwork?",
        },
        a: {
          ar: "نعم، يدعم حقل رفع التصميم ملفات PDF، AI، وPNG عالية الدقة.",
          en: "Yes, the artwork attachment field supports PDF, AI, EPS, and high-res PNG formats.",
        },
      },
      {
        q: {
          ar: "هل تشمل الحزمة خيارات ألوان الحبر؟",
          en: "Does this pack include ink pad color choices?",
        },
        a: {
          ar: "نعم، تتضمن خيارات الحبر المعتمدة: أزرق، أسود، أحمر، وأخضر.",
          en: "Yes, it provides standard ink pad color options: Blue, Black, Red, and Green.",
        },
      },
    ],
    previewMockup: {
      storefront: {
        title: { ar: "اختيار قطر الختم ولون الحبر", en: "Stamp Diameter & Ink Selection" },
        subtitle: {
          ar: "أبعاد واضحة بالمليمتر (30mm / 40mm) مع زر رفع الشعار لاختبار الختم",
          en: "Clear millimeter dimensions (30mm/40mm) with logo attachment input",
        },
        bullets: [
          {
            ar: "أزرار اختيار القطر: 30 مم، 40 مم، 50 مم",
            en: "Diameter selectors: 30mm, 40mm, 50mm",
          },
          {
            ar: "اختيار لون حبر الختم (أزرق، أسود، أحمر)",
            en: "Ink color choices (Blue, Black, Red)",
          },
          { ar: "حقل رفع ملف التصميم أو الشعار", en: "Artwork & vector logo upload slot" },
        ],
        tag: { ar: "واجهة المتجر", en: "Storefront" },
      },
      admin: {
        title: { ar: "إدارة مواصفات الأختام والمطبوعات", en: "Print & Stamp Specs in Admin" },
        subtitle: {
          ar: "توليد تلقائي لمحاور المقاسات بالمليمتر وحزم كميات المطبوعات",
          en: "Automated millimeter matrices and bulk print quantity tiers",
        },
        bullets: [
          { ar: "قوالب أبعاد الأختام الدائرية والمستطيلة", en: "Round & rect stamp templates" },
          { ar: "مقاسات الأوراق العالمية A3 - A6", en: "Standard A-series paper formats" },
          { ar: "إدارة حزم الكميات والتسعير بالجملة", en: "Quantity tiering & volume pricing" },
        ],
        tag: { ar: "لوحة التحكم", en: "Admin Panel" },
      },
    },
  },

  jewelry: {
    id: "jewelry",
    tagline: {
      ar: "تجربة راقية لمتاجر الذهب والمجوهرات: مقاسات الخواتم الدقيقة، عيارات الذهب، والشهادات المعتمدة",
      en: "Luxury suite for fine jewelry & gold boutiques: ring sizes, gold carats, and authenticity certs",
    },
    categoryLabel: {
      ar: "حزمة نشاط متخصصة",
      en: "Vertical Business Pack",
    },
    badge: {
      ar: "فخامة وأصالة",
      en: "Prestige Luxury",
    },
    publisher: {
      ar: "فريق Boutq المعتمد",
      en: "Boutq Official Studio",
    },
    highlights: [
      {
        ar: "مقاسات الخواتم الأمريكية والخليجية المعتمدة (US 5 إلى 10) مع جدول قياس القطر",
        en: "Standard US & Gulf ring sizing (US 5 to 10) with diameter conversion charts",
      },
      {
        ar: "خيارات عيارات الذهب والفضة (عيار 18، عيار 21، عيار 24، فضة 925)",
        en: "Gold karat & silver metal options (18K, 21K, 24K, 925 Sterling Silver)",
      },
      {
        ar: "شارات ضمان الأصالة وشهادات الألماس والأحجار الكريمة لزرع أعلى درجات الثقة",
        en: "Authenticity trust badges, diamond certificates, and gemstone verification",
      },
    ],
    fullOverview: {
      ar: "يعتمد قرار شراء المجوهرات الفاخرة والذهب على الثقة المطلقة ودقة المقاس. تُضفي حزمة 'المجوهرات الفاخرة' طابع البوتيك الراقي على متجرك من خلال عرض عيارات الذهب (18k / 21k) بدقة، وجداول مقاسات الخواتم بالمليمتر مع إرشادات قياس محيط الإصبع، بالإضافة إلى شارات فحص الأصالة والشهادات المعتمدة التي تمنح المشتري الطمأنينة الكاملة لاستثمار أمواله في قطعك الفاخرة.",
      en: "Fine jewelry and gold transactions hinge upon profound consumer trust and micron-precision sizing. Fine Jewelry elevates your boutique into an esteemed jeweler's salon: showcasing metal purities (18K, 21K, 24K, Platinum), US ring size ladders with inner-diameter charts, diamond grading certifications (GIA, IGI), and premium authenticity guarantees.",
    },
    keyFeatures: [
      {
        icon: "Gem",
        title: { ar: "مقاسات الخواتم الدقيقة (US 5-10)", en: "Precision Ring Sizing (US 5-10)" },
        description: {
          ar: "سلم مقاسات الخواتم القياسي مع جدول يوضح القطر الداخلي بالمليمتر وطريقة القياس بخيط.",
          en: "Standard US ring sizes with exact millimeter inner-diameter conversion chart.",
        },
      },
      {
        icon: "Award",
        title: { ar: "عيارات الذهب ونقاء المعادن", en: "Gold Karats & Metal Purity" },
        description: {
          ar: "خيارات عيار الذهب: 18 قيراط، 21 قيراط، 24 قيراط، ذهب أبيض، وذهب وردي.",
          en: "Preloaded metal purity options: 18K Yellow Gold, 21K, White Gold, Rose Gold.",
        },
      },
      {
        icon: "ShieldCheck",
        title: { ar: "شهادة الأصالة والضمان", en: "Authenticity & Certificate Badges" },
        description: {
          ar: "إبراز شهادة فحص الألماس والدمغة الرسمية لتعزيز ثقة العميل وتحفيز الشراء الفوري.",
          en: "Prominently displays hallmark inspection and diamond authenticity certifications.",
        },
      },
      {
        icon: "Sparkles",
        title: { ar: "تعليمات العناية بالأحجار والذهب", en: "Jewelry Care & Polishing Guide" },
        description: {
          ar: "دليل عناية مدمج بصفحة المنتج يشرح كيفية الحفاظ على بريق الأحجار والذهب لسنوات.",
          en: "Integrated care tips advising customers how to clean and preserve lustrous gemstones.",
        },
      },
    ],
    workflowSteps: [
      {
        step: 1,
        title: { ar: "تثبيت حزمة المجوهرات الفاخرة", en: "Install Fine Jewelry Pack" },
        description: {
          ar: "تفعيل سلم مقاسات الخواتم، شارات عيارات الذهب، ودليل الأصالة.",
          en: "Activates ring sizing matrices, gold karat badges, and authenticity trust seals.",
        },
      },
      {
        step: 2,
        title: { ar: "إضافة القطع والخواتم الثمينة", en: "Add Jewelry Pieces" },
        description: {
          ar: "حدد عيار الذهب، وزن القطعة بالجرام، ومقاسات الخواتم المتوفرة بنقرة واحدة.",
          en: "Select gold karat, item weight in grams, and available ring size ranges.",
        },
      },
      {
        step: 3,
        title: { ar: "مبيعات موثوقة بقيمة عالية", en: "Sell with Unmatched Prestige" },
        description: {
          ar: "يتسوق العملاء خواتمهم وقطعهم الذهبية بثقة تامة مع وضوح المقاس والعيار والضمان.",
          en: "Customers invest with high confidence backed by accurate sizing and certified purity.",
        },
      },
    ],
    faqs: [
      {
        q: {
          ar: "هل يمكن للعميل طلب مقاس خاتم مخصص غير معروض؟",
          en: "Can customers request a custom ring size not in stock?",
        },
        a: {
          ar: "نعم، بالتكامل مع إضافة 'الطلب المسبق والتفصيل'، يمكن تفعيل خيار صياغة مقاس خاص للعميل.",
          en: "Yes, paired with Made-to-Order, shoppers can request custom bespoke sizing.",
        },
      },
      {
        q: {
          ar: "هل توفر الحزمة مقاسات الأساور والسلاسل؟",
          en: "Does this pack include bracelet and chain length guides?",
        },
        a: {
          ar: "نعم، تشمل الحزمة قوالب أطوال السلاسل (40 سم، 45 سم، 50 سم) ومحيط الأساور.",
          en: "Yes, it includes chain length matrices (40cm, 45cm, 50cm) and wrist bracelet circumferences.",
        },
      },
    ],
    previewMockup: {
      storefront: {
        title: { ar: "اختيار مقاس الخاتم وعيار الذهب", en: "Ring Size & Gold Karat Selector" },
        subtitle: {
          ar: "عرض فاخر لمقاسات الخواتم (US 5-10) وعيارات الذهب (18K/21K) مع شهادة الأصالة",
          en: "Prestigious selector for ring sizes (US 5-10) and 18K/21K gold with cert badge",
        },
        bullets: [
          {
            ar: "مقاسات الخواتم الأمريكية بدقة القطر",
            en: "US ring size chips with diameter guide",
          },
          { ar: "خيارات عيار الذهب: 18K أو 21K", en: "Metal selection: 18K Yellow / White Gold" },
          { ar: "شارة ضمان: 'ذهب خالص مع شهادة فحص'", en: "Trust badge: 'Certified Fine Gold'" },
        ],
        tag: { ar: "واجهة المتجر", en: "Storefront" },
      },
      admin: {
        title: { ar: "إدارة تفاصيل المجوهرات والعيارات", en: "Jewelry Specs in Admin Panel" },
        subtitle: {
          ar: "تسجيل عيار الذهب، وزن الجرام، وجداول مقاسات الخواتم المعتمدة",
          en: "Manage karat purity, gram weights, and verified ring dimensions",
        },
        bullets: [
          { ar: "قوالب مقاسات الخواتم القياسية", en: "Standard ring size templates" },
          { ar: "تسجيل وزن الذهب وعياره", en: "Gold karat and weight logging" },
          { ar: "ربط شهادات فحص الألماس بالقطع", en: "Attach authenticity inspection certs" },
        ],
        tag: { ar: "لوحة التحكم", en: "Admin Panel" },
      },
    },
  },
  "coffee-roastery": {
    id: "coffee-roastery",
    tagline: {
      ar: "باقة متكاملة للمحامص والمقاهي المختصة تشمل خيارات الطحن، أوزان المحاصيل، ومفردات التحميص والتحضير",
      en: "Comprehensive solution for specialty roasteries featuring bean grind options, bag weights, and roasting terminology",
    },
    categoryLabel: {
      ar: "القهوة والمحامص المختصة",
      en: "Specialty Coffee & Roastery",
    },
    badge: {
      ar: "محاصيل مختصة",
      en: "Specialty Coffee",
    },
    publisher: {
      ar: "فريق Boutq OS",
      en: "Boutq OS Team",
    },
    highlights: [
      {
        ar: "محاور مخصصة: الوزن، نوع الطحنة، والمعالجة",
        en: "Custom axes: Weight, Grind Type, and Process",
      },
      {
        ar: "نماذج أوزان المحاصيل (250g، 500g، 1kg) وأظرف التقطير",
        en: "Standard bag weights (250g, 500g, 1kg) & Drip bags",
      },
      {
        ar: "مفردات المحمصة وملاحظات التحضير والباريسـتا",
        en: "Roastery vocabulary, barista & preparation notes",
      },
      {
        ar: "سياق ذكاء اصطناعي متخصص لإيحاءات ومعالجات البن",
        en: "Specialized AI catalog context for origin and tasting notes",
      },
    ],
    fullOverview: {
      ar: "تم تصميم حزمة القهوة والمحامص المختصة لتمنح متاجر القهوة تجربة استثنائية من اليوم الأول. تشمل الحزمة درجات الطحن الجاهزة (حبوب كاملة، فلتر V60، إسبريسو، كيمكس، كولد برو)، أوزان المحاصيل الشائعة، بوكسات أظرف القهوة سريعة التحضير، ومفردات خاصة بالمحمصة في إدارة الطلبات وتتبع خطوط التجهيز.",
      en: "Designed specifically for specialty coffee roasteries and cafes. Out of the box, it provides standardized grind options (Whole Bean, Filter V60, Espresso, Chemex, Cold Brew), package weights, drip bags bundles, and tailored roastery vocabulary across order fulfillment.",
    },
    keyFeatures: [
      {
        icon: "Coffee",
        title: { ar: "درجات طحن مسبقة الإعداد", en: "Ready-to-use Grind Options" },
        description: {
          ar: "تمكّن العميل من تحديد درجة الطحن المناسبة لأداته (حبوب كاملة، V60، إسبريسو، فرنش بريس).",
          en: "Allow customers to choose the exact grind size suited for their brewing method.",
        },
      },
      {
        icon: "Boxes",
        title: { ar: "أوزان وبوكسات المحاصيل", en: "Package Weights & Bundles" },
        description: {
          ar: "قوالب سريعة لأوزان أكياس البن (250 جم، 500 جم، 1 كجم) وبوكسات أظرف التقطير سريعة التحضير.",
          en: "Presets for coffee bags (250g, 500g, 1kg) and instant drip bag boxes.",
        },
      },
      {
        icon: "Sparkles",
        title: { ar: "ذكاء اصطناعي يفهم القهوة المختصة", en: "Coffee-Aware AI Catalog Engine" },
        description: {
          ar: "يستخرج تلقائياً الدولة المصدر، الارتفاع، المعالجة، وإيحاءات التذوق عند استيراد المحاصيل.",
          en: "Automatically detects origin, elevation, processing method, and tasting notes during import.",
        },
      },
      {
        icon: "Clock",
        title: { ar: "مفردات التحميص والتجهيز", en: "Roasting & Prep Vocabulary" },
        description: {
          ar: "استبدال مصطلحات الورشة بـ 'المحمصة' وحالات الطلب إلى 'قيد التجهيز / التحميص' و 'جاهز للتسليم'.",
          en: "Adapts system labels to 'Roastery', 'In Roasting / Prep', and 'Ready for Pickup'.",
        },
      },
    ],
    workflowSteps: [
      {
        step: 1,
        title: { ar: "تفعيل الحزمة لمتجر القهوة", en: "Activate Coffee Pack" },
        description: {
          ar: "تتفعّل الحزمة تلقائياً عند اختيار نشاط 'محاصيل وقهوة مختصة' أثناء التسجيل، أو بضغطة زر من متجر الإضافات.",
          en: "Activates automatically during roastery onboarding or via one-click in Addon Store.",
        },
      },
      {
        step: 2,
        title: { ar: "إضافة محاصيل البن والمنتجات", en: "Add Coffee Beans & Products" },
        description: {
          ar: "استفد من خيارات الطحن الجاهزة والأوزان القياسية لإضافة محاصيلك بسرعة وبدون إدخال يدوي مكرر.",
          en: "Leverage ready grind and weight presets to add coffee beans with zero manual setup overhead.",
        },
      },
      {
        step: 3,
        title: { ar: "استقبال الطلبات وتجهيز التحميص", en: "Receive Orders & Fulfill" },
        description: {
          ar: "تظهر تفاصيل الطحن ودرجة التحميص واضحة في بوليصة الشحن وفاتورة الطلب لموظفي المحمصة.",
          en: "Grind selection and roastery notes display clearly on invoices and packing slips.",
        },
      },
    ],
    faqs: [
      {
        q: {
          ar: "هل تناسب الحزمة محامص القهوة ومتاجر بيع البن؟",
          en: "Is this pack suitable for roasteries and bean merchants?",
        },
        a: {
          ar: "نعم، صُممت خصيصاً للمحامص والمتاجر التي تبيع محاصيل البن المختص مع خيارات طحن وأوزان مختلفة.",
          en: "Yes, tailored for roasteries selling specialty coffee beans with varied grind and weight choices.",
        },
      },
      {
        q: {
          ar: "هل يمكنني تعديل درجات الطحن أو إضافة أوزان خاصة بي؟",
          en: "Can I customize grind sizes or add proprietary weights?",
        },
        a: {
          ar: "بالتأكيد، يمكنك إضافة أي درجات طحن إضافية أو تعديل خيارات الأوزان بما يتناسب مع خطوط إنتاجك.",
          en: "Absolutely, you can freely add custom grinds or weight variations matching your product line.",
        },
      },
      {
        q: {
          ar: "هل تدعم خيارات الاستلام من الفرع والتوصيل السريع؟",
          en: "Does it support in-store pickup and quick delivery?",
        },
        a: {
          ar: "نعم، يتم تفعيل الاستلام الذاتي من المحمصة/المقهى والتوصيل السريع تلقائياً.",
          en: "Yes, in-store roastery pickup and delivery options are auto-configured on installation.",
        },
      },
    ],
    previewMockup: {
      storefront: {
        title: { ar: "اختيار وزن المحصول ودرجة الطحن", en: "Bean Weight & Grind Selection" },
        subtitle: {
          ar: "واجهة أنيقة تعرض أوزان المحصول (250g، 1kg) مع تحديد خيار الطحن المطلوب (فلتر، إسبريسو)",
          en: "Elegant selector showing bean weights (250g, 1kg) and grind size preference",
        },
        bullets: [
          { ar: "أزرار اختيار الوزن: 250g أو 1kg", en: "Weight pills: 250g or 1kg" },
          {
            ar: "قائمة خيارات الطحن: حبوب كاملة، فلتر V60، إسبريسو",
            en: "Grind options: Whole Bean, Filter V60, Espresso",
          },
          {
            ar: "عرض إيحاءات التذوق: ياسمين، دراق، شوكولاتة",
            en: "Tasting notes chips: Jasmine, Peach, Chocolate",
          },
        ],
        tag: { ar: "واجهة المتجر", en: "Storefront" },
      },
      admin: {
        title: { ar: "إدارة تفاصيل المحصول وطلبات المحمصة", en: "Roastery Specs & Order Queue" },
        subtitle: {
          ar: "متابعة تجهيز الطلبات مع توضيح درجة الطحن وملاحظات التحميص في بطاقة الطلب",
          en: "Track roastery orders with grind specs and barista notes clearly displayed",
        },
        bullets: [
          { ar: "قوالب أوزان ودرجات طحن قياسية", en: "Standardized weight and grind presets" },
          { ar: "توضيح درجة الطحن في بطاقة الطلب", en: "Clear grind size badge on order cards" },
          {
            ar: "توجيه ذكاء اصطناعي لقراءة تفاصيل المحاصيل",
            en: "AI-assisted extraction for origin & process",
          },
        ],
        tag: { ar: "لوحة التحكم", en: "Admin Panel" },
      },
    },
  },
};
