import * as React from "react";
import { VERTICAL_LABELS } from "@/lib/store-profile";
import { getBrandTemplate } from "@/lib/brand-templates";
import type { BrandWizardData } from "./types";
import { Store, ShieldCheck } from "lucide-react";

interface StepReviewProps {
  data: BrandWizardData;
  isAr: boolean;
}

export function StepReview({ data, isAr }: StepReviewProps) {
  const template = getBrandTemplate(data.store_vertical);
  const verticalLabel = VERTICAL_LABELS[data.store_vertical];

  return (
    <div className="space-y-6">
      {/* Visual Live Preview Banner */}
      <div
        className="p-5 rounded-2xl border shadow-sm transition-all overflow-hidden relative"
        style={{
          backgroundColor: data.backgroundColor || "#ffffff",
          color: data.textColor || "#1c1917",
          borderRadius: data.radius || "0.5rem",
        }}
      >
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            {data.logoPreviewUrl ? (
              <img
                src={data.logoPreviewUrl}
                alt="Brand logo"
                className="h-10 w-10 object-contain rounded-md"
              />
            ) : (
              <div
                className="h-10 w-10 rounded-md flex items-center justify-center font-bold text-white shadow-xs"
                style={{ backgroundColor: data.accentColor }}
              >
                {data.name_en.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <div className="font-bold text-base leading-tight">
                {isAr ? data.name_ar || data.name_en : data.name_en}
              </div>
              <div className="text-xs opacity-75 font-mono">boutq.app/{data.slug}</div>
            </div>
          </div>

          <div
            className="px-3 py-1 rounded-full text-xs font-semibold text-white shadow-xs"
            style={{ backgroundColor: data.accentColor }}
          >
            {isAr ? verticalLabel.ar : verticalLabel.en}
          </div>
        </div>

        <div className="pt-4 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="opacity-75">{isAr ? "الخطوط:" : "Fonts:"}</span>
            <span className="font-semibold">{data.fontPreset.fontAr}</span>
            <span>/</span>
            <span className="font-semibold">{data.fontPreset.fontEn}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="opacity-75">
              {isAr ? "الأقسام الافتراضية:" : "Starter categories:"}
            </span>
            <span className="font-semibold">
              {template.categories.length} {isAr ? "أقسام" : "categories"}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <div
              className="h-4 w-4 rounded-full border border-black/10"
              style={{ backgroundColor: data.accentColor }}
              title="Accent"
            />
            <div
              className="h-4 w-4 rounded-full border border-black/10"
              style={{ backgroundColor: data.secondaryColor }}
              title="Secondary"
            />
            <div
              className="h-4 w-4 rounded-full border border-black/10"
              style={{ backgroundColor: data.textColor }}
              title="Text"
            />
          </div>
        </div>
      </div>

      {/* Summary Breakdown Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Identity & Structure */}
        <div className="p-4 rounded-xl border border-border bg-card space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Store className="h-4 w-4 text-primary" />
            {isAr ? "المتجر والهوية" : "Store & Category"}
          </div>
          <div className="space-y-1.5 text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>{isAr ? "الاسم بالإنجليزية:" : "English Name:"}</span>
              <span className="font-medium text-foreground">{data.name_en}</span>
            </div>
            {data.name_ar && (
              <div className="flex justify-between">
                <span>{isAr ? "الاسم بالعربية:" : "Arabic Name:"}</span>
                <span className="font-medium text-foreground">{data.name_ar}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>{isAr ? "المعرّف (Slug):" : "Slug:"}</span>
              <span className="font-mono text-foreground font-semibold">{data.slug}</span>
            </div>
            <div className="flex justify-between">
              <span>{isAr ? "النشاط التجاري:" : "Vertical:"}</span>
              <span className="font-medium text-foreground">
                {isAr ? verticalLabel.ar : verticalLabel.en}
              </span>
            </div>
          </div>
        </div>

        {/* Admin Account & Plan */}
        <div className="p-4 rounded-xl border border-border bg-card space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ShieldCheck className="h-4 w-4 text-primary" />
            {isAr ? "حساب المدير والاشتراك" : "Owner & Subscription"}
          </div>
          <div className="space-y-1.5 text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>{isAr ? "المدير المسؤول:" : "Owner Name:"}</span>
              <span className="font-medium text-foreground">{data.owner_name}</span>
            </div>
            <div className="flex justify-between">
              <span>{isAr ? "البريد الإلكتروني:" : "Owner Email:"}</span>
              <span className="font-medium text-foreground">{data.owner_email}</span>
            </div>
            <div className="flex justify-between">
              <span>{isAr ? "باقة الاشتراك:" : "Plan:"}</span>
              <span className="font-semibold text-foreground capitalize">
                {data.plan_type === "annual"
                  ? isAr
                    ? "اشتراك سنوي نشط"
                    : "Annual Active"
                  : isAr
                    ? "فترة تجريبية"
                    : "Trial"}
              </span>
            </div>
            <div className="flex justify-between">
              <span>{isAr ? "تطبيق الموبايل:" : "Mobile App:"}</span>
              <span className="font-medium text-foreground">
                {data.createMobileApp
                  ? isAr
                    ? "تجهيز تلقائي"
                    : "Auto-provision"
                  : isAr
                    ? "غير مفعل"
                    : "Disabled"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
