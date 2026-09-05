import React from "react";
import { Link } from "@tanstack/react-router";
import { ShieldAlert, Store, ArrowRight, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

interface StorefrontSuspendedProps {
  brand: {
    name_ar?: string | null;
    name_en?: string | null;
    logo_url?: string | null;
    slug: string;
  };
  suspensionReason?: "trial_expired" | "inactive" | string;
}

export const StorefrontSuspended: React.FC<StorefrontSuspendedProps> = ({
  brand,
  suspensionReason = "trial_expired",
}) => {
  const isTrialExpired = suspensionReason === "trial_expired";
  const brandName = brand.name_ar || brand.name_en || brand.slug;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-foreground font-sans selection:bg-primary/20">
      <div className="w-full max-w-md mx-auto text-center space-y-6">
        {/* Brand Identity / Logo */}
        <div className="flex flex-col items-center gap-3">
          {brand.logo_url ? (
            <img
              src={brand.logo_url}
              alt={brandName}
              className="h-20 w-20 rounded-full object-cover border border-border shadow-sm"
            />
          ) : (
            <div className="h-20 w-20 rounded-full bg-muted border border-border flex items-center justify-center text-muted-foreground shadow-sm">
              <Store className="h-9 w-9" />
            </div>
          )}
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            {brandName}
          </h1>
        </div>

        {/* Status Card */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
          <div className="mx-auto size-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
            {isTrialExpired ? (
              <Lock className="size-6" />
            ) : (
              <ShieldAlert className="size-6" />
            )}
          </div>

          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">
              {isTrialExpired ? "المتجر متوقف مؤقتاً" : "المتجر غير متاح حالياً"}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {isTrialExpired
                ? "انتهت الفترة التجريبية الخاصة بهذا المتجر، وهو متوقف مؤقتاً عن استقبال الطلبات والزوار."
                : "هذا المتجر غير متاح في الوقت الحالي. يرجى المحاولة لاحقاً."}
            </p>
          </div>

          <div className="pt-2 border-t border-border">
            <p className="text-xs text-muted-foreground mb-3 font-medium">
              هل أنت صاحب هذا المتجر؟
            </p>
            <Button
              asChild
              className="w-full font-bold shadow-sm"
              size="default"
            >
              <Link to="/auth" search={{ redirect: `/admin/b/${brand.slug}` }}>
                تسجيل الدخول وترقية المتجر
                <ArrowRight className="size-4 ms-2 rtl:rotate-180" />
              </Link>
            </Button>
          </div>
        </div>

        {/* Footer info */}
        <p className="text-xs text-muted-foreground">
          مشغل بواسطة منصة{" "}
          <Link to="/" className="font-semibold text-foreground underline-offset-4 hover:underline">
            Boutq OS
          </Link>
        </p>
      </div>
    </div>
  );
};
