import React, { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  CircleAlert,
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
} from "lucide-react";
import type { SettingsTabId } from "@/components/settings/SettingsScopeSwitcher";

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
  const [collapsed, setCollapsed] = useState(false);

  // 1. Query active products count
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

  // 2. Query payment methods
  const paymentSettingsQ = useQuery({
    queryKey: ["readiness-payments", brandId],
    enabled: Boolean(brandId),
    queryFn: async () => {
      const { data, error } = await (supabase.from("business_settings") as any)
        .select("cod_enabled, card_enabled, benefit_enabled")
        .eq("brand_id", brandId)
        .maybeSingle();
      if (error) return null;
      return data;
    },
  });

  // 3. Query fulfillment settings
  const fulfillmentSettingsQ = useQuery({
    queryKey: ["readiness-fulfillment", brandId],
    enabled: Boolean(brandId),
    queryFn: async () => {
      const { data, error } = await (supabase.from("store_settings") as any)
        .select("delivery_enabled, pickup_enabled, shipping_zones")
        .eq("brand_id", brandId)
        .maybeSingle();
      if (error) return null;
      return data;
    },
  });

  // 4. Query CMS / policy pages
  const pagesQ = useQuery({
    queryKey: ["readiness-pages", brandId],
    enabled: Boolean(brandId),
    queryFn: async () => {
      const { count, error } = await (supabase.from("pages") as any)
        .select("id", { count: "exact", head: true })
        .eq("brand_id", brandId)
        .eq("is_published", true);
      if (error) return 0;
      return count ?? 0;
    },
  });

  const hasLogo = Boolean(logoUrl && logoUrl.trim().length > 0);
  const activeProducts = productsQ.data ?? 0;
  const hasProducts = activeProducts > 0;
  
  const paymentData = paymentSettingsQ.data;
  const hasPayments = Boolean(
    paymentData &&
      (paymentData.cod_enabled || paymentData.card_enabled || paymentData.benefit_enabled),
  );

  const fulfillData = fulfillmentSettingsQ.data;
  const hasFulfillment = Boolean(
    fulfillData &&
      (fulfillData.delivery_enabled ||
        fulfillData.pickup_enabled ||
        (Array.isArray(fulfillData.shipping_zones) && fulfillData.shipping_zones.length > 0)),
  );

  const publishedPages = pagesQ.data ?? 0;
  const hasPolicies = publishedPages > 0;

  const checklistItems = [
    {
      id: "logo",
      icon: Image,
      title: isAr ? "رفع شعار المتجر الرسمي" : "Upload official store logo",
      description: isAr
        ? "يظهر الشعار في ترويسة المتجر والفواتير والإيصالات الحرارية"
        : "Appears in storefront header, customer invoices, and receipts",
      isComplete: hasLogo,
      actionType: "tab" as const,
      tabId: "business" as SettingsTabId,
      actionLabel: isAr ? "إعداد الشعار" : "Configure Logo",
    },
    {
      id: "products",
      icon: Package,
      title: isAr ? "إضافة وتفعيل منتج واحد على الأقل" : "Add and activate at least 1 product",
      description: isAr
        ? `${activeProducts} منتج نشط حالياً جاهز للبيع`
        : `${activeProducts} active product(s) ready for purchase`,
      isComplete: hasProducts,
      actionType: "link" as const,
      href: `/admin/b/${slug}/inventory`,
      actionLabel: isAr ? "إدارة المنتجات" : "Manage Products",
    },
    {
      id: "payments",
      icon: CreditCard,
      title: isAr ? "تفعيل وسيلة دفع واحدة على الأقل" : "Configure at least 1 payment method",
      description: isAr
        ? "تفعيل الدفع عند الاستلام (COD)، بطاقة، أو محفظة بنفت"
        : "Enable Cash on Delivery (COD), Card, or BenefitPay",
      isComplete: hasPayments,
      actionType: "tab" as const,
      tabId: "payments" as SettingsTabId,
      actionLabel: isAr ? "إعداد الدفع" : "Setup Payments",
    },
    {
      id: "fulfillment",
      icon: Truck,
      title: isAr ? "تحديد مناطق ورسوم الشحن والتوصيل" : "Define shipping zones and delivery fees",
      description: isAr
        ? "حدد رسوم التوصيل المحلي أو الاستلام من الفرع"
        : "Specify local delivery fees, pickup locations, or zones",
      isComplete: hasFulfillment,
      actionType: "tab" as const,
      tabId: "checkout" as SettingsTabId,
      actionLabel: isAr ? "إعداد الشحن" : "Configure Shipping",
    },
    {
      id: "policies",
      icon: FileText,
      title: isAr ? "نشر صفحة الشروط أو سياسة الإرجاع" : "Publish return policy or terms page",
      description: isAr
        ? "توضيح حقوق العميل وسياسة الاستبدال يبني الثقة في المتجر"
        : "Clear refund and delivery terms builds customer trust",
      isComplete: hasPolicies,
      actionType: "link" as const,
      href: `/admin/b/${slug}/pages`,
      actionLabel: isAr ? "إدارة الصفحات" : "Manage Pages",
    },
  ];

  const completedCount = checklistItems.filter((it) => it.isComplete).length;
  const totalCount = checklistItems.length;
  const progressPercent = Math.round((completedCount / totalCount) * 100);
  const isAllComplete = completedCount === totalCount;

  return (
    <div className="rounded-2xl border border-border/80 bg-card p-4 sm:p-5 shadow-xs transition-all">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              isAllComplete
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
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
                className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
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
                  ? "متجرك مستوفٍ لجميع المتطلبات الأساسية ومستعد لاستقبال العملاء!"
                  : "All essential requirements are met. Your store is ready for customers!"
                : isAr
                  ? "أكمل المتطلبات الأساسية لضمان تجربة تسوق وشراء متكاملة بدون عوائق"
                  : "Complete key essentials to ensure seamless customer ordering and checkout"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs font-semibold"
          >
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
            onClick={() => setCollapsed(!collapsed)}
            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
            aria-label={collapsed ? (isAr ? "إظهار التفاصيل" : "Show details") : (isAr ? "إخفاء التفاصيل" : "Hide details")}
          >
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mt-3.5 h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full transition-all duration-500 ${
            isAllComplete ? "bg-emerald-500" : "bg-primary"
          }`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Checklist items list */}
      {!collapsed && (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-2 border-t border-border/40">
          {checklistItems.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.id}
                className={`flex items-start justify-between gap-3 p-3 rounded-xl border transition-colors ${
                  item.isComplete
                    ? "border-emerald-500/20 bg-emerald-500/[0.03]"
                    : "border-border/80 bg-muted/20 hover:border-primary/40"
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
                    <span className="text-[11px] text-muted-foreground block line-clamp-1">
                      {item.description}
                    </span>
                  </div>
                </div>

                <div className="shrink-0 self-center">
                  {item.isComplete ? (
                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded bg-emerald-500/10">
                      {isAr ? "مكتمل" : "Ready"}
                    </span>
                  ) : item.actionType === "tab" ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onNavigateTab(item.tabId)}
                      className="h-7 text-[11px] font-bold px-2"
                    >
                      {item.actionLabel}
                    </Button>
                  ) : (
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="h-7 text-[11px] font-bold px-2"
                    >
                      <Link to={item.href}>
                        {item.actionLabel}
                        <ArrowRight className="h-2.5 w-2.5 ms-1" />
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}