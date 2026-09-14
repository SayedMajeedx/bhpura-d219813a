import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Ruler } from "lucide-react";
import { type SizeGuide, type SizeGuideUnit } from "@/lib/size-guide";
import { ABAYA_GULF_TEMPLATE } from "@/lib/size-guide-templates";
import { SizeGuidePanel } from "./size-guide/SizeGuidePanel";

import { trackStorefrontEvent } from "@/lib/storefront-analytics";

interface SizeGuideModalProps {
  isAr?: boolean;
  productName?: string;
  onSelectSize?: (size: string) => void;
  selectedSize?: string | null;
  guide?: SizeGuide | null;
  initialUnit?: SizeGuideUnit;
  children?: React.ReactNode;
}

export function SizeGuideModal({
  isAr = true,
  productName,
  onSelectSize,
  selectedSize,
  guide,
  initialUnit,
  children,
}: SizeGuideModalProps) {
  const [open, setOpen] = useState(false);

  // If guide is explicitly null (hidden or none resolved) or placement is inline only, don't show modal trigger
  if (guide === null || (guide && guide.placement === "inline")) {
    return null;
  }

  // Fallback to gulf abaya template if no dynamic guide provided
  const activeGuide: SizeGuide = guide || {
    id: "fallback-default",
    brand_id: "default",
    name_ar: ABAYA_GULF_TEMPLATE.name_ar,
    name_en: ABAYA_GULF_TEMPLATE.name_en,
    template_key: ABAYA_GULF_TEMPLATE.key,
    base_unit: ABAYA_GULF_TEMPLATE.base_unit,
    columns: ABAYA_GULF_TEMPLATE.columns,
    rows: ABAYA_GULF_TEMPLATE.rows,
    how_to_measure: ABAYA_GULF_TEMPLATE.how_to_measure,
    diagram_url: null,
    video_url: null,
    recommender_enabled: true,
    placement: "modal",
    notes_ar: ABAYA_GULF_TEMPLATE.notes_ar ?? null,
    notes_en: ABAYA_GULF_TEMPLATE.notes_en ?? null,
    is_default: true,
    is_active: true,
    sort_order: 0,
    created_at: "",
    updated_at: "",
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      trackStorefrontEvent("view_size_guide", {
        guide_id: activeGuide.id,
        guide_name: activeGuide.name_en,
        product_name: productName,
      });
    }
  };

  const handleSelectSize = (size: string) => {
    if (onSelectSize) {
      onSelectSize(size);
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {children || (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2.5 text-xs font-medium text-primary hover:text-primary hover:bg-primary/10 transition-colors"
          >
            <Ruler className="h-3.5 w-3.5" />
            <span>{isAr ? "دليل المقاسات" : "Size Guide"}</span>
          </Button>
        )}
      </DialogTrigger>

      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6"
        dir={isAr ? "rtl" : "ltr"}
      >
        <DialogHeader className="text-start pb-2 border-b border-border">
          <div className="flex items-center justify-between gap-3">
            <div>
              <DialogTitle className="text-lg sm:text-xl font-display flex items-center gap-2">
                <Ruler className="h-5 w-5 text-primary" />
                <span>{isAr ? "دليل المقاسات" : "Size Guide"}</span>
              </DialogTitle>
              {productName && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{productName}</p>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="pt-3">
          <SizeGuidePanel
            guide={activeGuide}
            selectedSize={selectedSize}
            onSelectSize={onSelectSize ? handleSelectSize : undefined}
            initialUnit={initialUnit}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
