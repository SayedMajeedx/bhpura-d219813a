import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { FORMATS, THEMES } from "@/features/content-studio/lib/studio-content";
import type { ContentStudio } from "@/features/content-studio/hooks/use-content-studio";

/** Publish size, colour style and how the product photo fills the frame. */
export function FormatStylePicker({ studio }: { studio: ContentStudio }) {
  const { isAr, format, setFormat, theme, setTheme, imageFit, setImageFit } = studio;
  return (
    <>
      {/* Publish Size */}
      <div className="space-y-2 min-w-0">
        <Label className="text-xs font-bold text-foreground">
          {isAr ? "مقاس النشر" : "Publish size"}
        </Label>
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2.5">
          {Object.entries(FORMATS).map(([key, item]) => {
            const isSelected = format === key;
            return (
              <button
                type="button"
                key={key}
                onClick={() => setFormat(key as keyof typeof FORMATS)}
                className={cn(
                  "relative flex flex-col justify-between rounded-xl border p-2 sm:p-3 text-start transition-all cursor-pointer min-h-[58px] sm:min-h-[66px] min-w-0",
                  isSelected
                    ? "border-primary bg-primary/[0.06] ring-1 ring-primary shadow-2xs"
                    : "border-border hover:border-primary/40 bg-card/60",
                )}
              >
                <div className="flex items-center justify-between gap-1 w-full min-w-0">
                  <span className="text-xs font-bold text-foreground truncate">
                    {isAr ? item.ar : item.en}
                  </span>
                  {isSelected && (
                    <span className="grid size-3.5 sm:size-4 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                      <Check className="size-2 sm:size-2.5 stroke-[3]" />
                    </span>
                  )}
                </div>
                <span
                  dir="ltr"
                  className="font-mono text-xs text-muted-foreground tabular-nums truncate"
                >
                  {item.width} × {item.height}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Visual Style */}
      <div className="space-y-2 min-w-0">
        <Label className="text-xs font-bold text-foreground">
          {isAr ? "الأسلوب البصري" : "Visual style"}
        </Label>
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2.5">
          {Object.entries(THEMES).map(([key, item]) => {
            const isSelected = theme === key;
            return (
              <button
                type="button"
                key={key}
                onClick={() => setTheme(key as keyof typeof THEMES)}
                className={cn(
                  "relative flex flex-col justify-between rounded-xl border p-2 sm:p-3 text-start transition-all cursor-pointer min-h-[58px] sm:min-h-[66px] min-w-0",
                  isSelected
                    ? "border-primary bg-primary/[0.06] ring-1 ring-primary shadow-2xs"
                    : "border-border hover:border-primary/40 bg-card/60",
                )}
              >
                <div className="flex items-center justify-between w-full min-w-0">
                  <span className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                    <i
                      className="size-3 sm:size-3.5 rounded-full border border-black/10 shadow-2xs"
                      style={{ background: item.bg }}
                    />
                    <i
                      className="size-3 sm:size-3.5 rounded-full shadow-2xs"
                      style={{ background: item.ink }}
                    />
                  </span>
                  {isSelected && (
                    <span className="grid size-3.5 sm:size-4 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                      <Check className="size-2 sm:size-2.5 stroke-[3]" />
                    </span>
                  )}
                </div>
                <span className="text-xs font-bold text-foreground truncate mt-1">
                  {isAr ? item.ar : item.en}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Product Framing */}
      <div className="space-y-2 min-w-0">
        <Label className="text-xs font-bold text-foreground">
          {isAr ? "طريقة عرض صورة المنتج" : "Product photo framing"}
        </Label>
        <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
          <button
            type="button"
            onClick={() => setImageFit("cover")}
            className={cn(
              "relative flex flex-col justify-between rounded-xl border p-2.5 sm:p-3 text-start transition-all cursor-pointer min-h-[58px] sm:min-h-[64px] min-w-0",
              imageFit === "cover"
                ? "border-primary bg-primary/[0.06] ring-1 ring-primary shadow-2xs"
                : "border-border hover:border-primary/40 bg-card/60",
            )}
          >
            <div className="flex items-center justify-between w-full min-w-0">
              <span className="text-xs font-bold text-foreground truncate">
                {isAr ? "ملء الإطار (قص)" : "Cover frame"}
              </span>
              {imageFit === "cover" && (
                <span className="grid size-3.5 sm:size-4 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                  <Check className="size-2 sm:size-2.5 stroke-[3]" />
                </span>
              )}
            </div>
            <span className="text-xs text-muted-foreground mt-1 truncate">
              {isAr ? "تكبير الصورة لملء الخلفية" : "Fills canvas boundary"}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setImageFit("contain")}
            className={cn(
              "relative flex flex-col justify-between rounded-xl border p-2.5 sm:p-3 text-start transition-all cursor-pointer min-h-[58px] sm:min-h-[64px] min-w-0",
              imageFit === "contain"
                ? "border-primary bg-primary/[0.06] ring-1 ring-primary shadow-2xs"
                : "border-border hover:border-primary/40 bg-card/60",
            )}
          >
            <div className="flex items-center justify-between w-full min-w-0">
              <span className="text-xs font-bold text-foreground truncate">
                {isAr ? "احتواء كامل (كاملة)" : "Fit / Contain"}
              </span>
              {imageFit === "contain" && (
                <span className="grid size-3.5 sm:size-4 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                  <Check className="size-2.5 stroke-[3]" />
                </span>
              )}
            </div>
            <span className="text-xs text-muted-foreground mt-1 truncate">
              {isAr ? "حفظ كامل تفاصيل الصورة" : "Preserves full photo"}
            </span>
          </button>
        </div>
      </div>
    </>
  );
}
