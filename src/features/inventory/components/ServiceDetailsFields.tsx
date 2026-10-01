import { ListChecks, MapPin, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  SERVICE_LOCATIONS,
  type ServiceInclude,
  type ServiceLocation,
} from "@/lib/bookings/service-details";

const LOCATION_TEXT: Record<ServiceLocation, { ar: string; en: string }> = {
  customer: { ar: "عند العميل", en: "At the customer's" },
  venue: { ar: "في مقرّنا", en: "At our venue" },
  both: { ar: "الاثنين", en: "Either" },
};

/** Where a service happens and what it includes, in its editor. */
export function ServiceDetailsFields({
  location,
  includes,
  onLocation,
  onIncludes,
  isAr,
}: {
  location: ServiceLocation | null;
  includes: ServiceInclude[];
  onLocation: (location: ServiceLocation) => void;
  onIncludes: (includes: ServiceInclude[]) => void;
  isAr: boolean;
}) {
  const setLine = (index: number, patch: Partial<ServiceInclude>) =>
    onIncludes(includes.map((line, i) => (i === index ? { ...line, ...patch } : line)));

  return (
    <section className="space-y-4 rounded-xl border border-border bg-muted/20 p-3">
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
          <MapPin className="size-3.5" aria-hidden="true" />
          {isAr ? "مكان تقديم الخدمة" : "Where it happens"}
        </Label>
        <div
          role="group"
          aria-label={isAr ? "مكان تقديم الخدمة" : "Where it happens"}
          className="grid grid-cols-3 gap-1.5"
        >
          {SERVICE_LOCATIONS.map((id) => (
            <Button
              key={id}
              type="button"
              size="sm"
              variant="chip"
              aria-pressed={location === id}
              onClick={() => onLocation(id)}
              className={cn(
                "h-auto min-w-0 whitespace-normal border border-border py-2",
                location === id && "border-primary bg-primary/10 text-foreground",
              )}
            >
              {isAr ? LOCATION_TEXT[id].ar : LOCATION_TEXT[id].en}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
          <ListChecks className="size-3.5" aria-hidden="true" />
          {isAr ? "ما تشمله الخدمة" : "What's included"}
        </Label>
        {includes.length > 0 && (
          <ul className="space-y-1.5">
            {includes.map((line, index) => (
              <li key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-1.5">
                <Input
                  dir="rtl"
                  placeholder="بالعربية"
                  aria-label={isAr ? `البند ${index + 1} بالعربية` : `Line ${index + 1} in Arabic`}
                  value={line.ar}
                  onChange={(e) => setLine(index, { ar: e.target.value })}
                />
                <Input
                  dir="ltr"
                  placeholder="In English"
                  aria-label={
                    isAr ? `البند ${index + 1} بالإنجليزية` : `Line ${index + 1} in English`
                  }
                  value={line.en}
                  onChange={(e) => setLine(index, { en: e.target.value })}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={isAr ? "حذف البند" : "Remove line"}
                  onClick={() => onIncludes(includes.filter((_, i) => i !== index))}
                >
                  <X className="size-4" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1.5"
          disabled={includes.length >= 30}
          onClick={() => onIncludes([...includes, { ar: "", en: "" }])}
        >
          <Plus className="size-3.5" aria-hidden="true" />
          {isAr ? "إضافة بند" : "Add a line"}
        </Button>
      </div>
    </section>
  );
}
