import { useState } from "react";
import { Info, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/storefront-context";
import {
  isChangeable,
  optionDescription,
  optionName,
  optionPrice,
  optionStep,
  tiersText,
  validQuantity,
} from "@/lib/bookings/service-options";
import type { BookingFlow } from "@/features/storefront-booking/hooks/use-booking-flow";

/**
 * An add-on's long description, folded behind a small info button so a list of add-ons stays a
 * list of names and prices: the words open under the name on a tap.
 */
function OptionNote({ name, text, isAr }: { name: string; text: string; isAr: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="ms-1 size-5 translate-y-0.5 rounded-full text-muted-foreground hover:text-foreground"
        aria-expanded={open}
        aria-label={isAr ? `تفاصيل ${name}` : `Details of ${name}`}
        onClick={() => setOpen((value) => !value)}
      >
        <Info className="size-4" aria-hidden="true" />
      </Button>
      {open && (
        <span className="mt-1 block break-words text-xs font-normal text-muted-foreground">
          {text}
        </span>
      )}
    </>
  );
}

/**
 * A chosen service's add-ons: what comes with it (an attendant, shown with its
 * worth), what is added for you and can come off, what you can add, and blocks
 * that get cheaper (envelopes by the fifty). The total follows as they choose.
 */
export function BookingServiceOptions({
  flow,
  serviceId,
}: {
  flow: BookingFlow;
  serviceId: string;
}) {
  const { isAr, currency, showPrices } = flow;
  const options = flow.optionsOfService(serviceId);
  if (options.length === 0) return null;
  const selection = flow.selectionFor(serviceId);
  const extraHours = flow.extraHoursFor(serviceId);
  const money = (amount: number) => formatPrice(amount, currency, isAr ? "ar" : "en");

  return (
    <ul
      className="mt-2 space-y-2 rounded-xl border border-border bg-muted/30 p-3"
      aria-label={isAr ? "الإضافات" : "Add-ons"}
    >
      {options.map((option) => {
        const name = optionName(option, isAr);
        const description = optionDescription(option, isAr);
        const quantity = selection[option.id] ?? 0;
        const on = quantity > 0 || option.mode === "included" || option.mode === "required";
        const step = optionStep(option);
        const price = optionPrice(option, quantity || step, extraHours);
        const locked = !isChangeable(option);
        return (
          <li key={option.id} className="space-y-1">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-2.5">
                {option.tiers ? (
                  <span className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                ) : (
                  <Checkbox
                    checked={on}
                    disabled={locked}
                    aria-label={name}
                    className="mt-0.5"
                    onCheckedChange={(checked) =>
                      flow.setOptionQuantity(serviceId, option.id, checked === true ? step : 0)
                    }
                  />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {name}
                    {locked && (
                      <span className="ms-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        {option.mode === "included"
                          ? isAr
                            ? "مشمولة"
                            : "Included"
                          : isAr
                            ? "مع كل حجز"
                            : "With every booking"}
                      </span>
                    )}
                    {description && <OptionNote name={name} text={description} isAr={isAr} />}
                  </p>
                  {option.mode === "default_on" && quantity > 0 && showPrices && (
                    <p className="text-xs text-muted-foreground">
                      {isAr
                        ? `مضافة تلقائياً، وتُخصم ${money(price)} عند إزالتها`
                        : `Added for you; ${money(price)} comes off if you remove it`}
                    </p>
                  )}
                  {option.tiers && showPrices && (
                    <p className="text-xs text-muted-foreground">{tiersText(option.tiers, isAr)}</p>
                  )}
                </div>
              </div>
              {showPrices && option.mode !== "included" && (
                <span className="shrink-0 text-sm font-semibold text-foreground" dir="ltr">
                  {option.tiers
                    ? quantity > 0
                      ? `+${money(price)}`
                      : money(price)
                    : `+${money(price)}`}
                </span>
              )}
            </div>
            {option.tiers && (
              <div className="flex items-center gap-2 ps-6" role="group" aria-label={name}>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="size-8"
                  aria-label={isAr ? `إنقاص ${name}` : `Fewer ${name}`}
                  disabled={quantity === 0}
                  onClick={() => flow.setOptionQuantity(serviceId, option.id, quantity - step)}
                >
                  <Minus className="size-4" />
                </Button>
                <span
                  className={cn(
                    "min-w-10 text-center text-sm font-semibold",
                    quantity === 0 && "text-muted-foreground",
                  )}
                  dir="ltr"
                  aria-live="polite"
                >
                  {quantity}
                </span>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="size-8"
                  aria-label={isAr ? `زيادة ${name}` : `More ${name}`}
                  disabled={validQuantity(option, quantity + step) === null}
                  onClick={() => flow.setOptionQuantity(serviceId, option.id, quantity + step)}
                >
                  <Plus className="size-4" />
                </Button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
