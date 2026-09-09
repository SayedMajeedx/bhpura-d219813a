import React from "react";
import {
  Sparkles,
  ShieldCheck,
  Shield,
  Lock,
  KeyRound,
  Fingerprint,
  Award,
  CheckCircle2,
  Banknote,
  CreditCard,
  Coins,
  Wallet,
  Receipt,
  CircleDollarSign,
  QrCode,
  Percent,
  Truck,
  Package,
  PackageCheck,
  Clock,
  MapPin,
  Send,
  Zap,
  Plane,
  Star,
  Crown,
  Gem,
  Palette,
  Scissors,
  Shirt,
  Heart,
  Headphones,
  MessageCircle,
  Phone,
  HeartHandshake,
  Smile,
  HelpCircle,
  RefreshCw,
  RotateCcw,
  BadgeCheck,
  Flame,
  Gift,
  ThumbsUp,
  Tag,
  Globe,
  Leaf,
  LucideIcon,
} from "lucide-react";

export interface TrustBadgeItem {
  id: string;
  icon: string;
  text_ar: string;
  text_en: string;
  color: string;
  enabled: boolean;
}

export interface TrustBadgesConfig {
  enabled: boolean;
  items: TrustBadgeItem[];
}

export const DEFAULT_TRUST_BADGES: TrustBadgesConfig = {
  enabled: true,
  items: [
    {
      id: "badge-designs",
      icon: "Sparkles",
      text_ar: "تصاميم حصرية خاصّة بنا",
      text_en: "Exclusive In-House Designs",
      color: "amber",
      enabled: true,
    },
    {
      id: "badge-payments",
      icon: "Banknote",
      text_ar: "الدفع كاش عند الاستلام أو بنفت بي",
      text_en: "Cash on Arrival & BenefitPay",
      color: "emerald",
      enabled: true,
    },
    {
      id: "badge-security",
      icon: "ShieldCheck",
      text_ar: "موقع آمن ومشفّر 256-Bit",
      text_en: "256-Bit SSL Encrypted",
      color: "sky",
      enabled: true,
    },
    {
      id: "badge-delivery",
      icon: "Truck",
      text_ar: "توصيل سريع ومباشر",
      text_en: "Fast Local Delivery",
      color: "purple",
      enabled: true,
    },
  ],
};

export interface BadgeColorPreset {
  id: string;
  label_ar: string;
  label_en: string;
  textClass: string;
  bgClass: string;
  dotColor: string;
}

export const BADGE_COLOR_PRESETS: BadgeColorPreset[] = [
  {
    id: "amber",
    label_ar: "ذهبي / كهرماني",
    label_en: "Amber / Gold",
    textClass: "text-amber-400",
    bgClass: "bg-amber-400/10",
    dotColor: "#fbbf24",
  },
  {
    id: "emerald",
    label_ar: "أخضر / زمردي",
    label_en: "Emerald / Green",
    textClass: "text-emerald-400",
    bgClass: "bg-emerald-400/10",
    dotColor: "#34d399",
  },
  {
    id: "sky",
    label_ar: "سماوي / أزرق آمن",
    label_en: "Sky / Blue",
    textClass: "text-sky-400",
    bgClass: "bg-sky-400/10",
    dotColor: "#38bdf8",
  },
  {
    id: "purple",
    label_ar: "بنفسجي / ملكي",
    label_en: "Purple / Royal",
    textClass: "text-purple-400",
    bgClass: "bg-purple-400/10",
    dotColor: "#c084fc",
  },
  {
    id: "rose",
    label_ar: "وردي / بوتيك",
    label_en: "Rose / Boutique",
    textClass: "text-rose-400",
    bgClass: "bg-rose-400/10",
    dotColor: "#fb7185",
  },
  {
    id: "indigo",
    label_ar: "نيلي / داكن",
    label_en: "Indigo / Deep Blue",
    textClass: "text-indigo-400",
    bgClass: "bg-indigo-400/10",
    dotColor: "#818cf8",
  },
  {
    id: "neutral",
    label_ar: "حيادي / لون الفوتر",
    label_en: "Neutral / Muted",
    textClass: "text-current opacity-80",
    bgClass: "bg-white/10",
    dotColor: "#9ca3af",
  },
];

