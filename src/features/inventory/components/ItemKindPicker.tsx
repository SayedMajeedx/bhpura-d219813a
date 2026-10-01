import { CalendarDays, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ItemKind = "service" | "product";

const KINDS: Array<{
  id: ItemKind;
  icon: typeof Package;
  label: { ar: string; en: string };
  hint: { ar: string; en: string };
}> = [
  {
    id: "service",
    icon: CalendarDays,
    label: { ar: "خدمة", en: "Service" },
    hint: { ar: "تُحجز بتاريخ ووقت، بدون مخزون", en: "Booked for a date and time, no stock" },
  },
  {
    id: "product",
    icon: Package,
    label: { ar: "منتج", en: "Product" },
    hint: { ar: "يُباع ويُوصَّل، وله مخزون", en: "Sold and delivered, with stock" },
  },
];

/**
 * Whether an item in a bookings store is a service (sold only with a booking,
 * no stock) or a product (sold through the cart). Other stores sell products
 * only and do not show it.
 */
export function ItemKindPicker({
  value,
  onChange,
  isAr,
}: {
  value: ItemKind;
  onChange: (kind: ItemKind) => void;
  isAr: boolean;
}) {
  return (
    <div
      role="group"
      aria-label={isAr ? "نوع العنصر" : "Item type"}
      className="grid grid-cols-2 gap-2"
    >
      {KINDS.map(({ id, icon: Icon, label, hint }) => {
        const selected = value === id;
        return (
          <Button
            key={id}
            type="button"
            variant="chip"
            aria-pressed={selected}
            onClick={() => onChange(id)}
            className={cn(
              "h-auto w-full min-w-0 flex-col items-start justify-start gap-0.5 whitespace-normal rounded-xl border border-border px-3 py-2.5 text-start",
              selected && "border-primary bg-primary/10 text-foreground hover:bg-primary/10",
            )}
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Icon className="size-4" aria-hidden="true" />
              {isAr ? label.ar : label.en}
            </span>
            <span className="w-full break-words text-xs text-muted-foreground">
              {isAr ? hint.ar : hint.en}
            </span>
          </Button>
        );
      })}
    </div>
  );
}
