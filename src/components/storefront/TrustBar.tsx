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
  const { settings, lang } = useStorefront();
  const isAr = lang === "ar";

  if (settings?.trust_bar_enabled === false) {
    return null;
  }

  const activeItems = resolveStorefrontTrustBadges({ config: settings?.trust_badges, settings });

  if (!activeItems || activeItems.length === 0) {
    return null;
  }

  // On a phone the badges are one row that scrolls sideways (each one shows the edge of the
  // next): stacked two by two they took 166px between the hero and the first products.
  return (
    <section
      aria-label={isAr ? "مميزات التسوق والضمان" : "Shopping Guarantees & Features"}
      className={`w-full border-y border-border bg-card py-2 sm:py-5 ${className ?? ""}`}
    >
      <div className="mx-auto max-w-7xl sm:px-6">
        <div className="scrollbar-none flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 sm:grid sm:grid-cols-2 sm:gap-6 sm:overflow-visible sm:px-0 md:grid-cols-4">
          {activeItems.map((badge: TrustBadgeItem) => {
            const label = isAr ? badge.text_ar : badge.text_en;
            return (
              <div
                key={badge.id}
                className="flex w-[62%] max-w-64 shrink-0 snap-start items-center gap-2.5 rounded-xl p-2 transition-colors hover:bg-muted/40 sm:w-auto sm:max-w-none sm:gap-3 sm:p-3"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:size-10">
                  {renderTrustBadgeIcon(badge.icon, "size-4 stroke-[1.8] sm:size-5")}
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
