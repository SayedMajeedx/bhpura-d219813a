import * as React from "react";
import { useSettingsLevel } from "./settings-level";
import { SlidersHorizontal, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

interface AdvancedOnlyProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  labelAr?: string;
  labelEn?: string;
  fieldKey?: string;
  fieldName?: string;
  reason?: string;
}

export function AdvancedOnly({ children, fallback, labelAr, labelEn }: AdvancedOnlyProps) {
  const [level, setLevel] = useSettingsLevel();
  const { lang } = useI18n();
  const isAr = lang === "ar";

  if (level === "advanced") {
    return <>{children}</>;
  }

  if (fallback !== undefined) {
    return <>{fallback}</>;
  }

  return (
    <div className="py-2 px-3.5 my-2 rounded-xl border border-dashed border-border bg-muted/20 flex items-center justify-between text-xs text-muted-foreground transition-all">
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="h-3.5 w-3.5 text-primary opacity-70" />
        <span>
          {isAr
            ? labelAr || "خيارات تحكّم متقدمة إضافية متاحة"
            : labelEn || "Additional advanced options available"}
        </span>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setLevel("advanced")}
        className="h-6 text-xs text-primary font-medium hover:bg-primary/10 px-2"
      >
        {isAr ? "إظهار الخيارات المتقدمة" : "Show advanced"}
      </Button>
    </div>
  );
}
