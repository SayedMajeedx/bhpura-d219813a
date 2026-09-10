import React, { useState, useMemo, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Search,
  X,
  ChevronRight,
  Building2,
  Receipt,
  Store,
  Truck,
  CreditCard,
  Mail,
  ShieldCheck,
  Smartphone,
  Sparkles,
} from "lucide-react";
import type { SettingsTabId } from "@/components/settings/SettingsScopeSwitcher";

interface SettingsSearchEntry {
  id: string;
  tabId: SettingsTabId;
  targetId?: string;
  title_ar: string;
  title_en: string;
  keywords_ar: string[];
  keywords_en: string[];
  category_ar: string;
  category_en: string;
  icon: React.ElementType;
}

const SETTINGS_SEARCH_INDEX: SettingsSearchEntry[] = [
  {
    id: "business-profile",
    tabId: "business",
    title_ar: "الملف التجاري والشعار",
    title_en: "Business Profile & Logo",
    keywords_ar: ["شعار", "اسم المتجر", "لوجو", "العنوان", "الهاتف", "السجل التجاري", "البريد"],
    keywords_en: ["logo", "business name", "phone", "address", "cr number", "email", "contact"],
    category_ar: "الملف التجاري",
    category_en: "Business Profile",
    icon: Building2,
  },
  {
    id: "currency-tax",
    tabId: "business",
    title_ar: "العملة ونسبة الضريبة المضافة (VAT)",
    title_en: "Currency & Tax Rate (VAT)",
    keywords_ar: ["العملة", "دينار", "ريال", "دولار", "ضريبة", "القيمة المضافة", "vat", "tax"],
    keywords_en: ["currency", "bhd", "sar", "usd", "tax rate", "vat number", "vat percentage"],
    category_ar: "الملف التجاري",
    category_en: "Business Profile",
    icon: Building2,
  },
  {
    id: "invoice-templates",
    tabId: "invoice",
    title_ar: "قوالب الفاتورة الضريبية وتصميم الإيصال",
    title_en: "Tax Invoice Templates & Receipt Styling",
    keywords_ar: ["فاتورة", "طباعة", "حراري", "إيصال", "قالب الفاتورة", "ملاحظات الفاتورة", "رقم الفاتورة"],
    keywords_en: ["invoice", "thermal print", "receipt", "invoice template", "footer notes", "invoice number"],
    category_ar: "الفاتورة والطباعة",
    category_en: "Invoicing",
    icon: Receipt,
  },
  {
    id: "storefront-theme",
    tabId: "storefront",
    title_ar: "ألوان وهوية المتجر البصرية",
    title_en: "Storefront Colors & Visual Identity",
    keywords_ar: ["ألوان", "اللون الأساسي", "الثيم", "المظهر", "تصميم المتجر", "خلفية", "الهوية"],
    keywords_en: ["colors", "primary color", "theme", "palette", "storefront design", "background"],
    category_ar: "تصميم المتجر والـ SEO",
    category_en: "Storefront & Branding",
    icon: Store,
  },
  {
    id: "storefront-fonts",
    tabId: "storefront",
    title_ar: "خطوط المتجر العربية والإنجليزية",
    title_en: "Storefront Arabic & English Typography",
    keywords_ar: ["خط", "خطوط", "عربي", "تايبوغرافي", "cairo", "tajawal", "alexandria", "google fonts"],
    keywords_en: ["fonts", "typography", "arabic fonts", "font family", "google fonts"],
    category_ar: "تصميم المتجر والـ SEO",
    category_en: "Storefront & Branding",
    icon: Store,
  },
  {
    id: "storefront-banners",
    tabId: "storefront",
    title_ar: "بنرات الصفحة الرئيسية والعروض",
    title_en: "Homepage Hero Banners & Promo Cards",
    keywords_ar: ["بنر", "سلايدر", "عروض", "صورة البنر", "فيديو", "الصفحة الرئيسية", "hero"],
    keywords_en: ["banner", "hero slider", "promos", "slides", "homepage carousel"],
    category_ar: "تصميم المتجر والـ SEO",
    category_en: "Storefront & Branding",
    icon: Store,
  },
  {
    id: "storefront-trust-badges",
    tabId: "storefront",
    title_ar: "شارات الثقة والضمان للمتجر",
    title_en: "Store Trust & Guarantee Badges",
    keywords_ar: ["شارات الثقة", "ضمان", "توصيل سريع", "دفع آمن", "trust badges"],
    keywords_en: ["trust badges", "guarantees", "secure payment", "fast delivery"],
    category_ar: "تصميم المتجر والـ SEO",
    category_en: "Storefront & Branding",
    icon: Sparkles,
  },
  {
    id: "storefront-seo",
    tabId: "storefront",
    title_ar: "تهيئة محركات البحث (SEO)",
    title_en: "Search Engine Optimization (SEO)",
    keywords_ar: ["seo", "محركات البحث", "جوجل", "meta title", "وصف المتجر", "الكلمات الدلالية"],
    keywords_en: ["seo", "meta title", "meta description", "google search", "social preview"],
    category_ar: "تصميم المتجر والـ SEO",
    category_en: "Storefront & Branding",
    icon: Store,
  },
  {
    id: "checkout-shipping",
    tabId: "checkout",
    title_ar: "مناطق الشحن ورسوم التوصيل المحلي",
    title_en: "Delivery Zones & Local Shipping Rates",
    keywords_ar: ["شحن", "توصيل", "رسوم التوصيل", "مناطق الشحن", "شحن مجاني", "مندوب", "zones"],
    keywords_en: ["shipping", "delivery fee", "delivery zones", "free delivery threshold", "courier rates"],
    category_ar: "الشحن والتسليم",
    category_en: "Fulfillment",
    icon: Truck,
  },
  {
    id: "checkout-pickup",
    tabId: "checkout",
    title_ar: "الاستلام من الفرع أو المتجر",
    title_en: "Store Pickup & Click & Collect",
    keywords_ar: ["استلام", "فرع", "الموقع", "pickup", "استلام من المتجر"],
    keywords_en: ["pickup", "store pickup", "branch collection", "click and collect"],
    category_ar: "الشحن والتسليم",
    category_en: "Fulfillment",
    icon: Truck,
  },
  {
    id: "payment-methods",
    tabId: "payments",
    title_ar: "طرق الدفع (بنفت، بطاقة، الدفع عند الاستلام)",
    title_en: "Payment Gateways (BenefitPay, Cards, COD)",
    keywords_ar: ["دفع", "بنفت", "benefitpay", "بطاقة", "فيزا", "مدى", "كاش", "الدفع عند الاستلام", "cod", "بوابة دفع"],
    keywords_en: ["payments", "benefitpay", "card", "credit card", "debit", "cod", "cash on delivery", "tap"],
    category_ar: "طرق الدفع",
    category_en: "Payments",
    icon: CreditCard,
  },
  {
    id: "notifications-email",
    tabId: "emails",
    title_ar: "إشعارات الطلبات ورسائل البريد والواتساب",
    title_en: "Order Notifications, Email & WhatsApp",
    keywords_ar: ["إشعارات", "بريد", "إيميل", "واتساب", "رسائل", "تأكيد الطلب", "فواتير للعميل"],
    keywords_en: ["notifications", "email alerts", "whatsapp messages", "order confirmation", "receipts"],
    category_ar: "الإشعارات والبريد",
    category_en: "Notifications",
    icon: Mail,
  },
  {
    id: "security-passkeys",
    tabId: "security",
    title_ar: "الأمان ومفاتيح المرور البيومترية (Passkeys)",
    title_en: "Security, Passkeys & Biometric Login",
    keywords_ar: ["أمان", "بصمة", "passkey", "مفاتيح المرور", "دخول سريع", "حماية", "الدعم الفني"],
    keywords_en: ["security", "passkeys", "biometrics", "face id", "fingerprint", "support access"],
    category_ar: "الأمان والبصمة",
    category_en: "Security",
    icon: ShieldCheck,
  },
  {
    id: "mobile-apps",
    tabId: "apps",
    title_ar: "تطبيقات الجوال والباركود للمتجر",
    title_en: "Mobile Apps & Store QR Code",
    keywords_ar: ["تطبيق", "جوال", "موبايل", "ios", "android", "qr code", "باركود"],
    keywords_en: ["mobile apps", "app store", "google play", "qr code", "smartphone"],
    category_ar: "تطبيقات الجوال",
    category_en: "Mobile Apps",
    icon: Smartphone,
  },
  {
    id: "subscription-plan",
    tabId: "subscription",
    title_ar: "خطة الاشتراك والترخيص والفوترة",
    title_en: "Subscription Plan, Licensing & Billing",
    keywords_ar: ["اشتراك", "باقة", "ترخيص", "ترقية", "فاتورة المنصة", "تجديد"],
    keywords_en: ["subscription", "plan tier", "billing", "upgrade", "license", "renewal"],
    category_ar: "الاشتراك والترخيص",
    category_en: "Subscription",
    icon: CreditCard,
  },
];

