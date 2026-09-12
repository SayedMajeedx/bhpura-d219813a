import React, { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Sparkles,
  ArrowRight,
  Store,
  Package,
  CreditCard,
  Truck,
  FileText,
  Image,
  X,
} from "lucide-react";
import type { SettingsTabId } from "@/components/settings/SettingsScopeSwitcher";

export interface BusinessSettingsData {
  logo_url?: string | null;
  cod_enabled?: boolean | null;
  card_enabled?: boolean | null;
  benefit_enabled?: boolean | null;
  delivery_enabled?: boolean | null;
  pickup_enabled?: boolean | null;
  delivery_fee?: number | string | null;
  shipping_zones?: any[] | null;
  pages?: any;
}

export interface ReadinessEvaluationInput {
  logoUrl?: string | null;
  activeProductsCount: number;
  businessSettings?: BusinessSettingsData | null;
  brandLogoUrl?: string | null;
  lang?: "ar" | "en";
}

export interface ReadinessItem {
  id: "logo" | "products" | "payments" | "fulfillment" | "policies";
  icon: React.ElementType;
  title: string;
  description: string;
  isComplete: boolean;
  actionType: "tab" | "link";
  tabId?: SettingsTabId;
  href?: string;
  actionLabel: string;
  editLabel: string;
}

