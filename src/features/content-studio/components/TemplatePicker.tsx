import { Check, Clapperboard, LayoutTemplate } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ENGINE_TEMPLATES, type TemplateId } from "@/features/content-studio/templates";
import type { ContentStudio } from "@/features/content-studio/hooks/use-content-studio";

/** Choose the design: Classic (today's layout) or one of the animated templates. */
export function TemplatePicker({ studio }: { studio: ContentStudio }) {
  const { isAr, templateId, setTemplateId, sale, run } = studio;
  const options: Array<{
    id: TemplateId;
    name: string;
    note: string;
    animated: boolean;
  }> = [
    {
      id: "classic",
      name: isAr ? "كلاسيكي" : "Classic",
      note: isAr ? "صورة ثابتة أو فيديو المنتج" : "Still, or the product video",
      animated: false,
    },
    ...ENGINE_TEMPLATES.map((template) => ({
      id: template.id as TemplateId,
      name: isAr ? template.name.ar : template.name.en,
      note: isAr ? `متحرك · ${template.goal.ar}` : `Animated · ${template.goal.en}`,
      animated: true,
    })),
  ];

  return (
    <div className="space-y-2 min-w-0">
      <Label id="studio-template-label" className="text-xs font-bold text-foreground">
        {isAr ? "القالب" : "Template"}
      </Label>
      <div
        role="radiogroup"
        aria-labelledby="studio-template-label"
        className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-2.5"
      >
        {options.map((option) => {
          const selected = templateId === option.id;
          const Icon = option.animated ? Clapperboard : LayoutTemplate;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setTemplateId(option.id)}
              className={cn(
                "relative flex min-h-[64px] flex-col justify-between rounded-xl border p-2.5 sm:p-3 text-start transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                selected
                  ? "border-primary bg-primary/[0.06] ring-1 ring-primary shadow-2xs"
                  : "border-border hover:border-primary/40 bg-card/60",
              )}
            >
              <span className="flex w-full min-w-0 items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  <Icon className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                  <span className="truncate text-xs font-bold text-foreground">{option.name}</span>
                </span>
                {selected && (
                  <span className="grid size-4 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                    <Check className="size-2.5 stroke-[3]" aria-hidden="true" />
                  </span>
                )}
              </span>
              <span className="mt-1 truncate text-xs text-muted-foreground">{option.note}</span>
            </button>
          );
        })}
      </div>
      {templateId === "swatch-run" && !run && (
        <p role="status" className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {isAr
            ? "لهذا المنتج خيار واحد فقط، فسيظهر وحده. أضف ألواناً أو خيارات أخرى بصورها من المخزون لتظهر جولة الألوان."
            : "This product has one option only, so it shows on its own. Add colours or other options with their photos in Inventory to run through them."}
        </p>
      )}
      {templateId === "price-drop" && !sale && (
        <p role="status" className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {isAr
            ? "لا يوجد سعر مخفّض لهذا المنتج حالياً، فسيظهر سعره فقط. اختر مقاساً أو لوناً عليه تخفيض لإظهار نسبة التوفير."
            : "This product has no sale price right now, so the post shows its price only. Choose a variant on sale to show the saving."}
        </p>
      )}
    </div>
  );
}
