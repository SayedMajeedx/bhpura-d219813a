import { Button } from "@/components/ui/button";
import { VerticalIcon } from "@/components/verticals/VerticalIcon";
import { VERTICAL_LABELS } from "@/lib/store-profile";
import { cn } from "@/lib/utils";
import type { PickerVertical } from "@/lib/verticals/registry";

/**
 * One vertical in a picker grid (brand creation, onboarding). `detailed`
 * adds the parent ("Part of Fashion") and the summary under the name.
 *
 * The shared Button never wraps its text (`whitespace-nowrap`), which made
 * long Arabic names run out of the card; every line here wraps instead, and
 * the card fills its grid row so cards side by side stay the same height.
 */
export function VerticalChoice({
  vertical,
  selected,
  onSelect,
  lang,
  detailed = false,
}: {
  vertical: PickerVertical;
  selected: boolean;
  onSelect: () => void;
  lang: "ar" | "en";
  detailed?: boolean;
}) {
  const name = vertical.label[lang];
  return (
    <Button
      type="button"
      variant="ghost"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "h-full w-full min-w-0 whitespace-normal rounded-xl border p-3 font-normal",
        detailed
          ? "flex-col items-start justify-start gap-0 text-start"
          : "min-h-[44px] flex-col justify-center gap-1.5 px-2 py-2.5 text-center",
        selected
          ? "border-primary bg-primary/10 text-foreground shadow-sm ring-1 ring-primary hover:bg-primary/10"
          : "border-border bg-card text-muted-foreground hover:border-border hover:bg-muted/50 hover:text-foreground",
      )}
    >
      {detailed ? (
        <>
          <span
            className={cn(
              "mb-2 rounded-lg p-2",
              selected ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
            )}
          >
            <VerticalIcon vertical={vertical.id} className="h-4 w-4" />
          </span>
          <span className="w-full break-words text-xs font-semibold leading-snug text-foreground">
            {name}
          </span>
          {vertical.parent && (
            <span className="mt-0.5 w-full break-words text-xs leading-snug text-primary">
              {lang === "ar" ? "ضمن " : "Part of "}
              {VERTICAL_LABELS[vertical.parent][lang]}
            </span>
          )}
          <span className="mt-1 line-clamp-2 w-full break-words text-xs leading-snug text-muted-foreground">
            {vertical.summary[lang]}
          </span>
        </>
      ) : (
        <>
          <VerticalIcon
            vertical={vertical.id}
            className={cn("size-4 shrink-0", selected && "text-primary")}
          />
          <span
            className={cn(
              "w-full break-words text-xs leading-snug",
              selected ? "font-bold text-foreground" : "font-medium",
            )}
          >
            {name}
          </span>
        </>
      )}
    </Button>
  );
}
