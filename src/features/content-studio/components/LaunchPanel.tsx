import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { MomentBox, SwitchRow } from "@/features/content-studio/components/MomentPanel";
import type { ContentStudio } from "@/features/content-studio/hooks/use-content-studio";

/**
 * Coming Soon's choices: the pieces not in the store yet, the launch day and
 * hour, and whether the name stays a secret. Nothing for other templates.
 */
export function LaunchPanel({ studio }: { studio: ContentStudio }) {
  const { isAr, templateId, format } = studio;
  if (templateId !== "coming-soon") return null;
  const {
    products,
    selected,
    setProductId,
    launchDay,
    setLaunchDay,
    launchDated,
    setLaunchDated,
    launchHour,
    setLaunchHour,
    launchSecret,
    setLaunchSecret,
  } = studio;
  const hidden = products.filter((product) => product.is_active === false).slice(0, 8);

  return (
    <MomentBox
      icon={CalendarClock}
      title={isAr ? "الإطلاق" : "The launch"}
      hint={
        hidden.length > 0
          ? isAr
            ? "قطع مخفية عن المتجر، جاهزة للتشويق:"
            : "Pieces hidden from the store, ready to tease:"
          : isAr
            ? "لا توجد قطع مخفية. أي قطعة تصلح للتشويق، أو أضف واحدة مخفية من المخزون."
            : "No hidden pieces. Any piece can be teased, or add a hidden one in Inventory."
      }
    >
      {hidden.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {hidden.map((product) => {
            const picked = product.id === selected?.id;
            return (
              <Button
                key={product.id}
                type="button"
                variant="chip"
                size="sm"
                aria-pressed={picked}
                onClick={() => setProductId(product.id)}
                className={cn(
                  "max-w-full rounded-full border-border",
                  picked && "border-primary bg-primary/10 text-primary hover:bg-primary/10",
                )}
              >
                <span className="truncate">
                  {isAr ? product.name_ar || product.name : product.name_en || product.name}
                </span>
              </Button>
            );
          })}
        </div>
      )}
      <SwitchRow
        id="studio-launch-dated"
        label={isAr ? "حددنا يوم الإطلاق" : "The launch day is set"}
        checked={launchDated}
        onChange={setLaunchDated}
      />
      {launchDated && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 min-w-0">
            <Label
              htmlFor="studio-launch-day"
              className="text-xs font-medium text-muted-foreground"
            >
              {isAr ? "يوم الإطلاق" : "Launch day"}
            </Label>
            <Input
              id="studio-launch-day"
              type="date"
              dir="ltr"
              value={launchDay}
              onChange={(event) => setLaunchDay(event.target.value)}
              className="h-10 rounded-xl text-xs"
            />
          </div>
          <div className="space-y-1.5 min-w-0">
            <Label
              htmlFor="studio-launch-hour"
              className="text-xs font-medium text-muted-foreground"
            >
              {isAr ? "الساعة (اختياري)" : "Hour (optional)"}
            </Label>
            <Input
              id="studio-launch-hour"
              type="time"
              dir="ltr"
              value={launchHour}
              onChange={(event) => setLaunchHour(event.target.value)}
              className="h-10 rounded-xl text-xs"
            />
          </div>
        </div>
      )}
      <SwitchRow
        id="studio-launch-secret"
        label={isAr ? "إخفاء اسم القطعة" : "Keep the name a secret"}
        checked={launchSecret}
        onChange={setLaunchSecret}
      />
      {format === "story" && launchDated && (
        <p className="text-xs text-muted-foreground">
          {isAr
            ? "في الستوري تُركت مساحة تحت التاريخ: أضف فيها ملصق العدّ التنازلي من إنستغرام، فيذكّر متابعيك يوم الإطلاق."
            : "The story leaves room under the date: add Instagram's countdown sticker there, and followers get a reminder on the day."}
        </p>
      )}
    </MomentBox>
  );
}
