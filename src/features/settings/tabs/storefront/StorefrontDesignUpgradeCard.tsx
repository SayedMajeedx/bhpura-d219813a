import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Smartphone,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { useBrandSettingsFormContext } from "../../use-brand-settings-form";
import { useI18n } from "@/lib/i18n";

export function StorefrontDesignUpgradeCard() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const { bs, setBs } = useBrandSettingsFormContext();

  const currentVersion = Number(bs.storefront_design_version ?? 1);
  const isV2 = currentVersion === 2;

  const handleToggle = () => {
    setBs("storefront_design_version", isV2 ? 1 : 2);
  };

  const NextIcon = isAr ? ArrowLeft : ArrowRight;

  return (
    <Card className="overflow-hidden border-2 border-primary/20 bg-gradient-to-br from-card via-card to-primary/5 p-5 sm:p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="h-4 w-4" />
            </div>
            <h3 className="text-base font-bold text-foreground">
              {isAr ? "محرك المتجر Storefront 2.0" : "Storefront 2.0 Design Engine"}
            </h3>
            <Badge variant={isV2 ? "default" : "secondary"} className="text-xs font-semibold">
              {isV2
                ? isAr
                  ? "الإصدار 2.0 نشط"
                  : "v2.0 Active"
                : isAr
                  ? "الإصدار 1.0 كلاسيك"
                  : "v1.0 Classic"}
            </Badge>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed max-w-xl">
            {isAr
              ? "مظهر عصري فاخر مصمم خصيصاً للبوتيكات الخليجية: خطوط متجاوبة، شريط رأس مضغوط في صف واحد على الجوال، شريط ثقة وضمانات تلقائي، ونظام إشعارات توفر القطع المنتهية عبر واتساب."
              : "Luxury modern look tailored for GCC boutiques: fluid typography, streamlined 1-row mobile header, responsive trust guarantee badges, and out-of-stock WhatsApp waitlist."}
          </p>
        </div>

        <div className="shrink-0 pt-1">
          <Button
            type="button"
            variant={isV2 ? "outline" : "default"}
            onClick={handleToggle}
            className="gap-2 text-xs font-bold"
          >
            {isV2 ? (
              <>
                <span>{isAr ? "الرجوع للإصدار 1.0" : "Revert to v1.0"}</span>
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                <span>{isAr ? "الترقية إلى الإصدار 2.0 الآن" : "Upgrade to v2.0 Now"}</span>
                <NextIcon className="h-3.5 w-3.5" />
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Feature Pills */}
      <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-border pt-4">
        <div className="flex items-start gap-2.5">
          <Smartphone className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <div>
            <h4 className="text-xs font-semibold text-foreground">
              {isAr ? "رأس مضغوط 56px للجوال" : "56px Mobile Header"}
            </h4>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? "صف واحد خفيف مع بحث بملء الشاشة"
                : "1-row bar with instant fullscreen search"}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2.5">
          <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <div>
            <h4 className="text-xs font-semibold text-foreground">
              {isAr ? "شارات الثقة والضمان" : "Trust & Guarantee Badges"}
            </h4>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? "استرجاع، توصيل سريع، ودفع آمن"
                : "Fast delivery, easy returns & secure payment"}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2.5">
          <Zap className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <div>
            <h4 className="text-xs font-semibold text-foreground">
              {isAr ? "إشعار التوفر عبر واتساب" : "WhatsApp Back-in-Stock"}
            </h4>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? "استقطاب العملاء للقطع المنتهية تلقائياً"
                : "Capture waitlist leads when variants sell out"}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}