interface SettingsSearchBarProps {
  lang: "ar" | "en";
  onSelectResult: (tabId: SettingsTabId) => void;
}

export function SettingsSearchBar({ lang, onSelectResult }: SettingsSearchBarProps) {
  const isAr = lang === "ar";
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const trimmed = query.trim().toLowerCase();

  const results = useMemo(() => {
    if (!trimmed) return [];
    return SETTINGS_SEARCH_INDEX.filter((entry) => {
      const matchTitleAr = entry.title_ar.toLowerCase().includes(trimmed);
      const matchTitleEn = entry.title_en.toLowerCase().includes(trimmed);
      const matchCategoryAr = entry.category_ar.toLowerCase().includes(trimmed);
      const matchCategoryEn = entry.category_en.toLowerCase().includes(trimmed);
      const matchKeywordsAr = entry.keywords_ar.some((kw) => kw.toLowerCase().includes(trimmed));
      const matchKeywordsEn = entry.keywords_en.some((kw) => kw.toLowerCase().includes(trimmed));
      return (
        matchTitleAr ||
        matchTitleEn ||
        matchCategoryAr ||
        matchCategoryEn ||
        matchKeywordsAr ||
        matchKeywordsEn
      );
    });
  }, [trimmed]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (tabId: SettingsTabId) => {
    onSelectResult(tabId);
    setQuery("");
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-xl">
      <div className="relative">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={
            isAr
              ? "ابحث في الإعدادات (الشعار، العملة، ألوان المتجر، رسوم الشحن، طرق الدفع...)"
              : "Search settings (logo, currency, storefront theme, shipping rates, payments...)"
          }
          className="h-9 ps-9 pe-9 text-xs rounded-xl bg-background border-border/80 shadow-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        />
        {query && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setQuery("");
              setIsOpen(false);
            }}
            className="absolute end-1.5 top-1/2 -translate-y-1/2 h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
            aria-label={isAr ? "مسح البحث" : "Clear search"}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Dropdown Results */}
      {isOpen && trimmed.length > 0 && (
        <div className="absolute top-full start-0 end-0 mt-1.5 z-50 rounded-xl border border-border/80 bg-popover/95 backdrop-blur-md shadow-xl overflow-hidden animate-fade-in max-h-80 overflow-y-auto">
          {results.length > 0 ? (
            <div className="p-1.5 space-y-1">
              <div className="px-2 py-1 text-[11px] font-semibold text-muted-foreground">
                {isAr
                  ? `عُثر على ${results.length} خيار مطابق`
                  : `Found ${results.length} matching setting(s)`}
              </div>
              {results.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelect(item.tabId)}
                    className="w-full flex items-center justify-between gap-3 p-2 rounded-lg text-start hover:bg-muted/70 transition-colors group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-foreground block truncate">
                          {isAr ? item.title_ar : item.title_en}
                        </span>
                        <span className="text-[11px] text-muted-foreground block truncate">
                          {isAr ? item.category_ar : item.category_en}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 text-muted-foreground group-hover:text-primary transition-colors">
                      <span className="text-[11px] font-semibold hidden sm:inline">
                        {isAr ? "الانتقال للقسم" : "Jump to section"}
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" />
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="p-4 text-center text-xs text-muted-foreground">
              {isAr
                ? `لم يتم العثور على إعداد مطابق لـ "${query}"`
                : `No settings matching "${query}"`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}