export interface IconCatalogItem {
  id: string;
  name: string;
  icon: LucideIcon;
  label_ar: string;
  label_en: string;
  description_ar: string;
  description_en: string;
  category: "security" | "payment" | "delivery" | "quality" | "support" | "general";
  keywords: string[];
}

export const TRUST_ICON_CATALOG: IconCatalogItem[] = [
  // --- Quality, Craftsmanship & Fashion ---
  {
    id: "Sparkles",
    name: "Sparkles",
    icon: Sparkles,
    label_ar: "بريق ولمعان",
    label_en: "Sparkles / Magic",
    description_ar: "تصاميم حصرية، قطع مميزة، لمسة فاخرة، صناعة يدوية",
    description_en: "Exclusive in-house designs, premium touches, luxury handcrafted",
    category: "quality",
    keywords: ["sparkle", "star", "exclusive", "design", "shine", "بريق", "حصري", "تصاميم", "لمعان", "فاخر"],
  },
  {
    id: "Star",
    name: "Star",
    icon: Star,
    label_ar: "نجمة التميز",
    label_en: "Star / Rating",
    description_ar: "أعلى تقييم، جودة ممتازة، المنتجات الأكثر تفضيلاً",
    description_en: "Top rated, best quality, customer favorite selections",
    category: "quality",
    keywords: ["star", "rating", "best", "quality", "نجمة", "تقييم", "ممتاز", "جودة", "المفضل"],
  },
  {
    id: "Crown",
    name: "Crown",
    icon: Crown,
    label_ar: "تاج الملكي",
    label_en: "Crown / VIP",
    description_ar: "ماركة ملكية، خدمة VIP راقية، تشكيلة فاخرة",
    description_en: "Royal boutique, luxury VIP treatment, premium curation",
    category: "quality",
    keywords: ["crown", "king", "queen", "vip", "luxury", "تاج", "ملكي", "فاخر", "راقي"],
  },
  {
    id: "Gem",
    name: "Gem",
    icon: Gem,
    label_ar: "جوهرة",
    label_en: "Gem / Jewelry",
    description_ar: "قطع نادرة، مجوهرات، أحجار كريمة، خامات أصيلة",
    description_en: "Rare pieces, jewelry, precious materials, authentic gems",
    category: "quality",
    keywords: ["gem", "diamond", "jewel", "luxury", "جوهرة", "الماس", "ذهب", "نادر", "أصيل"],
  },
  {
    id: "Shirt",
    name: "Shirt",
    icon: Shirt,
    label_ar: "أزياء وملابس",
    label_en: "Fashion / Apparel",
    description_ar: "أزياء نسائية، عبايات، فساتين، تفصيل حسب المقاس",
    description_en: "Apparel, abayas, dresses, tailored couture fit",
    category: "quality",
    keywords: ["shirt", "clothes", "fashion", "abaya", "dress", "أزياء", "ملابس", "عباية", "فستان", "تفصيل"],
  },
  {
    id: "Scissors",
    name: "Scissors",
    icon: Scissors,
    label_ar: "مقص الخياطة والتفصيل",
    label_en: "Scissors / Tailoring",
    description_ar: "خياطة وتفصيل دقيق، تعديل مقاسات، حياكة يدوية",
    description_en: "Custom tailoring, precision alteration, handcrafted stitching",
    category: "quality",
    keywords: ["scissors", "tailor", "cut", "sew", "مقص", "خياطة", "تفصيل", "حياكة", "تعديل"],
  },
  {
    id: "Palette",
    name: "Palette",
    icon: Palette,
    label_ar: "لوحة ألوان",
    label_en: "Color Palette",
    description_ar: "ألوان متنوعة، تشكيلات موسمية، درجات مخصصة",
    description_en: "Wide color palette, seasonal tones, bespoke shades",
    category: "quality",
    keywords: ["palette", "colors", "art", "design", "ألوان", "باليت", "فن", "تصميم"],
  },

  // --- Payment & Finance ---
  {
    id: "Banknote",
    name: "Banknote",
    icon: Banknote,
    label_ar: "أوراق نقدية كاش",
    label_en: "Cash / Banknote",
    description_ar: "الدفع نقداً عند الاستلام، كاش بدون بطاقة، تسوية فورية",
    description_en: "Cash on delivery, pay upon arrival, instant settlement",
    category: "payment",
    keywords: ["cash", "money", "banknote", "cod", "arrival", "كاش", "نقد", "عند الاستلام", "فلوس", "عملة"],
  },
  {
    id: "CreditCard",
    name: "CreditCard",
    icon: CreditCard,
    label_ar: "بطاقة دفع ائتمانية",
    label_en: "Credit Card / Debit",
    description_ar: "دفع آمن بالفيزا وماستركارد وبطاقات مدى وبنفت بي",
    description_en: "Debit/Credit cards, Visa, Mastercard, BenefitPay, Mada",
    category: "payment",
    keywords: ["card", "credit", "visa", "mastercard", "benefit", "mada", "بطاقة", "فيزا", "مدى", "بنفت", "دفع"],
  },
  {
    id: "Wallet",
    name: "Wallet",
    icon: Wallet,
    label_ar: "المحفظة الإلكترونية",
    label_en: "Digital Wallet",
    description_ar: "دفع سريع عبر المحافظ الرقمية وآبل باي وسهل",
    description_en: "Digital wallets, Apple Pay, Google Pay, fast checkout",
    category: "payment",
    keywords: ["wallet", "apple pay", "google pay", "محفظة", "آبل باي", "دفع سريع"],
  },
  {
    id: "Coins",
    name: "Coins",
    icon: Coins,
    label_ar: "عملات معدنية وتوفير",
    label_en: "Coins / Savings",
    description_ar: "أفضل الأسعار، توفير حقيقي، كاش باك ونقاط ولاء",
    description_en: "Best prices, real savings, cashback and reward points",
    category: "payment",
    keywords: ["coins", "points", "cashback", "save", "عملات", "نقاط", "توفير", "كاش باك"],
  },
  {
    id: "Receipt",
    name: "Receipt",
    icon: Receipt,
    label_ar: "فاتورة ضريبية رسمية",
    label_en: "Official Invoice",
    description_ar: "فواتير إلكترونية معتمدة وشاملة للضريبة ورقم التتبع",
    description_en: "Official VAT compliant e-invoices with itemized tracking",
    category: "payment",
    keywords: ["receipt", "invoice", "vat", "tax", "فاتورة", "ضريبة", "إيصال"],
  },
  {
    id: "CircleDollarSign",
    name: "CircleDollarSign",
    icon: CircleDollarSign,
    label_ar: "رمز الدفع والعملة",
    label_en: "Currency / Price",
    description_ar: "شفافية الأسعار، لا رسوم خفية، تسعير شامل",
    description_en: "Transparent pricing, no hidden fees, clear totals",
    category: "payment",
    keywords: ["price", "money", "dollar", "fee", "سعر", "رسوم", "عملة"],
  },
  {
    id: "QrCode",
    name: "QrCode",
    icon: QrCode,
    label_ar: "رمز QR / بنفت بي",
    label_en: "QR Code / BenefitPay",
    description_ar: "الدفع بمسح كود QR عبر BenefitPay أو التحويل البنكي الفوري",
    description_en: "Scan & Pay QR via BenefitPay or instant bank transfer",
    category: "payment",
    keywords: ["qr", "scan", "benefitpay", "transfer", "كود", "مسح", "بنفت", "تحويل"],
  },

  // --- Security & Trust ---
  {
    id: "ShieldCheck",
    name: "ShieldCheck",
    icon: ShieldCheck,
    label_ar: "درع الأمان والتحقق",
    label_en: "Shield Check / Verified",
    description_ar: "تسوق آمن ومحمي، بيانات مشفرة، متجر موثق ومعتمد",
    description_en: "Secure shopping, encrypted customer data, verified store",
    category: "security",
    keywords: ["shield", "security", "safe", "verified", "protect", "درع", "أمان", "حماية", "موثق", "تشفير"],
  },
  {
    id: "Lock",
    name: "Lock",
    icon: Lock,
    label_ar: "قفل الأمان والتشفير",
    label_en: "SSL 256-Bit Lock",
    description_ar: "تشفير تام 256-Bit SSL، خصوصية كاملة للمعلومات",
    description_en: "256-Bit SSL encryption, total privacy and protection",
    category: "security",
    keywords: ["lock", "ssl", "encrypt", "secure", "private", "قفل", "تشفير", "سري", "خصوصية", "أمان"],
  },
  {
    id: "Shield",
    name: "Shield",
    icon: Shield,
    label_ar: "حماية المشتري",
    label_en: "Buyer Protection",
    description_ar: "حماية المشتري، ضمان استلام الطلب بالكامل",
    description_en: "Complete buyer protection and delivery guarantee",
    category: "security",
    keywords: ["shield", "guard", "protection", "حماية", "أمان", "ضمان"],
  },
  {
    id: "KeyRound",
    name: "KeyRound",
    icon: KeyRound,
    label_ar: "مفتاح الخصوصية",
    label_en: "Privacy Key",
    description_ar: "بياناتك الشخصية محمية بالكامل ولا تشارك مع أي طرف",
    description_en: "Private data securely locked, zero third-party sharing",
    category: "security",
    keywords: ["key", "privacy", "access", "مفتاح", "خصوصية", "سرية"],
  },
  {
    id: "Fingerprint",
    name: "Fingerprint",
    icon: Fingerprint,
    label_ar: "البصمة والهوية الموثقة",
    label_en: "Biometric / Authentic",
    description_ar: "منتجات أصلية 100% موثقة الهوية والمصدر",
    description_en: "100% authentic items with verified origin identity",
    category: "security",
    keywords: ["fingerprint", "identity", "authentic", "بصمة", "أصلي", "هوية", "توثيق"],
  },
  {
    id: "Award",
    name: "Award",
    icon: Award,
    label_ar: "وسام الجودة والاعتماد",
    label_en: "Certified Quality Award",
    description_ar: "علامة تجارية مرخصة ومعتمدة رسمياً وموثوقة",
    description_en: "Officially certified brand, trusted merchant badge",
    category: "security",
    keywords: ["award", "certified", "license", "badge", "وسام", "معتمد", "مرخص", "جائزة"],
  },
  {
    id: "BadgeCheck",
    name: "BadgeCheck",
    icon: BadgeCheck,
    label_ar: "شارة التوثيق والضمان",
    label_en: "Verified Badge",
    description_ar: "حساب تجاري موثق، متجر مضمون وخاضع للرقابة",
    description_en: "Verified business account, authentic inspected products",
    category: "security",
    keywords: ["badge", "verified", "guarantee", "شارة", "موثق", "تحقق", "ضمان"],
  },

  // --- Shipping & Delivery ---
  {
    id: "Truck",
    name: "Truck",
    icon: Truck,
    label_ar: "شاحنة التوصيل السريع",
    label_en: "Express Delivery Truck",
    description_ar: "توصيل سريع ومباشر لكافة مناطق البحرين والخليج",
    description_en: "Fast local delivery across Bahrain and GCC couriers",
    category: "delivery",
    keywords: ["truck", "shipping", "delivery", "fast", "express", "شاحنة", "توصيل", "شحن", "سريع", "مندوب"],
  },
  {
    id: "Package",
    name: "Package",
    icon: Package,
    label_ar: "طرد وشحنة مغلفة",
    label_en: "Packaged Parcel",
    description_ar: "تغليف فاخر وآمن يحمي المنتجات حتى باب منزلك",
    description_en: "Premium secure gift packaging delivered to your door",
    category: "delivery",
    keywords: ["package", "parcel", "box", "wrap", "طرد", "شحنة", "تغليف", "صندوق"],
  },
  {
    id: "PackageCheck",
    name: "PackageCheck",
    icon: PackageCheck,
    label_ar: "فحص وتأكيد الشحنة",
    label_en: "Inspected & Packed",
    description_ar: "فحص جودة الشحنة وتأكيد القطع قبل الإرسال",
    description_en: "Quality inspection and count verification before shipping",
    category: "delivery",
    keywords: ["check", "inspect", "pack", "ready", "فحص", "تأكيد", "جاهز", "شحنة"],
  },
  {
    id: "Zap",
    name: "Zap",
    icon: Zap,
    label_ar: "توصيل فوري خاطف",
    label_en: "Same-Day Instant Delivery",
    description_ar: "توصيل خلال نفس اليوم في ساعات معدودة",
    description_en: "Lightning-fast same day delivery in record hours",
    category: "delivery",
    keywords: ["zap", "flash", "fast", "instant", "same day", "برق", "سريع", "فوري", "نفس اليوم"],
  },
  {
    id: "Clock",
    name: "Clock",
    icon: Clock,
    label_ar: "التزام بالمواعيد",
    label_en: "Punctual Timing",
    description_ar: "مواعيد تسليم دقيقة بدون تأخير",
    description_en: "Precise delivery time windows without delay",
    category: "delivery",
    keywords: ["clock", "time", "hour", "punctual", "وقت", "ساعة", "مواعيد", "التزام"],
  },
  {
    id: "Plane",
    name: "Plane",
    icon: Plane,
    label_ar: "شحن جوي ودولي",
    label_en: "Worldwide Air Shipping",
    description_ar: "شحن لكافة دول الخليج والعالم عبر الطيران السريع",
    description_en: "Express air cargo across all GCC countries and worldwide",
    category: "delivery",
    keywords: ["plane", "air", "international", "gcc", "طيران", "جوي", "دولي", "خليج", "شحن"],
  },
  {
    id: "MapPin",
    name: "MapPin",
    icon: MapPin,
    label_ar: "تتبع الموقع والمندوب",
    label_en: "Live GPS Tracking",
    description_ar: "تتبع حركة الطلب والمندوب على الخريطة مباشرة",
    description_en: "Live GPS tracking of driver and order status",
    category: "delivery",
    keywords: ["map", "pin", "location", "track", "موقع", "خريطة", "تتبع", "عنوان"],
  },

  // --- Guarantees & Support ---
  {
    id: "RefreshCw",
    name: "RefreshCw",
    icon: RefreshCw,
    label_ar: "استبدال واسترجاع سهل",
    label_en: "Easy Exchange & Return",
    description_ar: "إمكانية الاسترجاع أو استبدال المقاس بكل سلاسة",
    description_en: "Hassle-free return and size exchange policy",
    category: "support",
    keywords: ["refresh", "return", "exchange", "swap", "استرجاع", "استبدال", "تغيير", "مقاس", "إرجاع"],
  },
  {
    id: "RotateCcw",
    name: "RotateCcw",
    icon: RotateCcw,
    label_ar: "استرداد الأموال",
    label_en: "Money-Back Guarantee",
    description_ar: "ضمان استرداد المبلغ في حال عدم مطابقة المنتج",
    description_en: "Full refund if items do not match expectations",
    category: "support",
    keywords: ["refund", "money back", "return", "استرداد", "ضمان", "إرجاع فلوس"],
  },
  {
    id: "Headphones",
    name: "Headphones",
    icon: Headphones,
    label_ar: "خدمة العملاء على مدار الساعة",
    label_en: "24/7 Customer Care",
    description_ar: "فريق دعم متاح لمساعدتك والإجابة على كل استفسار",
    description_en: "Support team ready to assist you anytime",
    category: "support",
    keywords: ["headphones", "support", "help", "care", "سماعات", "خدمة عملاء", "دعم", "مساعدة"],
  },
  {
    id: "MessageCircle",
    name: "MessageCircle",
    icon: MessageCircle,
    label_ar: "تواصل مباشر واتساب",
    label_en: "Direct WhatsApp Chat",
    description_ar: "رد فوري واستفسار مباشر عبر محادثة الواتساب",
    description_en: "Instant reply and direct assistance via WhatsApp",
    category: "support",
    keywords: ["whatsapp", "chat", "message", "واتساب", "شات", "محادثة", "رسائل", "تواصل"],
  },
  {
    id: "Phone",
    name: "Phone",
    icon: Phone,
    label_ar: "اتصال هاتفي مباشر",
    label_en: "Direct Call Assistance",
    description_ar: "تواصل مباشر مع المتجر والمندوب عبر الهاتف",
    description_en: "Direct phone line to store management and courier",
    category: "support",
    keywords: ["phone", "call", "contact", "هاتف", "اتصال", "مكالمة", "تواصل"],
  },
  {
    id: "HeartHandshake",
    name: "HeartHandshake",
    icon: HeartHandshake,
    label_ar: "ثقة ورضا تام",
    label_en: "Trusted Commitment",
    description_ar: "علاقة ثقة مبنية على رضاك التام كعميل مميز",
    description_en: "Dedicated to complete customer satisfaction",
    category: "support",
    keywords: ["handshake", "trust", "satisfaction", "ثقة", "مصافحة", "رضا", "اتفاق"],
  },
  {
    id: "Smile",
    name: "Smile",
    icon: Smile,
    label_ar: "ابتسامة وسعادة المتسوق",
    label_en: "Customer Happiness",
    description_ar: "تجربة تسوق مبهجة تضمن سعادتك بكل قطعة",
    description_en: "Delightful shopping experience that sparks joy",
    category: "support",
    keywords: ["smile", "happy", "joy", "ابتسامة", "سعادة", "فرحة"],
  },

  // --- General Ecommerce & Highlights ---
  {
    id: "Gift",
    name: "Gift",
    icon: Gift,
    label_ar: "هدايا وتغليف فاخر",
    label_en: "Gift Wrapping & Cards",
    description_ar: "إمكانية إهداء المنتجات مع كرت إهداء وتغليف راقي",
    description_en: "Complimentary gift packaging and custom message card",
    category: "general",
    keywords: ["gift", "present", "wrap", "box", "هدية", "هدايا", "تغليف", "كرت"],
  },
  {
    id: "Tag",
    name: "Tag",
    icon: Tag,
    label_ar: "عروض وأسعار خاصة",
    label_en: "Exclusive Discounts",
    description_ar: "خصومات حصرية وكوبونات للمشتركين والعملاء المميزين",
    description_en: "Special coupon codes and subscriber member discounts",
    category: "general",
    keywords: ["tag", "discount", "sale", "offer", "خصم", "تخفيض", "عرض", "كوبون"],
  },
  {
    id: "Percent",
    name: "Percent",
    icon: Percent,
    label_ar: "تخفيضات موسمية",
    label_en: "Seasonal Sale",
    description_ar: "تخفيضات وعروض موسمية لا تُفوّت",
    description_en: "Seasonal promotional sales on selected items",
    category: "general",
    keywords: ["percent", "sale", "discount", "نسبة", "تخفيض", "عروض"],
  },
  {
    id: "Flame",
    name: "Flame",
    icon: Flame,
    label_ar: "الأكثر طلباً ورواجاً",
    label_en: "Trending Hot Items",
    description_ar: "القطع الأكثر طلباً ومبيعاً على المتجر",
    description_en: "Most popular bestselling trends right now",
    category: "general",
    keywords: ["flame", "hot", "trend", "popular", "شعلة", "ترند", "الأكثر طلبا", "رائج"],
  },
  {
    id: "Leaf",
    name: "Leaf",
    icon: Leaf,
    label_ar: "أقمشة طبيعية ومستدامة",
    label_en: "Natural & Eco Friendly",
    description_ar: "خامات طبيعية 100% قطنية ناعمة وصديقة للبيئة",
    description_en: "100% natural, soft, breathable, eco-friendly fabrics",
    category: "general",
    keywords: ["leaf", "eco", "natural", "organic", "ورقة", "طبيعي", "قطن", "عضوي"],
  },
  {
    id: "Globe",
    name: "Globe",
    icon: Globe,
    label_ar: "متجر معتمد إقليمياً",
    label_en: "Regional GCC Store",
    description_ar: "نخدم العملاء في البحرين، السعودية، الإمارات، الكويت، عمان وقطر",
    description_en: "Serving customers across Bahrain and all GCC territories",
    category: "general",
    keywords: ["globe", "world", "gcc", "region", "عالمي", "إقليمي", "خليج", "دول"],
  },
];

