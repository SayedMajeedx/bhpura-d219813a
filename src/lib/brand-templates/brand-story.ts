import { STORE_VERTICALS, type StoreVertical } from "@/lib/store-profile";

type Text = { ar: string; en: string };

/** What the storefront's "Our story" section says until the brand writes its own. */
export type BrandStoryDefaults = {
  subtitle: Text;
  description: Text;
  /** Three promises, shown with the quality, care and guarantee icons. */
  values: [Text, Text, Text];
};

/**
 * One entry per store vertical; the Record type makes a new vertical fail to
 * compile until it has its own copy, so no store falls back to another
 * vertical's words (a services store used to promise "exclusive collections").
 */
const BRAND_STORY_DEFAULTS: Record<StoreVertical, BrandStoryDefaults> = {
  abayas: {
    subtitle: {
      ar: "قصتنا وشغفنا بالعباية الأنيقة",
      en: "Our Story & Passion for the Elegant Abaya",
    },
    description: {
      ar: "نصمم عبايات تجمع بين الحشمة والأناقة، بخامات مختارة وتفصيل دقيق يليق بذوق عملائنا، مع التزامنا بأعلى معايير الجودة في كل قطعة.",
      en: "We design abayas that bring modesty and elegance together, in carefully chosen fabrics and precise tailoring, held to the highest standards in every piece.",
    },
    values: [
      { ar: "خامات فاخرة مختارة", en: "Premium Selected Fabrics" },
      { ar: "تفصيل دقيق ومقاسات مريحة", en: "Precise Tailoring & Comfortable Fit" },
      { ar: "ضمان الجودة والأصالة", en: "Quality & Authenticity Guaranteed" },
    ],
  },
  fashion: {
    subtitle: { ar: "قصتنا وشغفنا بالتصميم الراقي", en: "Our Story & Passion for Refined Design" },
    description: {
      ar: "نقدم أرقى التشكيلات العصرية المصممة بعناية فائقة لتلبي ذوق عملائنا المتميزين، مع التزامنا بأعلى معايير الجودة والأناقة في كل اختيار.",
      en: "Curating refined contemporary pieces crafted with meticulous care for our distinguished clients, upholding the highest standards of luxury and elegance.",
    },
    values: [
      { ar: "أعلى معايير الجودة", en: "Premium Quality Standards" },
      { ar: "تشكيلات حصرية مميزة", en: "Exclusive Curated Collections" },
      { ar: "ضمان الجودة والأصالة", en: "Authenticity & Quality Guarantee" },
    ],
  },
  beauty: {
    subtitle: {
      ar: "قصتنا وشغفنا بالجمال والعناية",
      en: "Our Story & Passion for Beauty and Care",
    },
    description: {
      ar: "نختار منتجات تجميل وعناية بمكونات موثوقة تناسب البشرة والشعر، لإطلالة واثقة وروتين عناية ممتع كل يوم.",
      en: "We select beauty and care products with trusted ingredients for skin and hair, for a confident look and a daily routine worth enjoying.",
    },
    values: [
      { ar: "مكونات موثوقة وآمنة", en: "Trusted, Safe Ingredients" },
      { ar: "منتجات أصلية مضمونة", en: "Guaranteed Authentic Products" },
      { ar: "نصائح عناية مخصصة", en: "Personal Care Advice" },
    ],
  },
  fragrance: {
    subtitle: { ar: "قصتنا وشغفنا بالعطور الفاخرة", en: "Our Story & Passion for Fine Fragrances" },
    description: {
      ar: "نبتكر أرقى النفحات العطرية المميزة بمكونات نقية وفريدة لتلبي ذوق عملائنا الرفيع، مع التزامنا بأعلى معايير الفخامة والثبات.",
      en: "Curating distinctive fragrances crafted from pure and rare ingredients for our refined clientele, upholding luxury and enduring elegance.",
    },
    values: [
      { ar: "زيوت عطرية نقية", en: "Pure Fragrance Oils" },
      { ar: "ثبات وفوحان يدوم", en: "Long-Lasting Sillage" },
      { ar: "ضمان الجودة والأصالة", en: "Authenticity & Quality Guarantee" },
    ],
  },
  coffee: {
    subtitle: {
      ar: "قصتنا وشغفنا بالقهوة المختصة",
      en: "Our Story & Passion for Specialty Coffee",
    },
    description: {
      ar: "نختار محاصيلنا من أفضل المزارع ونحمّصها بعناية على دفعات صغيرة، لنقدّم لكم فنجاناً غنياً بالنكهة في كل مرة.",
      en: "We source our beans from the finest farms and roast them carefully in small batches, for a cup full of flavour every time.",
    },
    values: [
      { ar: "محاصيل من أفضل المزارع", en: "Beans from the Finest Farms" },
      { ar: "تحميص طازج على دفعات صغيرة", en: "Freshly Roasted in Small Batches" },
      { ar: "نكهة غنية ومتوازنة", en: "Rich, Balanced Flavour" },
    ],
  },
  food: {
    subtitle: {
      ar: "قصتنا وشغفنا بالمذاق الأصيل",
      en: "Our Story & Passion for Authentic Flavors",
    },
    description: {
      ar: "نقدم أشهى المأكولات والحلويات المحضرة بعناية فائقة من أجود المكونات الطازجة لتلبي ذوق عملائنا المتميزين، مع التزامنا بأعلى معايير الجودة والنظافة.",
      en: "Crafting authentic culinary delicacies prepared with meticulous care from the finest fresh ingredients for our discerning guests, upholding the highest standards of taste and hygiene.",
    },
    values: [
      { ar: "أعلى معايير الجودة والنظافة", en: "Premium Quality & Hygiene" },
      { ar: "مكونات طازجة ومختارة", en: "Fresh & Handpicked Ingredients" },
      { ar: "مذاق أصيل وطازج دائماً", en: "Authentic Flavor & Freshness Guaranteed" },
    ],
  },
  gifts: {
    subtitle: { ar: "قصتنا وشغفنا بفن الإهداء", en: "Our Story & Passion for the Art of Gifting" },
    description: {
      ar: "ننسق هدايا وورود بلمسة شخصية وتغليف أنيق، لتصل مشاعركم لمن تحبون في كل مناسبة.",
      en: "We arrange gifts and flowers with a personal touch and elegant wrapping, so your feelings reach the people you love on every occasion.",
    },
    values: [
      { ar: "تنسيق بلمسة شخصية", en: "Personally Arranged" },
      { ar: "تغليف أنيق وبطاقات إهداء", en: "Elegant Wrapping & Gift Cards" },
      { ar: "توصيل في الوقت المناسب", en: "On-Time Delivery" },
    ],
  },
  print: {
    subtitle: {
      ar: "قصتنا وشغفنا بالطباعة والتخصيص",
      en: "Our Story & Passion for Print & Personalisation",
    },
    description: {
      ar: "نحوّل أفكاركم إلى مطبوعات ومنتجات مخصصة بجودة عالية وتفاصيل دقيقة، من التصميم حتى التسليم.",
      en: "We turn your ideas into high-quality printed and personalised products with precise detail, from design to delivery.",
    },
    values: [
      { ar: "طباعة عالية الجودة", en: "High-Quality Printing" },
      { ar: "تخصيص حسب طلبك", en: "Personalised to Your Order" },
      { ar: "مراجعة التصميم قبل التنفيذ", en: "Design Proof Before Production" },
    ],
  },
  jewelry: {
    subtitle: {
      ar: "قصتنا وشغفنا بالمجوهرات الراقية",
      en: "Our Story & Passion for Fine Jewellery",
    },
    description: {
      ar: "نقدّم قطع مجوهرات وإكسسوارات مصاغة بإتقان من خامات أصلية، لتبقى لمسة أناقة تدوم في كل مناسبة.",
      en: "We offer jewellery and accessories crafted with care from genuine materials, a lasting touch of elegance for every occasion.",
    },
    values: [
      { ar: "خامات أصلية موثوقة", en: "Genuine Materials" },
      { ar: "صياغة متقنة", en: "Fine Craftsmanship" },
      { ar: "ضمان الجودة والأصالة", en: "Quality & Authenticity Guaranteed" },
    ],
  },
  home: {
    subtitle: { ar: "قصتنا وشغفنا بالمنزل والديكور", en: "Our Story & Passion for Home & Décor" },
    description: {
      ar: "نختار قطع ديكور ومستلزمات منزلية تجمع بين الجمال والعملية، لتمنح بيتك دفئاً وطابعاً خاصاً.",
      en: "We choose décor and homeware that combine beauty and practicality, giving your home warmth and character.",
    },
    values: [
      { ar: "قطع مختارة بعناية", en: "Carefully Chosen Pieces" },
      { ar: "جودة تدوم طويلاً", en: "Built to Last" },
      { ar: "تصاميم تناسب كل مساحة", en: "Designs for Every Space" },
    ],
  },
  electronics: {
    subtitle: { ar: "قصتنا وشغفنا بالتقنية", en: "Our Story & Passion for Technology" },
    description: {
      ar: "نوفّر أجهزة وإكسسوارات تقنية أصلية بضمان موثوق، مع دعم يساعدكم على اختيار ما يناسب احتياجاتكم.",
      en: "We offer genuine devices and tech accessories with a reliable warranty, and support to help you choose what fits your needs.",
    },
    values: [
      { ar: "منتجات أصلية", en: "Genuine Products" },
      { ar: "ضمان موثوق", en: "Reliable Warranty" },
      { ar: "دعم بعد البيع", en: "After-Sales Support" },
    ],
  },
  digital: {
    subtitle: {
      ar: "قصتنا وشغفنا بالمحتوى الرقمي",
      en: "Our Story & Passion for Digital Products",
    },
    description: {
      ar: "نصمم منتجات رقمية عملية وعالية الجودة تصلكم فور الشراء، لتستفيدوا منها مباشرة وفي أي وقت.",
      en: "We create practical, high-quality digital products delivered the moment you buy, ready to use right away, anytime.",
    },
    values: [
      { ar: "تسليم فوري بعد الشراء", en: "Instant Delivery" },
      { ar: "محتوى عالي الجودة", en: "High-Quality Content" },
      { ar: "دعم عند الحاجة", en: "Help When You Need It" },
    ],
  },
  services: {
    subtitle: { ar: "قصتنا وشغفنا بخدمتكم", en: "Our Story & Passion for Serving You" },
    description: {
      ar: "نقدّم خدمات وباقات مصممة حول مناسبتكم، بفريق محترف يهتم بكل تفصيل من الحجز حتى يوم الموعد.",
      en: "We offer services and packages built around your occasion, with a professional team that cares for every detail from booking to the big day.",
    },
    values: [
      { ar: "فريق محترف وموثوق", en: "Professional, Trusted Team" },
      { ar: "باقات مرنة تناسب مناسبتكم", en: "Flexible Packages for Your Occasion" },
      { ar: "حجز سهل والتزام بالمواعيد", en: "Easy Booking & On-Time Service" },
    ],
  },
  general: {
    subtitle: { ar: "قصتنا وشغفنا بما نقدمه", en: "Our Story & What Drives Us" },
    description: {
      ar: "نختار منتجاتنا بعناية لتلبي احتياجات عملائنا، مع التزامنا بأعلى معايير الجودة وخدمة تليق بكم.",
      en: "We choose our products with care to meet our customers' needs, with a commitment to quality and the service you deserve.",
    },
    values: [
      { ar: "أعلى معايير الجودة", en: "Premium Quality Standards" },
      { ar: "منتجات مختارة بعناية", en: "Carefully Selected Products" },
      { ar: "خدمة عملاء مميزة", en: "Outstanding Customer Service" },
    ],
  },
};

/** The default "Our story" copy for a store's vertical (general when unknown). */
export function brandStoryDefaults(vertical: string | null | undefined): BrandStoryDefaults {
  const id = (vertical ?? "").trim().toLowerCase();
  return (STORE_VERTICALS as readonly string[]).includes(id)
    ? BRAND_STORY_DEFAULTS[id as StoreVertical]
    : BRAND_STORY_DEFAULTS.general;
}
