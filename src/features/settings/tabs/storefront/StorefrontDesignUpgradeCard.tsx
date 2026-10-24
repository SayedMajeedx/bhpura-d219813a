import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, ArrowRight, ArrowLeft, Smartphone, ShieldCheck, Zap } from "lucide-react";
import { useBrandSettingsFormContext } from "../../use-brand-settings-form";
import { useI18n } from "@/lib/i18n";

export function StorefrontDesignUpgradeCard() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const { bs, setBs } = useBrandSettingsFormContext();

  const currentVersion = Number(bs.storefront_design_version ?? 1);
  const isV2 = currentVersion === 2;

  // One way only: a live store on the new look is not offered the old one back from here (a
  // tap once switched a store's whole storefront to the classic look).
  const handleUpgrade = () => {
    setBs("storefront_design_version", 2);
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
              {isAr ? "مظهر المتجر الجديد" : "The new storefront look"}
            </h3>
            <Badge variant={isV2 ? "default" : "secondary"} className="text-xs font-semibold">
              {isV2 ? (isAr ? "مفعّل" : "Active") : isAr ? "المظهر الكلاسيكي" : "Classic look"}
            </Badge>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed max-w-xl">
            {isAr
              ? "مصمم للبوتيكات: خطوط تتكيف مع الشاشة، رأس في صف واحد على الجوال، شريط ثقة يقول ما تقوله إعداداتك، وقائمة انتظار لمن يطلب إشعاره عند توفر مقاس نفد."
              : "Made for boutiques: type that fits the screen, a one-row header on phones, a trust bar that says what your settings say, and a waiting list for shoppers who ask to hear when a size is back."}
          </p>
        </div>

        {!isV2 && (
          <div className="shrink-0 pt-1">
            <Button type="button" onClick={handleUpgrade} className="gap-2 text-xs font-bold">
              <Sparkles className="h-3.5 w-3.5" />
              <span>{isAr ? "الانتقال إلى المظهر الجديد" : "Switch to the new look"}</span>
              <NextIcon className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* Feature Pills */}
      <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-border pt-4">
        <div className="flex items-start gap-2.5">
          <Smartphone className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <div>
            <h4 className="text-xs font-semibold text-foreground">
              {isAr ? "رأس في صف واحد على الجوال" : "One-row header on phones"}
            </h4>
            <p className="text-xs text-muted-foreground">
              {isAr ? "مع بحث يفتح بملء الشاشة" : "With search that opens full screen"}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2.5">
          <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <div>
            <h4 className="text-xs font-semibold text-foreground">
              {isAr ? "شريط الثقة" : "Trust bar"}
            </h4>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? "طرق الدفع والتوصيل كما في إعداداتك، أو شاراتك"
                : "Your payment and delivery as your settings say, or your own badges"}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2.5">
          <Zap className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <div>
            <h4 className="text-xs font-semibold text-foreground">
              {isAr ? "قائمة الانتظار" : "Waiting list"}
            </h4>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? "من طلب إشعاره بمقاس نفد، وأنت من يراسله"
                : "Who asked to hear about a sold-out size; you message them"}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}