// Helper to look up an icon component or return a fallback
const ICON_MAP = new Map<string, LucideIcon>();
TRUST_ICON_CATALOG.forEach((item) => {
  ICON_MAP.set(item.id.toLowerCase(), item.icon);
  ICON_MAP.set(item.name.toLowerCase(), item.icon);
});

// Also add common emoji synonyms
export const EMOJI_TO_ICON_ID: Record<string, string> = {
  "✨": "Sparkles",
  "⭐": "Star",
  "💸": "Banknote",
  "💵": "Banknote",
  "💳": "CreditCard",
  "🔒": "Lock",
  "🛡️": "ShieldCheck",
  "🚚": "Truck",
  "📦": "Package",
  "⚡": "Zap",
  "🎁": "Gift",
  "👑": "Crown",
  "💎": "Gem",
  "🔄": "RefreshCw",
};

export function resolveTrustBadgeIcon(iconKey: string): LucideIcon | null {
  if (!iconKey) return null;
  const normalized = iconKey.trim();
  const fromEmoji = EMOJI_TO_ICON_ID[normalized];
  if (fromEmoji) {
    const icon = ICON_MAP.get(fromEmoji.toLowerCase());
    if (icon) return icon;
  }
  return ICON_MAP.get(normalized.toLowerCase()) ?? null;
}

export function getColorPreset(colorId: string | undefined): BadgeColorPreset {
  if (!colorId) return BADGE_COLOR_PRESETS[0];
  const found = BADGE_COLOR_PRESETS.find((c) => c.id === colorId.toLowerCase());
  return found ?? BADGE_COLOR_PRESETS[0];
}

export function renderTrustBadgeIcon(
  iconKey: string,
  className = "w-4 h-4",
  colorId?: string,
): React.ReactElement {
  const IconComponent = resolveTrustBadgeIcon(iconKey);
  const colorPreset = getColorPreset(colorId);

  if (IconComponent) {
    return React.createElement(IconComponent, {
      className: `${className} ${colorPreset.textClass} shrink-0`,
      "aria-hidden": "true",
    });
  }

  // Fallback to emoji if string is an emoji
  return React.createElement(
    "span",
    {
      className: `shrink-0 text-base leading-none select-none`,
      role: "img",
      "aria-hidden": "true",
    },
    iconKey || "✨",
  );
}
