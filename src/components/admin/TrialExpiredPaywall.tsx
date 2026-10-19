import React from "react";
import { useNavigate } from "@tanstack/react-router";
import { LogOut, Building2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { signOut } from "@/lib/auth/session";
import { BrandSubscriptionHub } from "@/components/subscription/BrandSubscriptionHub";

interface TrialExpiredPaywallProps {
  brand: {
    id: string;
    slug: string;
    name_ar?: string | null;
    name_en?: string | null;
    plan_type?: string | null;
    trial_ends_at?: string | null;
    subscription_status?: string | null;
  };
  reason?: "trial_expired" | "inactive";
}

/** The platform's support line, for a question about a plan. */
const SUPPORT_WHATSAPP = "97339955508";

/**
 * What a store's staff see when its trial has ended or the store is paused: the plans the
 * platform sells today and their checkout (PayPal or BenefitPay), from the same place as
 * Settings → Subscription (`BrandSubscriptionHub`). It once showed three plans written here by
 * hand, two of them withdrawn and all at old prices, and could only open a WhatsApp chat.
 */
export const TrialExpiredPaywall: React.FC<TrialExpiredPaywallProps> = ({
  brand,
  reason = "trial_expired",
}) => {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const navigate = useNavigate();
  const brandName =
    (isAr ? brand.name_ar || brand.name_en : brand.name_en || brand.name_ar) || brand.slug;

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/auth" });
  };

  return (
    <div
      className="min-h-screen bg-background text-foreground p-3 sm:p-8"
      dir={isAr ? "rtl" : "ltr"}
    >
      <div className="mx-auto w-full min-w-0 max-w-5xl space-y-6">
        <header className="flex min-w-0 items-center justify-between gap-3 border-b border-border pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <Building2 className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h1 dir="auto" className="text-page-start break-words font-bold leading-tight">
                {brandName}
              </h1>
              <p dir="ltr" className="text-page-start truncate text-xs text-muted-foreground">
                {brand.slug}.boutq.store
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            className="gap-1.5"
          >
            <LogOut className="size-4" />
            <span>{isAr ? "تسجيل الخروج" : "Sign out"}</span>
          </Button>
        </header>

        <div
          role="status"
          className="flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4"
        >
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
          <div className="min-w-0 space-y-1">
            <h2 className="font-bold">
              {reason === "trial_expired"
                ? isAr
                  ? "انتهت الفترة التجريبية المجانية"
                  : "Your free trial has ended"
                : isAr
                  ? "المتجر متوقف حالياً"
                  : "Your store is paused"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {isAr
                ? "لوحة التحكم والمتجر متوقفان مؤقتاً، وبياناتك محفوظة كما هي. اختر باقتك وادفع أدناه ليعود كل شيء فوراً."
                : "Your dashboard and store are paused, and all your data is kept. Choose a plan and pay below to bring everything back at once."}
            </p>
          </div>
        </div>

        <BrandSubscriptionHub brandId={brand.id} brandSlug={brand.slug} />

        <p className="border-t border-border pt-4 text-center text-xs text-muted-foreground">
          {isAr
            ? "سؤال عن الباقات؟ تواصل معنا عبر واتساب "
            : "A question about plans? WhatsApp us at "}
          <a
            href={`https://wa.me/${SUPPORT_WHATSAPP}`}
            target="_blank"
            rel="noopener noreferrer"
            dir="ltr"
            className="font-semibold text-foreground underline underline-offset-2"
          >
            +973 3995 5508
          </a>
        </p>
      </div>
    </div>
  );
};