export function evaluateStoreReadiness(input: ReadinessEvaluationInput) {
  const isAr = input.lang !== "en";
  const bData = input.businessSettings;

  // 1. Logo
  const resolvedLogoUrl =
    input.logoUrl && input.logoUrl.trim().length > 0
      ? input.logoUrl.trim()
      : bData?.logo_url && bData.logo_url.trim().length > 0
        ? bData.logo_url.trim()
        : input.brandLogoUrl && input.brandLogoUrl.trim().length > 0
          ? input.brandLogoUrl.trim()
          : null;
  const hasLogo = Boolean(resolvedLogoUrl);

  // 2. Products
  const activeProducts = input.activeProductsCount ?? 0;
  const hasProducts = activeProducts > 0;

  // 3. Payments
  const hasPayments = Boolean(
    bData && (bData.cod_enabled || bData.card_enabled || bData.benefit_enabled),
  );

  // 4. Fulfillment
  const hasFulfillment = Boolean(
    bData &&
    (bData.delivery_enabled ||
      bData.pickup_enabled ||
      (Array.isArray(bData.shipping_zones) && bData.shipping_zones.length > 0) ||
      (bData.delivery_fee != null &&
        Number(bData.delivery_fee) >= 0 &&
        bData.delivery_enabled !== false)),
  );

  // 5. CMS / Policy Pages
  const rawPages = bData?.pages;
  const pagesList: any[] = Array.isArray(rawPages)
    ? rawPages
    : Array.isArray((rawPages as any)?.pages)
      ? (rawPages as any).pages
      : [];

  const validPages = pagesList.filter(
    (p) =>
      p &&
      (Boolean(p.slug) ||
        Boolean(p.title_ar) ||
        Boolean(p.title_en) ||
        Boolean(p.content_ar) ||
        Boolean(p.content_en)),
  );
  const hasPolicies = validPages.length > 0;

  const items: ReadinessItem[] = [
    {
      id: "logo",
      icon: Image,
      title: isAr ? "رفع شعار المتجر الرسمي" : "Upload official store logo",
      description: isAr
        ? hasLogo
          ? "تم تعيين وتحديث شعار المتجر الرسمي بنجاح"
          : "يظهر الشعار في ترويسة المتجر والفواتير والإيصالات الحرارية"
        : hasLogo
          ? "Official store logo uploaded and configured"
          : "Appears in storefront header, customer invoices, and receipts",
      isComplete: hasLogo,
      actionType: "tab",
      tabId: "business",
      actionLabel: isAr ? "إعداد الشعار" : "Configure Logo",
      editLabel: isAr ? "تعديل" : "Edit",
    },
    {
      id: "products",
      icon: Package,
      title: isAr ? "إضافة وتفعيل منتج واحد على الأقل" : "Add and activate at least 1 product",
      description: isAr
        ? hasProducts
          ? `${activeProducts} منتج نشط حالياً جاهز للبيع مباشرة`
          : "أضف وتفعيل أول منتج لبدء استقبال الطلبات"
        : hasProducts
          ? `${activeProducts} active product(s) ready for purchase`
          : "Add and activate your first product to start selling",
      isComplete: hasProducts,
      actionType: "link",
      actionLabel: isAr ? "إدارة المنتجات" : "Manage Products",
      editLabel: isAr ? "عرض" : "View",
    },
    {
      id: "payments",
      icon: CreditCard,
      title: isAr ? "تفعيل وسيلة دفع واحدة على الأقل" : "Configure at least 1 payment method",
      description: isAr
        ? hasPayments
          ? bData?.cod_enabled && bData?.card_enabled && bData?.benefit_enabled
            ? "تم تفعيل الدفع عند الاستلام والبطاقات ومحفظة بنفت"
            : bData?.cod_enabled && bData?.card_enabled
              ? "تم تفعيل الدفع عند الاستلام والبطاقات الائتمانية"
              : "تم تفعيل وتجهيز وسائل الدفع بنجاح"
          : "تفعيل الدفع عند الاستلام (COD)، بطاقة، أو محفظة بنفت"
        : hasPayments
          ? "Payment methods configured and active"
          : "Enable Cash on Delivery (COD), Card, or BenefitPay",
      isComplete: hasPayments,
      actionType: "tab",
      tabId: "payments",
      actionLabel: isAr ? "إعداد الدفع" : "Setup Payments",
      editLabel: isAr ? "تعديل" : "Edit",
    },
    {
      id: "fulfillment",
      icon: Truck,
      title: isAr ? "تحديد مناطق ورسوم الشحن والتوصيل" : "Define shipping zones and delivery fees",
      description: isAr
        ? hasFulfillment
          ? bData?.delivery_enabled && bData?.pickup_enabled
            ? "تم تفعيل التوصيل والاستلام المحلي ومناطق الشحن"
            : bData?.delivery_enabled
              ? "تم تفعيل التوصيل ورسوم الشحن بنجاح"
              : "تم إعداد خيارات التسليم والشحن"
          : "حدد رسوم التوصيل المحلي أو الاستلام من الفرع"
        : hasFulfillment
          ? "Delivery, pickup, and shipping zones active"
          : "Specify local delivery fees, pickup locations, or zones",
      isComplete: hasFulfillment,
      actionType: "tab",
      tabId: "checkout",
      actionLabel: isAr ? "إعداد الشحن" : "Configure Shipping",
      editLabel: isAr ? "تعديل" : "Edit",
    },
    {
      id: "policies",
      icon: FileText,
      title: isAr ? "نشر صفحة الشروط أو سياسة الإرجاع" : "Publish return policy or terms page",
      description: isAr
        ? hasPolicies
          ? `${validPages.length} صفحات منشورة تشمل الشروط والسياسات`
          : "توضيح حقوق العميل وسياسة الاستبدال يبني الثقة في المتجر"
        : hasPolicies
          ? `${validPages.length} published page(s) with store policies`
          : "Clear refund and delivery terms builds customer trust",
      isComplete: hasPolicies,
      actionType: "link",
      actionLabel: isAr ? "إدارة الصفحات" : "Manage Pages",
      editLabel: isAr ? "إدارة" : "Manage",
    },
  ];

  const completedCount = items.filter((it) => it.isComplete).length;
  const totalCount = items.length;
  const progressPercent = Math.round((completedCount / totalCount) * 100);
  const isAllComplete = completedCount === totalCount;

  return {
    hasLogo,
    hasProducts,
    activeProducts,
    hasPayments,
    hasFulfillment,
    hasPolicies,
    pagesCount: validPages.length,
    items,
    completedCount,
    totalCount,
    progressPercent,
    isAllComplete,
  };
}

