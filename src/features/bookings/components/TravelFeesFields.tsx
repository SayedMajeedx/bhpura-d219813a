import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BAHRAIN_REGIONS } from "@/lib/bahrain-regions";

/** Travel fees as typed: "" = none (the default applies to an area left empty). */
export type TravelFeeDraft = { defaultFee: string; byArea: Record<string, string> };

/** A draft from the saved fees. */
export function travelFeeDraft(
  defaultFee: number | null,
  byArea: Record<string, number>,
): TravelFeeDraft {
  return {
    defaultFee: defaultFee === null ? "" : String(defaultFee),
    byArea: Object.fromEntries(Object.entries(byArea).map(([code, fee]) => [code, String(fee)])),
  };
}

function parseFee(text: string): number | null | "invalid" {
  if (text.trim() === "") return null;
  const fee = Number(text);
  return Number.isFinite(fee) && fee >= 0 ? fee : "invalid";
}

/**
 * What to save: the default (null = no travel fees) and every area's fee,
 * null for an area whose fee was cleared (it then uses the default). Null
 * when a fee is not a valid amount.
 */
export function travelFeesToSave(
  draft: TravelFeeDraft,
  saved: Record<string, number>,
): { defaultFee: number | null; byArea: Record<string, number | null> } | null {
  const defaultFee = parseFee(draft.defaultFee);
  if (defaultFee === "invalid") return null;
  const byArea: Record<string, number | null> = {};
  for (const code of new Set([...Object.keys(saved), ...Object.keys(draft.byArea)])) {
    const fee = parseFee(draft.byArea[code] ?? "");
    if (fee === "invalid") return null;
    if (fee !== null || code in saved) byArea[code] = fee;
  }
  return { defaultFee, byArea };
}

/** The store's travel fee by the event's area, with a default for the rest. */
export function TravelFeesFields({
  isAr,
  draft,
  onChange,
}: {
  isAr: boolean;
  draft: TravelFeeDraft;
  onChange: (draft: TravelFeeDraft) => void;
}) {
  const [open, setOpen] = useState(Object.keys(draft.byArea).length > 0);
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-semibold text-foreground">
        {isAr ? "رسوم التنقل حسب المنطقة" : "Travel fee by area"}
      </legend>
      <div className="space-y-1">
        <Label htmlFor="travel-fee-default" className="text-xs">
          {isAr
            ? "الرسوم العامة (اتركها فارغة إن لم تكن هناك رسوم)"
            : "Default fee (empty: no travel fees)"}
        </Label>
        <Input
          id="travel-fee-default"
          type="number"
          min={0}
          step="0.001"
          dir="ltr"
          value={draft.defaultFee}
          onChange={(event) => onChange({ ...draft, defaultFee: event.target.value })}
        />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 gap-1 px-2 text-xs"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronDown className={open ? "size-3.5 rotate-180" : "size-3.5"} aria-hidden="true" />
        {isAr ? "رسوم مختلفة لمناطق محددة" : "Different fees for some areas"}
      </Button>
      {open && (
        <div className="grid max-h-56 grid-cols-2 gap-2 overflow-y-auto rounded-lg border border-border p-2">
          {BAHRAIN_REGIONS.map((region) => (
            <div key={region.value} className="space-y-0.5">
              <Label htmlFor={`travel-fee-${region.value}`} className="text-xs">
                {isAr ? region.ar : region.en}
              </Label>
              <Input
                id={`travel-fee-${region.value}`}
                type="number"
                min={0}
                step="0.001"
                dir="ltr"
                placeholder={draft.defaultFee || "—"}
                value={draft.byArea[region.value] ?? ""}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    byArea: { ...draft.byArea, [region.value]: event.target.value },
                  })
                }
              />
            </div>
          ))}
        </div>
      )}
    </fieldset>
  );
}
