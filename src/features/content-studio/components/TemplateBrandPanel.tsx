import { Stamp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { LogoTint } from "@/features/content-studio/engine/brand-mark";
import type { ContentStudio } from "@/features/content-studio/hooks/use-content-studio";

const MIN_SCALE = 0.6;
const MAX_SCALE = 2.2;

/**
 * The logo on the animated templates: how big it is and what colour it takes.
 * "Match the template" is white over a photo and the template's ink on plain
 * ground; the logo's own colours, white or black override that.
 */
export function TemplateBrandPanel({ studio }: { studio: ContentStudio }) {
  const { isAr, logo, logoScale, setLogoScale, logoTint, setLogoTint } = studio;
  const tints: Array<{ value: LogoTint; label: string }> = [
    { value: "auto", label: isAr ? "حسب القالب" : "Match template" },
    { value: "original", label: isAr ? "الألوان الأصلية" : "Original" },
    { value: "white", label: isAr ? "أبيض" : "White" },
    { value: "black", label: isAr ? "أسود" : "Black" },
  ];

  return (
    <div className="space-y-4 rounded-2xl border border-border-strong bg-muted/20 p-3.5 sm:p-5 min-w-0">
      <div className="flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-lg bg-primary/10 text-primary">
          <Stamp className="size-3.5" aria-hidden="true" />
        </span>
        <div>
          <h3 className="text-xs font-bold text-foreground">{isAr ? "الشعار" : "Brand mark"}</h3>
          <p className="text-xs text-muted-foreground">
            {logo
              ? isAr
                ? "حجم الشعار ولونه في القالب"
                : "Logo size and colour on this template"
              : isAr
                ? "لم يُرفع شعار بعد، فيظهر اسم المتجر. أضف الشعار من الإعدادات."
                : "No logo uploaded yet, so the store name is shown. Add your logo in Settings."}
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <Label htmlFor="studio-logo-size" className="text-xs font-medium text-muted-foreground">
            {isAr ? "حجم الشعار" : "Logo size"}
          </Label>
          <span dir="ltr" className="font-mono text-xs tabular-nums text-foreground">
            {Math.round(logoScale * 100)}%
          </span>
        </div>
        <input
          id="studio-logo-size"
          type="range"
          min={MIN_SCALE}
          max={MAX_SCALE}
          step={0.05}
          value={logoScale}
          onChange={(event) => setLogoScale(Number(event.target.value))}
          className="h-1.5 w-full cursor-pointer rounded-lg bg-muted accent-primary"
        />
      </div>

      <div className="space-y-1.5">
        <span id="studio-logo-tint-label" className="text-xs font-medium text-muted-foreground">
          {isAr ? "لون الشعار" : "Logo colour"}
        </span>
        <div
          role="radiogroup"
          aria-labelledby="studio-logo-tint-label"
          className="grid grid-cols-2 gap-1.5 sm:grid-cols-4"
        >
          {tints.map((tint) => {
            const selected = logoTint === tint.value;
            return (
              <Button
                key={tint.value}
                type="button"
                variant="chip"
                size="sm"
                role="radio"
                aria-checked={selected}
                onClick={() => setLogoTint(tint.value)}
                className={cn(
                  "h-9 rounded-lg border-border text-xs",
                  selected && "border-primary bg-primary/10 text-foreground",
                )}
              >
                {tint.label}
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
