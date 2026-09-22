import React from "react";
import { useStorefront } from "@/lib/storefront-context";
import {
  resolveStorefrontTrustBadges,
  renderTrustBadgeIcon,
  type TrustBadgeItem,
} from "@/lib/trust-badges";

export interface TrustBarProps {
  className?: string;
}

export function TrustBar({ className }: TrustBarProps) {
  const { brand, settings, lang } = useStorefront();
  const isAr = lang === "ar";

  if (settings?.trust_bar_enabled === false) {
    return null;
  }

  const activeItems = resolveStorefrontTrustBadges({
    config: settings?.trust_badges,
    vertical: settings?.store_vertical,
    settings,
    brandName: settings?.business_name,
  });

  if (!activeItems || activeItems.length === 0) {
    return null;
  }

  return (
    <section
      aria-label={isAr ? "مميزات التسوق والضمان" : "Shopping Guarantees & Features"}
      className={`w-full border-y border-border bg-card py-4 sm:py-5 ${className ?? ""}`}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid grid-cols-2 gap-3 sm:gap-6 md:grid-cols-4">
          {activeItems.map((badge: TrustBadgeItem) => {
            const label = isAr ? badge.text_ar : badge.text_en;
            return (
              <div
                key={badge.id}
                className="flex items-center gap-3 rounded-xl p-2.5 sm:p-3 transition-colors hover:bg-muted/40"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  {renderTrustBadgeIcon(badge.icon, "size-5 stroke-[1.8]")}
                </div>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-medium text-foreground line-clamp-2 leading-snug">
                    {label}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
