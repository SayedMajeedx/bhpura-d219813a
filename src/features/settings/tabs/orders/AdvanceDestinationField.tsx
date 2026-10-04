import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ADVANCE_HOME_COUNTRY } from "@/lib/payments/advance-rules";
import type { AdvanceRuleForm } from "@/lib/payments/advance-rule-form";
import { COUNTRIES_DATABASE, getCountryByCode } from "@/lib/shipping";

const chip = (on: boolean) =>
  cn("border border-border", on && "border-primary bg-primary/10 text-foreground");

/**
 * Where the order goes: anywhere, inside the store's own country, or abroad (any country, or
 * only the ones chosen). A pickup or digital order has no country and counts as inside.
 */
export function AdvanceDestinationField({
  form,
  isAr,
  onChange,
}: {
  form: AdvanceRuleForm;
  isAr: boolean;
  onChange: (next: Partial<AdvanceRuleForm>) => void;
}) {
  const home = getCountryByCode(ADVANCE_HOME_COUNTRY);
  const homeName = (isAr ? home?.name_ar : home?.name_en) ?? ADVANCE_HOME_COUNTRY;
  const choices: Array<[AdvanceRuleForm["destination"], string]> = [
    ["any", isAr ? "الكل" : "Anywhere"],
    ["local", isAr ? `داخل ${homeName}` : `Inside ${homeName}`],
    ["abroad", isAr ? "للخارج" : "Abroad"],
  ];
  const abroad = COUNTRIES_DATABASE.filter((country) => country.code !== ADVANCE_HOME_COUNTRY);

  return (
    <div className="space-y-1.5">
      <div role="radiogroup" aria-label={isAr ? "الوجهة" : "Destination"} className="space-y-1.5">
        <p className="text-xs font-medium">{isAr ? "الوجهة" : "Destination"}</p>
        <div className="flex flex-wrap gap-2">
          {choices.map(([choice, label]) => (
            <Button
              key={choice}
              type="button"
              size="xs"
              variant="chip"
              role="radio"
              aria-checked={form.destination === choice}
              className={chip(form.destination === choice)}
              onClick={() =>
                onChange({
                  destination: choice,
                  countries: choice === "abroad" ? form.countries : [],
                })
              }
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
      {form.destination === "abroad" && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "اختر دولاً محددة، أو اتركها فارغة لكل الدول."
              : "Pick countries, or leave empty for every country."}
          </p>
          <div className="flex flex-wrap gap-1.5" aria-label={isAr ? "الدول" : "Countries"}>
            {abroad.map((country) => {
              const on = form.countries.includes(country.code);
              return (
                <Button
                  key={country.code}
                  type="button"
                  size="xs"
                  variant="chip"
                  aria-pressed={on}
                  className={chip(on)}
                  onClick={() =>
                    onChange({
                      countries: on
                        ? form.countries.filter((code) => code !== country.code)
                        : [...form.countries, country.code],
                    })
                  }
                >
                  {country.flag} {isAr ? country.name_ar : country.name_en}
                </Button>
              );
            })}
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {isAr
          ? "الاستلام من الفرع والتسليم الرقمي والمواعيد تُحسب داخل البلد."
          : "Pickup, digital and appointment orders count as inside."}
      </p>
    </div>
  );
}
