import { useState } from "react";
import { type SizeGuide, type SizeGuideUnit } from "@/lib/size-guide";
import { SizeGuidePanel } from "./SizeGuidePanel";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Ruler, ChevronDown, ChevronUp } from "lucide-react";

export interface SizeGuideInlineProps {
  guide: SizeGuide;
  selectedSize?: string | null;
  onSelectSize?: (size: string) => void;
  initialUnit?: SizeGuideUnit;
  defaultExpanded?: boolean;
}

export function SizeGuideInline({
  guide,
  selectedSize,
  onSelectSize,
  initialUnit,
  defaultExpanded = false,
}: SizeGuideInlineProps) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
      <Button
        type="button"
        variant="ghost"
        className="w-full justify-between px-4 py-3 h-auto rounded-none hover:bg-muted/30"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <div className="flex items-center gap-2">
          <Ruler className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">
            {isAr ? "جدول القياسات وإرشادات المقاس" : "Size Guide & Measurements"}
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </Button>

      {expanded && (
        <div className="p-4 pt-2 border-t border-border">
          <SizeGuidePanel
            guide={guide}
            selectedSize={selectedSize}
            onSelectSize={onSelectSize}
            initialUnit={initialUnit}
          />
        </div>
      )}
    </div>
  );
}
