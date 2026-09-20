import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  STORE_VERTICALS,
  VERTICAL_ICON_NAMES,
  VERTICAL_LABELS,
  type StoreVertical,
} from "@/lib/store-profile";
import { getBrandTemplate } from "@/lib/brand-templates";
import type { BrandWizardData } from "./types";
import {
  Sparkles,
  Shirt,
  Flower2,
  Coffee,
  Utensils,
  Gift,
  Printer,
  Gem,
  Home,
  Smartphone,
  FileCode,
  Store,
} from "lucide-react";

interface StepIdentityProps {
  data: BrandWizardData;
  onChange: (patch: Partial<BrandWizardData>) => void;
  isAr: boolean;
}

const ICONS_BY_NAME: Record<string, React.ElementType> = {
  Sparkles,
  Shirt,
  Flower2,
  Coffee,
  Utensils,
  Gift,
  Printer,
  Gem,
  Home,
  Smartphone,
  FileCode,
  Store,
};

const VERTICAL_ICONS: Record<StoreVertical, React.ElementType> = Object.fromEntries(
  STORE_VERTICALS.map((v) => [v, ICONS_BY_NAME[VERTICAL_ICON_NAMES[v]] ?? Store]),
) as Record<StoreVertical, React.ElementType>;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 30);
}

export function StepIdentity({ data, onChange, isAr }: StepIdentityProps) {
  const handleNameEnChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const patch: Partial<BrandWizardData> = { name_en: val };

    // Auto-suggest slug only if the user hasn't manually edited it
    if (!data.isSlugManuallyEdited) {
      patch.slug = slugify(val);
    }
    onChange(patch);
  };

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
    onChange({
      slug: val,
      isSlugManuallyEdited: true,
    });
  };

  const handleVerticalSelect = (vertical: StoreVertical) => {
    const template = getBrandTemplate(vertical);
    onChange({
      store_vertical: vertical,
      accentColor: template.defaultPalette.primary,
      secondaryColor: template.defaultPalette.secondary,
      radius: template.radius,
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="brand-name-en">
            {isAr ? "اسم البراند (بالإنجليزية) *" : "Brand Name (English) *"}
          </Label>
          <Input
            id="brand-name-en"
            placeholder="e.g. Saffron Atelier"
            value={data.name_en}
            onChange={handleNameEnChange}
            autoFocus
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="brand-name-ar">
            {isAr ? "اسم البراند (بالعربية)" : "Brand Name (Arabic)"}
          </Label>
          <Input
            id="brand-name-ar"
            placeholder="مثال: مشغل الزعفران"
            value={data.name_ar}
            onChange={(e) => onChange({ name_ar: e.target.value })}
            dir="rtl"
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="brand-slug">
            {isAr ? "المعرّف بالرابط (Slug) *" : "Store Slug / URL identifier *"}
          </Label>
          {data.isSlugManuallyEdited && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-auto rounded-md text-xs text-primary hover:underline"
              onClick={() => {
                onChange({
                  slug: slugify(data.name_en),
                  isSlugManuallyEdited: false,
                });
              }}
            >
              {isAr ? "إعادة تعيين من الاسم الإنجليزي" : "Reset from English name"}
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-mono bg-muted px-2 py-2 rounded-md border border-border">
            boutq.app/
          </span>
          <Input
            id="brand-slug"
            placeholder="saffron-atelier"
            value={data.slug}
            onChange={handleSlugChange}
            className="font-mono text-sm"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {isAr
            ? "يُستخدم في روابط المتجر وفواتير الطلبات. يتكون من أحرف إنجليزية صغيرة وأرقام وشرطات فقط."
            : "Used in store URLs and checkout links. English lowercase letters, numbers, and hyphens only."}
        </p>
      </div>

      <div className="space-y-3 pt-2">
        <div>
          <Label className="text-sm font-medium">
            {isAr ? "نوع النشاط والتصنيف التجاري *" : "Store Vertical / Business Category *"}
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isAr
              ? "يحدد الأقسام المقترحة، وحدات المتجر، والنمط البصري الافتراضي تلقائياً."
              : "Pre-configures categories, store modules, and tailored design defaults."}
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 max-h-[340px] overflow-y-auto p-1 border border-border rounded-xl bg-muted/20">
          {STORE_VERTICALS.map((vertical) => {
            const Icon = VERTICAL_ICONS[vertical] || Store;
            const isSelected = data.store_vertical === vertical;
            const label = VERTICAL_LABELS[vertical];

            return (
              <Button
                key={vertical}
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleVerticalSelect(vertical)}
                className={`h-auto rounded-md flex flex-col items-start text-start p-3 rounded-xl border transition-all ${
                  isSelected
                    ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary"
                    : "border-border bg-card hover:bg-muted/50 hover:border-border"
                }`}
              >
                <div
                  className={`p-2 rounded-lg mb-2 ${
                    isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="font-semibold text-xs text-foreground leading-tight">
                  {isAr ? label.ar : label.en}
                </div>
                <div className="text-xs text-muted-foreground leading-tight mt-1 truncate max-w-full">
                  {isAr ? label.en : label.ar}
                </div>
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
