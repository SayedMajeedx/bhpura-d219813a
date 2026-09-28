import { CalendarHeart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatOccasionDate, OCCASIONS } from "@/features/content-studio/lib/occasions";
import type { ContentStudio } from "@/features/content-studio/hooks/use-content-studio";

/**
 * The Occasion Pack's subject: which occasion (the next one is chosen to start
 * with), when it falls, and the greeting, message and optional offer.
 */
export function OccasionPanel({ studio }: { studio: ContentStudio }) {
  const {
    isAr,
    occasionId,
    setOccasionId,
    occasionDate,
    occasionCountry,
    occasionGreeting,
    setOccasionGreeting,
    occasionMessage,
    setOccasionMessage,
    occasionOffer,
    setOccasionOffer,
  } = studio;
  const lang = isAr ? "ar" : "en";
  const today = new Date().toISOString().slice(0, 10);
  const onNow = occasionDate.toISOString().slice(0, 10) === today;
  const when = formatOccasionDate(occasionDate, lang);

  return (
    <div className="space-y-4 rounded-2xl border border-border-strong bg-muted/20 p-3.5 sm:p-4 min-w-0">
      <div className="flex items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <CalendarHeart className="size-3.5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 id="studio-occasion-label" className="text-xs font-bold text-foreground">
            {isAr ? "المناسبة" : "Occasion"}
          </h3>
          <p role="status" className="text-xs text-muted-foreground">
            {onNow
              ? isAr
                ? "المناسبة قائمة الآن"
                : "On now"
              : isAr
                ? `القادمة: ${when}`
                : `Next: ${when}`}
            {occasionId === "national-day" && ` · ${occasionCountry.name[lang]}`}
          </p>
        </div>
      </div>

      <div
        role="radiogroup"
        aria-labelledby="studio-occasion-label"
        className="flex flex-wrap gap-2"
      >
        {OCCASIONS.map((occasion) => {
          const selected = occasion.id === occasionId;
          return (
            <Button
              key={occasion.id}
              type="button"
              role="radio"
              aria-checked={selected}
              variant="chip"
              size="sm"
              onClick={() => setOccasionId(occasion.id)}
              className={cn(
                "rounded-full border-border",
                selected && "border-primary bg-primary/10 text-primary hover:bg-primary/10",
              )}
            >
              {occasion.name[lang]}
            </Button>
          );
        })}
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label
            htmlFor="studio-occasion-greeting"
            className="text-xs font-medium text-muted-foreground"
          >
            {isAr ? "التهنئة" : "Greeting"}
          </Label>
          <Input
            id="studio-occasion-greeting"
            value={occasionGreeting}
            onChange={(event) => setOccasionGreeting(event.target.value)}
            maxLength={40}
            className="h-10 rounded-xl text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <Label
            htmlFor="studio-occasion-message"
            className="text-xs font-medium text-muted-foreground"
          >
            {isAr ? "الرسالة" : "Message"}
          </Label>
          <Input
            id="studio-occasion-message"
            value={occasionMessage}
            onChange={(event) => setOccasionMessage(event.target.value)}
            maxLength={70}
            className="h-10 rounded-xl text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <Label
            htmlFor="studio-occasion-offer"
            className="text-xs font-medium text-muted-foreground"
          >
            {isAr ? "عرض المناسبة (اختياري)" : "Offer (optional)"}
          </Label>
          <Input
            id="studio-occasion-offer"
            value={occasionOffer}
            onChange={(event) => setOccasionOffer(event.target.value)}
            placeholder={isAr ? "مثال: خصم ٢٠٪ بكود EID20" : "e.g. 20% off with code EID20"}
            maxLength={40}
            className="h-10 rounded-xl text-xs"
          />
        </div>
      </div>
    </div>
  );
}
