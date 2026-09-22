import React from "react";
import { useStorefront } from "@/lib/storefront-context";
import { ResponsiveImage } from "@/components/responsive-media";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { useReveal } from "@/lib/motion/use-reveal";
import { Sparkles, ShieldCheck, HeartHandshake, Award } from "lucide-react";

interface BrandStorySectionProps {
  className?: string;
}

export function BrandStorySection({ className = "" }: BrandStorySectionProps) {
  const { brand, settings, lang, t } = useStorefront();
  const isAr = lang === "ar";
  const { ref: revealRef } = useReveal<HTMLElement>({
    disabled: settings?.motion_enabled === false,
  });

  const storeVertical = (
    settings?.store_vertical ||
    (brand as any)?.store_vertical ||
    "general"
  ).toLowerCase();

  const isFood = ["food", "sweets", "cafe", "coffee", "bakery", "restaurant"].includes(
    storeVertical,
  );
  const isPerfumes = ["perfumes", "beauty", "cosmetics"].includes(storeVertical);

  const defaultSubtitle = isFood
    ? isAr
      ? "قصتنا وشغفنا بالمذاق الأصيل"
      : "Our Story & Passion for Authentic Flavors"
    : isPerfumes
      ? isAr
        ? "قصتنا وشغفنا بالعطور الفاخرة"
        : "Our Story & Passion for Fine Fragrances"
      : isAr
        ? "قصتنا وشغفنا بالتصميم الراقي"
        : "Our Story & Passion for Refined Design";

  const defaultDescAr = isFood
    ? "نقدم أشهى المأكولات والحلويات المحضرة بعناية فائقة من أجود المكونات الطازجة لتلبي ذوق عملائنا المتميزين، مع التزامنا بأعلى معايير الجودة والنظافة."
    : isPerfumes
      ? "نبتكر أرقى النفحات العطرية المميزة بمكونات نقية وفريدة لتلبي ذوق عملائنا الرفيع، مع التزامنا بأعلى معايير الفخامة والثبات."
      : "نقدم أرقى التشكيلات العصرية المصممة بعناية فائقة لتلبي ذوق عملائنا المتميزين، مع التزامنا بأعلى معايير الجودة والأناقة في كل اختيار.";

  const defaultDescEn = isFood
    ? "Crafting authentic culinary delicacies prepared with meticulous care from the finest fresh ingredients for our discerning guests, upholding the highest standards of taste and hygiene."
    : isPerfumes
      ? "Curating distinctive fragrances crafted from pure and rare ingredients for our refined clientele, upholding luxury and enduring elegance."
      : "Curating refined contemporary pieces crafted with meticulous care for our distinguished clients, upholding the highest standards of luxury and elegance.";

  const title = isAr
    ? settings?.brand_story_title_ar || brand.name_ar || brand.name_en
    : settings?.brand_story_title_en || brand.name_en || brand.name_ar;

  const subtitle = isAr
    ? settings?.brand_story_subtitle_ar || defaultSubtitle
    : settings?.brand_story_subtitle_en || defaultSubtitle;

  const description = isAr
    ? settings?.brand_story_description_ar ||
      brand.about_ar ||
      brand.meta_description ||
      defaultDescAr
    : settings?.brand_story_description_en ||
      brand.about_en ||
      brand.meta_description ||
      defaultDescEn;

  const bgMedia = brand.hero_media?.background;
  const bgImageFallback =
    typeof bgMedia === "string"
      ? bgMedia
      : typeof bgMedia === "object" && bgMedia?.type !== "video"
        ? bgMedia?.url
        : typeof bgMedia === "object"
          ? bgMedia?.posterUrl
          : null;

  const imageUrl =
    settings?.brand_story_image_url ||
    settings?.category_banner_background_url ||
    brand.hero_media?.slides?.[0]?.media_url ||
    bgImageFallback ||
    brand.logo_url;

  const values = isFood
    ? [
        {
          icon: Award,
          text: t("أعلى معايير الجودة والنظافة", "Premium Quality & Hygiene"),
        },
        {
          icon: HeartHandshake,
          text: t("مكونات طازجة ومختارة", "Fresh & Handpicked Ingredients"),
        },
        {
          icon: ShieldCheck,
          text: t("مذاق أصيل وطازج دائماً", "Authentic Flavor & Freshness Guaranteed"),
        },
      ]
    : isPerfumes
      ? [
          {
            icon: Award,
            text: t("زيوت عطرية نقية", "Pure Fragrance Oils"),
          },
          {
            icon: HeartHandshake,
            text: t("ثبات وفوحان يدوم", "Long-Lasting Sillage"),
          },
          {
            icon: ShieldCheck,
            text: t("ضمان الجودة والأصالة", "Authenticity & Quality Guarantee"),
          },
        ]
      : [
          {
            icon: Award,
            text: t("أعلى معايير الجودة", "Premium Quality Standards"),
          },
          {
            icon: HeartHandshake,
            text: t("تشكيلات حصرية مميزة", "Exclusive Curated Collections"),
          },
          {
            icon: ShieldCheck,
            text: t("ضمان الجودة والأصالة", "Authenticity & Quality Guarantee"),
          },
        ];

  return (
    <section
      ref={revealRef}
      className={`py-12 sm:py-16 border-y border-border bg-muted/20 sf-reveal ${className}`}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Visual Side (5 columns on desktop) */}
          <div className="lg:col-span-5 order-2 lg:order-1">
            <div className="relative rounded-2xl overflow-hidden aspect-[4/5] shadow-md border border-border bg-card">
              {imageUrl ? (
                <ResponsiveImage
                  src={imageUrl}
                  preset="hero"
                  sizes="(min-width: 1024px) 40vw, 100vw"
                  alt={title || "Brand Story"}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full grid place-items-center bg-muted text-muted-foreground">
                  <Sparkles className="h-10 w-10 text-primary opacity-40" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
            </div>
          </div>

          {/* Editorial Content Side (7 columns on desktop) */}
          <div className="lg:col-span-7 order-1 lg:order-2 space-y-6 text-start">
            <div className="space-y-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                <span>{subtitle}</span>
              </span>
              <h2 className="font-display text-2xl sm:text-3xl md:text-4xl text-foreground leading-tight">
                {title}
              </h2>
            </div>

            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed whitespace-pre-line">
              {description}
            </p>

            {/* Brand Values Badges */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              {values.map((v, i) => {
                const IconComp = v.icon;
                return (
                  <div
                    key={i}
                    className="flex items-center gap-2.5 p-3 rounded-xl bg-card border border-border shadow-2xs"
                  >
                    <div className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <IconComp className="h-4 w-4" />
                    </div>
                    <span className="text-xs font-semibold text-foreground">{v.text}</span>
                  </div>
                );
              })}
            </div>

            {/* Read More / About Link if page exists */}
            {settings?.pages?.some((p) => p.slug === "about" || p.slug === "about-us") && (
              <div className="pt-2">
                <Button
                  asChild
                  variant="outline"
                  className="h-10 rounded-xl font-semibold text-xs gap-2"
                >
                  <Link
                    to="/$slug/$category"
                    params={{
                      slug: brand.slug,
                      category:
                        settings.pages.find((p) => p.slug === "about" || p.slug === "about-us")
                          ?.slug || "about",
                    }}
                  >
                    <span>{t("تعرف على قصتنا الكاملة", "Read Our Full Story")}</span>
                  </Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