interface StoreReadinessChecklistProps {
  brandId: string;
  slug: string;
  lang: "ar" | "en";
  logoUrl?: string | null;
  onNavigateTab: (tab: SettingsTabId) => void;
}

export function StoreReadinessChecklist({
  brandId,
  slug,
  lang,
  logoUrl,
  onNavigateTab,
}: StoreReadinessChecklistProps) {
  const isAr = lang === "ar";

  // 1. Query active products count (using canonical is_active flag)
  const productsQ = useQuery({
    queryKey: ["readiness-active-products", brandId],
    enabled: Boolean(brandId),
    queryFn: async () => {
      const { count, error } = await supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("brand_id", brandId)
        .eq("is_active", true);
      if (error) return 0;
      return count ?? 0;
    },
  });

  // 2. Query business_settings (payments, fulfillment, pages, logo)
  const businessSettingsQ = useQuery({
    queryKey: ["readiness-business-settings", brandId],
    enabled: Boolean(brandId),
    queryFn: async () => {
      const { data, error } = await (supabase.from("business_settings") as any)
        .select(
          "logo_url, cod_enabled, card_enabled, benefit_enabled, delivery_enabled, pickup_enabled, delivery_fee, shipping_zones, pages",
        )
        .eq("brand_id", brandId)
        .maybeSingle();
      if (error) return null;
      return data as BusinessSettingsData;
    },
  });

  // 3. Query brand logo fallback if needed
  const brandQ = useQuery({
    queryKey: ["readiness-brand-logo", brandId],
    enabled: Boolean(brandId && !logoUrl && !businessSettingsQ.data?.logo_url),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brands")
        .select("logo_url")
        .eq("id", brandId)
        .maybeSingle();
      if (error) return null;
      return (data?.logo_url as string) ?? null;
    },
  });

  const evaluation = evaluateStoreReadiness({
    logoUrl,
    activeProductsCount: productsQ.data ?? 0,
    businessSettings: businessSettingsQ.data,
    brandLogoUrl: brandQ.data,
    lang,
  });

  const checklistItems = evaluation.items.map((item) => {
    if (item.id === "products") {
      return { ...item, href: `/admin/b/${slug}/inventory` };
    }
    if (item.id === "policies") {
      return { ...item, href: `/admin/b/${slug}/pages` };
    }
    return item;
  });

  const { completedCount, totalCount, progressPercent, isAllComplete } = evaluation;

  // Option 3: Collapsed by default when 100% complete; expanded by default when incomplete
  const [userCollapsed, setUserCollapsed] = useState<boolean | null>(null);
  const collapsed = userCollapsed !== null ? userCollapsed : isAllComplete;

  // Option 3: Dismiss capability with localStorage memory
  const storageKey = `store-readiness-dismissed-${brandId}`;
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      if (typeof window !== "undefined") {
        return localStorage.getItem(storageKey) === "true";
      }
    } catch {
      // ignore
    }
    return false;
  });

  // Auto-reappear if any requirement breaks in the future
  useEffect(() => {
    if (!isAllComplete && dismissed) {
      setDismissed(false);
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // ignore
      }
    }
  }, [isAllComplete, dismissed, storageKey]);

  // If 100% complete and merchant explicitly dismissed it, unmount completely
  if (isAllComplete && dismissed) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(storageKey, "true");
    } catch {
      // ignore
    }
  };

  return (
    <div
      className={`rounded-2xl border border-border-strong bg-card shadow-xs transition-all ${
        collapsed ? "p-3 sm:p-4" : "p-4 sm:p-5"
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
              isAllComplete
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20"
                : "bg-primary/10 text-primary"
            }`}
          >
            {isAllComplete ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <Sparkles className="h-5 w-5" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-display font-bold text-foreground text-sm sm:text-base">
                {isAr ? "جاهزية المتجر للانطلاق المباشر" : "Store Launch Readiness"}
              </h3>
              <span
                className={`text-xs font-bold px-2 py-0.5 rounded-full transition-colors ${
                  isAllComplete
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                    : "bg-amber-500/15 text-amber-800 dark:text-amber-200"
                }`}
              >
                {completedCount} / {totalCount} {isAr ? "مكتمل" : "completed"} ({progressPercent}%)
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isAllComplete
                ? isAr
                  ? "متجرك مستوفٍ لجميع المتطلبات الأساسية ومستعد لاستقبال العملاء والطلبات!"
                  : "All essential requirements are met. Your store is ready for customers!"
                : isAr
                  ? "أكمل المتطلبات الأساسية لضمان تجربة تسوق وشراء متكاملة بدون عوائق"
                  : "Complete key essentials to ensure seamless customer ordering and checkout"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 self-end sm:self-center">
          <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 text-xs font-semibold">
            <a href={`/${slug}`} target="_blank" rel="noopener noreferrer">
              <Store className="h-3.5 w-3.5 text-primary" />
              <span>{isAr ? "معاينة المتجر المباشر" : "Customer Preview"}</span>
              <ExternalLink className="h-3 w-3 text-muted-foreground ms-0.5" />
            </a>
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setUserCollapsed(!collapsed)}
            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
            aria-label={
              collapsed
                ? isAr
                  ? "إظهار التفاصيل"
                  : "Show details"
                : isAr
                  ? "إخفاء التفاصيل"
                  : "Hide details"
            }
          >
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>

          {isAllComplete && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
              title={isAr ? "إخفاء التنبيه نهائياً" : "Dismiss readiness card"}
              aria-label={isAr ? "إخفاء التنبيه نهائياً" : "Dismiss readiness card"}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Progress Bar (shown when expanded or incomplete) */}
      {!collapsed && (
        <div className="mt-3.5 h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${
              isAllComplete ? "bg-emerald-500" : "bg-primary"
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}

      {/* Checklist items list */}
      {!collapsed && (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-2 border-t border-border-subtle">
          {checklistItems.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.id}
                className={`flex items-start justify-between gap-3 p-3 rounded-xl border transition-colors ${
                  item.isComplete
                    ? "border-emerald-500/20 bg-emerald-500/[0.03]"
                    : "border-border-strong bg-muted/20 hover:border-primary/40"
                }`}
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg mt-0.5 ${
                      item.isComplete
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {item.isComplete ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <Icon className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-foreground block truncate">
                      {item.title}
                    </span>
                    <span className="text-xs text-muted-foreground block line-clamp-1">
                      {item.description}
                    </span>
                  </div>
                </div>

                <div className="shrink-0 self-center">
                  {item.isComplete ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded bg-emerald-500/10">
                        {isAr ? "مكتمل" : "Ready"}
                      </span>
                      {item.actionType === "tab" && item.tabId ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => onNavigateTab(item.tabId!)}
                          className="h-6 px-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                          title={item.editLabel}
                        >
                          <span>{item.editLabel}</span>
                        </Button>
                      ) : item.href ? (
                        <Button
                          asChild
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                          title={item.editLabel}
                        >
                          <Link to={item.href}>
                            <span>{item.editLabel}</span>
                          </Link>
                        </Button>
                      ) : null}
                    </div>
                  ) : item.actionType === "tab" && item.tabId ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onNavigateTab(item.tabId!)}
                      className="h-7 text-xs font-bold px-2"
                    >
                      {item.actionLabel}
                    </Button>
                  ) : item.href ? (
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs font-bold px-2"
                    >
                      <Link to={item.href}>
                        {item.actionLabel}
                        <ArrowRight className="h-2.5 w-2.5 ms-1 rtl:rotate-180" />
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
