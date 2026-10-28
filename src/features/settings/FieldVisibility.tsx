import * as React from "react";
import { useSettingsLevel } from "./settings-level";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { useDisclosure } from "@/components/motion/use-disclosure";
import { SoftText } from "@/components/motion/SoftText";

interface AdvancedOnlyProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  labelAr?: string;
  labelEn?: string;
  fieldKey?: string;
  fieldName?: string;
  /** What the fold holds, in the reader's language ("Section banners & backgrounds"). */
  reason?: string;
}

/**
 * Options most stores leave alone, folded on the basic level. Each fold says what it holds (every
 * fold once read "Additional advanced options available", so two folds side by side looked the
 * same) and opens on its own: showing one fold no longer switched the whole page to advanced.
 */
export function AdvancedOnly({ children, fallback, labelAr, labelEn, reason }: AdvancedOnlyProps) {
  const [level] = useSettingsLevel();
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const [open, setOpen] = React.useState(false);
  const panelId = React.useId();
  // The options grow open and fold away (transitions.dev's accordion).
  const fold = useDisclosure(open);

  if (level === "advanced") {
    return <>{children}</>;
  }

  if (fallback !== undefined) {
    return <>{fallback}</>;
  }

  const what =
    reason ||
    (isAr ? labelAr : labelEn) ||
    (isAr ? "خيارات تحكّم متقدمة إضافية" : "More advanced options");

  return (
    <div className="t-acc my-2" data-open={fold.shown ? "true" : "false"}>
      <div className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-dashed border-border bg-muted/20 px-3.5 py-2 text-xs text-muted-foreground">
        <div className="flex min-w-0 items-center gap-2">
          <SlidersHorizontal
            className="h-3.5 w-3.5 shrink-0 text-primary opacity-70"
            aria-hidden="true"
          />
          <span className="min-w-0 break-words">{what}</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
          className="h-8 shrink-0 px-2 text-xs font-medium text-primary hover:bg-primary/10"
        >
          <SoftText value={open ? (isAr ? "إخفاء" : "Hide") : isAr ? "إظهار" : "Show"} />
        </Button>
      </div>
      {fold.mounted && (
        <div id={panelId} className="t-acc-panel">
          <div className="t-acc-panel-inner">
            <div className="pt-3">{children}</div>
          </div>
        </div>
      )}
    </div>
  );
}
