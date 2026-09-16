import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Check,
  ChevronRight,
  ChevronLeft,
  ShieldCheck,
  Ruler,
  Scissors,
  Layers,
  Crown,
} from "lucide-react";
import type { AddonId, AddonManifest } from "@/lib/addons/addon-types";
import type { StoreVertical } from "@/lib/store-profile";
import { ADDON_SHOWCASE_DATA } from "@/lib/addons/addon-showcase-data";
import { cn } from "@/lib/utils";

interface AddonStoreHeroProps {
  manifests: AddonManifest[];
  installedMap: Map<AddonId, any>;
  storeVertical: StoreVertical | null;
  isAr: boolean;
  onSelectAddon: (addonId: AddonId) => void;
  onQuickInstall: (addonId: AddonId) => Promise<void>;
  isMutating: boolean;
}

export function AddonStoreHero({
  manifests,
  installedMap,
  storeVertical,
  isAr,
  onSelectAddon,
  onQuickInstall,
  isMutating,
}: AddonStoreHeroProps) {
  // Select top featured addons:
  // e.g. based on vertical or defaults: size-guides, abaya-pack/made-to-order, fit-passport
  const featuredIds: AddonId[] = React.useMemo(() => {
    if (storeVertical === "abayas") {
      return ["abaya-pack", "made-to-order", "size-guides"];
    }
    if (storeVertical === "fashion") {
      return ["fashion-core", "size-guides", "fit-passport"];
    }
    if (storeVertical === "beauty") {
      return ["beauty-perfume", "gifts", "digital-products"];
    }
    if (storeVertical === "jewelry") {
      return ["jewelry", "gifts", "made-to-order"];
    }
    if (storeVertical === "food") {
      return ["food-beverage", "gifts", "digital-products"];
    }
    if (storeVertical === "gifts") {
      return ["gifts", "digital-products", "fashion-core"];
    }
    if (storeVertical === "print") {
      return ["print-stamps", "digital-products", "gifts"];
    }
    return ["size-guides", "made-to-order", "abaya-pack", "fit-passport"];
  }, [storeVertical]);

  const [currentIndex, setCurrentIndex] = useState(0);

  // Auto rotate every 8 seconds
  useEffect(() => {
    if (featuredIds.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % featuredIds.length);
    }, 8000);
    return () => clearInterval(timer);
  }, [featuredIds.length]);

  const currentId = featuredIds[currentIndex] || "size-guides";
  const currentManifest = manifests.find((m) => m.id === currentId);
  const currentShowcase = ADDON_SHOWCASE_DATA[currentId];

  if (!currentManifest || !currentShowcase) return null;

  const isInstalled = installedMap.has(currentId);

  const getHeroIcon = (id: AddonId) => {
    switch (id) {
      case "size-guides":
        return <Ruler className="h-8 w-8" />;
      case "made-to-order":
        return <Scissors className="h-8 w-8" />;
      case "abaya-pack":
        return <Crown className="h-8 w-8" />;
      default:
        return <Sparkles className="h-8 w-8" />;
    }
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card via-card to-primary/5 p-6 md:p-8 shadow-sm">
      {/* Decorative ambient background blur */}
      <div className="pointer-events-none absolute -end-20 -top-20 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -start-20 h-72 w-72 rounded-full bg-muted/40 blur-3xl" />

      <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        {/* Left / Info Section */}
        <div className="max-w-2xl space-y-4">
          {/* Header Badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge
              variant="default"
              className="gap-1.5 px-3 py-1 text-xs font-semibold shadow-none"
            >
              <Sparkles className="h-3.5 w-3.5 text-primary-foreground" />
              <span>{isAr ? "إضافة مميزة وموصى بها" : "Featured Spotlight"}</span>
            </Badge>

            {currentShowcase.badge && (
              <Badge variant="secondary" className="px-2.5 py-0.5 text-xs font-medium">
                {isAr ? currentShowcase.badge.ar : currentShowcase.badge.en}
              </Badge>
            )}

            <Badge variant="outline" className="px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/5">
              <ShieldCheck className="h-3.5 w-3.5 me-1 text-emerald-500" />
              <span>{isAr ? "إضافة رسمية موثقة" : "Official Extension"}</span>
            </Badge>
          </div>

          {/* Main Title & Tagline */}
          <div className="space-y-2">
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-foreground">
              {isAr ? currentManifest.name.ar : currentManifest.name.en}
            </h2>
            <p className="text-sm md:text-base text-muted-foreground leading-relaxed line-clamp-2">
              {isAr ? currentShowcase.tagline.ar : currentShowcase.tagline.en}
            </p>
          </div>

          {/* Key Value Bullets */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            {currentShowcase.highlights.slice(0, 2).map((h, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs text-foreground/90">
                <div className="h-4 w-4 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Check className="h-2.5 w-2.5" />
                </div>
                <span className="truncate">{isAr ? h.ar : h.en}</span>
              </div>
            ))}
          </div>

          {/* CTA Actions */}
          <div className="flex items-center gap-3 pt-3 flex-wrap">
            <Button
              size="default"
              onClick={() => onSelectAddon(currentId)}
              className="gap-2 px-5 font-semibold shadow-sm"
            >
              <span>{isAr ? "استكشف تفاصيل الإضافة" : "View Add-on Details"}</span>
              {isAr ? <ArrowLeft className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
            </Button>

            {!isInstalled ? (
              <Button
                variant="outline"
                size="default"
                disabled={isMutating}
                onClick={() => onQuickInstall(currentId)}
                className="gap-2 font-medium border-border hover:bg-card"
              >
                <span>{isAr ? "تثبيت سريع مجاني" : "Quick Install (Free)"}</span>
              </Button>
            ) : (
              <Badge variant="outline" className="h-9 px-3 gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/5">
                <Check className="h-3.5 w-3.5" />
                <span>{isAr ? "مثبتة ونشطة في متجرك" : "Installed & Active"}</span>
              </Badge>
            )}
          </div>
        </div>

        {/* Right / Visual Showcase Card */}
        <div className="relative shrink-0 flex items-center justify-center lg:w-80">
          <div
            onClick={() => onSelectAddon(currentId)}
            className="group cursor-pointer w-full rounded-2xl border border-border/70 bg-card/90 p-5 shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
          >
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold shrink-0 transition-transform group-hover:scale-105">
                  {getHeroIcon(currentId)}
                </div>
                <div>
                  <div className="font-bold text-sm text-foreground">
                    {isAr ? currentManifest.name.ar : currentManifest.name.en}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {isAr ? currentShowcase.publisher.ar : currentShowcase.publisher.en}
                  </div>
                </div>
              </div>
              <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-semibold">
                v{currentManifest.version}
              </Badge>
            </div>

            <div className="mt-4 space-y-2">
              <div className="text-xs font-semibold text-muted-foreground">
                {isAr ? "معاينة الوظيفة الأساسية:" : "Live Function Preview:"}
              </div>
              <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs leading-relaxed text-foreground/80">
                {isAr
                  ? currentShowcase.previewMockup.storefront.title.ar
                  : currentShowcase.previewMockup.storefront.title.en}
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between text-xs text-primary font-medium pt-2 border-t border-border">
              <span>{isAr ? "اضغط للمعاينة الكاملة" : "Click for full showcase"}</span>
              {isAr ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </div>
          </div>
        </div>
      </div>

      {/* Carousel Dots & Controls (if more than 1 featured) */}
      {featuredIds.length > 1 && (
        <div className="mt-6 flex items-center justify-between pt-4 border-t border-border/50">
          <div className="flex items-center gap-1.5">
            {featuredIds.map((id, idx) => (
              <button
                key={id}
                onClick={() => setCurrentIndex(idx)}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  idx === currentIndex ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60"
                )}
                aria-label={`Slide ${idx + 1}`}
              />
            ))}
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-lg"
              onClick={() =>
                setCurrentIndex((prev) => (prev - 1 + featuredIds.length) % featuredIds.length)
              }
            >
              {isAr ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-lg"
              onClick={() => setCurrentIndex((prev) => (prev + 1) % featuredIds.length)}
            >
              {isAr ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
