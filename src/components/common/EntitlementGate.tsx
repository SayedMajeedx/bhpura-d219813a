// ==============================================================================
// BOUTQ OS: ENTITLEMENT GATE COMPONENT
// ==============================================================================

import React from "react";
import { useFeature } from "@/lib/saas-billing/use-entitlements";
import type { SaaSFeatureKey } from "@/lib/saas-billing/saas-billing.types";
import { Lock, Sparkles, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";

interface EntitlementGateProps {
  brandId: string | undefined | null;
  featureKey: SaaSFeatureKey;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  titleEn?: string;
  titleAr?: string;
  descriptionEn?: string;
  descriptionAr?: string;
  onUpgradeClick?: () => void;
}

export function EntitlementGate({
  brandId,
  featureKey,
  children,
  fallback,
  titleEn = "Feature Locked",
  titleAr = "الميزة غير متاحة في باقتك الحالية",
  descriptionEn = "Upgrade your Boutq OS plan to unlock this advanced feature and expand your boutique capabilities.",
  descriptionAr = "قم بترقية باقة Boutq OS لفتح هذه الميزة المتقدمة وتوسيع إمكانيات متجرك.",
  onUpgradeClick,
}: EntitlementGateProps) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const { isEnabled, isLoading } = useFeature(brandId, featureKey);

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center text-muted-foreground text-xs animate-pulse">
        {isAr ? "جاري التحقق من صلاحيات الباقة..." : "Verifying plan entitlements..."}
      </div>
    );
  }

  if (isEnabled) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  return (
    <Card className="border-dashed border-border bg-muted/20 my-4 shadow-none">
      <CardContent className="flex flex-col items-center justify-center p-8 text-center space-y-4">
        <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shadow-sm">
          <Lock className="h-6 w-6" />
        </div>

        <div className="space-y-1.5 max-w-md">
          <h3 className="text-base font-bold text-foreground flex items-center justify-center gap-1.5">
            <span>{isAr ? titleAr : titleEn}</span>
            <Sparkles className="h-4 w-4 text-amber-500" />
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {isAr ? descriptionAr : descriptionEn}
          </p>
        </div>

        {onUpgradeClick && (
          <Button
            type="button"
            variant="default"
            size="default"
            onClick={onUpgradeClick}
            className="gap-2 font-bold min-h-[44px] px-5"
          >
            <span>{isAr ? "ترقية الباقة الآن" : "Upgrade Plan Now"}</span>
            <ArrowUpRight className="h-4 w-4" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
